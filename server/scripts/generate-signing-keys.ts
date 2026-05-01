// Генерація Ed25519-пари для підпису офлайн-токенів.
// Запуск:  deno run --allow-write server/scripts/generate-signing-keys.ts
//
// Приватний ключ (PKCS#8, base64url) → у секрети Supabase: LICENSE_SIGNING_PRIVATE_KEY
// Публічний ключ (SPKI, base64url)  → зашити у десктоп-клієнт для офлайн-перевірки.

function b64url(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

const pair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
) as CryptoKeyPair;

const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const spki  = new Uint8Array(await crypto.subtle.exportKey("spki",  pair.publicKey));

const out = {
    private_key_b64url: b64url(pkcs8),
    public_key_b64url:  b64url(spki),
    algorithm: "Ed25519",
    generated_at: new Date().toISOString(),
};

console.log(JSON.stringify(out, null, 2));
console.error("\n⚠  Збережи private_key у секрет Supabase: LICENSE_SIGNING_PRIVATE_KEY");
console.error("⚠  Public_key зашиваємо у десктоп-клієнт. НЕ комітити private_key у git!");
