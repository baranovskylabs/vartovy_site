/**
 * Cloudflare Pages Function — /api/pro-pricing
 *
 * Returns live Pro early-bird status based on Cloudflare KV counter:
 * - sold
 * - remaining
 * - currentPrice (29 until first 1000 sales, then 49)
 */

const TARGET = 1000;
const EARLY_PRICE = 29;
const REGULAR_PRICE = 49;

const DOWNLOADS = {
    setup: {
        envVar: "DOWNLOAD_SETUP_URL",
        defaultUrl: "https://github.com/baranovskylabs/vartovy_site/releases/download/v1.0.2/Vartovy-1.0.2-x64-Setup.exe",
        filename: "Vartovy-1.0.2-x64-Setup.exe",
        unavailable: "Файл Setup 1.0.2 ще не опублікований у сховищі. Спробуйте пізніше.",
    },
    portable: {
        envVar: "DOWNLOAD_PORTABLE_URL",
        defaultUrl: "https://github.com/baranovskylabs/vartovy_site/releases/download/v1.0.2/Vartovy-1.0.2-x64-Portable.exe",
        filename: "Vartovy-1.0.2-x64-Portable.exe",
        unavailable: "Файл Portable 1.0.2 ще не опублікований у сховищі. Спробуйте пізніше.",
    },
};

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

async function readSold(env) {
    // Primary source: KV binding (PRO_PRICING_KV)
    if (env.PRO_PRICING_KV) {
        const raw = await env.PRO_PRICING_KV.get("pro:sold");
        const value = Number(raw ?? 0);
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    }

    // Fallback source: plain env number (PRO_SOLD_COUNT)
    const fallback = Number(env.PRO_SOLD_COUNT ?? 0);
    return Number.isFinite(fallback) && fallback >= 0 ? Math.floor(fallback) : 0;
}

export async function onRequestOptions({ request }) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get("Origin") || ""),
    });
}

export async function onRequestGet({ request, env }) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    const downloadKind = (url.searchParams.get("download") || "").toLowerCase();

    if (downloadKind) {
        const target = DOWNLOADS[downloadKind];
        if (!target) {
            return new Response("Невірний параметр download. Використайте setup або portable.", {
                status: 400,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            });
        }

        const sourceUrl = env[target.envVar] || target.defaultUrl;

        try {
            const upstream = await fetch(sourceUrl, {
                redirect: "follow",
                headers: {
                    "User-Agent": "Vartovy-Site-Download-Proxy/1.0",
                },
            });

            if (!upstream.ok || !upstream.body) {
                return new Response(target.unavailable, {
                    status: 503,
                    headers: {
                        "Content-Type": "text/plain; charset=utf-8",
                        "Cache-Control": "no-store",
                    },
                });
            }

            const headers = new Headers(upstream.headers);
            headers.set("Content-Type", "application/octet-stream");
            headers.set("Content-Disposition", `attachment; filename=\"${target.filename}\"`);
            headers.set("Cache-Control", "public, max-age=300, must-revalidate");
            headers.set("X-Content-Type-Options", "nosniff");

            return new Response(upstream.body, {
                status: 200,
                headers,
            });
        } catch (err) {
            return new Response(`Помилка сервера завантаження: ${String(err)}`, {
                status: 502,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            });
        }
    }

    try {
        const sold = await readSold(env);
        const remaining = Math.max(0, TARGET - sold);
        const reached = sold >= TARGET;

        return json({
            sold,
            target: TARGET,
            remaining,
            currentPrice: reached ? REGULAR_PRICE : EARLY_PRICE,
            reached,
            source: env.PRO_PRICING_KV ? "kv" : "env",
        }, 200, origin);
    } catch (err) {
        return json({ error: "counter_read_failed", details: String(err) }, 502, origin);
    }
}
