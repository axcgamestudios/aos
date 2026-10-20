"use client";

import { useEffect } from "react";
import { useOS } from "@/os/store";
import Wallpaper from "@/os/components/Wallpaper";
import Desktop from "@/os/components/Desktop";
import MenuBar from "@/os/components/MenuBar";
import Dock from "@/os/components/Dock";
import WindowManager from "@/os/components/WindowManager";
import Spotlight from "@/os/components/Spotlight";
import Launchpad from "@/os/components/Launchpad";
import ControlCenter from "@/os/components/ControlCenter";
import { NotificationCenter, NotificationToasts } from "@/os/components/NotificationCenter";
import AppSwitcher from "@/os/components/AppSwitcher";
import BootScreen from "@/os/components/BootScreen";
import { LoginGate } from "@/os/components/LoginScreen";

export default function Page() {
  const stage = useOS((s) => s.stage);
  const appearance = useOS((s) => s.settings.appearance);
  const accent = useOS((s) => s.settings.accent);
  const brightness = useOS((s) => s.sys.brightness);

  /* apply theme + accent */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", appearance === "dark");
    root.style.setProperty("--accent-os", accent);
  }, [appearance, accent]);

  /* global keyboard shortcuts */
  useEffect(() => {
    if (stage !== "desktop") return;
    const os = useOS.getState();
    const onKey = (e: KeyboardEvent) => {
      const s = useOS.getState();
      const mod = e.metaKey || e.ctrlKey;

      // Escape closes overlays
      if (e.key === "Escape") {
        if (s.spotlightOpen) s.setSpotlight(false);
        else if (s.launchpadOpen) s.setLaunchpad(false);
        else if (s.controlCenterOpen || s.notifCenterOpen) s.closePopovers();
        return;
      }

      if (mod && e.code === "Space") {
        e.preventDefault();
        s.setSpotlight(!s.spotlightOpen);
        return;
      }
      if (mod && e.key === "Tab") {
        e.preventDefault();
        if (!s.switcherOpen) s.setSwitcher(true);
        return;
      }
      // ⌘` cycles windows (⌘Tab is often reserved by the browser/OS)
      if (mod && e.code === "Backquote") {
        e.preventDefault();
        const vis = s.windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z);
        if (vis.length > 1) s.focusWindow(vis[1].id);
        else if (vis.length === 1) {
          const min = s.windows.filter((w) => w.minimized).sort((a, b) => b.z - a.z)[0];
          if (min) s.focusWindow(min.id);
        }
        return;
      }
      if (mod && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        if (s.activeId) s.closeWindow(s.activeId);
        return;
      }
      if (mod && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        if (s.activeId) s.minimizeWindow(s.activeId);
        return;
      }
      if (mod && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        const active = s.windows.find((w) => w.id === s.activeId);
        if (active) s.closeApp(active.appId);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        s.openApp("settings");
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      void os;
    };
  }, [stage]);

  return (
    <div className="os-no-select fixed inset-0 overflow-hidden bg-black" data-os="macos-web-27">
      <Wallpaper />

      {stage === "desktop" && (
        <>
          <Desktop />
          <WindowManager />
          <MenuBar />
          <Launchpad />
          <Dock />
          <ControlCenter />
          <NotificationCenter />
          <NotificationToasts />
          <Spotlight />
          <AppSwitcher />
        </>
      )}

      <LoginGate />
      {stage === "boot" && <BootScreen />}

      {/* brightness dimmer */}
      <div
        className="pointer-events-none fixed inset-0 z-[8000] bg-black transition-opacity duration-200"
        style={{ opacity: ((100 - brightness) / 100) * 0.78 }}
        aria-hidden
      />
    </div>
  );
}
