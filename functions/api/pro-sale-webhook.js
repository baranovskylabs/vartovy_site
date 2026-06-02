/**
 * Cloudflare Pages Function — /api/pro-sale-webhook
 *
 * Increments Pro sold counter after successful purchase.
 *
 * Required:
 * - KV binding: PRO_PRICING_KV
 * - Secret: PRO_SALES_WEBHOOK_SECRET
 *
 * Supported payload (generic):
 * {
 *   "event": "payment.succeeded",
 *   "product": "pro",
 *   "quantity": 1,
 *   "event_id": "unique-id"
 * }
 */

const ALLOWED_ORIGINS = ["https://vartovy.app", "http://localhost", "http://127.0.0.1:5500"];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "https://vartovy.app";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Vartovy-Webhook-Secret",
        "Cache-Control": "no-store",
    };
}

function json(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders(origin),
        },
    });
}

function readSecret(request) {
    const headerSecret = request.headers.get("x-vartovy-webhook-secret");
    if (headerSecret) return headerSecret;

    const auth = request.headers.get("authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    return "";
}

function isProPayload(payload) {
    const simple = String(payload.product || payload.plan || "").toLowerCase();
    if (simple === "pro") return true;

    const maybePlan = String(payload?.metadata?.plan || payload?.meta?.custom_data?.plan || "").toLowerCase();
    if (maybePlan === "pro") return true;

    const variant = String(payload?.data?.attributes?.first_order_item?.variant_name || "").toLowerCase();
    return variant.includes("pro");
}

function readQuantity(payload) {
    const raw = Number(payload.quantity ?? payload?.data?.attributes?.first_order_item?.quantity ?? 1);
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(50, Math.floor(raw)));
}

async function getSold(kv) {
    const raw = await kv.get("pro:sold");
    const n = Number(raw ?? 0);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export async function onRequestOptions({ request }) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get("Origin") || ""),
    });
}

export async function onRequestPost({ request, env }) {
    const origin = request.headers.get("Origin") || "";

    if (!env.PRO_PRICING_KV) {
        return json({ error: "kv_not_configured" }, 500, origin);
    }

    const expectedSecret = String(env.PRO_SALES_WEBHOOK_SECRET || "");
    if (!expectedSecret) {
        return json({ error: "webhook_secret_not_configured" }, 500, origin);
    }

    const gotSecret = readSecret(request);
    if (!gotSecret || gotSecret !== expectedSecret) {
        return json({ error: "unauthorized" }, 401, origin);
    }

    let payload;
    try {
        payload = await request.json();
    } catch {
        return json({ error: "bad_json" }, 400, origin);
    }

    if (!isProPayload(payload)) {
        return json({ ok: true, ignored: true, reason: "not_pro" }, 200, origin);
    }

    const eventId = String(
        payload.event_id ||
        payload.id ||
        payload?.meta?.event_id ||
        request.headers.get("x-event-id") ||
        ""
    ).trim();

    if (eventId) {
        const idempotencyKey = `event:${eventId}`;
        const seen = await env.PRO_PRICING_KV.get(idempotencyKey);
        if (seen) {
            const sold = await getSold(env.PRO_PRICING_KV);
            return json({ ok: true, deduped: true, sold }, 200, origin);
        }
        await env.PRO_PRICING_KV.put(idempotencyKey, "1", { expirationTtl: 60 * 60 * 24 * 45 });
    }

    const qty = readQuantity(payload);
    const current = await getSold(env.PRO_PRICING_KV);
    const next = current + qty;

    await env.PRO_PRICING_KV.put("pro:sold", String(next));

    return json({ ok: true, incremented_by: qty, sold: next }, 200, origin);
}
