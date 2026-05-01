// Edge Function: lemon-webhook
// Endpoint: POST /functions/v1/lemon-webhook
//
// Приймає вебхуки від Lemon Squeezy. Обов'язково:
// 1. Перевірити підпис X-Signature (HMAC-SHA256, секрет = LEMONSQUEEZY_WEBHOOK_SECRET).
// 2. Зробити обробку ідемпотентною (дедуп за X-Event-Id).
// 3. Жодних довгих операцій > 5 секунд — Lemon Squeezy ретраїть.
//
// Реагуємо на:
//   - order_created       → створюємо запис у public.orders
//   - license_key_created → створюємо public.licenses (ключ зберігаємо як sha256-hash)
//   - license_key_updated → синхронізуємо статус (revoked / refunded)
//   - subscription_payment_refunded / order_refunded → status='refunded' + revoke

import { preflight, json } from "../_shared/cors.ts";
import { verifyLemonSignature } from "../_shared/lemon.ts";
import { adminClient, sha256Hex } from "../_shared/db.ts";

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    const origin = req.headers.get("origin");

    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, { status: 405, origin });
    }

    const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET");
    if (!secret) {
        console.error("LEMONSQUEEZY_WEBHOOK_SECRET not set");
        return json({ error: "server_misconfigured" }, { status: 500, origin });
    }

    const raw = await req.text();
    const sig = req.headers.get("x-signature");
    const ok = await verifyLemonSignature(raw, sig, secret);
    if (!ok) {
        return json({ error: "bad_signature" }, { status: 401, origin });
    }

    const eventName = req.headers.get("x-event-name") ?? "";
    const eventId = req.headers.get("x-event-id") ?? crypto.randomUUID();

    let payload: any;
    try {
        payload = JSON.parse(raw);
    } catch {
        return json({ error: "bad_json" }, { status: 400, origin });
    }

    const db = adminClient();

    // Ідемпотентність: якщо подія вже оброблена — повертаємо 200.
    const { error: dupErr } = await db
        .from("webhook_events")
        .insert({
            provider: "lemonsqueezy",
            event_name: eventName,
            event_id: eventId,
            payload,
        });
    if (dupErr && !`${dupErr.message}`.includes("duplicate")) {
        console.error("webhook insert", dupErr);
    }
    if (dupErr && `${dupErr.message}`.includes("duplicate")) {
        return json({ ok: true, deduped: true }, { origin });
    }

    try {
        switch (eventName) {
            case "order_created":
                await handleOrderCreated(db, payload);
                break;
            case "license_key_created":
                await handleLicenseCreated(db, payload);
                break;
            case "license_key_updated":
                await handleLicenseUpdated(db, payload);
                break;
            case "order_refunded":
                await handleOrderRefunded(db, payload);
                break;
            default:
                // Інші події логуються, але не обробляються.
                break;
        }
    } catch (e) {
        console.error("handler error", eventName, e);
        return json({ error: "handler_failed" }, { status: 500, origin });
    }

    return json({ ok: true }, { origin });
});

// --- handlers --------------------------------------------------------

async function handleOrderCreated(db: ReturnType<typeof adminClient>, p: any) {
    const o = p?.data?.attributes;
    if (!o) return;
    await db.from("orders").upsert({
        ls_order_id:    Number(p.data.id),
        ls_store_id:    Number(o.store_id),
        ls_product_id:  Number(o.first_order_item?.product_id ?? 0) || null,
        ls_variant_id:  Number(o.first_order_item?.variant_id ?? 0) || null,
        customer_email: String(o.user_email).toLowerCase(),
        customer_name:  o.user_name ?? null,
        total_cents:    Number(o.total ?? 0),
        currency:       o.currency ?? "USD",
        status:         o.status ?? "paid",
        raw:            p,
    }, { onConflict: "ls_order_id" });
}

async function handleLicenseCreated(db: ReturnType<typeof adminClient>, p: any) {
    const a = p?.data?.attributes;
    if (!a) return;

    // Прив'язка до order
    const orderId = Number(a.order_id);
    const { data: ord } = await db
        .from("orders")
        .select("id")
        .eq("ls_order_id", orderId)
        .maybeSingle();

    const fullKey: string = a.key;            // повний ключ
    const keyShort = fullKey.slice(-4);
    const keyHash = await sha256Hex(fullKey);

    await db.from("licenses").upsert({
        order_id:           ord?.id ?? null,
        ls_license_key_id:  Number(p.data.id),
        key_short:          keyShort,
        key_hash:           keyHash,
        customer_email:     String(a.user_email).toLowerCase(),
        plan:               "pro",
        status:             a.status === "active" ? "active" : a.status,
        activation_limit:   Number(a.activation_limit ?? 3),
        activations_count:  Number(a.activation_usage ?? 0),
        expires_at:         a.expires_at ?? null,
    }, { onConflict: "ls_license_key_id" });
}

async function handleLicenseUpdated(db: ReturnType<typeof adminClient>, p: any) {
    const a = p?.data?.attributes;
    if (!a) return;
    await db.from("licenses").update({
        status:            a.status === "active" ? "active" : a.status,
        activation_limit:  Number(a.activation_limit ?? 3),
        activations_count: Number(a.activation_usage ?? 0),
        expires_at:        a.expires_at ?? null,
    }).eq("ls_license_key_id", Number(p.data.id));
}

async function handleOrderRefunded(db: ReturnType<typeof adminClient>, p: any) {
    const orderId = Number(p.data.id);
    await db.from("orders").update({ status: "refunded" }).eq("ls_order_id", orderId);
    // Усі ключі цього замовлення → revoked
    const { data: ord } = await db
        .from("orders").select("id").eq("ls_order_id", orderId).maybeSingle();
    if (ord?.id) {
        await db.from("licenses").update({ status: "revoked" }).eq("order_id", ord.id);
        // також revoke усі активні активації
        const { data: lics } = await db
            .from("licenses").select("id").eq("order_id", ord.id);
        for (const l of lics ?? []) {
            await db.from("license_activations")
                .update({ revoked_at: new Date().toISOString() })
                .eq("license_id", l.id)
                .is("revoked_at", null);
        }
    }
}
