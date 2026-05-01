// Edge Function: validate
// Endpoint: POST /functions/v1/validate
// Body: { license_key: string, device_id: string }
//
// Швидка онлайн-перевірка статусу. Використовується десктоп-клієнтом
// як heartbeat (наприклад, раз на 24 години). Не змінює стан.

import { preflight, json } from "../_shared/cors.ts";
import { adminClient, sha256Hex } from "../_shared/db.ts";

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    const origin = req.headers.get("origin");

    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, { status: 405, origin });
    }

    let body: { license_key?: string; device_id?: string };
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, { status: 400, origin }); }

    const licenseKey = (body.license_key ?? "").trim();
    const deviceId = (body.device_id ?? "").trim();
    if (!licenseKey || !deviceId) {
        return json({ error: "missing_fields" }, { status: 400, origin });
    }

    const db = adminClient();
    const keyHash = await sha256Hex(licenseKey);

    const { data: lic } = await db
        .from("licenses")
        .select("id, status, plan, expires_at")
        .eq("key_hash", keyHash)
        .maybeSingle();

    if (!lic) return json({ valid: false, reason: "not_found" }, { origin });

    const expired = lic.expires_at && new Date(lic.expires_at) < new Date();
    const valid = lic.status === "active" && !expired;

    if (valid) {
        const { data: act } = await db
            .from("license_activations")
            .select("id")
            .eq("license_id", lic.id)
            .eq("device_id", deviceId)
            .is("revoked_at", null)
            .maybeSingle();
        if (act) {
            await db.from("license_activations")
                .update({ last_seen_at: new Date().toISOString() })
                .eq("id", act.id);
        } else {
            return json({ valid: false, reason: "device_not_activated" }, { origin });
        }
    }

    return json({
        valid,
        plan: lic.plan,
        status: lic.status,
        reason: valid ? null : (expired ? "expired" : lic.status),
    }, { origin });
});
