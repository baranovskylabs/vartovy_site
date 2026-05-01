// Edge Function: activate
// Endpoint: POST /functions/v1/activate
// Body: { license_key: string, device_id: string, device_name?: string, platform?: string }
//
// Логіка:
//  1. Знаходимо ліцензію за sha256(license_key). Перевіряємо status='active' і термін.
//  2. Викликаємо Lemon Squeezy /licenses/activate (instance_name = device_id) — він
//     слідкує за глобальним лімітом активацій.
//  3. Створюємо/оновлюємо запис у license_activations.
//  4. Видаємо короткоживучий офлайн-токен (Ed25519, JWT-формат).
//
// Важливо: повний ключ ніколи не залишається у БД у відкритому вигляді.

import { preflight, json } from "../_shared/cors.ts";
import { adminClient, sha256Hex } from "../_shared/db.ts";
import { lemonActivate } from "../_shared/lemon.ts";
import {
    OFFLINE_TOKEN_TTL_SEC,
    signOfflineToken,
} from "../_shared/license-token.ts";

Deno.serve(async (req) => {
    const pre = preflight(req);
    if (pre) return pre;
    const origin = req.headers.get("origin");

    if (req.method !== "POST") {
        return json({ error: "method_not_allowed" }, { status: 405, origin });
    }

    let body: {
        license_key?: string;
        device_id?: string;
        device_name?: string;
        platform?: string;
    };
    try { body = await req.json(); } catch { return json({ error: "bad_json" }, { status: 400, origin }); }

    const licenseKey = (body.license_key ?? "").trim();
    const deviceId = (body.device_id ?? "").trim();
    if (!licenseKey || !deviceId) {
        return json({ error: "missing_fields" }, { status: 400, origin });
    }
    if (deviceId.length < 8 || deviceId.length > 128) {
        return json({ error: "invalid_device_id" }, { status: 400, origin });
    }

    const db = adminClient();
    const keyHash = await sha256Hex(licenseKey);

    const { data: lic, error } = await db
        .from("licenses")
        .select("id, ls_license_key_id, customer_email, plan, status, activation_limit, expires_at")
        .eq("key_hash", keyHash)
        .maybeSingle();

    if (error) {
        console.error("db", error);
        return json({ error: "server_error" }, { status: 500, origin });
    }
    if (!lic) {
        return json({ error: "license_not_found" }, { status: 404, origin });
    }
    if (lic.status !== "active") {
        return json({ error: "license_inactive", status: lic.status }, { status: 403, origin });
    }
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
        return json({ error: "license_expired" }, { status: 403, origin });
    }

    // Уже активований цей пристрій?
    const { data: existing } = await db
        .from("license_activations")
        .select("id")
        .eq("license_id", lic.id)
        .eq("device_id", deviceId)
        .is("revoked_at", null)
        .maybeSingle();

    if (!existing) {
        // Перевірка ліміту локально
        const { count } = await db
            .from("license_activations")
            .select("*", { count: "exact", head: true })
            .eq("license_id", lic.id)
            .is("revoked_at", null);
        if ((count ?? 0) >= lic.activation_limit) {
            return json({ error: "activation_limit_reached" }, { status: 403, origin });
        }

        // Реєструємо у Lemon Squeezy
        const ls = await lemonActivate(licenseKey, deviceId);
        if (!ls.ok || !ls.data?.activated) {
            return json(
                { error: "lemon_activate_failed", details: ls.data?.error ?? null },
                { status: 403, origin },
            );
        }

        await db.from("license_activations").insert({
            license_id:   lic.id,
            device_id:    deviceId,
            device_name:  body.device_name ?? null,
            platform:     body.platform ?? null,
            ip_hash:      await ipHash(req),
            last_seen_at: new Date().toISOString(),
        });
    } else {
        await db.from("license_activations")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id);
    }

    const now = Math.floor(Date.now() / 1000);
    const token = await signOfflineToken({
        sub: lic.id,
        eml: lic.customer_email,
        pln: lic.plan,
        dev: deviceId,
        iat: now,
        exp: now + OFFLINE_TOKEN_TTL_SEC,
        sid: String(lic.ls_license_key_id),
    });

    return json({
        ok: true,
        plan: lic.plan,
        offline_token: token,
        expires_in: OFFLINE_TOKEN_TTL_SEC,
        email: lic.customer_email,
    }, { origin });
});

async function ipHash(req: Request): Promise<string> {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const salt = Deno.env.get("IP_HASH_SALT") ?? "vartovy";
    return await sha256Hex(salt + "|" + ip);
}
