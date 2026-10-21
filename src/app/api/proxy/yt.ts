/* ============================================================
   axcsOS — Cliente YouTube nativo (generado server-side)
   La SPA de youtube.com no hidrata bajo proxy (anti-bot), pero:
   - /results viene server-rendered (ytInitialData con vídeos) ✓
   - la API innertube (youtubei/v1/search|player) responde ✓
   - youtube-nocookie.com/embed reproduce (diseñado para embeber) ✓
   Estrategia: grid propio con portadas + reproductor embed.
   ============================================================ */

export interface YtVideo {
  id: string;
  title: string;
  channel: string;
  views: string;
  duration: string;
  thumb: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ---------------- config innertube (cacheada) ---------------- */
let cfgCache: { key: string; version: string; at: number } | null = null;

async function getInnertubeConfig(): Promise<{ key: string; version: string } | null> {
  if (cfgCache && Date.now() - cfgCache.at < 12 * 3600_000) {
    return { key: cfgCache.key, version: cfgCache.version };
  }
  try {
    const res = await fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      headers: {
        "user-agent": UA,
        "accept-language": "es-ES,es;q=0.9",
        cookie: "SOCS=CAI; CONSENT=YES+cb.axcs",
      },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    const key =
      /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1] ??
      /INNERTUBE_API_KEY="([^"]+)"/.exec(html)?.[1] ??
      "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    const version = /"clientVersion":"([\d.]+)"/.exec(html)?.[1] ?? "2.20261020.01.00";
    cfgCache = { key, version, at: Date.now() };
    return { key, version };
  } catch {
    return { key: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8", version: "2.20261020.01.00" };
  }
}

async function innertube(
  endpoint: string,
  body: Record<string, unknown>,
  client: "WEB" | "ANDROID" = "WEB"
): Promise<any | null> {
  const cfg = await getInnertubeConfig();
  if (!cfg) return null;
  const androidUA = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";
  const clientCfg =
    client === "ANDROID"
      ? {
          clientName: "ANDROID",
          clientVersion: "20.10.38",
          androidSdkVersion: 30,
          osName: "Android",
          osVersion: "11",
          hl: "es",
          gl: "ES",
          userAgent: androidUA,
        }
      : {
          clientName: "WEB",
          clientVersion: cfg.version,
          hl: "es",
          gl: "ES",
          userAgent: UA,
        };
  const payload = {
    context: { client: clientCfg },
    ...body,
  };
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/${endpoint}?key=${cfg.key}&prettyPrint=false`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": client === "ANDROID" ? androidUA : UA,
          cookie: "SOCS=CAI; CONSENT=YES+cb.axcs",
          origin: "https://www.youtube.com",
          referer: "https://www.youtube.com/",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ---------------- extracción de vídeos ---------------- */

/** recorre un JSON recolectando vídeos (videoRenderer / reelItemRenderer) */
export function collectVideos(data: any, out: YtVideo[] = [], depth = 0): YtVideo[] {
  if (!data || typeof data !== "object" || depth > 30 || out.length > 60) return out;
  const node = data as Record<string, unknown>;
  const vr = (node.videoRenderer ?? node.gridVideoRenderer ?? node.reelItemRenderer ?? null) as
    | Record<string, any>
    | null;
  if (vr && vr.videoId) {
    const title =
      (vr.title?.runs?.[0]?.text as string) ||
      (vr.headline?.simpleText as string) ||
      "";
    const channel =
      (vr.ownerText?.runs?.[0]?.text as string) ||
      (vr.longBylineText?.runs?.[0]?.text as string) ||
      "";
    const views = (vr.viewCountText?.simpleText ?? vr.shortViewCountText?.simpleText ?? "") as string;
    const duration = (vr.lengthText?.simpleText ?? "") as string;
    if (title && !out.some((v) => v.id === vr.videoId)) {
      out.push({
        id: String(vr.videoId),
        title: String(title),
        channel: String(channel),
        views: String(views),
        duration: String(duration),
        thumb: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
      });
    }
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (v && typeof v === "object") {
      if (Array.isArray(v)) {
        for (const item of v) collectVideos(item, out, depth + 1);
      } else {
        collectVideos(v, out, depth + 1);
      }
    }
  }
  return out;
}

/** home = búsquedas variadas mezcladas (cacheado 5 min) */
let homeCache: { videos: YtVideo[]; at: number } | null = null;
const HOME_TOPICS = ["música", "gaming", "humor", "deportes"];

export async function getHomeFeed(): Promise<YtVideo[]> {
  if (homeCache && Date.now() - homeCache.at < 5 * 60_000) return homeCache.videos;
  const results = await Promise.all(
    HOME_TOPICS.map(async (topic) => {
      const data = await innertube("search", { query: topic });
      return data ? collectVideos(data).slice(0, 6) : [];
    })
  );
  // intercalar temas
  const mixed: YtVideo[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    for (const list of results) {
      const v = list[i];
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        mixed.push(v);
      }
    }
  }
  if (mixed.length) homeCache = { videos: mixed, at: Date.now() };
  return mixed;
}

/** búsqueda (API, con fallback a la página HTML server-rendered) */
export async function ytSearch(q: string): Promise<YtVideo[]> {
  const data = await innertube("search", { query: q });
  if (data) {
    const videos = collectVideos(data);
    if (videos.length) return videos;
  }
  // fallback: la página de resultados viene server-rendered
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      {
        headers: {
          "user-agent": UA,
          "accept-language": "es-ES,es;q=0.9",
          cookie: "SOCS=CAI; CONSENT=YES+cb.axcs",
        },
        signal: AbortSignal.timeout(20000),
      }
    );
    const html = await res.text();
    const m = /ytInitialData\s*=\s*(\{.+?\});/.exec(html);
    if (m) {
      try {
        return collectVideos(JSON.parse(m[1]));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** metadatos + stream de un vídeo (cliente ANDROID devuelve URLs directas) */
export async function ytVideoInfo(
  id: string
): Promise<{ video: YtVideo; streamUrl: string | null } | null> {
  const data = await innertube("player", { videoId: id }, "ANDROID");
  const d = data?.videoDetails;
  const fmt =
    (data?.streamingData?.formats ?? []).find((f: any) => f.itag === 18) ??
    (data?.streamingData?.formats ?? [])[0];
  const streamUrl: string | null = fmt?.url ?? null;
  if (d && d.videoId) {
    const secs = Number(d.lengthSeconds) || 0;
    return {
      video: {
        id: String(d.videoId),
        title: String(d.title ?? ""),
        channel: String(d.author ?? ""),
        views: Number(d.viewCount) > 0 ? Number(d.viewCount).toLocaleString("es-ES") + " vistas" : "",
        duration: secs > 0 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "",
        thumb: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      },
      streamUrl,
    };
  }
  return null;
}

/* ---------------- render ---------------- */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Roboto,-apple-system,sans-serif;background:#0f0f0f;color:#f1f1f1;min-height:100vh}
.hdr{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:16px;padding:10px 20px;background:rgba(15,15,15,.95);backdrop-filter:blur(10px);border-bottom:1px solid #272727}
.logo{display:flex;align-items:center;gap:6px;font-size:19px;font-weight:700;letter-spacing:-1px;color:#fff;text-decoration:none}
.sbox{flex:1;max-width:560px;display:flex}
.sbox input{flex:1;height:38px;border:1px solid #303030;background:#121212;color:#fff;border-radius:20px 0 0 20px;padding:0 18px;font-size:14px;outline:none}
.sbox input:focus{border-color:#3ea6ff}
.sbox button{height:38px;border:1px solid #303030;border-left:0;background:#222;color:#aaa;border-radius:0 20px 20px 0;padding:0 20px;cursor:pointer;font-size:14px}
.sbox button:hover{background:#303030}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:24px 16px;padding:24px 20px;max-width:1600px;margin:0 auto}
.card{cursor:pointer}
.th{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#1f1f1f}
.th img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.card:hover .th img{transform:scale(1.04)}
.dur{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.8);border-radius:4px;padding:1px 5px;font-size:12px;font-weight:600}
.meta{display:flex;gap:10px;margin-top:10px}
.av{flex:none;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#c4302b,#ff0033);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
.tt{font-size:14px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:3px}
.ch,.vw{font-size:12.5px;color:#aaa}
.playerwrap{max-width:1100px;margin:0 auto;padding:20px}
.player{aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
.player video{width:100%;height:100%;display:block;background:#000;object-fit:contain}
.noStream{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.noStream img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.45}
.noStream div{position:relative;z-index:1;font-size:13px;color:#ddd;background:rgba(0,0,0,.6);padding:8px 14px;border-radius:8px;text-align:center}
.back{display:inline-flex;align-items:center;gap:6px;color:#3ea6ff;text-decoration:none;font-size:13px;margin-bottom:12px}
.wt{font-size:20px;font-weight:700;margin:14px 0 4px}
.h2{font-size:16px;font-weight:700;padding:6px 20px 0;max-width:1600px;margin:0 auto}
.empty{padding:80px 20px;text-align:center;color:#888}
.empty h3{font-size:17px;margin-bottom:8px;color:#ddd}
.empty p{font-size:13px}
`;

function ytLogoSvg(): string {
  return `<svg width="30" height="21" viewBox="0 0 28 20" aria-hidden="true"><path d="M27.4 3.1s-.3-2-1.1-2.9c-1.1-1.2-2.3-1.2-2.9-1.3C19.5-1.4 14-1.4 14-1.4h0s-5.5 0-9.4.3c-.6.1-1.8.1-2.9 1.3C.9 1.1.6 3.1.6 3.1S.3 5.5.3 7.9v2.2c0 2.4.3 4.8.3 4.8s.3 2 1.1 2.9c1.1 1.2 2.5 1.1 3.2 1.3 2.3.2 9.8.3 9.8.3s5.5 0 9.4-.4c.6-.1 1.8-.1 2.9-1.3.8-.9 1.1-2.9 1.1-2.9s.3-2.4.3-4.8V7.9c0-2.4-.3-4.8-.3-4.8z" fill="#f00"/><path d="m10.8 13.1 7.9-4.5-7.9-4.5z" fill="#fff"/></svg>`;
}

function cardsHtml(videos: YtVideo[], origin: string): string {
  const prox = (u: string) => `${origin}/api/proxy?u=${encodeURIComponent(u)}`;
  const watch = (id: string) =>
    prox(`https://www.youtube.com/watch?v=${id}`);
  return videos
    .map((v) => {
      const ch = v.channel ? v.channel[0].toUpperCase() : "?";
      return `<div class="card" onclick="location='${watch(v.id)}'">
  <div class="th"><img loading="lazy" src="${prox(v.thumb)}" alt="">
  ${v.duration ? `<span class="dur">${esc(v.duration)}</span>` : ""}</div>
  <div class="meta"><div class="av">${esc(ch)}</div><div style="min-width:0">
  <div class="tt">${esc(v.title)}</div>
  <div class="ch">${esc(v.channel)}</div><div class="vw">${esc(v.views)}</div></div></div></div>`;
    })
    .join("\n");
}

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    title
  )}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

/** home de YouTube (feed mezclado) */
export function renderHome(videos: YtVideo[], origin: string): string {
  const proxyPrefix = `${origin}/api/proxy?u=`;
  const searchAction = proxyPrefix + encodeURIComponent("https://www.youtube.com/results");
  const body = `
<header class="hdr">
  <a class="logo" href="${proxyPrefix}${encodeURIComponent("https://www.youtube.com")}">${ytLogoSvg()} YouTube</a>
  <form class="sbox" action="${searchAction}" method="get">
    <input name="search_query" placeholder="Buscar en YouTube" autocomplete="off">
    <button type="submit">Buscar</button>
  </form>
</header>
${
  videos.length
    ? `<div class="grid">${cardsHtml(videos, origin)}</div>`
    : `<div class="empty"><h3>Sin conexión con YouTube</h3><p>No se pudo cargar el feed. Inténtalo de nuevo en unos segundos.</p></div>`
}`;
  return shell("YouTube", body);
}

/** resultados de búsqueda */
export function renderSearch(videos: YtVideo[], q: string, origin: string): string {
  const proxyPrefix = `${origin}/api/proxy?u=`;
  const searchAction = proxyPrefix + encodeURIComponent("https://www.youtube.com/results");
  const body = `
<header class="hdr">
  <a class="logo" href="${proxyPrefix}${encodeURIComponent("https://www.youtube.com")}">${ytLogoSvg()} YouTube</a>
  <form class="sbox" action="${searchAction}" method="get">
    <input name="search_query" placeholder="Buscar en YouTube" value="${esc(q)}" autocomplete="off">
    <button type="submit">Buscar</button>
  </form>
</header>
${
  videos.length
    ? `<h2 class="h2">Resultados para “${esc(q)}”</h2><div class="grid">${cardsHtml(videos, origin)}</div>`
    : `<div class="empty"><h3>Sin resultados</h3><p>No se encontraron vídeos para “${esc(q)}”.</p></div>`
}`;
  return shell(`${q} — YouTube`, body);
}

/** página de reproducción con reproductor NATIVO (stream directo del API) */
export function renderWatch(
  v: YtVideo | null,
  id: string,
  streamUrl: string | null,
  related: YtVideo[],
  origin: string
): string {
  const proxyPrefix = `${origin}/api/proxy?u=`;
  const prox = (u: string) => proxyPrefix + encodeURIComponent(u);
  const homeHref = proxyPrefix + encodeURIComponent("https://www.youtube.com");
  const poster = prox(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
  const videoSrc = streamUrl ? prox(streamUrl) : null;
  const body = `
<div class="playerwrap">
  <a class="back" href="${homeHref}">‹ Volver a YouTube</a>
  <div class="player">${
    videoSrc
      ? `<video controls preload="metadata" poster="${poster}" src="${videoSrc}" playsinline></video>`
      : `<div class="noStream"><img src="${poster}" alt=""><div>Este vídeo no permite reproducción nativa (DRM o restricción de edad).</div></div>`
  }</div>
  ${v ? `<div class="wt">${esc(v.title)}</div><div class="ch">${esc(v.channel)}${v.views ? " · " + esc(v.views) : ""}</div>` : ""}
  ${
    related.length
      ? `<h2 class="h2" style="padding:26px 0 0">Más vídeos</h2><div class="grid" style="padding-top:14px">${cardsHtml(
          related.slice(0, 12),
          origin
        )}</div>`
      : ""
  }
</div>`;
  return shell(v ? `${v.title} — YouTube` : "YouTube", body);
}

/** ¿es una URL de watch de youtube que merece página especial? */
export function isYouTubeWatch(url: URL): string | null {
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  // IMPORTANTE: no interceptar /embed/ (debe pasar por el proxy normal para no anidar)
  if (url.pathname === "/watch") return url.searchParams.get("v");
  return null;
}

/** ¿es una URL de navegación de youtube (home/resultados/canal)? */
export function isYouTubeBrowse(url: URL): boolean {
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return false;
  return (
    url.pathname === "/" ||
    url.pathname === "" ||
    url.pathname.startsWith("/results") ||
    url.pathname.startsWith("/feed")
  );
}
