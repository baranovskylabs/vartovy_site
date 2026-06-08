/**
 * Cloudflare Pages Function — /api/download/setup
 * Streams Setup binary to the user as an attachment.
 */

const DEFAULT_URL = "https://github.com/baranovskylabs/vartovy_site/releases/download/v1.0.2/Vartovy-1.0.2-x64-Setup.exe";
const FILENAME = "Vartovy-1.0.2-x64-Setup.exe";

export async function onRequestGet({ env }) {
  const sourceUrl = env.DOWNLOAD_SETUP_URL || DEFAULT_URL;

  try {
    const upstream = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Vartovy-Site-Download-Proxy/1.0",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(
        "Файл Setup 1.0.2 ще не опублікований у сховищі. Спробуйте пізніше.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const headers = new Headers(upstream.headers);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename=\"${FILENAME}\"`);
    headers.set("Cache-Control", "public, max-age=300, must-revalidate");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch {
    return new Response("Помилка сервера завантаження. Спробуйте пізніше.", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
