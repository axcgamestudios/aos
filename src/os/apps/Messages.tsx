"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleUser,
  File as FileIcon,
  Group,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Square,
  UserPlus,
  X,
} from "lucide-react";
import type { AppProps } from "../types";
import { useOS } from "../store";
import {
  type AosChat,
  type AosMessage,
  type AosUser,
  checkBackend,
  getBackendUrl,
  getChats,
  getFriends,
  getMessages,
  login as apiLogin,
  register as apiRegister,
  requestFriend,
  respondFriend,
  searchUsers,
  sendMessage,
  setToken,
  type FriendsState,
} from "../services/backend";

/* ============================================================
   Mensajes axcsOS — mensajería real vía backend propio
   (server/aos-backend.mjs). Sin backend: pantalla de
   configuración honesta, nada simulado.
   ============================================================ */

export default function MessagesApp(_props: AppProps) {
  const notify = useOS((s) => s.notify);
  const openApp = useOS((s) => s.openApp);
  const updateSettings = useOS((s) => s.updateSettings);

  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [backendDetail, setBackendDetail] = useState("");
  const [user, setUser] = useState<AosUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authErr, setAuthErr] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [view, setView] = useState<"chats" | "contacts">("chats");
  const [chats, setChats] = useState<AosChat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<AosMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [friends, setFriends] = useState<FriendsState>({ friends: [], incoming: [], outgoing: [] });
  const [userQuery, setUserQuery] = useState("");
  const [found, setFound] = useState<AosUser[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordErr, setRecordErr] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastTimeRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ---------- arranque: comprobar backend y sesión ---------- */
  useEffect(() => {
    (async () => {
      if (!getBackendUrl()) {
        setBackendOk(false);
        setBackendDetail("Sin configurar");
        return;
      }
      const r = await checkBackend();
      setBackendOk(r.ok);
      setBackendDetail(r.detail);
      if (r.ok) {
        try {
          const { me } = await import("../services/backend");
          const { user } = await me();
          setUser(user);
        } catch {
          setToken("");
        }
      }
    })();
  }, []);

  const refreshChats = useCallback(async () => {
    if (!user) return;
    try {
      const { chats: cs } = await getChats();
      setChats(cs);
    } catch { /* backend caído: el usuario verá el error al interactuar */ }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refreshChats();
    const t = setInterval(() => void refreshChats(), 5000);
    return () => clearInterval(t);
  }, [user, refreshChats]);

  /* ---------- mensajes del chat activo (polling incremental) ---------- */
  useEffect(() => {
    if (!user || !activeChat) return;
    lastTimeRef.current = 0;
    setMessages([]);
    let alive = true;
    const poll = async () => {
      try {
        const { messages: ms } = await getMessages(activeChat, lastTimeRef.current);
        if (!alive || ms.length === 0) return;
        setMessages((prev) => [...prev, ...ms]);
        lastTimeRef.current = ms[ms.length - 1].time;
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
      } catch { /* ignorar fallos de polling */ }
    };
    void poll();
    const t = setInterval(poll, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, activeChat]);

  /* ---------- autenticación ---------- */
  const doAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthErr("");
    try {
      const r = authMode === "login" ? await apiLogin(username, password) : await apiRegister(username, password, displayName || username);
      setToken(r.token);
      setUser(r.user);
      updateSettings({ userName: r.user.displayName, ...(r.user.avatar ? { avatar: r.user.avatar } : {}) });
      notify("messages", "Sesión iniciada", `Conectado como ${r.user.displayName}`);
    } catch (err) {
      setAuthErr(String((err as Error).message ?? err));
    }
  };

  /* ---------- acciones ---------- */
  const send = async (body: { text?: string; attachment?: { name: string; mime: string; data: string } }) => {
    if (!activeChat || sending) return;
    setSending(true);
    try {
      await sendMessage(activeChat, body);
      setDraft("");
    } catch (err) {
      notify("messages", "No se pudo enviar", String((err as Error).message ?? err));
    } finally {
      setSending(false);
    }
  };

  const onFile = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) {
      notify("messages", "Archivo demasiado grande", "Los adjuntos tienen un límite de 2 MB");
      return;
    }
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.onerror = () => rej(new Error("No se pudo leer el archivo"));
      r.readAsDataURL(f);
    });
    await send({ attachment: { name: f.name, mime: f.type || "application/octet-stream", data } });
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setRecordErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 512) return; // pulsación accidental
        if (blob.size > 2 * 1024 * 1024) {
          notify("messages", "Nota de voz demasiado larga", "Límite de 2 MB por adjunto");
          return;
        }
        const b64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(",")[1] || "");
          r.readAsDataURL(blob);
        });
        await send({ attachment: { name: `nota-voz-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.webm`, mime: "audio/webm", data: b64 } });
      };
      mr.start();
      setRecording(true);
    } catch (e) {
      setRecordErr("Micrófono no disponible: " + String((e as Error).message ?? e));
    }
  };

  const doSearch = async () => {
    if (userQuery.trim().length < 2) return setFound([]);
    try {
      const { users } = await searchUsers(userQuery.trim());
      setFound(users);
    } catch { /* mantener resultados previos */ }
  };

  const refreshFriends = useCallback(async () => {
    if (!user) return;
    try {
      setFriends(await getFriends());
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    if (view === "contacts") void refreshFriends();
  }, [view, refreshFriends]);

  /* ---------- pantallas de configuración / login ---------- */
  if (backendOk === false) {
    return (
      <SetupScreen
        detail={backendDetail}
        onSettings={() => openApp("settings", { payload: { section: "account" } })}
        onRetry={async () => {
          const r = await checkBackend();
          setBackendOk(r.ok || null);
          setBackendDetail(r.detail);
          if (r.ok) location.reload();
        }}
      />
    );
  }

  if (backendOk === null) {
    return <Centered>Comprobando el backend de mensajería…</Centered>;
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <form onSubmit={doAuth} className="glass lg-specular w-80 rounded-2xl p-5 dark:glass-dark">
          <h2 className="mb-1 text-center text-[15px] font-semibold text-neutral-800 dark:text-neutral-100">
            {authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </h2>
          <p className="mb-4 text-center text-[10.5px] text-neutral-400">Cuenta axcsOS (servidor propio) · {getBackendUrl()}</p>
          {authMode === "register" && (
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nombre visible" className="mb-2 w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100" />
          )}
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuario" autoComplete="username" className="mb-2 w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Contraseña" autoComplete={authMode === "login" ? "current-password" : "new-password"} className="mb-1 w-full rounded-lg border border-black/10 bg-white/80 px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100" />
          {authErr && <p className="mb-2 text-[10.5px] text-rose-500">{authErr}</p>}
          <button type="submit" className="mb-2 w-full rounded-lg bg-[var(--accent-os)] py-2 text-[12px] font-semibold text-white transition hover:opacity-90">
            {authMode === "login" ? "Entrar" : "Registrarme"}
          </button>
          <button type="button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} className="w-full text-center text-[10.5px] text-[var(--accent-os)] underline">
            {authMode === "login" ? "Crear una cuenta nueva" : "Ya tengo cuenta"}
          </button>
        </form>
      </div>
    );
  }

  const chat = chats.find((c) => c.id === activeChat);

  /* ---------- app principal ---------- */
  return (
    <div className="flex h-full bg-white dark:bg-neutral-950">
      {/* sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-black/8 bg-neutral-100/80 backdrop-blur-xl dark:border-white/8 dark:bg-neutral-900/70">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[12px] font-bold text-white">
              {user.displayName[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-neutral-800 dark:text-neutral-100">{user.displayName}</p>
            <p className="truncate text-[10px] text-neutral-400">@{user.username}</p>
          </div>
          <button onClick={() => setView(view === "chats" ? "contacts" : "chats")} title={view === "chats" ? "Contactos" : "Chats"} className="rounded-md p-1.5 text-neutral-500 transition hover:bg-black/10 dark:text-neutral-300 dark:hover:bg-white/10">
            {view === "chats" ? <CircleUser size={15} /> : <ArrowLeft size={15} />}
          </button>
        </div>

        <div className="px-2 pb-2">
          <div className="flex rounded-lg bg-black/5 p-0.5 text-[10.5px] dark:bg-white/10">
            <button onClick={() => setView("chats")} className={`flex-1 rounded-md py-1 font-medium transition ${view === "chats" ? "bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-white" : "text-neutral-500"}`}>
              Chats {chats.length > 0 && `(${chats.length})`}
            </button>
            <button onClick={() => setView("contacts")} className={`flex-1 rounded-md py-1 font-medium transition ${view === "contacts" ? "bg-white text-neutral-800 shadow-sm dark:bg-neutral-700 dark:text-white" : "text-neutral-500"}`}>
              Contactos {friends.incoming.length > 0 && `· ${friends.incoming.length}⑤`}
            </button>
          </div>
        </div>

        <div className="mac-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
          {view === "chats" ? (
            chats.length === 0 ? (
              <div className="px-2 py-4 text-center text-[10.5px] leading-relaxed text-neutral-400">
                Sin conversaciones todavía.
                <br />
                Añade contactos desde la pestaña Contactos.
              </div>
            ) : (
              chats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveChat(c.id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition ${
                    activeChat === c.id ? "bg-[var(--accent-os)]/15" : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  {c.avatar ? (
                    <img src={c.avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${c.type === "group" ? "bg-gradient-to-br from-emerald-400 to-teal-600" : "bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400"}`}>
                      {c.type === "group" ? <Group size={13} /> : c.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-neutral-800 dark:text-neutral-100">{c.name}</p>
                      {c.last && <span className="shrink-0 text-[9px] text-neutral-400">{new Date(c.last.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                    <p className="truncate text-[10px] text-neutral-400">{c.last ? (c.last.from ? "Tú: " : "") + c.last.text : "Sin mensajes"}</p>
                  </div>
                  {c.unread > 0 && <span className="h-4 min-w-4 shrink-0 rounded-full bg-[var(--accent-os)] px-1 text-center text-[9px] font-bold leading-4 text-white">{c.unread}</span>}
                </button>
              ))
            )
          ) : (
            <ContactsView
              friends={friends}
              found={found}
              query={userQuery}
              onQuery={setUserQuery}
              onSearch={doSearch}
              onOpenChat={(u) => {
                const dm = chats.find((c) => c.type === "dm" && c.members.some((m) => m.id === u.id));
                if (dm) {
                  setActiveChat(dm.id);
                  setView("chats");
                }
              }}
              onRequest={async (uname) => {
                try {
                  await requestFriend(uname);
                  notify("messages", "Solicitud enviada", `Esperando respuesta de ${uname}`);
                  void refreshFriends();
                } catch (e) {
                  notify("messages", "Solicitud", String((e as Error).message ?? e));
                }
              }}
              onRespond={async (id, accept) => {
                try {
                  await respondFriend(id, accept);
                  void refreshFriends();
                  await refreshChats();
                } catch (e) {
                  notify("messages", "Solicitud", String((e as Error).message ?? e));
                }
              }}
            />
          )}
        </div>
      </div>

      {/* conversación */}
      <div className="flex min-w-0 flex-1 flex-col">
        {chat ? (
          <>
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-black/8 px-4 dark:border-white/8">
              {chat.type === "group" ? (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
                  <Group size={13} />
                </div>
              ) : chat.avatar ? (
                <img src={chat.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-indigo-400 to-fuchsia-400 text-[11px] font-bold text-white">
                  {chat.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-100">{chat.name}</p>
                <p className="text-[9.5px] text-neutral-400">{chat.type === "group" ? `${chat.members.length + 1} miembros` : `@${chat.members[0]?.username ?? ""}`}</p>
              </div>
            </div>

            <div ref={scrollRef} className="mac-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto bg-neutral-50/60 px-4 py-3 dark:bg-neutral-900/40">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed shadow-sm ${m.mine ? "rounded-br-md bg-[var(--accent-os)] text-white" : "rounded-bl-md bg-white text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"}`}>
                    {!m.mine && chat.type === "group" && m.fromUser && <p className="mb-0.5 text-[9.5px] font-semibold opacity-70">{m.fromUser.displayName}</p>}
                    {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                    {m.attachment && <Attachment m={m} />}
                    <p className={`mt-0.5 text-right text-[8.5px] ${m.mine ? "text-white/70" : "text-neutral-400"}`}>
                      {new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} {m.mine && <Check size={8} className="ml-0.5 inline" />}
                    </p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="py-8 text-center text-[11px] text-neutral-400">Sin mensajes todavía. Escribe el primero.</p>}
            </div>

            {recordErr && <p className="px-4 py-1 text-[10px] text-amber-600">{recordErr}</p>}
            <form
              className="flex shrink-0 items-end gap-2 border-t border-black/8 bg-white px-3 py-2.5 dark:border-white/8 dark:bg-neutral-900"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) void send({ text: draft.trim().slice(0, 4000) });
              }}
            >
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} title="Adjuntar archivo (≤2 MB)" className="rounded-lg p-2 text-neutral-500 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10">
                <Paperclip size={15} />
              </button>
              <button type="button" onClick={() => void toggleRecording()} title={recording ? "Detener y enviar nota de voz" : "Grabar nota de voz"} className={`rounded-lg p-2 transition ${recording ? "animate-pulse bg-rose-500/15 text-rose-500" : "text-neutral-500 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"}`}>
                {recording ? <Square size={15} /> : <Mic size={15} />}
              </button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (draft.trim()) void send({ text: draft.trim().slice(0, 4000) });
                  }
                }}
                rows={1}
                placeholder="Mensaje…"
                className="max-h-24 min-h-9 flex-1 resize-none rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--accent-os)]/40 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <button type="submit" disabled={sending || !draft.trim()} className="rounded-xl bg-[var(--accent-os)] p-2.5 text-white transition hover:opacity-90 disabled:opacity-40" title="Enviar">
                <Send size={14} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
            <Group size={34} className="opacity-30" />
            <p className="text-[12px]">Selecciona una conversación o crea un contacto</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Attachment({ m }: { m: AosMessage }) {
  const att = m.attachment!;
  if (att.mime.startsWith("image/")) {
    return <img src={`data:${att.mime};base64,${att.data}`} alt={att.name} className="mt-1 max-h-52 rounded-xl" />;
  }
  if (att.mime.startsWith("audio/")) {
    return <audio controls src={`data:${att.mime};base64,${att.data}`} className="mt-1 h-8 w-56" />;
  }
  return (
    <a
      href={`data:${att.mime};base64,${att.data}`}
      download={att.name}
      className="mt-1 flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-1.5 text-[10.5px] font-medium underline dark:bg-white/10"
    >
      <FileIcon size={12} /> {att.name}
    </a>
  );
}

function ContactsView({
  friends,
  found,
  query,
  onQuery,
  onSearch,
  onOpenChat,
  onRequest,
  onRespond,
}: {
  friends: FriendsState;
  found: AosUser[];
  query: string;
  onQuery: (q: string) => void;
  onSearch: () => void;
  onOpenChat: (u: AosUser) => void;
  onRequest: (username: string) => void;
  onRespond: (id: string, accept: boolean) => void;
}) {
  return (
    <div className="space-y-3 p-1">
      <form
        className="flex items-center gap-1.5 rounded-lg bg-black/5 px-2 py-1.5 dark:bg-white/10"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <Search size={11} className="shrink-0 text-neutral-400" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar usuarios (@usuario)…" className="w-full bg-transparent text-[11px] text-neutral-700 outline-none dark:text-neutral-200" />
      </form>
      {found.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Resultados</p>
          {found.map((u) => (
            <div key={u.id} className="mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-400 text-[9px] font-bold text-white">{u.displayName[0]?.toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{u.displayName}</p>
                <p className="truncate text-[9px] text-neutral-400">@{u.username}</p>
              </div>
              <button onClick={() => onRequest(u.username)} title="Enviar solicitud" className="rounded-md p-1 text-[var(--accent-os)] transition hover:bg-[var(--accent-os)]/10">
                <UserPlus size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {friends.incoming.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Solicitudes recibidas</p>
          {friends.incoming.map((r) => (
            <div key={r.id} className="mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/10">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{r.from.displayName}</p>
                <p className="truncate text-[9px] text-neutral-400">@{r.from.username}</p>
              </div>
              <button onClick={() => onRespond(r.id, true)} className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400">Aceptar</button>
              <button onClick={() => onRespond(r.id, false)} className="rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-rose-500">Rechazar</button>
            </div>
          ))}
        </div>
      )}
      <div>
        <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Amigos ({friends.friends.length})</p>
        {friends.friends.length === 0 ? (
          <p className="px-2 py-1 text-[10px] leading-relaxed text-neutral-400">Busca por nombre de usuario y envía una solicitud de amistad.</p>
        ) : (
          friends.friends.map((u) => (
            <button key={u.id} onClick={() => onOpenChat(u)} className="mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10">
              {u.avatar ? (
                <img src={u.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-400 text-[9px] font-bold text-white">{u.displayName[0]?.toUpperCase()}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{u.displayName}</p>
                <p className="truncate text-[9px] text-neutral-400">@{u.username}</p>
              </div>
            </button>
          ))
        )}
      </div>
      {friends.outgoing.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">Enviadas (pendientes)</p>
          {friends.outgoing.map((r) => (
            <p key={r.id} className="px-2 py-0.5 text-[10px] text-neutral-400">@{r.to.username} — esperando respuesta</p>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupScreen({ detail, onSettings, onRetry }: { detail: string; onSettings: () => void; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-50 px-6 text-center dark:bg-neutral-950">
      <div className="glass lg-specular flex max-w-md flex-col gap-3 rounded-2xl p-6 text-left dark:glass-dark">
        <div className="flex items-center gap-2">
          <Settings2 size={15} className="text-[var(--accent-os)]" />
          <h2 className="text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-100">Mensajería real: requiere backend</h2>
        </div>
        <p className="text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          La mensajería de axcsOS usa cuentas y almacenamiento del lado del servidor (nunca solo memoria local). Para
          usarla despliega el backend incluido en el repositorio:
        </p>
        <ol className="ml-4 list-decimal space-y-1 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          <li>Despliega <code>server/aos-backend.mjs</code> (Render/Railway/Fly/VPS, Node 18+)</li>
          <li>En Ajustes → Cuenta, pon su URL (ej. <code>https://mi-backend.example.com</code>)</li>
          <li>Regístrate y añade contactos por su nombre de usuario</li>
        </ol>
        <p className="text-[10px] text-neutral-400">Estado actual: {detail}</p>
        <div className="flex gap-2">
          <button onClick={onSettings} className="flex-1 rounded-lg bg-[var(--accent-os)] py-2 text-[11.5px] font-semibold text-white transition hover:opacity-90">
            Abrir Ajustes → Cuenta
          </button>
          <button onClick={onRetry} className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-[11.5px] font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/10">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-neutral-50 text-[12px] text-neutral-400 dark:bg-neutral-950">
      <div className="flex items-center gap-2">
        <X size={13} className="opacity-0" />
        {children}
      </div>
    </div>
  );
}
