// Тонка обгортка над Lemon Squeezy License API.
// Документація: https://docs.lemonsqueezy.com/api/license-api

const LS_API = "https://api.lemonsqueezy.com/v1";

function apiKey(): string {
    const k = Deno.env.get("LEMONSQUEEZY_API_KEY");
    if (!k) throw new Error("LEMONSQUEEZY_API_KEY not set");
    return k;
}

async function lsForm(path: string, form: Record<string, string>) {
    const body = new URLSearchParams(form).toString();
    const res = await fetch(`${LS_API}${path}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey()}`,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data } as const;
}

export type LemonValidation = {
    valid: boolean;
    error?: string;
    license_key?: {
        id: number;
        status: string;
        key: string;
        activation_limit: number;
        activation_usage: number;
        expires_at: string | null;
    };
    meta?: {
        store_id: number;
        order_id: number;
        order_item_id: number;
        product_id: number;
        product_name: string;
        variant_id: number;
        variant_name: string;
        customer_id: number;
        customer_name: string;
        customer_email: string;
    };
    instance?: { id: string; name: string; created_at: string };
};

export function lemonValidate(licenseKey: string, instanceId?: string) {
    const form: Record<string, string> = { license_key: licenseKey };
    if (instanceId) form.instance_id = instanceId;
    return lsForm("/licenses/validate", form);
}

export function lemonActivate(licenseKey: string, instanceName: string) {
    return lsForm("/licenses/activate", {
        license_key: licenseKey,
        instance_name: instanceName,
    });
}

export function lemonDeactivate(licenseKey: string, instanceId: string) {
    return lsForm("/licenses/deactivate", {
        license_key: licenseKey,
        instance_id: instanceId,
    });
}

// Перевірка HMAC-SHA256 підпису вебхука Lemon Squeezy.
export async function verifyLemonSignature(
    rawBody: string,
    signature: string | null,
    secret: string,
): Promise<boolean> {
    if (!signature) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const macBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const expected = Array.from(new Uint8Array(macBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    // timing-safe порівняння
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
}
