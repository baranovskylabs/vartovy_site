/**
 * Cloudflare Pages Function — /api/download?kind=setup|portable
 * Streams binary to the user as an attachment from an upstream storage URL.
 */

const TARGETS = {
  setup: {
    envVar: "DOWNLOAD_SETUP_URL",
    defaultUrl: "https://github.com/baranovskylabs/vartovy_site/releases/download/v1.0.2/Vartovy-1.0.2-x64-Setup.exe",
    filename: "Vartovy-1.0.2-x64-Setup.exe",
    unavailable: "Файл Setup 1.0.2 ще не опублікований у сховищі. Спробуйте пізніше.",
  },
  portable: {
    envVar: "DOWNLOAD_PORTABLE_URL",
    defaultUrl: "https://github.com/baranovskylabs/vartovy_site/releases/download/v1.0.2/Vartovy-1.0.2-x64-Portable.exe",
    filename: "Vartovy-1.0.2-x64-Portable.exe",
    unavailable: "Файл Portable 1.0.2 ще не опублікований у сховищі. Спробуйте пізніше.",
  },
};

function fail(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "").toLowerCase();
  const target = TARGETS[kind];

  if (!target) {
    return fail("Невірний параметр kind. Використайте setup або portable.", 400);
  }

  const sourceUrl = env[target.envVar] || target.defaultUrl;

  try {
    const upstream = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Vartovy-Site-Download-Proxy/1.0",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return fail(target.unavailable, 503);
    }

    const headers = new Headers(upstream.headers);
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename=\"${target.filename}\"`);
    headers.set("Cache-Control", "public, max-age=300, must-revalidate");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch {
    return fail("Помилка сервера завантаження. Спробуйте пізніше.", 502);
  }
}
