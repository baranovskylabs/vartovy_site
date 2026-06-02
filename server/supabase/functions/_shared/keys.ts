export function generateActivationKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "VRTV";
    for (let i = 0; i < bytes.length; i++) {
        if (i % 3 === 0) out += "-";
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}

export function generateOtpCode(): string {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    return String(n).padStart(6, "0");
}
