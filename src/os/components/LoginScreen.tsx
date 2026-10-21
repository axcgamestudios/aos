"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Fingerprint, ShieldAlert } from "lucide-react";
import { useOS } from "../store";
import { AvatarIcon } from "../icons";
import {
  createSession,
  fetchAccounts,
  findAccount,
  getStoredSession,
  startSessionGuard,
  verifyPassword,
  type AccountRecord,
  type StoredSession,
} from "../services/auth";

function ClockBig() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute top-[11%] left-0 flex w-full flex-col items-center text-white">
      <p className="text-[21px] font-normal capitalize tracking-wide text-white/90 [text-shadow:0_1px_18px_rgba(0,0,0,0.45)]">
        {now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <p className="mt-1 text-[96px] font-thin leading-none tabular-nums tracking-tight [text-shadow:0_2px_38px_rgba(0,0,0,0.55)]">
        {now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

export function LoginScreen({ mode }: { mode: "login" | "lock" }) {
  const userName = useOS((s) => s.settings.userName);
  const avatar = useOS((s) => s.settings.avatar);
  const session = useOS((s) => s.session);
  const kickMessage = useOS((s) => s.kickMessage);
  const login = useOS((s) => s.login);
  const setStage = useOS((s) => s.setStage);
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [stored, setStored] = useState<StoredSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLock = mode === "lock" && !!session;
  const shownName = isLock ? session.username : user.trim() || userName;

  useEffect(() => {
    setStored(getStoredSession());
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const fail = (msg: string) => {
    setError(msg);
    setShake(true);
    setBusy(false);
    setTimeout(() => setShake(false), 500);
  };

  const enterWith = (account: AccountRecord | { id: string; username: string }, token?: string, reuse?: boolean) => {
    const sess = reuse && token ? null : createSession(account as AccountRecord);
    const finalToken = token ?? sess!.token;
    setLeaving(true);
    setTimeout(() => {
      login({ id: account.id, username: account.username });
      // 1 dispositivo por cuenta: afirmar esta sesión y expulsar las demás
      void startSessionGuard(account.id, finalToken, (detail) => {
        useOS.getState().logoutFromKick(detail);
      });
    }, 450);
  };

  const submit = async () => {
    if (busy) return;
    if (!isLock && !user.trim()) {
      fail("Introduce tu usuario.");
      return;
    }
    if (!pw.trim()) {
      fail("Introduce la contraseña de tu cuenta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const accounts = await fetchAccounts();
      const account = findAccount(accounts, isLock ? session.username : user);
      if (!account) {
        fail("Esa cuenta no existe. Pide al administrador que la cree.");
        return;
      }
      const ok = await verifyPassword(pw, account);
      if (!ok) {
        fail("Usuario o contraseña incorrectos.");
        return;
      }
      enterWith(account);
    } catch (e) {
      fail("No se pudo comprobar la cuenta (sin conexión con GitHub).");
      console.error("[login]", e);
    }
  };

  const touchId = async () => {
    if (busy || !stored) return;
    setBusy(true);
    setError("");
    try {
      const accounts = await fetchAccounts();
      const acc = accounts.find((a) => a.id === stored.accountId);
      if (!acc) {
        fail("Esta cuenta ya no existe. Pide al administrador una nueva.");
        return;
      }
      enterWith(acc, stored.token, true);
    } catch (e) {
      fail("Sin conexión con GitHub para verificar la cuenta.");
      console.error("[login touchid]", e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      className="fixed inset-0 z-[6500]"
    >
      {/* capa sutil sobre el wallpaper — el fondo queda visible como en macOS */}
      <div
        className="absolute inset-0"
        style={{
          backdropFilter: "blur(2px) brightness(0.82) saturate(1.12)",
          WebkitBackdropFilter: "blur(2px) brightness(0.82) saturate(1.12)",
        }}
      />
      {/* degradado suave para legibilidad inferior */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/35" />

      <ClockBig />

      <div className="relative flex h-full flex-col items-center">
        {/* bloque de autenticación, en el tercio inferior como macOS */}
        <div className="absolute top-[52%] flex w-[320px] flex-col items-center">
          {avatar ? (
            <img src={avatar} alt="" className="h-[92px] w-[92px] rounded-full object-cover shadow-[0_10px_38px_rgba(0,0,0,0.45)] ring-[3px] ring-white/35" />
          ) : (
            <AvatarIcon className="h-[92px] w-[92px] rounded-full shadow-[0_10px_38px_rgba(0,0,0,0.45)] ring-[3px] ring-white/35" />
          )}

          {kickMessage && (
            <div className="mt-3 flex items-center gap-1.5 rounded-full bg-red-500/25 px-3 py-1.5 text-[12px] text-white ring-[0.5px] ring-red-300/40 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
              <ShieldAlert size={13} className="shrink-0" />
              {kickMessage}
            </div>
          )}

          {!isLock && (
            <input
              value={user}
              onChange={(e) => {
                setUser(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Usuario"
              autoComplete="username"
              className="os-input mt-4 h-[38px] w-[252px] rounded-full bg-black/30 px-4 text-center text-[13px] text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_2px_14px_rgba(0,0,0,0.25)] ring-[0.5px] ring-white/25 backdrop-blur-xl outline-none placeholder:text-white/60"
            />
          )}

          <motion.div
            animate={shake ? { x: [0, -10, 10, -8, 8, 0] } : {}}
            transition={{ duration: 0.45 }}
            className={`${isLock ? "mt-4" : "mt-2.5"} flex h-[38px] w-[252px] items-center overflow-hidden rounded-full bg-black/30 pl-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25),0_2px_14px_rgba(0,0,0,0.25)] ring-[0.5px] ring-white/25 backdrop-blur-xl`}
          >
            <input
              ref={inputRef}
              type="password"
              value={pw}
              disabled={busy}
              onChange={(e) => {
                setPw(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="Introduce la contraseña"
              autoComplete="current-password"
              className="os-input h-full w-full bg-transparent text-center text-[13px] text-white outline-none placeholder:text-white/60 disabled:opacity-60"
            />
            <button
              onClick={() => void submit()}
              disabled={busy}
              aria-label="Entrar"
              className="mr-1.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-white/25 text-white transition hover:bg-white/45 disabled:opacity-50"
            >
              {busy ? (
                <span className="block h-[13px] w-[13px] animate-spin rounded-full border-[2px] border-white/40 border-t-white" />
              ) : (
                <ArrowRight size={14} />
              )}
            </button>
          </motion.div>

          {error && <p className="mt-2.5 text-[12px] text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">{error}</p>}

          {stored && (
            <button
              onClick={touchId}
              disabled={busy}
              className="mt-3.5 flex items-center gap-1.5 text-[12px] text-white/75 transition hover:text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)] disabled:opacity-50"
            >
              <Fingerprint size={15} />
              Touch ID · entrar como {stored.username}
            </button>
          )}
        </div>

        <div className="absolute bottom-7 flex flex-col items-center gap-1 text-white/60">
          <p className="text-[11px]">Cuentas creadas por el administrador · 1 dispositivo por cuenta</p>
          <p className="text-[11px] font-medium text-white/45">axcsOS 1.0 · Liquid Glass</p>
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
