"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe, Info, Monitor, Palette, Sun, Moon, Upload, User, Search as SearchIcon, ShieldCheck } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { ACCENTS, CUSTOM_WALLPAPER_ID, WALLPAPERS } from "../wallpapers";
import { PearLogo } from "../icons";
import {
  BAREMUX_VERSION,
  DEMO_WISP,
  LIBCURL_VERSION,
  SCRAMJET_VERSION,
  applyTransport,
  getDiagnostics,
  onDiagnostics,
  testWisp,
  type EngineDiagnostics,
} from "../engine/scramjet";
type Pane = "appearance" | "wallpaper" | "dock" | "browser" | "general";

const PANES: { id: Pane; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "wallpaper", label: "Fondo de pantalla", icon: Monitor },
  { id: "dock", label: "Dock y barra de menús", icon: Sun },
  { id: "browser", label: "Navegador", icon: Globe },
  { id: "general", label: "General", icon: Info },
];

/** reescala una imagen a dataURL (para wallpapers/avatares sin ocupar mucho localStorage) */
function fileToDataUrl(file: File, maxW: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

function Card({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="mb-4">
      {title && <h3 className="mb-2 ml-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>}
      <div className="overflow-hidden rounded-xl border border-black/8 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/60">
        {children}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 px-4 py-3 last:border-0 dark:border-white/5">
      {children}
    </div>
  );
}

export default function SettingsApp({ win }: AppProps) {
  const settings = useOS((s) => s.settings);
  const sys = useOS((s) => s.sys);
  const setSys = useOS((s) => s.setSys);
  const update = useOS((s) => s.updateSettings);
  const openApp = useOS((s) => s.openApp);
  const browser = useOS((s) => s.browser);
  const updateBrowser = useOS((s) => s.updateBrowser);
  const notify = useOS((s) => s.notify);
  const [pane, setPane] = useState<Pane>((win.payload?.section as Pane) || "appearance");

  return (
    <div className="flex h-full">
      {/* sidebar */}
      <div className="w-48 shrink-0 border-r border-black/8 bg-neutral-100/70 backdrop-blur-2xl dark:border-white/8 dark:bg-neutral-900/60">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
          {settings.avatar ? (
            <img src={settings.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[13px] font-bold text-white">
              {settings.userName[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <div>
            <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{settings.userName}</p>
            <p className="text-[10px] text-neutral-400">Cuenta local de axcsOS</p>
          </div>
        </div>
        <div className="px-2 pt-1">
          {PANES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPane(p.id)}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-[12px] ${
                pane === p.id
                  ? "bg-[var(--accent-os)] text-white"
                  : "text-neutral-700 hover:bg-black/8 dark:text-neutral-200 dark:hover:bg-white/10"
              }`}
            >
              <p.icon size={14} className={pane === p.id ? "text-white" : "text-[var(--accent-os)]"} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="mac-scrollbar min-w-0 flex-1 overflow-y-auto bg-neutral-50/80 p-5 dark:bg-neutral-950/80">
        <h2 className="mb-4 px-1 text-[17px] font-bold text-neutral-800 dark:text-neutral-100">
          {PANES.find((p) => p.id === pane)?.label}
        </h2>

        {pane === "appearance" && (
          <>
            <Card>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Apariencia</span>
                <div className="flex gap-2.5">
                  {(
                    [
                      { id: "light", label: "Claro", icon: Sun },
                      { id: "dark", label: "Oscuro", icon: Moon },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => update({ appearance: mode.id })}
                      className="flex flex-col items-center gap-1"
                    >
                      <div
                        className={`flex h-11 w-16 items-center justify-center rounded-lg border-2 transition ${
                          settings.appearance === mode.id
                            ? "border-[var(--accent-os)]"
                            : "border-black/10 dark:border-white/15"
                        } ${mode.id === "light" ? "bg-white" : "bg-neutral-900"}`}
                      >
                        <mode.icon size={16} className={mode.id === "light" ? "text-neutral-700" : "text-amber-300"} />
                      </div>
                      <span className="text-[10.5px] text-neutral-500">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Color de acento</span>
                <div className="flex gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.value}
                      title={a.name}
                      onClick={() => update({ accent: a.value })}
                      className="flex h-5 w-5 items-center justify-center rounded-full transition hover:scale-110"
                      style={{ background: a.value }}
                    >
                      {settings.accent === a.value && <Check size={11} className="text-white" strokeWidth={3.5} />}
                    </button>
                  ))}
                </div>
              </Row>
              <Row>
                <div>
                  <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Reducir transparencia</p>
                  <p className="text-[10.5px] text-neutral-400">Sustituye el Liquid Glass por materiales opacos</p>
                </div>
                <Toggle checked={settings.reduceTransparency} onChange={(v) => update({ reduceTransparency: v })} />
              </Row>
            </Card>
          </>
        )}

        {pane === "wallpaper" && (
          <>
            <Card>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                {settings.customWallpaper && (
                  <button
                    onClick={() => update({ wallpaper: CUSTOM_WALLPAPER_ID })}
                    className="group flex flex-col gap-1.5"
                  >
                    <div
                      className={`aspect-[16/10] rounded-lg border-2 bg-neutral-300 bg-cover bg-center transition shadow-sm group-hover:scale-[1.02] dark:bg-neutral-800 ${
                        settings.wallpaper === CUSTOM_WALLPAPER_ID ? "border-[var(--accent-os)]" : "border-black/10 dark:border-white/10"
                      }`}
                      style={{ backgroundImage: `url(${settings.customWallpaper})` }}
                    />
                    <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                      {settings.customWallpaperName ?? "Personalizado"}
                    </span>
                  </button>
                )}
                {WALLPAPERS.map((w) => (
                  <button key={w.id} onClick={() => update({ wallpaper: w.id })} className="group flex flex-col gap-1.5">
                    <div
                      className={`aspect-[16/10] rounded-lg border-2 bg-neutral-300 transition shadow-sm group-hover:scale-[1.02] dark:bg-neutral-800 ${
                        settings.wallpaper === w.id ? "border-[var(--accent-os)]" : "border-black/10 dark:border-white/10"
                      }`}
                      style={{ background: w.css }}
                    />
                    <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">{w.name}</span>
                  </button>
                ))}
              </div>
              <WallpaperUpload
                onUploaded={(dataUrl, name) => {
                  update({ customWallpaper: dataUrl, customWallpaperName: name, wallpaper: CUSTOM_WALLPAPER_ID });
                  notify("settings", "Fondo actualizado", "Tu imagen es ahora el fondo de pantalla.");
                }}
              />
            </Card>
          </>
        )}

        {pane === "dock" && (
          <>
            <Card>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Tamaño de los iconos</span>
                <input
                  type="range"
                  min={40}
                  max={68}
                  value={settings.dockSize}
                  onChange={(e) => update({ dockSize: Number(e.target.value) })}
                  className="w-44 accent-[var(--accent-os)]"
                />
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Ampliación</span>
                <Toggle checked={settings.dockMagnify} onChange={(v) => update({ dockMagnify: v })} />
              </Row>
            </Card>
            <Card title="Barra de menús">
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">No molestar</span>
                <Toggle checked={sys.dnd} onChange={(v) => setSys({ dnd: v })} />
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Wi-Fi</span>
                <Toggle checked={sys.wifi} onChange={(v) => setSys({ wifi: v })} />
              </Row>
              <Row>
                <span className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Bluetooth</span>
                <Toggle checked={sys.bluetooth} onChange={(v) => setSys({ bluetooth: v })} />
              </Row>
            </Card>
          </>
        )}

        {pane === "browser" && <BrowserPane />}

        {pane === "general" && (
          <>
            <Card title="Perfil">
              <Row>
                <div className="flex min-w-0 items-center gap-3">
                  {settings.avatar ? (
                    <img src={settings.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[14px] font-bold text-white">
                      {settings.userName[0]?.toUpperCase() ?? "U"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <input
                      value={settings.userName}
                      onChange={(e) => update({ userName: e.target.value.slice(0, 24) || "Usuario" })}
                      className="w-40 rounded-md border border-black/10 bg-white px-2 py-1 text-[12.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <p className="mt-1 text-[10.5px] text-neutral-400">Nombre visible en el sistema</p>
                  </div>
                </div>
                <AvatarUpload
                  onUploaded={(dataUrl) => {
                    update({ avatar: dataUrl });
                    notify("settings", "Avatar actualizado", "Foto de perfil guardada.");
                  }}
                />
              </Row>
            </Card>
            <Card title="Acerca de">
              <Row>
                <div className="flex items-center gap-4">
                  <PearLogo className="h-9 w-5 text-neutral-700 dark:text-neutral-200" />
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">axcsOS 1.0</p>
                    <p className="text-[11px] text-neutral-400">Compilación 27A1241 · Liquid Glass · Motor Scramjet {SCRAMJET_VERSION}</p>
                  </div>
                </div>
                <button
                  onClick={() => openApp("about")}
                  className="rounded-md border border-black/10 bg-white px-3 py-1 text-[11.5px] font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  Más información
                </button>
              </Row>
              {[
                ["Chip", "Z1 Silicon · 8 núcleos"],
                ["Memoria", "16 GB"],
                ["Número de serie", "Z1WEB27X0001"],
                ["Pantalla", `${typeof window !== "undefined" ? window.screen.width : 1440} × ${typeof window !== "undefined" ? window.screen.height : 900}`],
              ].map(([k, v]) => (
                <Row key={k}>
                  <span className="text-[12.5px] text-neutral-500">{k}</span>
                  <span className="text-[12.5px] font-medium text-neutral-700 dark:text-neutral-200">{v}</span>
                </Row>
              ))}
            </Card>
            <Card title="Almacenamiento">
              <div className="p-4">
                <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <div className="h-full w-[34%] rounded-full bg-gradient-to-r from-[var(--accent-os)] to-purple-500" />
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">171,4 GB usados de 512 GB · 251,42 GB libres</p>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= panel Navegador ================= */
function BrowserPane() {
  const browser = useOS((s) => s.browser);
  const updateBrowser = useOS((s) => s.updateBrowser);
  const notify = useOS((s) => s.notify);
  const clearHistory = useOS((s) => s.clearHistory);
  const [wispInput, setWispInput] = useState(browser.wispUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [diag, setDiag] = useState<EngineDiagnostics>(getDiagnostics());

  useEffect(() => onDiagnostics(setDiag), []);
  useEffect(() => setWispInput(browser.wispUrl), [browser.wispUrl]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await testWisp(wispInput);
    setTestResult(r);
    setTesting(false);
  };

  const applyWisp = async () => {
    updateBrowser({ wispUrl: wispInput });
    try {
      await applyTransport(wispInput);
      notify("settings", "Transporte actualizado", `Navegando vía ${wispInput}`);
    } catch (e) {
      notify("settings", "Transporte", `Se aplicará al reiniciar el motor (${String((e as Error).message ?? e).slice(0, 60)})`);
    }
  };

  const isDemo = browser.wispUrl === DEMO_WISP;
  const statusColor =
    diag.status === "ready" ? "bg-emerald-500" : diag.status === "error" ? "bg-rose-500" : diag.status === "loading" ? "bg-amber-500" : "bg-neutral-400";

  return (
    <>
      <Card title="Motor de navegación">
        <Row>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12.5px] text-neutral-700 dark:text-neutral-200">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
              Estado: <b>{diag.status === "ready" ? "activo" : diag.status === "loading" ? "iniciando" : diag.status === "error" ? "error" : "en espera"}</b>
            </p>
            <p className="mt-0.5 text-[10.5px] text-neutral-400">
              Scramjet {SCRAMJET_VERSION} · BareMux {BAREMUX_VERSION} · libcurl {LIBCURL_VERSION}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-neutral-400">
            <span>{diag.swRegistered ? "SW registrado ✓" : "SW sin registrar"}</span>
            <span>{diag.transportSet ? "Transporte listo ✓" : "Transporte pendiente"}</span>
          </div>
        </Row>
        <Row>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Servidor de transporte (wisp)</p>
            <p className="mb-2 text-[10.5px] leading-relaxed text-neutral-400">
              El navegador carga los sitios a través de este servidor por WebSocket. Despliega el tuyo con{" "}
              <code>server/wisp-server.mjs</code> (Render, Railway, Fly.io o VPS) y pon aquí su URL <code>wss://…</code>.
            </p>
            <div className="flex gap-2">
              <input
                value={wispInput}
                onChange={(e) => setWispInput(e.target.value)}
                spellCheck={false}
                placeholder="wss://tu-servidor-wisp.example.com/"
                className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <button
                onClick={runTest}
                disabled={testing}
                className="shrink-0 rounded-md border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {testing ? "Probando…" : "Probar"}
              </button>
              <button
                onClick={applyWisp}
                className="shrink-0 rounded-md bg-[var(--accent-os)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
              >
                Aplicar
              </button>
            </div>
            {testResult && (
              <p className={`mt-1.5 text-[10.5px] ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                {testResult.ok ? "✓ " : "✗ "}
                {testResult.detail}
              </p>
            )}
            {diag.error && <p className="mt-1.5 text-[10.5px] text-rose-500">Motor: {diag.error}</p>}
          </div>
        </Row>
        {isDemo && (
          <div className="flex items-start gap-2 border-t border-black/5 bg-amber-500/10 px-4 py-2.5 text-[10.5px] leading-relaxed text-amber-700 dark:border-white/5 dark:text-amber-300">
            <ShieldCheck size={13} className="mt-0.5 shrink-0" />
            <span>
              Actualmente usas el transporte público de demostración de Mercury Workshop (externo, sin garantía de disponibilidad y no controlado por ti).
              Para un uso serio, despliega tu propio servidor wisp y configúralo arriba.
            </span>
          </div>
        )}
      </Card>

      <Card title="Búsqueda">
        <Row>
          <div className="min-w-0">
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Motor de búsqueda</p>
            <p className="text-[10.5px] text-neutral-400">Resultados reales mostrados dentro de Safari; se abren por el motor integrado.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <ChoiceButton active={browser.searchEngine === "bing"} onClick={() => updateBrowser({ searchEngine: "bing" })} label="Bing" />
            <ChoiceButton active={browser.searchEngine === "searxng"} onClick={() => updateBrowser({ searchEngine: "searxng" })} label="SearXNG" />
          </div>
        </Row>
        {browser.searchEngine === "searxng" && (
          <Row>
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[12.5px] text-neutral-700 dark:text-neutral-200">Instancia SearXNG (API JSON)</p>
              <input
                value={browser.searxngUrl}
                onChange={(e) => updateBrowser({ searxngUrl: e.target.value })}
                spellCheck={false}
                placeholder="https://searx.example.com"
                className="w-full rounded-md border border-black/10 bg-white px-2.5 py-1.5 text-[11.5px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <p className="mt-1.5 text-[10.5px] text-neutral-400">
                La instancia debe tener <code>format=json</code> habilitado. Sin configurar, Safari seguirá usando DuckDuckGo.
              </p>
            </div>
          </Row>
        )}
      </Card>

      <Card title="Privacidad">
        <Row>
          <div>
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Guardar historial</p>
            <p className="text-[10.5px] text-neutral-400">Las visitas se guardan solo en este dispositivo</p>
          </div>
          <Toggle checked={browser.keepHistory} onChange={(v) => updateBrowser({ keepHistory: v })} />
        </Row>
        <Row>
          <div>
            <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Borrar historial ahora</p>
            <p className="text-[10.5px] text-neutral-400">Elimina todas las entradas guardadas</p>
          </div>
          <button
            onClick={() => {
              clearHistory();
              notify("settings", "Historial", "Historial de navegación borrado.");
            }}
            className="shrink-0 rounded-md border border-rose-500/40 px-3 py-1 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10"
          >
            Borrar
          </button>
        </Row>
      </Card>

      <Card title="Créditos del motor">
        <div className="px-4 py-3 text-[10.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Navegación integrada con <b>Scramjet</b> (MercuryWorkshop, OSS), <b>BareMux</b> y <b>libcurl-transport</b>, con backend <b>wisp</b>
          {" "}(wisp-js). Archivos servidos desde el propio sitio (sin dependencias externas del frontend). Los sitios se cargan tal cual;
          el sistema no altera DRM ni autenticaciones de terceros.
        </div>
      </Card>
    </>
  );
}

function ChoiceButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
        active ? "bg-[var(--accent-os)] text-white" : "border border-black/10 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

/* ================= subidas de archivos ================= */
function WallpaperUpload({ onUploaded }: { onUploaded: (dataUrl: string, name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-black/5 px-4 py-3 dark:border-white/5">
      <div>
        <p className="text-[12.5px] text-neutral-700 dark:text-neutral-200">Usar tu propia imagen</p>
        <p className="text-[10.5px] text-neutral-400">JPG/PNG · se reescala y guarda en este dispositivo</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const dataUrl = await fileToDataUrl(f, 1920, 0.82);
            onUploaded(dataUrl, f.name.replace(/\.[^.]+$/, ""));
          } catch {
            /* imagen inválida */
          }
          e.target.value = "";
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
      >
        <Upload size={11} /> Elegir imagen…
      </button>
    </div>
  );
}

function AvatarUpload({ onUploaded }: { onUploaded: (dataUrl: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            onUploaded(await fileToDataUrl(f, 96, 0.85));
          } catch {
            /* imagen inválida */
          }
          e.target.value = "";
        }}
      />
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => ref.current?.click()}
          className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition hover:bg-neutral-50 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <Upload size={10} className="mr-1 inline" /> Foto
        </button>
      </div>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] rounded-full transition ${checked ? "bg-[var(--accent-os)]" : "bg-black/15 dark:bg-white/20"}`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-[2px]"}`}
      />
    </button>
  );
}
