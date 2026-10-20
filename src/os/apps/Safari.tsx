"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Lock, RotateCw, Search, Star } from "lucide-react";
import type { AppProps } from "../types";
import { AXC_URL } from "./AxcGames";

interface Fav {
  name: string;
  url: string;
  color: string;
  letter: string;
}

const FAVORITES: Fav[] = [
  { name: "AXCGAMES", url: AXC_URL, color: "linear-gradient(135deg,#6366f1,#ec4899)", letter: "A" },
  { name: "Bing", url: "https://www.bing.com", color: "linear-gradient(135deg,#0f766e,#14b8a6)", letter: "b" },
  { name: "Ejemplo", url: "https://example.com", color: "linear-gradient(135deg,#334155,#64748b)", letter: "e" },
  { name: "Wikipedia", url: "https://es.wikipedia.org", color: "linear-gradient(135deg,#475569,#0ea5e9)", letter: "W" },
];

const HOME = "about:start";

export default function SafariApp({ win }: AppProps) {
  const initialUrl = (win.payload?.url as string) ?? HOME;
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [hIndex, setHIndex] = useState(0);
  const [address, setAddress] = useState(initialUrl === HOME ? "" : initialUrl);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = history[hIndex];

  // derive address from navigation (no effect needed)
  const [prevNav, setPrevNav] = useState(current);
  if (current !== prevNav) {
    setPrevNav(current);
    setAddress(current === HOME ? "" : current);
  }

  const navigate = (raw: string) => {
    let url = raw.trim();
    if (!url) return;
    const isUrl = /^https?:\/\//i.test(url) || /^[\w-]+(\.[\w-]+)+/.test(url);
    if (!isUrl) url = `https://www.bing.com/search?q=${encodeURIComponent(url)}`;
    else if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setLoading(true);
    const next = [...history.slice(0, hIndex + 1), url];
    setHistory(next);
    setHIndex(next.length - 1);
    setAddress(url);
  };

  const showStart = current === HOME;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/8 bg-neutral-100/80 px-3 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-900/80">
        <button
          disabled={hIndex === 0}
          onClick={() => setHIndex((i) => Math.max(0, i - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Atrás"
        >
          <ArrowLeft size={15} />
        </button>
        <button
          disabled={hIndex >= history.length - 1}
          onClick={() => setHIndex((i) => Math.min(history.length - 1, i + 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 disabled:opacity-30 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Adelante"
        >
          <ArrowRight size={15} />
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
            placeholder="Buscar o introducir nombre de dominio"
            className="os-input h-full w-full bg-transparent text-[12px] text-neutral-700 outline-none placeholder:text-neutral-400 dark:text-neutral-200"
          />
        </form>
        <button
          onClick={() => {
            if (showStart) return;
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10"
          title="Recargar"
        >
          <RotateCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* favorites bar */}
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

      {/* content */}
      <div className="relative min-h-0 flex-1">
        {showStart ? (
          <div className="mac-scrollbar h-full overflow-y-auto bg-gradient-to-b from-neutral-50 to-neutral-100 px-8 py-10 dark:from-neutral-900 dark:to-neutral-950">
            <div className="mx-auto max-w-xl">
              <h2 className="mb-1 text-center text-[15px] font-semibold text-neutral-700 dark:text-neutral-200">
                Favoritos
              </h2>
              <p className="mb-6 text-center text-[11px] text-neutral-400">
                Algunos sitios bloquean su visualización embebida; usa “Abrir fuera” si uno no carga.
              </p>
              <div className="grid grid-cols-4 gap-4">
                {FAVORITES.map((f) => (
                  <button
                    key={f.name}
                    onClick={() => navigate(f.url)}
                    className="group flex flex-col items-center gap-2"
                  >
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
                    Consejo: escribe en la barra de direcciones para buscar en la web o ve directo a
                    un dominio. AXCGAMES también tiene su propia app en el Dock.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <iframe
              key={current + reloadKey}
              src={current}
              title="Safari"
              className="h-full w-full border-0"
              allow="fullscreen; autoplay; gamepad; clipboard-write"
              onLoad={() => setLoading(false)}
            />
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2">
              <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-[11px] text-white opacity-0 backdrop-blur transition-opacity hover:opacity-100">
                <span>¿No carga? El sitio puede bloquear iframes.</span>
                <button
                  onClick={() => window.open(current, "_blank", "noopener,noreferrer")}
                  className="flex items-center gap-1 font-semibold text-sky-300"
                >
                  <ExternalLink size={11} /> Abrir fuera
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
