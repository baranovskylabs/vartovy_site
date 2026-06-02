// Edge Function: restore-confirm
// Endpoint: POST /functions/v1/restore-confirm
// Body: { email: string, device_id: string, code: string }

import { preflight, json } from "../_shared/cors.ts";
import { adminClient, sha256Hex } from "../_shared/db.ts";
import {
    PERMANENT_DEVICE_TOKEN_TTL_SEC,
    signOfflineToken,
} from "../_shared/license-token.ts";

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    const origin = req.headers.get("origin");

    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, { status: 405, origin });
    }

    let body: { email?: string; device_id?: string; code?: string };
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, { status: 400, origin }); }

    const email = String(body.email ?? "").trim().toLowerCase();
    const deviceId = String(body.device_id ?? "").trim();
    const code = String(body.code ?? "").trim();

    if (!email || !deviceId || !code) {
        return json({ error: "missing_fields" }, { status: 400, origin });
    }

    const db = adminClient();
    const nowIso = new Date().toISOString();

    const { data: challenge } = await db
        .from("restore_challenges")
        .select("id, license_id, email, code_hash, expires_at, attempts, max_attempts, used_at")
        .eq("email", email)
        .eq("device_id", deviceId)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .maybeSingle();

    if (!challenge) {
        return json({ error: "challenge_not_found" }, { status: 404, origin });
    }

    if (new Date(challenge.expires_at) < new Date()) {
        return json({ error: "challenge_expired" }, { status: 403, origin });
    }

    if (challenge.attempts >= challenge.max_attempts) {
        return json({ error: "too_many_attempts" }, { status: 403, origin });
    }

    const salt = Deno.env.get("RESTORE_CODE_SALT") ?? "vartovy-restore";
    const expectedHash = await sha256Hex(`${salt}|${challenge.license_id}|${deviceId}|${code}`);

    if (expectedHash !== challenge.code_hash) {
        await db
            .from("restore_challenges")
            .update({ attempts: challenge.attempts + 1 })
            .eq("id", challenge.id);
        return json({ error: "invalid_code" }, { status: 403, origin });
    }

    await db.from("restore_challenges").update({ used_at: nowIso }).eq("id", challenge.id);

    const { data: lic } = await db
        .from("licenses")
        .select("id, ls_license_key_id, customer_email, plan, status, expires_at")
        .eq("id", challenge.license_id)
        .eq("customer_email", email)
        .maybeSingle();

    if (!lic) return json({ error: "license_not_found" }, { status: 404, origin });
    if (lic.status !== "active") return json({ error: "license_inactive" }, { status: 403, origin });
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
        return json({ error: "license_expired" }, { status: 403, origin });
    }

    const { data: act } = await db
        .from("license_activations")
        .select("id")
        .eq("license_id", lic.id)
        .eq("device_id", deviceId)
        .is("revoked_at", null)
        .maybeSingle();

    if (!act) {
        return json({ error: "device_not_bound" }, { status: 403, origin });
    }

    await db
        .from("license_activations")
        .update({ last_seen_at: nowIso })
        .eq("id", act.id);

    const now = Math.floor(Date.now() / 1000);
    const token = await signOfflineToken({
        sub: lic.id,
        eml: lic.customer_email,
        pln: lic.plan,
        dev: deviceId,
        iat: now,
        exp: now + PERMANENT_DEVICE_TOKEN_TTL_SEC,
        sid: String(lic.ls_license_key_id ?? lic.id),
    });

    return json({
        ok: true,
        plan: lic.plan,
        offline_token: token,
        expires_in: PERMANENT_DEVICE_TOKEN_TTL_SEC,
        restored: true,
    }, { origin });
});
