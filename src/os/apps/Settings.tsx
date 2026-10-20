"use client";

import { useState } from "react";
import { Check, Info, Monitor, Palette, Sun, Moon } from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import { ACCENTS, WALLPAPERS } from "../wallpapers";
import { AppleLogo } from "../icons";
type Pane = "appearance" | "wallpaper" | "dock" | "general";

const PANES: { id: Pane; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "appearance", label: "Apariencia", icon: Palette },
  { id: "wallpaper", label: "Fondo de pantalla", icon: Monitor },
  { id: "dock", label: "Dock y barra de menús", icon: Sun },
  { id: "general", label: "General", icon: Info },
];

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

export default function SettingsApp(_props: AppProps) {
  const settings = useOS((s) => s.settings);
  const sys = useOS((s) => s.sys);
  const setSys = useOS((s) => s.setSys);
  const update = useOS((s) => s.updateSettings);
  const openApp = useOS((s) => s.openApp);
  const [pane, setPane] = useState<Pane>("appearance");

  return (
    <div className="flex h-full">
      {/* sidebar */}
      <div className="w-48 shrink-0 border-r border-black/8 bg-neutral-100/70 backdrop-blur-2xl dark:border-white/8 dark:bg-neutral-900/60">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[13px] font-bold text-white">
            U
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{settings.userName}</p>
            <p className="text-[10px] text-neutral-400">Apple Account</p>
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
          <Card>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
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
          </Card>
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

        {pane === "general" && (
          <>
            <Card title="Acerca de">
              <Row>
                <div className="flex items-center gap-4">
                  <AppleLogo className="h-8 w-8 text-neutral-700 dark:text-neutral-200" />
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">macOS Web 27.0</p>
                    <p className="text-[11px] text-neutral-400">Compilación 27A1241 · Liquid Glass</p>
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
