/**
 * Cloudflare Pages Function — /api/pro-pricing
 *
 * Returns live Pro early-bird status based on licenses count in Supabase:
 * - sold
 * - remaining
 * - currentPrice (29 until first 1000 sales, then 49)
 */

const TARGET = 1000;
const EARLY_PRICE = 29;
const REGULAR_PRICE = 49;

const ALLOWED_ORIGINS = ["https://vartovy.app", "http://localhost", "http://127.0.0.1:5500"];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "https://vartovy.app";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=60, must-revalidate",
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

function parseCount(contentRange) {
    // Example: "0-9/123"
    if (!contentRange || !contentRange.includes("/")) return 0;
    const total = Number(contentRange.split("/")[1]);
    return Number.isFinite(total) ? total : 0;
}

export async function onRequestOptions({ request }) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get("Origin") || ""),
    });
}

export async function onRequestGet({ request, env }) {
    const origin = request.headers.get("Origin") || "";
    const supabaseUrl = env.SUPABASE_URL;
    const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
        return json({
            sold: 0,
            target: TARGET,
            remaining: TARGET,
            currentPrice: EARLY_PRICE,
            reached: false,
            source: "fallback",
        }, 200, origin);
    }

    try {
        const url = `${supabaseUrl}/rest/v1/licenses?select=id&plan=eq.pro`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                apikey: serviceRole,
                Authorization: `Bearer ${serviceRole}`,
                Prefer: "count=exact",
                Range: "0-0",
            },
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            return json({ error: "supabase_error", details: body.slice(0, 250) }, 502, origin);
        }

        const sold = parseCount(res.headers.get("content-range"));
        const remaining = Math.max(0, TARGET - sold);
        const reached = sold >= TARGET;

        return json({
            sold,
            target: TARGET,
            remaining,
            currentPrice: reached ? REGULAR_PRICE : EARLY_PRICE,
            reached,
            source: "supabase",
        }, 200, origin);
    } catch (err) {
        return json({ error: "network_error", details: String(err) }, 502, origin);
    }
}
