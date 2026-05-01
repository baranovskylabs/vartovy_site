// Дозволяємо звернення з сайту і з десктоп-клієнта (origin = null/file://).
// Для production звузити ALLOWED_ORIGINS до домену сайту.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function corsHeaders(origin: string | null): HeadersInit {
    const allow =
        ALLOWED_ORIGINS.includes("*") || (origin && ALLOWED_ORIGINS.includes(origin))
            ? origin ?? "*"
            : ALLOWED_ORIGINS[0] ?? "*";

    return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Headers":
            "authorization, x-client-info, apikey, content-type, x-signature",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Vary": "Origin",
    };
}

export function preflight(req: Request): Response | null {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders(req.headers.get("origin")) });
    }
    return null;
}

export function json(
    body: unknown,
    init: ResponseInit & { origin?: string | null } = {},
): Response {
    const { origin = null, headers, ...rest } = init as ResponseInit & {
        origin?: string | null;
    };
    return new Response(JSON.stringify(body), {
        ...rest,
        headers: {
            "content-type": "application/json; charset=utf-8",
            ...corsHeaders(origin),
            ...(headers ?? {}),
        },
    });
}
