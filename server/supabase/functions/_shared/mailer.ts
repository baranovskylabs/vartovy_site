export type MailPayload = {
    to: string;
    subject: string;
    text: string;
    html?: string;
};

export async function sendTransactionalEmail(payload: MailPayload): Promise<{
    ok: boolean;
    status: number;
    error?: string;
}> {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    if (!apiKey || !from) {
        return { ok: false, status: 0, error: "mailer_not_configured" };
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: payload.to,
            subject: payload.subject,
            text: payload.text,
            html: payload.html ?? `<pre>${escapeHtml(payload.text)}</pre>`,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        return { ok: false, status: res.status, error: body.slice(0, 500) };
    }

    return { ok: true, status: res.status };
}

function escapeHtml(input: string): string {
    return input
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
