// Видача короткоживучих офлайн-токенів (Ed25519).
// Десктоп-клієнт зберігає токен і періодично оновлює його через /activate.
// Публічний ключ зашитий у застосунок → офлайн-перевірка підпису.

function b64urlEncode(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function importPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
    const der = b64urlDecode(pkcs8B64);
    return await crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: "Ed25519" },
        false,
        ["sign"],
    );
}

export type TokenPayload = {
    sub: string;          // license id
    eml: string;          // email (нижній регістр)
    pln: string;          // plan
    dev: string;          // device_id
    iat: number;          // issued at (unix s)
    exp: number;          // expires at (unix s)
    sid: string;          // ls_license_key_id (для ревокації)
};

export async function signOfflineToken(payload: TokenPayload): Promise<string> {
    const sk = Deno.env.get("LICENSE_SIGNING_PRIVATE_KEY");
    if (!sk) throw new Error("LICENSE_SIGNING_PRIVATE_KEY not set");
    const key = await importPrivateKey(sk);

    const header = { alg: "EdDSA", typ: "VRT1" };
    const enc = new TextEncoder();
    const headerB = b64urlEncode(enc.encode(JSON.stringify(header)));
    const payloadB = b64urlEncode(enc.encode(JSON.stringify(payload)));
    const signingInput = `${headerB}.${payloadB}`;

    const sigBuf = await crypto.subtle.sign(
        { name: "Ed25519" },
        key,
        enc.encode(signingInput),
    );
    const sigB = b64urlEncode(new Uint8Array(sigBuf));
    return `${signingInput}.${sigB}`;
}

// TTL офлайн-токена. Після завершення клієнт мусить онлайн оновити.
export const OFFLINE_TOKEN_TTL_SEC = 60 * 60 * 24 * 14; // 14 днів
