/**
 * Cloudflare Pages Function — /api/contact
 *
 * Rate-limits by IP via KV (3 per 24 h).
 * Sends email via Resend API.
 *
 * Env vars required (Cloudflare Pages → Settings → Environment variables):
 *   RESEND_API_KEY  — API key from resend.com (re_...)
 *   TO_EMAIL        — куди надходять листи, напр. support@vartovy.app
 *   FROM_EMAIL      — верифікований відправник, напр. noreply@vartovy.app
 *                     (або onboarding@resend.dev для тестів без верифікації домену)
 *
 * Optional KV namespace "CONTACT_RATE" for IP rate limiting.
 */

const RATE_LIMIT   = 3;
const RATE_WINDOW_S = 24 * 60 * 60;

const ALLOWED_ORIGINS = ['https://vartovy.app', 'http://localhost'];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://vartovy.app';
    return {
        'Access-Control-Allow-Origin':  allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

function json(body, status, origin) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
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

    // ── Parse body ───────────────────────────────────────────────────────────
    let payload;
    try {
        payload = await request.json();
    } catch {
        return json({ success: 'false', message: 'Invalid JSON.' }, 400, origin);
    }

    // ── Consent ──────────────────────────────────────────────────────────────
    if (!payload.consent || payload.consent === 'false') {
        return json({ success: 'false', message: 'Consent is required.' }, 400, origin);
    }

    // ── Honeypot ─────────────────────────────────────────────────────────────
    if (payload._honey && payload._honey.trim() !== '') {
        return json({ success: 'true' }, 200, origin);
    }

    // ── IP rate limit via KV ─────────────────────────────────────────────────
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
        || 'unknown';

    if (env.CONTACT_RATE) {
        const kvKey  = `contact:${ip}`;
        const stored = await env.CONTACT_RATE.get(kvKey);
        const count  = stored ? parseInt(stored, 10) : 0;

        if (count >= RATE_LIMIT) {
            return json({ success: 'false', message: 'Rate limit exceeded. Try again tomorrow.' }, 429, origin);
        }
        await env.CONTACT_RATE.put(kvKey, String(count + 1), { expirationTtl: RATE_WINDOW_S });
    }

    // ── Send via Resend ──────────────────────────────────────────────────────
    const apiKey   = env.RESEND_API_KEY;
    const toEmail  = env.TO_EMAIL   || 'vartovy.support@protonmail.com';
    const fromEmail = env.FROM_EMAIL || 'Vartovy Contact <noreply@vartovy.app>';

    if (!apiKey) {
        return json({ success: 'false', message: 'Email service not configured.' }, 500, origin);
    }

    const name    = String(payload.name    || '').slice(0, 80);
    const email   = String(payload.email   || '').slice(0, 120);
    const topic   = String(payload.topic   || 'No topic').slice(0, 100);
    const message = String(payload.message || '').slice(0, 4000);

    const htmlBody = `
<table style="font-family:sans-serif;font-size:15px;border-collapse:collapse;width:100%">
  <tr><td style="padding:6px 12px;font-weight:bold;width:140px;background:#f5f5f5">Ім'я</td><td style="padding:6px 12px">${escHtml(name)}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Email</td><td style="padding:6px 12px"><a href="mailto:${escHtml(email)}">${escHtml(email)}</a></td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5">Тема</td><td style="padding:6px 12px">${escHtml(topic)}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;vertical-align:top">Повідомлення</td><td style="padding:6px 12px;white-space:pre-wrap">${escHtml(message)}</td></tr>
</table>`;

    let res;
    try {
        res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({
                from:     fromEmail,
                to:       [toEmail],
                reply_to: email || undefined,
                subject:  `[Vartovy] ${topic} — від ${name}`,
                html:     htmlBody,
            }),
        });
    } catch {
        return json({ success: 'false', message: 'Network error sending email.' }, 502, origin);
    }

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        return json({ success: 'false', message: 'Email delivery failed.' }, 502, origin);
    }

    return json({ success: 'true' }, 200, origin);
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
