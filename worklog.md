# Worklog

---
Task ID: 5
Agent: main (Z.ai)
Task: Integrar el nuevo motor de navegación del estudio (wss://wsn-c6o3.onrender.com/) como transporte principal de Scramjet

Work Log:
- SONDEO DEL NUEVO MOTOR: wss://wsn-c6o3.onrender.com/ identificado como wisp-server-node (Rust/Node en Render free tier) mediante análisis de protocolo: (1) HTTP plano cuelga para siempre (solo acepta upgrades WS), (2) al abrir WS envía CONTINUE stream=0 buffer=127 — firma exacta de wisp-server-node (ConnectionHandler.js: ws.send(continuePacketMaker({streamID:0},127))), (3) framing wisp confirmado con el mapeo REAL del protocolo: 0x01=CONNECT, 0x02=DATA, 0x03=CONTINUE, 0x04=CLOSE, 0x05=INFO v2.
- BUGS DE SONDA RESUELTOS: el probe original (probe-wisp.mjs) tenía DATA/CONTINUE intercambiados y esperaba un CONTINUE en stream 1 que wisp-server-node nunca envía (solo manda CONTINUE stream 0 inicial; flujo v1 puro sin handshake INFO). Sonda corregida (scripts/probe-wisp2.mjs): CONNECT + GET inmediatos → RESPUESTA HTTP/1.1 200 REAL de example.com a través del túnel en 264ms. MOTOR VERIFICADO AL 100%.
- INTEGRACIÓN (src/os/engine/scramjet.ts): MAIN_WISP = wss://wsn-c6o3.onrender.com/ como transporte principal; defaultWisp() siempre devuelve MAIN_WISP; cadena de failover ensureHealthyWisp: [actual, MAIN_WISP (25s margen para despertar del dyno frío de Render), DEMO_WISP (6s), LOCAL_WISP (solo dev)] con dedupe; startWispKeepalive(): WebSocket persistente durante toda la sesión del OS que mantiene el dyno de Render despierto (Render free duerme sin tráfico → primera navegación tardaría 30-60s), con reconexión automática cada 20s y flag window.__wispKeepalive para E2E.
- MIGRACIÓN DE STORE (src/os/store.ts): los usuarios con el demo viejo persistido en localStorage se migran automáticamente (wispUrl: defaultWisp() en merge); login() arranca el keepalive.
- SAFARI (src/os/apps/Safari.tsx): el efecto de re-afirmación del transporte ahora comprueba salud ANTES de aplicar (testWisp 20s) para no pelear con el failover (si el motor propio está dormido/caído, se mantiene el respaldo activo en vez de romperse); StartPage con engineKind own/demo/other y textos honestos por estado.
- AJUSTES (src/os/apps/Settings.tsx): banner verde "Conectado al motor propio del estudio (wisp-server-node en Render)" cuando está activo; el aviso ámbar del demo ahora explica que es un respaldo temporal y cómo volver al propio ("Reparar motor"). README actualizado.
- E2E VERIFICADO (agent-browser, dev :3000): login → desktop → Safari con banner "Motor activo wss://wsn-c6o3.onrender.com/" → example.com CARGADO COMPLETO dentro del iframe (contenido multilingüe real, título de pestaña OK) → es.wikipedia.org cargado completo (Wikipedia:Portada con links/imágenes) → búsqueda Bing "telescopio james webb" con resultados reales → panel Ajustes → Navegador mostrando motor propio + banner verde → KEEPALIVE ON. (Nota: un reinicio de ventana durante el test fue HMR por editar el código en caliente, no un bug.)
- DESPLIEGUE: commit main + export estático build:pages + rama gh-pages + verificación en vivo.

Stage Summary:
- El navegador de axcsOS ahora usa el motor PROPIO del estudio (Render) en vez del demo público ajeno: misma arquitectura Scramjet, transporte prioritario propio con respaldo automático y keepalive anti-sueño.
- Compatibilidad garantizada: libcurl-transport 1.5.2 se conecta sin subprotocolo = flujo v1 puro, exactamente lo que wisp-server-node sirve (es el backend para el que se diseñó).
- Evidencia: scripts/shots/wisp-e2e-*.png (login, desktop, banner motor, example.com, wikipedia, búsqueda, ajustes).
- Sonda reutilizable: scripts/probe-wisp2.mjs (protocolo wisp correcto, modos v1/v2, cualquier host/puerto).

---
Task ID: 2
Agent: main (Z.ai)
Task: Restaurar axcsOS (Next.js) + logo pera + login fiel al ejemplo + Safari 100% nativo (fix 303, portadas YouTube, velocidad, streaming)

Work Log:
- Restaurada la app Next.js completa (sobrevivió en git/src tras el reset del entorno); backup inmediato + checkpoint git.
- Logo: la pera axcsOS.png del usuario vectorizada a SVG (skimage marching squares + Catmull-Rom, IoU 0.989) → PearLogo en icons.tsx, layout.tsx (favicon), reemplazados los 5 usos (MenuBar, BootScreen, Settings, Terminal, AboutMac).
- Wallpaper Golden Gate generado (1344x768) y puesto como default; FIX crítico: Wallpaper.tsx usaba backgroundImage con sintaxis shorthand inválida (los fondos de imagen nunca funcionaron) → background.
- Rebranding completo a axcsOS en todos los textos (títulos, Terminal, Finder, About, notificaciones) + 🍐.
- LoginScreen rediseñado fiel a la captura de referencia (VLM): fecha arriba + reloj 96px ultra-ligero, wallpaper visible (blur 2px), píldora password oscura, Touch ID.
- Motor proxy server-side /api/proxy: redirect follow (FIX 303), reescritura HTML/CSS (decodeEntities FIX &amp;, pre-paso etiquetas <script src> FIX crítico), <base> inyectado, jar de cookies + CONSENT/SOCS para Google, caché LRU assets, CORS, Range para vídeo, bloqueo bucles localhost, fix 204 (runtime no permite construirlo).
- Shim cliente inyectado: localStorage/sessionStorage/document.cookie/document.domain (sandbox opaco), fetch/XHR/window.open/setAttribute/prototipos src-href/document.write hooks, MutationObserver para contenido dinámico, fix doble-proxificación de imágenes (bucle infinito), canal de errores jserror, descargas postMessage, comandos back/forward/reload.
- Cliente YouTube nativo (/api/proxy/yt.ts): la SPA de youtube.com no hidrata bajo proxy (anti-bot) → home/feed vía API innertube (4 temas mezclados), búsqueda vía API+fallback HTML server-rendered, watch con metadatos del player API (cliente ANDROID) + REPRODUCTOR NATIVO <video> con stream googlevideo por el proxy (itag 18) + relacionados.
- Safari v3: iframe sandbox sin same-origin, búsqueda DuckDuckGo (sin Google/Bing), favoritos (AXCGAMES/YouTube/Wikipedia/DDG), barra streaming DRM, descargas integradas, título de página al window manager.
- App Descargas nueva (registry + Launchpad) + slice en store con persistencia y objectURLs de sesión; migración de clave macos-web-27 → axcsos (respetando notas/ajustes, estrenando goldengate).
- E2E verificado con agent-browser: boot→login (Golden Gate visible)→desktop→Safari→YouTube home con 24 portadas reales→clic→VÍDEO REPRODUCIÉNDOSE (fotograma real verificado)→búsqueda DDG con resultados→GitHub completamente estilizado. TypeScript limpio.

Stage Summary:
- axcsOS 1.0 completo y verificado; servidor dev persistente (setsid double-fork) en :3000.
- Fixes de raíz: 303 (redirects), portadas YouTube (cliente nativo + proxy imágenes), velocidad (API+caché), wallpapers (bug histórico backgroundImage), bucles de doble-proxy.
- Reproducción de vídeo YouTube NATIVA (sin DRM, stream directo). Netflix/DRM: best-effort con aviso (limitación de Widevine, no proxy).
- Backups: download/axcsOS-backup/src-axcsOS-final-*.tar.gz + capturas de evidencia + 2 commits git (checkpoint y final).

---
Task ID: 1
Agent: main (Z.ai)
Task: Sistema operativo web estilo macOS 27 (Liquid Glass) con inicio de sesión y app AXCGAMES (axcgamestudios.github.io/nueva-pestana/)

Work Log:
- Inicializado entorno fullstack Next.js 16 (skill fullstack-dev); verificado que AXCGAMES permite iframe (sin X-Frame-Options).
- Generados 4 wallpapers estilo macOS (tahoe-dark, tahoe-light, sequoia, sonoma) con image-generation CLI + 4 gradientes CSS dinámicos.
- Sistema de diseño Liquid Glass en globals.css: .glass/.glass-dark/.glass-chrome, .lg-specular (bordes especulares), sombras de ventana macOS, animaciones (dock-bounce, win-open, pop-in, shake, spotlight, progress).
- Store Zustand con persist (ajustes, notas, sys state): gestión de ventanas (abrir/cerrar/foco/minimizar/zoom/rect), sesión (boot/login/desktop/lock), notificaciones, sys (volumen/brillo/wifi/bt/dnd).
- Iconos SVG propios estilo macOS: Finder, AXCGAMES (gamepad gradiente), Safari (brújula), Notas, Calculadora, Terminal, Ajustes (engranajes generados por código), Launchpad, Papelera, Carpeta, Macintosh HD, avatar de login, doc/imagen.
- Apps: AXCGAMES (iframe embebido con toolbar, recarga, abrir-externo), Finder (FS simulado, grid/lista, sidebar), Safari (historial, barra de direcciones, favoritos, start page), Notas (CRUD + autoguardado), Calculadora (teclado completo), Terminal (neofetch, abrir <app>, ayuda…), Ajustes (apariencia/acento/fondos/dock/general), TextEdit, Previsualización, Acerca de este Mac.
- Shell del OS: barra de menús con menú Apple + menús por app + estado (batería/wifi/spotlight/centro control/reloj), Dock con magnificación gaussiana + tooltips + bounce, gestor de ventanas (drag/resize 8 handles/semáforos/doble clic zoom), Spotlight (apps+notas+matemáticas+web), Launchpad fullscreen, Centro de Control (tiles+sliders), Centro de Notificaciones (widgets reloj/calendario), toasts auto-dismiss, AppSwitcher ⌘Tab, escritorio con iconos y menú contextual, boot con Apple logo y barra de progreso, login/lock con Touch ID.
- Atajos: ⌘Espacio (Spotlight), ⌘Tab (switcher), ⌘` (ciclar ventanas), ⌘M, ⌘Q, ⌘,, Esc.
- Bugs corregidos: ciclo de imports Finder↔registry (evaluación lazy de APPS), selector zustand v5 con array inestable (useRunningApps eliminado), cierre de Touch ID con closure obsoleto (doEnter extraído), advertencias React lint v6 (componentes fuera de render, setState en efectos → patrones derivados), mezcla background/backgroundColor.
- Verificación E2E con agent-browser: boot→login→desktop, AXCGAMES iframe cargando el portal real (Kingdom of the Forgotten Seas visible), calculadora 7×8=56, terminal neofetch + abrir notas, cambio de wallpaper a Sequoia persistido, bloqueo/desbloqueo con ventanas preservadas, minimizar con iframe vivo, Spotlight/Launchpad funcionales, consola sin errores. Evaluación visual VLM: 8.5/10 de similitud macOS; ventana AXCGAMES verificada (semáforos, toolbar, web integrada).

Stage Summary:
- OS web completo y funcional en / (única ruta usuario), todo client-side con persistencia localStorage.
- Apps: finder, axcgames, safari, notes, calculator, terminal, settings, textedit, preview, about.
- Archivos clave: src/os/{store,registry,types,icons,wallpapers}, src/os/components/* (MenuBar, Dock, WindowFrame, WindowManager, Spotlight, Launchpad, ControlCenter, NotificationCenter, AppSwitcher, Desktop, Wallpaper, BootScreen, LoginScreen), src/os/apps/*, src/app/page.tsx, globals.css.
- Lint 0 errores/0 warnings; dev server OK en puerto 3000.

---
Task ID: 3
Agent: main (Z.ai)
Task: Motor de navegador real (Scramjet) + buscador + ajustes + despliegue GitHub Pages (axcgamestudios/aos)

Work Log:
- AUDITORÍA: stack Next 16 + Turbopack, Safari v3 con /api/proxy server-side (909 líneas), proxy nativo YouTube con /api/proxy/yt.ts. Infra: sandbox con dev server :3000, sin backend público.
- INVESTIGACIÓN MOTOR: Scramjet 1.1.0 (release GH oficial = npm igual), bare-mux 2.1.9, libcurl-transport 1.5.2 (⚠️ la 2.0.5 es incompatible con SJ 1.x: "headers is not iterable"), wisp-js 0.5.0 (backend oficial, anti-SSRF integrado). Scramjet lista GFN+YouTube como soportados. Referencia Schoolsucks descartada como dependencia (arquitectura ajena no verificable); solución propia con stack Mercury OSS.
- Rig de pruebas (public/sjtest.html) + wisp local (:3001): example.com OK → YouTube SPA OK (portadas a color) → reproducción bloqueada por anti-bot Google (IP datacenter, documentado).
- BUGS DE INTEGRACIÓN RESUELTOS: (1) orden init: controller ANTES que register SW (si no, IDB $scramjet sin stores → NotFoundError) + autocura deleteDatabase; (2) base() mal calculado para subrutas → SharedWorker 404 "port is dead"; (3) doble-codificación URL transitoria; (4) RACE iframe: engine caliente resuelve en microtask antes de que React monte el iframe → waitForIframe(); (5) ⚠️ ROOT CAUSE CRÍTICO: fetchs de página a sitios con set-cookie colgaban para siempre — el SW hace await dispatch(client) esperando ACK del runtime scramjet que la página del OS no tiene → ACK implementado en engine doInit (protocolo verificado en client/dom/cookie.ts); (6) engineFetch antes del init → engineEncodeUrl ahora auto-inicializa.
- Safari v4 completo: pestañas múltiples con iframes vivos (estado preservado), historial por pestaña (back/forward real app-level + SPA urlchange sync), barra direcciones (URL/dominio/búsqueda), reload/stop/home, marcadores editables persistentes, historial global + borrado, título/favicon desde contentDocument, popups window.open y target=_blank → pestañas internas (captura en fase about:blank + click capture), descargas interceptadas por el SW → app Descargas, banner de error del motor con acceso a Ajustes, ⌘L/⌘T/⌘W.
- Buscador: resultados reales nativos vía Bing RSS (format=rss, sin clave, funciona desde datacenter) con fallback DDG html y fallback final a DDG dentro del motor (desafío anti-bot ejecutable con JS real). SearXNG opcional configurable. DDG html endpoint = HTTP 202 anti-bot desde datacenter (limitación documentada).
- Ajustes → Navegador: wisp URL + Probar (testWisp WebSocket) + Aplicar (applyTransport en caliente), diagnóstico del motor en vivo (scripts/SW/transporte/versión), aviso demo wisp, buscador, privacidad, créditos.
- Settings: fondo de pantalla propio (upload → canvas resize → dataURL), avatar foto de perfil, nombre editable; LoginScreen usa avatar; wallpaper con basePath correcto (rutas relativas).
- Iconos oficiales del estudio (repo) integrados como iconos de apps (finder/safari/notas/calculadora/settings/axcgames → imgIcon rutas relativas).
- Export estático: next.config BUILD_TARGET=pages (output export + basePath /aos + trailingSlash + images unoptimized); scripts/serve-pages.mjs para probar el out/ bajo /aos localmente; E2E del export verificado (SW controla, example.com OK vía wisp local).
- DESPLIEGUE: main = fuente completa (con logos preservados del repo, engine assets públicos, server/ desplegable, README); gh-pages = export + .nojekyll; Pages activado → https://axcgamestudios.github.io/aos/ VERIFICADO EN VIVO: 200, sw.js+wasm MIME correctos, SW controla, example.com + YouTube cargan vía wisp demo público.
- Pruebas de compatibilidad (VLM + DOM): GFN landing completa a color ✓, Poki catálogo 245 imgs ✓, Netflix landing carátulas ✓ (reproducción=DRM no soportado por diseño), YouTube SPA+búsqueda interna con resultados orgánicos reales ✓ (reproducción depende de IP del wisp: anti-bot Google), Bing búsqueda nativa 10 resultados ✓, Wikipedia ✓.
- Fases 1-4 del roadmap del usuario completadas y validadas.

Stage Summary:
- Motor Scramjet 1.1.0 integrado de verdad (SW+rewriter WASM+baremux+libcurl+wisp), 6 bugs de raíz resueltos (incl. ACK de cookies del SW), Safari v4 con pestañas/historial/marcadores/descargas/popups internos.
- Buscador real (Bing RSS nativo + DDG fallback + SearXNG opcional).
- GitHub Pages vivo y verificado: https://axcgamestadudios.github.io/aos/ (axcgamestudios.github.io/aos), código en main, deploy en gh-pages, server/wisp-server.mjs listo para desplegar el transporte propio.
- Faltan fases 5-9 (glass extra, cuentas, mensajería, llamadas, apps/descargas extra).

---
Task ID: 4
Agent: main (Z.ai)
Task: YouTube 100% nativo sin Scramjet + chat real estilo WhatsApp (cuenta axcsOS ID) + estabilidad Scramjet + limpieza de Ajustes + logos recortados

Work Log:
- LOGOS: finder/calculator/axcgames (JPG no cuadrados, arte a sangre) cuadrados por replicación de bordes (sin perder arte) → PNG 512; safari/notes/settings reencuadrados con trim de alfa. public/icons actualizado (solo PNG), icons.tsx apunta a los .png.
- YOUTUBE 100% NATIVO (src/os/services/yt.ts + src/os/apps/YouTube.tsx): API pública Piped con failover entre instancias (private.coffee ✓, ducks.party ✓, kavin, adminforge, reallyaweso), trending/búsqueda/canales/comentarios con caché 5 min; /streams para reproductor propio <video> (muxed, selector de calidad); si las fuentes libres están bloqueadas por Google (muro anti-bot de las IPs de las instancias — verificado hoy) → metadatos por noembed (CORS *) + relacionados por búsqueda + REPRODUCTOR EMBEBIDO OFICIAL (se sirve desde la IP del usuario, sin login). NUNCA Scramjet, NUNCA login. innertube descartado por CORS (github fent/node-ytdl-core#75) y bloqueo IP del sandbox. App registrada (id "youtube", icono SVG propio, dock+launchpad) + integración en Safari: parseYouTubeUrl() enruta youtube.com/youtu.be/shorts a la vista nativa dentro de la pestaña (0 peticiones al motor, historial de pestaña real, back/forward y recarga wired, título de ventana con el título real del vídeo).
- MOTOR: recoverEngine() en engine/scramjet.ts (re-registro de SW, conexión BareMux NUEVA = SharedWorker fresco, wisp sano con testWisp), ensureHealthyWisp() cadena demo/local; Safari: auto-reparación al entrar en error (cooldown 12s) + reintento de navegación con frame nuevo tras fallo; wireFrameEvents extraído.
- CUENTA axcsOS ID (src/os/services/account.ts): par ECDH P-256 en localStorage, @id = huella SHA-256 de la clave (6 chars Crockford), perfil (nombre/avatar/bio/estado), fingerprint/desderive/encrypt AES-GCM, genGroupKey, avatar gradiente por defecto, onAccount suscripción.
- CHAT REAL (src/os/services/chat.ts): brokers MQTT públicos wss (emqx:8084 → hivemq:8884 → mosquitto:8081, failover + backoff + anti-kick multi-pestaña), presencia cada 45s (TTL 100s), buzón por usuario (QoS 1, sesión persistente), DM cifrados ECDH→AES-GCM, grupos (clave AES repartida cifrada por DM), acuses de lectura, typing, DEDUPE por id (QoS 1), LLMADAS WebRTC (audio/vídeo, STUN público, señalización cifrada), persistencia con recorte por cuota, media helpers (shrinkImage <210KB, voz 24kbps).
- APP MENSAJES (rewritten): onboarding crear ID, lista de chats (último mensaje, no leídos, búsqueda), conversación estilo WhatsApp (burbujas con cola, ✓✓ azul, separadores de día, escribiendo…), composer con emojis (6 categorías), stickers (5 packs), imágenes (→ Preview), notas de voz (MediaRecorder, waveform, cancelar), grupos (crear/miembros/invitación), contactos por @id + directorio vivo, perfil propio, llamadas (modal entrante + overlay activo con mute/cámara/colgar + PiP).
- AJUSTES: panel Cuenta = axcsOS ID (sin servidor, sin BD), panel Navegador sin URL de wisp (auto-configurado + botón "Reparar motor"), textos honestos.
- E2E VERIFICADO (agent-browser): login→dock (YouTube+Mensajes)→YouTube tendencias 15 reales→búsqueda→watch (noembed 200 + embed + relacionados + comentarios tras auto-retry)→youtube.com en pestaña Safari (vista nativa, 0 peticiones scramjet, back/forward OK)→example.com por el motor OK→chat: crear ID, MQTT online (broker.emqx.io:8084, clientId aos2-zswba3), presencia bidireccional con peer Node real, DM CIFRADO recibido y descifrado, respuesta cifrada RECIBIDA Y DESCIFRADA por el peer, acuse de lectura, sticker renderizado; export estático verificado localmente (/aos, iconos, dock). Fix en vivo: dedupe QoS1, dedupe announce, sync barra de direcciones, cooldown de comentarios con auto-retry.
- DESPLIEGUE: main bc55b82 + gh-pages 863bc0a (out 5.8MB + .nojekyll).

Stage Summary:
- YouTube ya no depende de Scramjet ni pide sesión: cliente nativo propio multi-fuente (Piped→noembed→embebido oficial) integrado como app y dentro de pestañas de Safari.
- Chat REAL verificado con segunda parte independiente (Node): presencia, E2E ida y vuelta, acuses. Cero servidores que configurar.
- Scramjet se auto-repara; Ajustes ya no pide servidor ni base de datos.
- Scripts de E2E reutilizables: scripts/e2e-chat-peer.mjs, e2e-chat-probe.mjs, e2e-chat-roundtrip.sh.
- VERIFICACIÓN EN VIVO (https://axcgamestudios.github.io/aos/): boot+login OK, dock con YouTube+Mensajes, app YouTube con 14 vídeos reales y badge "sin sesión · sin Scramjet", chat MQTT ONLINE desde el origen público (cuenta @yq5b37 creada en vivo), sw.js/scramjet MIME correctos, iconos PNG servidos. 0 errores de página.

---
Task ID: 6
Agent: main (Z.ai)
Task: Diagnosticar y corregir "las páginas se quedan cargando" en el navegador del OS

Work Log:
- DIAGNÓSTICO (scripts/probe-wisp2.mjs): el motor propio (wss://wsn-c6o3.onrender.com/, Render free tier) acepta el WebSocket y hasta envía el CONTINUE inicial tras despertar de su sueño de inactividad, PERO los datos nunca fluyen (CONNECT cuelga sin respuesta) → la primera navegación queda en spinner eterno SIN error (nada disparaba la auto-reparación). Confirmado en caliente: 1ª prueba colgada >30 s sin datos, 60 s después HTTP 200 real en 260 ms; 5/5 OK en caliente. El respaldo público (wisp.mercurywork.shop) dio 502 transitorio y luego 3/3 OK.
- CAUSA RAÍZ: testWisp() solo comprobaba que el WebSocket ABRIERA → un motor "medio muerto" (arranque en frío) pasaba el chequeo y ensureHealthyWisp lo daba por sano.
- FIX 1 — testWisp honesto (engine/scramjet.ts): prueba a nivel de DATOS con protocolo wisp v1 real desde el navegador: CONNECT(example.com:80, TCP) + GET mínimo y espera del PRIMER byte DATA de vuelta (0x02); CLOSE del servidor = fallo honesto. Frameos binarios con DataView LE. Firma y nombre intactos (mismos puntos de llamada).
- FIX 2 — failover real ANTES de navegar: doInit() ahora elige wisp con ensureHealthyWisp() (prueba honesta) antes de setTransport; MAIN 22 s de margen (arranque en frío), resto 8 s. Si el propio está medio muerto → respaldo sano aplicado de verdad.
- FIX 3 — keepalive anti-sueño reforzado: renovación PROACTIVA del WebSocket cada 4 min (cada reapertura ES una petición entrante que resetea el temporizador de inactividad de Render; un WS abierto en silencio puede no contar), con clearTimeout contra temporizadores huérfanos y reconexión a los 20 s tras cortes.
- FIX 4 — watchdog de carga en Safari (Safari.tsx): ventana temporal por pestaña (hangRef, stage 0/1). >22 s colgada → prueba honesta del wisp ACTIVO: si fluye (sitio lento) se da margen; si no fluye → recoverEngine + reintento con frame NUEVO (retryFreshFrame, extraído y reutilizado también por el catch de navigateTab). >44 s → error honesto visible: overlay "La página no cargó / El motor no respondió…" con botones Reintentar (push:false) y Ajustes del navegador. Ventana reiniciada en navigate/navigateTab/reload; limpiada en onLoad/urlchange/stop. Tab.error nuevo en la interfaz.
- E2E VERIFICADO (agent-browser, dev :3000): login→Safari→example.com CARGADO (init con chequeo honesto integrado); sonda de datos desde el navegador DATA_FLOWS_OK contra el motor propio; URL muerta falla rápido (WS_ERROR_OK); es.wikipedia.org completa sin falsos positivos; navegación a IP no enrutable (203.0.113.1) → watchdog da margen a los 22 s (motor sano, sitio colgado) y a los 44 s declara overlay honesto con Reintentar/Ajustes verificados por DOM; clic en Reintentar limpia el overlay y relanza (barra de carga activa); example.com vuelve a cargar tras todo el ciclo (sin regresión); __wispKeepalive=true; 0 errores de consola; TypeScript limpio en src/.
- DESPLIEGUE: commit main 01800fe + gh-pages a3a21c5; verificado en vivo: https://axcgamestudios.github.io/aos/ 200 y código nuevo confirmado en el chunk desplegado (84612c77ba9facca.js, mensaje "no hizo fluir datos").

Stage Summary:
- "Las páginas se quedan cargando" resuelto de raíz con 4 capas: chequeo de salud honesto (datos reales, no solo apertura de WS), failover real antes de fijar transporte, keepalive que impide que Render duerma el motor y watchdog que garantiza que NINGUNA pestaña quede en spinner eterno (diagnóstico, reintento y error honesto con botón Reintentar).
- Evidencia: scripts/shots/watchdog-e2e-example.png; sonda reutilizable scripts/probe-wisp2.mjs.
