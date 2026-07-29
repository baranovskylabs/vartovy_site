/**
 * Cloudflare Pages Function — /api/contact
 *
 * Rate-limits by IP via KV (3 per 24 h).
 * Sends email via Resend API.
 *
 * Env vars required (Cloudflare Pages → Settings → Environment variables):
 *   RESEND_API_KEY  — API key from resend.com (re_...)
 *   FROM_EMAIL      — верифікований відправник, напр. noreply@vartovy.app
 *                     (або onboarding@resend.dev для тестів без верифікації домену)
 *
 * Optional KV namespace "CONTACT_RATE" for IP rate limiting.
 */

const RATE_LIMIT   = 20;
const RATE_WINDOW_S = 24 * 60 * 60;
const CONTACT_RECIPIENT = 'vartovy.support@protonmail.com';

const ALLOWED_ORIGINS = ['https://vartovy.app', 'https://www.vartovy.app'];
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin)
        ? origin
        : 'https://vartovy.app';
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

    // ── IP rate limit via KV ─────────────────────────────────────────────────
    const ip = request.headers.get('CF-Connecting-IP')
        || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
        || 'unknown';

    const kvKey = `contact:${ip}`;
    let submissionCount = 0;
    if (env.CONTACT_RATE) {
        const stored = await env.CONTACT_RATE.get(kvKey);
        submissionCount = stored ? parseInt(stored, 10) : 0;

        if (submissionCount >= RATE_LIMIT) {
            return json({ success: 'false', error: 'rate_limit' }, 429, origin);
        }
    }

    // ── Send via Resend ──────────────────────────────────────────────────────
    const apiKey   = env.RESEND_API_KEY;
    const fromEmail = env.FROM_EMAIL || 'Vartovy <noreply@vartovy.app>';

    if (!apiKey) {
        return json({ success: 'false', message: 'Email service not configured.' }, 500, origin);
    }

    const name    = String(payload.name    || '').slice(0, 80);
    const email   = String(payload.email   || '').slice(0, 120);
    const topic   = String(payload.topic   || 'No topic').slice(0, 100);
    const message = String(payload.message || '').slice(0, 4000);
    const submissionId = String(payload._submission_id || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 80);

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
                ...(submissionId ? { 'Idempotency-Key': `contact-${submissionId}` } : {}),
            },
            body: JSON.stringify({
                from:     fromEmail,
                to:       [CONTACT_RECIPIENT],
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
        return json({ success: 'false', message: 'Email delivery failed: ' + errBody }, 502, origin);
    }

    if (env.CONTACT_RATE) {
        await env.CONTACT_RATE.put(kvKey, String(submissionCount + 1), { expirationTtl: RATE_WINDOW_S });
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
