import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export function adminClient() {
    const url = Deno.env.get("SUPABASE_URL");
    const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !srv) throw new Error("Supabase env not set");
    return createClient(url, srv, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

export async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
