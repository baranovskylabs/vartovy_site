// Edge Function: restore-request
// Endpoint: POST /functions/v1/restore-request
// Body: { email: string, device_id: string }
//
// Призначення: після перевстановлення ОС користувач відновлює Pro-доступ
// на тому самому пристрої без повторного використання activation key.

import { preflight, json } from "../_shared/cors.ts";
import { adminClient, sha256Hex } from "../_shared/db.ts";
import { generateOtpCode } from "../_shared/keys.ts";
import { sendTransactionalEmail } from "../_shared/mailer.ts";

const RESTORE_TTL_MIN = 10;

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    const origin = req.headers.get("origin");

    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, { status: 405, origin });
    }

    let body: { email?: string; device_id?: string };
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, { status: 400, origin }); }

    const email = String(body.email ?? "").trim().toLowerCase();
    const deviceId = String(body.device_id ?? "").trim();
    if (!email || !deviceId) {
        return json({ error: "missing_fields" }, { status: 400, origin });
    }

    const db = adminClient();

    const { data: licenses } = await db
        .from("licenses")
        .select("id, customer_email, status")
        .eq("customer_email", email)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5);

    if (!licenses?.length) {
        return json({ ok: true, sent: true, expires_in_sec: RESTORE_TTL_MIN * 60 }, { origin });
    }

    let targetLicenseId: string | null = null;
    for (const lic of licenses) {
        const { data: act } = await db
            .from("license_activations")
            .select("id")
            .eq("license_id", lic.id)
            .eq("device_id", deviceId)
            .is("revoked_at", null)
            .maybeSingle();
        if (act?.id) {
            targetLicenseId = lic.id;
            break;
        }
    }

    if (!targetLicenseId) {
        return json({ ok: true, sent: true, expires_in_sec: RESTORE_TTL_MIN * 60 }, { origin });
    }

    const code = generateOtpCode();
    const salt = Deno.env.get("RESTORE_CODE_SALT") ?? "vartovy-restore";
    const codeHash = await sha256Hex(`${salt}|${targetLicenseId}|${deviceId}|${code}`);
    const expiresAt = new Date(Date.now() + RESTORE_TTL_MIN * 60 * 1000).toISOString();

    await db.from("restore_challenges")
        .update({ used_at: new Date().toISOString() })
        .eq("license_id", targetLicenseId)
        .eq("device_id", deviceId)
        .is("used_at", null);

    await db.from("restore_challenges").insert({
        license_id: targetLicenseId,
        email,
        device_id: deviceId,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
        max_attempts: 5,
    });

    const mail = await sendTransactionalEmail({
        to: email,
        subject: "Vartovy: код відновлення активації",
        text: [
            "Ваш код відновлення активації Vartovy:",
            "",
            code,
            "",
            `Код дійсний ${RESTORE_TTL_MIN} хвилин.`,
            "Якщо це не ви — проігноруйте цей лист.",
        ].join("\n"),
    });

    if (!mail.ok) {
        console.error("restore mail failed", mail.status, mail.error);
        return json({ error: "mailer_failed" }, { status: 500, origin });
    }

    return json({ ok: true, sent: true, expires_in_sec: RESTORE_TTL_MIN * 60 }, { origin });
});
