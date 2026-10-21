# Worklog

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
