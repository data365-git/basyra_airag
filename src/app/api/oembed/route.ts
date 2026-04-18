import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface OEmbedResult {
  title:       string | null;
  description: string | null;
  image:       string | null;
  site_name:   string | null;
  url:         string;
}

// ─── YouTube helpers ──────────────────────────────────────────────────────────

function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* ignore */ }
  return null;
}

function vimeoVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("vimeo.com")) {
      const m = u.pathname.match(/\/(\d+)/);
      return m ? m[1] : null;
    }
  } catch { /* ignore */ }
  return null;
}

// ─── OG tag parser ────────────────────────────────────────────────────────────

function parseOG(html: string): Omit<OEmbedResult, "url"> {
  function meta(prop: string): string | null {
    // Match both property="og:…" and name="og:…" forms
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']` +
      `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      "i"
    );
    const m = html.match(re);
    return m ? (m[1] ?? m[2] ?? null) : null;
  }

  function tag(name: string): string | null {
    const re = new RegExp(`<${name}[^>]*>([^<]+)<\/${name}>`, "i");
    const m = html.match(re);
    return m ? m[1].trim() : null;
  }

  return {
    title:       meta("og:title")       ?? meta("twitter:title")       ?? tag("title"),
    description: meta("og:description") ?? meta("twitter:description")  ?? meta("description"),
    image:       meta("og:image")       ?? meta("twitter:image"),
    site_name:   meta("og:site_name"),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Normalise
  let normalised = url;
  if (!/^https?:\/\//i.test(normalised)) normalised = "https://" + normalised;

  // Fast-path: YouTube
  const ytId = youtubeVideoId(normalised);
  if (ytId) {
    return NextResponse.json({
      title:       null,
      description: null,
      image:       `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      site_name:   "YouTube",
      url:         normalised,
    } satisfies OEmbedResult);
  }

  // Fast-path: Vimeo
  const vmId = vimeoVideoId(normalised);
  if (vmId) {
    try {
      const vimeoRes = await fetch(
        `https://vimeo.com/api/v2/video/${vmId}.json`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (vimeoRes.ok) {
        const [v] = await vimeoRes.json();
        return NextResponse.json({
          title:       v.title ?? null,
          description: v.description ?? null,
          image:       v.thumbnail_large ?? null,
          site_name:   "Vimeo",
          url:         normalised,
        } satisfies OEmbedResult);
      }
    } catch { /* fall through to HTML fetch */ }
  }

  // Generic OG fetch
  try {
    const res = await fetch(normalised, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BasyraBot/1.0; +https://basyra.uz)",
        "Accept":     "text/html",
      },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({ title: null, description: null, image: null, site_name: null, url: normalised });
    }

    // Only read first 32 KB — enough for <head>
    const reader   = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let   total    = 0;
    const MAX      = 32 * 1024;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
        if (total >= MAX) { await reader.cancel(); break; }
      }
    }

    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc); merged.set(c, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    const og = parseOG(html);

    let siteName = og.site_name;
    if (!siteName) {
      try { siteName = new URL(normalised).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    }

    return NextResponse.json({ ...og, site_name: siteName, url: normalised } satisfies OEmbedResult);
  } catch {
    return NextResponse.json({ title: null, description: null, image: null, site_name: null, url: normalised });
  }
}
