"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Fingerprint } from "lucide-react";
import { useOS } from "../store";
import { AvatarIcon } from "../icons";

function ClockBig() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute top-[7%] flex flex-col items-center text-white drop-shadow-lg">
      <p className="text-[15px] font-medium capitalize text-white/90">
        {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <p className="text-[76px] font-semibold leading-none tabular-nums tracking-tight">
        {now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

export function LoginScreen({ mode }: { mode: "login" | "lock" }) {
  const userName = useOS((s) => s.settings.userName);
  const login = useOS((s) => s.login);
  const setStage = useOS((s) => s.setStage);
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const doEnter = () => {
    setLeaving(true);
    setTimeout(() => {
      if (mode === "login") login();
      else setStage("desktop");
    }, 450);
  };

  const submit = () => {
    if (!pw.trim()) {
      setShake(true);
      setError("Introduce la contraseña de la demo: cualquier texto");
      setTimeout(() => setShake(false), 500);
      return;
    }
    doEnter();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="fixed inset-0 z-[6500]"
    >
      {/* frosted layer over the wallpaper behind */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: "blur(70px) brightness(0.55) saturate(1.25)",
          WebkitBackdropFilter: "blur(70px) brightness(0.55) saturate(1.25)",
        }}
      />
      <div className="absolute inset-0 bg-neutral-900/25" />

      <div className="relative flex h-full flex-col items-center justify-center">
        {mode === "lock" && <ClockBig />}

      <div className={`relative flex flex-col items-center gap-4 ${mode === "lock" ? "mt-24" : ""}`}>
        <AvatarIcon className="h-[110px] w-[110px] rounded-full shadow-2xl ring-[3px] ring-white/25" />
        <h1 className="text-[19px] font-semibold text-white drop-shadow">{userName}</h1>

        <motion.div
          animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : {}}
          transition={{ duration: 0.45 }}
          className="flex h-[34px] w-[230px] items-center overflow-hidden rounded-full bg-white/20 pl-4 shadow-inner ring-[0.5px] ring-white/30 backdrop-blur-xl"
        >
          <input
            ref={inputRef}
            type="password"
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Introduce la contraseña"
            className="os-input h-full w-full bg-transparent text-[13px] text-white outline-none placeholder:text-white/60"
          />
          <button
            onClick={submit}
            aria-label="Entrar"
            className="mr-1 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white/25 text-white transition hover:bg-white/40"
          >
            <ArrowRight size={14} />
          </button>
        </motion.div>

        {error && <p className="text-[12px] text-white/75">{error}</p>}

        <button
          onClick={() => {
            setPw("••••");
            doEnter();
          }}
          className="mt-1 flex items-center gap-2 text-[12px] text-white/70 transition hover:text-white"
        >
          <Fingerprint size={16} />
          Entrar con Touch ID
        </button>
        </div>

        <div className="absolute bottom-8 flex flex-col items-center gap-1 text-white/60">
          <p className="text-[11px]">Demo: cualquier contraseña es válida · Touch ID entra directo</p>
          <p className="text-[11px] font-medium text-white/45">macOS Web 27.0 · Liquid Glass</p>
        </div>
      </div>
    </motion.div>
  );
}

export function LoginGate() {
  const stage = useOS((s) => s.stage);
  return (
    <AnimatePresence>
      {(stage === "login" || stage === "lock") && <LoginScreen key={stage} mode={stage === "lock" ? "lock" : "login"} />}
    </AnimatePresence>
  );
}
