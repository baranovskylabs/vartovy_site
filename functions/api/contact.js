/**
 * Cloudflare Pages Function — /api/contact
 *
 * Rate-limits contact form submissions by IP (3 per 24 h).
 * Validates that consent was given.
 * Forwards the payload to FormSubmit AJAX and relays the response.
 *
 * Requires KV namespace "CONTACT_RATE" bound in Pages → Settings → Functions.
 */

const RATE_LIMIT = 3;
const RATE_WINDOW_S = 24 * 60 * 60; // 24 hours in seconds
const FORMSUBMIT_URL =
    'https://formsubmit.co/ajax/1b37017d3189e6ab449a3b8cc2ddcd56';

const ALLOWED_ORIGIN = 'https://vartovy.app';

function corsHeaders(origin) {
    const allowed =
        origin === ALLOWED_ORIGIN || origin === 'http://localhost' ? origin : ALLOWED_ORIGIN;
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
        },
    });
}

export async function onRequestOptions({ request }) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('Origin') || ''),
    });
}

export async function onRequestPost({ request, env }) {
    const origin = request.headers.get('Origin') || '';

    // ── Parse body ──────────────────────────────────────────────────────────
    let payload;
    try {
        payload = await request.json();
    } catch {
        return json({ success: 'false', message: 'Invalid JSON.' }, 400, origin);
    }

    // ── Consent check ────────────────────────────────────────────────────────
    if (!payload.consent || payload.consent === 'false') {
        return json(
            { success: 'false', message: 'Consent is required.' },
            400,
            origin,
        );
    }

    // ── Honeypot ─────────────────────────────────────────────────────────────
    if (payload._honey && payload._honey.trim() !== '') {
        // Silent reject for bots.
        return json({ success: 'true' }, 200, origin);
    }

    // ── IP-based rate limit via KV ────────────────────────────────────────────
    const ip =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
        'unknown';

    const kvKey = `contact:${ip}`;

    if (env.CONTACT_RATE) {
        const stored = await env.CONTACT_RATE.get(kvKey);
        const count = stored ? parseInt(stored, 10) : 0;

        if (count >= RATE_LIMIT) {
            return json(
                { success: 'false', message: 'Rate limit exceeded. Try again tomorrow.' },
                429,
                origin,
            );
        }

        // Increment counter; set TTL only on first write so window starts at first submission
        const newCount = count + 1;
        await env.CONTACT_RATE.put(kvKey, String(newCount), {
            expirationTtl: RATE_WINDOW_S,
        });
    }

    // ── Forward to FormSubmit ────────────────────────────────────────────────
    // Remove internal/honeypot fields before forwarding
    const { _honey, _form_opened_at, ...forwardPayload } = payload;

    let fsRes;
    try {
        fsRes = await fetch(FORMSUBMIT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(forwardPayload),
        });
    } catch {
        return json(
            { success: 'false', message: 'Network error forwarding request.' },
            502,
            origin,
        );
    }

    let fsBody;
    try {
        fsBody = await fsRes.json();
    } catch {
        fsBody = {};
    }

    if (!fsRes.ok || fsBody.success === 'false' || fsBody.success === false) {
        return json(
            { success: 'false', message: fsBody.message || 'FormSubmit error.' },
            fsRes.status || 502,
            origin,
        );
    }

    return json({ success: 'true' }, 200, origin);
}
