"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download as DownloadIcon,
  ExternalLink,
  Home,
  Lock,
  RotateCw,
  Search,
  ShieldAlert,
  Star,
  X,
} from "lucide-react";
import type { AppProps } from "../types";
import { AXC_URL } from "./AxcGames";
import { useOS, setDownloadObjectUrl } from "../store";

/* ============================================================
   Safari axcsOS — navegador 100% nativo vía /api/proxy
   - Sin Google/Bing: búsqueda con DuckDuckGo
   - Recursos de la web (CSS/JS/imágenes) reescritos por el proxy
   - Descargas integradas en el OS
   ============================================================ */

const PROXY = "/api/proxy?u=";
const toProxy = (url: string) => PROXY + encodeURIComponent(url);
const DDG = (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

interface Fav {
  name: string;
  url: string;
  color: string;
  letter: string;
}

const FAVORITES: Fav[] = [
  { name: "AXCGAMES", url: AXC_URL, color: "linear-gradient(135deg,#6366f1,#ec4899)", letter: "A" },
  { name: "YouTube", url: "https://www.youtube.com", color: "linear-gradient(135deg,#c4302b,#ff0033)", letter: "▶" },
  { name: "Wikipedia", url: "https://es.wikipedia.org", color: "linear-gradient(135deg,#475569,#0ea5e9)", letter: "W" },
  { name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=axcsOS", color: "linear-gradient(135deg,#de5833,#f77c3c)", letter: "D" },
];

const HOME = "about:start";

const STREAMING_RE = /(netflix|hulu|hbo|max|disney\+|disneyplus|primevideo|crunchyroll|movistarplus|filmin|skyshowtime|appletv)/i;

function normalizeInput(raw: string): string {
  let url = raw.trim();
  if (!url) return HOME;
  if (/^https?:\/\//i.test(url)) return url;
  // dominio?
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url) && !url.includes(" ")) {
    return `https://${url}`;
  }
  // búsqueda
  return DDG(url);
}

export default function SafariApp({ win }: AppProps) {
  const initialUrl = (win.payload?.url as string) ?? HOME;
  const [src, setSrc] = useState(initialUrl === HOME ? HOME : toProxy(initialUrl));
  const [address, setAddress] = useState(initialUrl === HOME ? "" : initialUrl);
  const [pageUrl, setPageUrl] = useState(initialUrl === HOME ? "" : initialUrl);
  const [pageTitle, setPageTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingHint, setStreamingHint] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const winId = win.id;

  const addDownload = useOS((s) => s.addDownload);
  const setWindowTitle = useOS((s) => s.setWindowTitle);
  const notify = useOS((s) => s.notify);

  const navigate = (raw: string) => {
    const url = normalizeInput(raw);
    if (!url || url === HOME) {
      setSrc(HOME);
      setPageUrl("");
      setPageTitle("");
      setWindowTitle(winId, "Safari");
      return;
    }
    setLoading(true);
    setStreamingHint(STREAMING_RE.test(url));
    setSrc(toProxy(url));
    setPageUrl(url);
    setAddress(url);
  };

  /* escuchar mensajes del shim inyectado */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { __axcs?: string; title?: string; url?: string; name?: string } | null;
      if (!d || typeof d !== "object") return;
      if (d.__axcs === "nav") {
        const url = typeof d.url === "string" ? d.url : "";
        const title = typeof d.title === "string" ? d.title : "";
        if (url) {
          setPageUrl(url);
          setAddress(url);
          setStreamingHint(STREAMING_RE.test(url));
        }
        if (title) {
          setPageTitle(title);
          setWindowTitle(winId, title.length > 42 ? title.slice(0, 42) + "…" : title);
        }
      } else if (d.__axcs === "download") {
        void doDownload(String(d.url), String(d.name ?? "archivo"));
      } else if (d.__axcs === "jserror") {
        // diagnóstico del motor proxy en consola
        console.warn("[axcsOS proxy]", (d as { msg?: string }).msg, (d as { file?: string }).file ?? "");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winId]);

  const doDownload = async (url: string, name: string) => {
    try {
      notify("safari", "Descargando…", name);
      const res = await fetch(toProxy(url));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      const id = addDownload({ name, url, size: blob.size, mime: blob.type || "application/octet-stream" });
      setDownloadObjectUrl(id, objectUrl);
      notify("safari", "Descarga completada", `${name} · listo en Descargas`);
    } catch {
      notify("safari", "Error de descarga", `No se pudo descargar ${name}`);
    }
  };

  const cmd = (c: "back" | "forward" | "reload") => {
    if (src === HOME) return;
    if (c === "reload") setLoading(true);
    iframeRef.current?.contentWindow?.postMessage({ __axcsCmd: c }, "*");
  };

  const showStart = src === HOME;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/8 bg-neutral-100/80 px-3 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-900/80">
        <button
          onClick={() => cmd("back")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Atrás"
          disabled={showStart}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          onClick={() => cmd("forward")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Adelante"
          disabled={showStart}
        >
          <ArrowRight size={15} />
        </button>
        <button
          onClick={() => navigate(HOME)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Inicio"
        >
          <Home size={14} />
        </button>
        <form
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-lg bg-black/5 px-3 focus-within:ring-2 focus-within:ring-[var(--accent-os)]/50 dark:bg-white/10"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
            inputRef.current?.blur();
          }}
        >
          {showStart ? (
            <Search size={12} className="shrink-0 text-neutral-400" />
          ) : (
            <Lock size={11} className="shrink-0 text-emerald-500" />
          )}
          <input
            ref={inputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Buscar con DuckDuckGo o introducir dirección"
            spellCheck={false}
            className="os-input h-full w-full bg-transparent text-[12px] text-neutral-700 outline-none placeholder:text-neutral-400 dark:text-neutral-200"
          />
          {address && (
            <button type="button" onClick={() => { setAddress(""); inputRef.current?.focus(); }} className="shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
              <X size={11} />
            </button>
          )}
        </form>
        <button
          onClick={() => cmd("reload")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Recargar"
          disabled={showStart}
        >
          <RotateCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* barra de favoritos */}
      <div className="no-scrollbar flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-black/8 bg-neutral-50/90 px-3 dark:border-white/8 dark:bg-neutral-900/60">
        {FAVORITES.map((f) => (
          <button
            key={f.name}
            onClick={() => navigate(f.url)}
            className="flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-neutral-600 transition hover:bg-black/8 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-[5px] text-[9px] font-bold text-white"
              style={{ background: f.color }}
            >
              {f.letter}
            </span>
            {f.name}
          </button>
        ))}
      </div>

      {loading && (
        <div className="h-0.5 shrink-0 overflow-hidden bg-transparent">
          <div className="animate-progress h-full w-1/3 rounded-full bg-[var(--accent-os)]" />
        </div>
      )}

      {/* contenido */}
      <div className="relative min-h-0 flex-1">
        {showStart ? (
          <div className="mac-scrollbar h-full overflow-y-auto bg-gradient-to-b from-neutral-50 to-neutral-100 px-8 py-10 dark:from-neutral-900 dark:to-neutral-950">
            <div className="mx-auto max-w-xl">
              <h2 className="mb-1 text-center text-[15px] font-semibold text-neutral-700 dark:text-neutral-200">
                Explorar con Safari
              </h2>
              <p className="mb-6 text-center text-[11px] text-neutral-400">
                Navegación nativa por proxy — sin rastreadores, sin Google. Las páginas cargan completas.
              </p>
              <div className="grid grid-cols-4 gap-4">
                {FAVORITES.map((f) => (
                  <button key={f.name} onClick={() => navigate(f.url)} className="group flex flex-col items-center gap-2">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-md transition group-hover:scale-105"
                      style={{ background: f.color }}
                    >
                      {f.letter}
                    </div>
                    <span className="text-[11px] text-neutral-600 dark:text-neutral-300">{f.name}</span>
                  </button>
                ))}
              </div>
              <div className="glass lg-specular mx-auto mt-10 max-w-md rounded-2xl p-4 dark:glass-dark">
                <div className="flex items-center gap-3">
                  <Star size={16} className="shrink-0 text-amber-400" />
                  <p className="text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                    Escribe arriba para buscar en la web o ir directo a un dominio. Los archivos que descargues
                    quedan en la app <b>Descargas</b> del Launchpad.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              key={src}
              src={src}
              title="Safari"
              className="h-full w-full border-0 bg-white"
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation"
              allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
              onLoad={() => setLoading(false)}
            />
            {/* barra de streaming */}
            {streamingHint && (
              <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-4 py-2 text-[11px] text-white shadow-lg backdrop-blur">
                <ShieldAlert size={13} className="shrink-0 text-amber-400" />
                <span className="max-w-[300px] truncate">
                  Plataforma de streaming: si el vídeo no arranca (requiere DRM), ábrela fuera.
                </span>
                <button
                  onClick={() => pageUrl && window.open(pageUrl, "_blank", "noopener,noreferrer")}
                  className="flex shrink-0 items-center gap-1 font-semibold text-sky-300"
                >
                  <ExternalLink size={11} /> Abrir fuera
                </button>
                <button onClick={() => setStreamingHint(false)} className="shrink-0 text-white/50 hover:text-white">
                  <X size={12} />
                </button>
              </div>
            )}
            {/* botón flotante abrir fuera */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[11px] text-white opacity-0 backdrop-blur transition-opacity hover:opacity-100">
                <span className="max-w-[240px] truncate">{pageTitle || pageUrl}</span>
                <button
                  onClick={() => pageUrl && window.open(pageUrl, "_blank", "noopener,noreferrer")}
                  className="flex items-center gap-1 font-semibold text-sky-300"
                >
                  <ExternalLink size={11} /> Abrir fuera
                </button>
                <button
                  onClick={() => pageUrl && void doDownload(pageUrl, (pageTitle || "pagina") + ".html")}
                  className="flex items-center gap-1 font-semibold text-emerald-300"
                  title="Guardar la página como archivo"
                >
                  <DownloadIcon size={11} /> Guardar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
