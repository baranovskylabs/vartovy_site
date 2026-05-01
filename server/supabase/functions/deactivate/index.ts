// Edge Function: deactivate
// Endpoint: POST /functions/v1/deactivate
// Body: { license_key: string, device_id: string }

import { preflight, json } from "../_shared/cors.ts";
import { adminClient, sha256Hex } from "../_shared/db.ts";
import { lemonDeactivate } from "../_shared/lemon.ts";

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
        .from("licenses").select("id").eq("key_hash", keyHash).maybeSingle();
    if (!lic) return json({ error: "license_not_found" }, { status: 404, origin });

    // У Lemon Squeezy instance_id == device_id (ми так передавали при активації).
    const ls = await lemonDeactivate(licenseKey, deviceId);
    if (!ls.ok) {
        // Навіть якщо LS повернув помилку — локально все одно чистимо запис.
        console.warn("lemon deactivate failed", ls.status, ls.data);
    }

    await db.from("license_activations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("license_id", lic.id)
        .eq("device_id", deviceId)
        .is("revoked_at", null);

    return json({ ok: true }, { origin });
});
