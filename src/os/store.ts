"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Note,
  OsNotification,
  OsSettings,
  Rect,
  Stage,
  WindowOpenOptions,
  WindowState,
} from "./types";
import { DEFAULT_WALLPAPER } from "./wallpapers";
import { getAppDef } from "./registry";

const MENUBAR_H = 30;
const DOCK_RESERVED = 96;

const SEED_NOTES: Note[] = [
  {
    id: "note-welcome",
    title: "Bienvenido a macOS Web",
    content:
      "Bienvenido a macOS Web 27 “Liquid Glass”.\n\nCosas que puedes probar:\n• ⌘ + Espacio abre Spotlight\n• ⌘ + Tab cambia de aplicación\n• Haz clic derecho en el escritorio\n• Abre la app AXCGAMES desde el Dock\n\nTodo se guarda automáticamente en este navegador.",
    updatedAt: Date.now(),
    folder: "Notas",
  },
  {
    id: "note-shortcuts",
    title: "Atajos de teclado",
    content:
      "Atajos útiles del sistema:\n\n⌘ Espacio — Spotlight\n⌘ Tab — Cambiar app\n⌘ W — Cerrar ventana\n⌘ M — Minimizar\n⌘ Q — Salir de la app\n⌘ , — Ajustes\n\nLos semáforos (rojo, amarillo, verde) están en la esquina superior izquierda de cada ventana.",
    updatedAt: Date.now() - 86400000,
    folder: "Notas",
  },
];

export interface SysState {
  volume: number;
  brightness: number;
  wifi: boolean;
  bluetooth: boolean;
  airdrop: boolean;
  dnd: boolean;
  stageManager: boolean;
}

interface OsStore {
  stage: Stage;
  booted: boolean;
  windows: WindowState[];
  zTop: number;
  activeId: string | null;
  cascade: number;
  bouncing: Record<string, number>;
  spotlightOpen: boolean;
  launchpadOpen: boolean;
  controlCenterOpen: boolean;
  notifCenterOpen: boolean;
  switcherOpen: boolean;
  settings: OsSettings;
  sys: SysState;
  notes: Note[];
  notifications: OsNotification[];
  trashCount: number;

  setStage: (s: Stage) => void;
  finishBoot: () => void;
  login: () => void;
  logout: () => void;
  lock: () => void;

  openApp: (appId: string, opts?: WindowOpenOptions) => string | null;
  closeWindow: (id: string) => void;
  closeApp: (appId: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  zoomWindow: (id: string) => void;
  setWindowRect: (id: string, rect: Partial<Rect>) => void;
  setWindowTitle: (id: string, title: string) => void;
  minimizeActive: () => void;

  updateSettings: (patch: Partial<OsSettings>) => void;
  setSys: (patch: Partial<SysState>) => void;

  upsertNote: (note: Partial<Note> & { id?: string }) => string;
  deleteNote: (id: string) => void;

  notify: (appId: string, title: string, body: string) => void;
  dismissNotification: (id: string) => void;

  setSpotlight: (open: boolean) => void;
  setLaunchpad: (open: boolean) => void;
  setControlCenter: (open: boolean) => void;
  setNotifCenter: (open: boolean) => void;
  setSwitcher: (open: boolean) => void;
  closePopovers: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

let uidCounter = 0;
const uid = (prefix = "w") =>
  `${prefix}${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

export const useOS = create<OsStore>()(
  persist(
    (set, get) => ({
      stage: "boot",
      booted: false,
      windows: [],
      zTop: 10,
      activeId: null,
      cascade: 0,
      bouncing: {},
      spotlightOpen: false,
      launchpadOpen: false,
      controlCenterOpen: false,
      notifCenterOpen: false,
      switcherOpen: false,
      settings: {
        wallpaper: DEFAULT_WALLPAPER,
        appearance: "dark",
        accent: "#0a84ff",
        dockSize: 52,
        dockMagnify: true,
        reduceTransparency: false,
        userName: "Usuario",
      },
      sys: {
        volume: 65,
        brightness: 100,
        wifi: true,
        bluetooth: true,
        airdrop: false,
        dnd: false,
        stageManager: false,
      },
      notes: SEED_NOTES,
      notifications: [],
      trashCount: 3,

      setStage: (s) => set({ stage: s }),
      finishBoot: () => set({ booted: true, stage: "login" }),
      login: () => {
        set({ stage: "desktop" });
        setTimeout(() => {
          get().notify("finder", "Bienvenido", "Sesión iniciada. Disfruta de macOS Web 27.");
        }, 900);
      },
      logout: () =>
        set({
          stage: "login",
          windows: [],
          activeId: null,
          spotlightOpen: false,
          launchpadOpen: false,
          controlCenterOpen: false,
          notifCenterOpen: false,
        }),
      lock: () => set({ stage: "lock" }),

      openApp: (appId, opts) => {
        const def = getAppDef(appId);
        if (!def) return null;
        const state = get();

        // single-instance: focus existing
        if (def.singleInstance !== false) {
          const existing = state.windows.find((w) => w.appId === appId);
          if (existing) {
            get().focusWindow(existing.id);
            set({ launchpadOpen: false, spotlightOpen: false });
            closePopoversHelper(set);
            return existing.id;
          }
        }

        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        const w = Math.min(def.defaultSize.w, vw - 48);
        const h = Math.min(def.defaultSize.h, vh - MENUBAR_H - DOCK_RESERVED);
        const step = state.cascade % 7;
        const baseX = vw / 2 - w / 2 + (step - 3) * 26;
        const baseY = MENUBAR_H + 24 + step * 22;
        const x = clamp(opts?.center === false ? baseX : baseX, 12, Math.max(12, vw - w - 12));
        const y = clamp(baseY, MENUBAR_H + 8, Math.max(MENUBAR_H + 8, vh - h - 70));

        const id = uid();
        const win: WindowState = {
          id,
          appId,
          title: opts?.title ?? def.name,
          x,
          y,
          w,
          h,
          z: state.zTop + 1,
          minimized: false,
          maximized: false,
          payload: opts?.payload,
        };
        set({
          windows: [...state.windows, win],
          zTop: state.zTop + 1,
          activeId: id,
          cascade: state.cascade + 1,
          launchpadOpen: false,
          spotlightOpen: false,
          bouncing: { ...state.bouncing, [appId]: Date.now() },
        });
        closePopoversHelper(set);
        return id;
      },

      closeWindow: (id) => {
        const state = get();
        const rest = state.windows.filter((w) => w.id !== id);
        const nextActive =
          state.activeId === id
            ? [...rest].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null
            : state.activeId;
        set({ windows: rest, activeId: nextActive });
      },

      closeApp: (appId) => {
        const state = get();
        const rest = state.windows.filter((w) => w.appId !== appId);
        const nextActive =
          [...rest].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]?.id ?? null;
        set({ windows: rest, activeId: nextActive });
      },

      focusWindow: (id) => {
        const state = get();
        const win = state.windows.find((w) => w.id === id);
        if (!win) return;
        if (state.activeId === id && !win.minimized) return;
        set({
          windows: state.windows.map((w) =>
            w.id === id ? { ...w, z: state.zTop + 1, minimized: false } : w
          ),
          zTop: state.zTop + 1,
          activeId: id,
        });
      },

      minimizeWindow: (id) => {
        const state = get();
        const rest = state.windows.filter((w) => w.id !== id && !w.minimized);
        const nextActive =
          state.activeId === id
            ? [...rest].sort((a, b) => b.z - a.z)[0]?.id ?? null
            : state.activeId;
        set({
          windows: state.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
          activeId: nextActive,
        });
      },

      restoreWindow: (id) => get().focusWindow(id),

      zoomWindow: (id) => {
        const state = get();
        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        set({
          windows: state.windows.map((w) => {
            if (w.id !== id) return w;
            if (w.maximized && w.prevRect) {
              return { ...w, ...w.prevRect, maximized: false, prevRect: undefined };
            }
            return {
              ...w,
              prevRect: { x: w.x, y: w.y, w: w.w, h: w.h },
              x: 8,
              y: MENUBAR_H + 6,
              w: vw - 16,
              h: vh - MENUBAR_H - 6 - 78,
              maximized: true,
            };
          }),
        });
      },

      setWindowRect: (id, rect) => {
        const state = get();
        set({
          windows: state.windows.map((w) => (w.id === id ? { ...w, ...rect } : w)),
        });
      },

      setWindowTitle: (id, title) => {
        const state = get();
        set({
          windows: state.windows.map((w) => (w.id === id ? { ...w, title } : w)),
        });
      },

      minimizeActive: () => {
        const { activeId } = get();
        if (activeId) get().minimizeWindow(activeId);
      },

      updateSettings: (patch) => {
        set({ settings: { ...get().settings, ...patch } });
      },

      setSys: (patch) => {
        set({ sys: { ...get().sys, ...patch } });
      },

      upsertNote: (note) => {
        const id = note.id ?? uid("n");
        const state = get();
        const existing = state.notes.find((n) => n.id === id);
        if (existing) {
          set({
            notes: [
              { ...existing, ...note, id, updatedAt: Date.now() },
              ...state.notes.filter((n) => n.id !== id),
            ],
          });
        } else {
          set({
            notes: [
              {
                id,
                title: note.title?.trim() || "Nueva nota",
                content: note.content ?? "",
                updatedAt: Date.now(),
                folder: "Notas",
              },
              ...state.notes,
            ],
          });
        }
        return id;
      },

      deleteNote: (id) => {
        set({ notes: get().notes.filter((n) => n.id !== id) });
      },

      notify: (appId, title, body) => {
        if (get().sys.dnd) return;
        const n: OsNotification = { id: uid("nt"), appId, title, body, time: Date.now() };
        set({ notifications: [...get().notifications.slice(-4), n] });
      },

      dismissNotification: (id) => {
        set({ notifications: get().notifications.filter((n) => n.id !== id) });
      },

      setSpotlight: (open) => {
        closePopoversHelper(set);
        set({ spotlightOpen: open });
      },
      setLaunchpad: (open) => {
        closePopoversHelper(set);
        set({ launchpadOpen: open });
      },
      setControlCenter: (open) => {
        closePopoversHelper(set);
        set({ controlCenterOpen: open });
      },
      setNotifCenter: (open) => {
        closePopoversHelper(set);
        set({ notifCenterOpen: open });
      },
      setSwitcher: (open) => {
        set({ switcherOpen: open });
      },
      closePopovers: () => closePopoversHelper(set),
    }),
    {
      name: "macos-web-27",
      partialize: (s) => ({
        settings: s.settings,
        sys: s.sys,
        notes: s.notes,
        trashCount: s.trashCount,
      }),
    }
  )
);

function closePopoversHelper(set: (partial: Partial<OsStore>) => void) {
  set({ controlCenterOpen: false, notifCenterOpen: false, spotlightOpen: false, launchpadOpen: false });
}

/* ---------- helpers / selectors ---------- */

export function useActiveAppId(): string {
  return useOS((s) => {
    const win = s.windows.find((w) => w.id === s.activeId);
    return win && !win.minimized ? win.appId : "finder";
  });
}
