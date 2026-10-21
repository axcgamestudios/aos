import { NextRequest } from "next/server";
import {
  getHomeFeed,
  isYouTubeBrowse,
  isYouTubeWatch,
  renderHome,
  renderSearch,
  renderWatch,
  ytSearch,
  ytVideoInfo,
} from "./yt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ============================================================
   axcsOS — Motor proxy nativo server-side
   - Sigue redirects (arregla 303/302/301 de raíz)
   - Reescribe HTML/CSS para enrutar TODOS los recursos por el proxy
   - Jar de cookies + caché LRU de assets (velocidad)
   - Inyecta shim cliente: localStorage, fetch/XHR, MutationObserver
     (captura contenido dinámico p.ej. portadas de YouTube), descargas
   ============================================================ */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

const PROXY_PREFIX = "/api/proxy?u=";

let OWN_ORIGIN = ""; // origen público de este servidor (para URLs absolutas a prueba de <base>)

function prox(absoluteUrl: string): string {
  return `${OWN_ORIGIN}${PROXY_PREFIX}${encodeURIComponent(absoluteUrl)}`;
}

/* ---------------- cookie jar ---------------- */
const jar = new Map<string, Map<string, string>>();

function jarKey(host: string) {
  return host.replace(/^www\./, "").toLowerCase();
}

function getCookieHeader(url: URL): string {
  const out: string[] = [];
  for (const [host, cookies] of jar) {
    if (url.hostname === host || url.hostname.endsWith("." + host)) {
      for (const [k, v] of cookies) out.push(`${k}=${v}`);
    }
  }
  // saltar el muro de consentimiento de Google/YouTube
  if (/(^|\.)youtube\.com$|(^|\.)google\.[a-z.]+$|(^|\.)googleusercontent\.com$/.test(url.hostname)) {
    if (!out.some((c) => c.startsWith("SOCS="))) out.push("SOCS=CAI");
    if (!out.some((c) => c.startsWith("CONSENT="))) out.push("CONSENT=YES+cb.axcs");
  }
  return out.join("; ");
}

function storeCookies(url: URL, res: Response) {
  const lines: string[] =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    let domain = jarKey(url.hostname);
    const dm = /domain=([^;\s]+)/i.exec(line);
    if (dm) domain = jarKey(dm[1].replace(/^\./, ""));
    if (!jar.has(domain)) jar.set(domain, new Map());
    if (/expires=thu,\s*01\s*jan\s*1970/i.test(line)) {
      jar.get(domain)!.delete(name);
    } else {
      jar.get(domain)!.set(name, value);
    }
  }
}

/* ---------------- caché LRU de assets ---------------- */
const CACHE_MAX = 160;
const assetCache = new Map<
  string,
  { body: ArrayBuffer; contentType: string; status: number; bytes: number }
>();
let cacheBytes = 0;

function cacheGet(key: string) {
  const hit = assetCache.get(key);
  if (hit) {
    assetCache.delete(key);
    assetCache.set(key, hit); // refrescar LRU
  }
  return hit;
}
function cacheSet(
  key: string,
  entry: { body: ArrayBuffer; contentType: string; status: number }
) {
  if (entry.body.byteLength > 6 * 1024 * 1024) return;
  if (assetCache.has(key)) cacheBytes -= assetCache.get(key)!.bytes;
  assetCache.set(key, { ...entry, bytes: entry.body.byteLength });
  cacheBytes += entry.body.byteLength;
  while (assetCache.size > CACHE_MAX || cacheBytes > 48 * 1024 * 1024) {
    const oldest = assetCache.keys().next().value;
    if (oldest === undefined) break;
    cacheBytes -= assetCache.get(oldest)!.bytes;
    assetCache.delete(oldest);
  }
}

/* ---------------- utilidades de reescritura ---------------- */

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n) ?? "";
  } catch {
    return "";
  }
}

/** decodifica entidades HTML de los valores de atributos del código fuente */
function decodeEntities(s: string): string {
  let out = s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeCodePoint(parseInt(d, 10)));
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return out.replace(/&([a-zA-Z]+);/g, (m, name: string) => named[name.toLowerCase()] ?? m);
}

function shouldProxy(v: string | undefined | null): boolean {
  if (!v) return false;
  const s = v.trim();
  if (!s || s.startsWith("#")) return false;
  if (/^(data|blob|javascript|mailto|tel|about|sms|ftp|ws|wss|chrome|file|magnet):/i.test(s))
    return false;
  if (s.includes(PROXY_PREFIX)) return false;
  return true;
}

function absolutize(v: string, base: string): string | null {
  try {
    const u = new URL(v, base);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return null;
}

function proxify(v: string, base: string): string {
  if (!shouldProxy(v)) return v;
  const abs = absolutize(v, base);
  return abs ? prox(abs) : v;
}

function rewriteSrcset(value: string, base: string): string {
  return value
    .split(",")
    .map((part) => {
      const tokens = part.trim().split(/\s+/);
      if (tokens[0] && shouldProxy(tokens[0])) tokens[0] = proxify(tokens[0], base);
      return tokens.join(" ");
    })
    .join(", ");
}

const ATTR_RE =
  /\s(href|src|action|formaction|poster|data-src|data-srcset|data-original|data-lazy-src|data-thumb|data-poster|imagesrcset|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

const URL_CSS_RE = /url\(\s*(["']?)([^)'"]+)\1\s*\)/gi;

function rewriteCssUrls(css: string, base: string): string {
  let out = css.replace(URL_CSS_RE, (m, _q: string, u: string) =>
    shouldProxy(u) ? `url("${proxify(u, base)}")` : m
  );
  out = out.replace(/@import\s+(["'])([^'"]+)\1/gi, (m, _q: string, u: string) =>
    shouldProxy(u) ? `@import "${proxify(u, base)}"` : m
  );
  return out;
}

function rewriteSegment(seg: string, base: string): string {
  // limpiar <link> inútiles por proxy; canonical se deja intacto
  seg = seg.replace(/<link\b[^>]*>/gi, (tag) => {
    if (/rel=(["']?)(preconnect|dns-prefetch)\1/i.test(tag)) return "";
    return tag;
  });
  // atributos con URLs
  seg = seg.replace(ATTR_RE, (m, attr: string, dq?: string, sq?: string, uq?: string) => {
    const raw = dq ?? sq ?? uq ?? "";
    if (!raw) return m;
    const value = decodeEntities(raw);
    let next: string;
    const a = attr.toLowerCase();
    if (a === "srcset" || a === "data-srcset" || a === "imagesrcset") {
      next = rewriteSrcset(value, base);
    } else if ((a === "href" || a === "action" || a === "formaction") && value.startsWith("#")) {
      // con <base> inyectado, un fragmento puro navegaría al sitio real: redirigirlo al proxy
      next = proxify(base + value, base);
    } else {
      next = proxify(value, base);
    }
    if (next === raw || next === value) return m;
    return ` ${attr}="${next.replace(/"/g, "&quot;")}"`;
  });
  // url() en style inline y bloques <style>
  seg = seg.replace(URL_CSS_RE, (m, _q: string, u: string) => {
    const dec = decodeEntities(u);
    return shouldProxy(dec) ? `url("${proxify(dec, base)}")` : m;
  });
  return seg;
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/<\/script/gi, "<\\/script");
}

/* ---------------- shim cliente inyectado ---------------- */
const CLIENT_SHIM = `
(function(){
  if (window.__AXCS_INJECTED) return; window.__AXCS_INJECTED = true;
  var BASE = '__BASE_URL__';
  var P = '/api/proxy?u=';
  function enc(u){ return location.protocol + '//' + location.host + P + encodeURIComponent(u); }
  function shouldRewrite(u){
    if (!u) return false;
    var s = String(u).trim();
    if (!s || s.charAt(0) === '#') return false;
    if (/^(data|blob|javascript|mailto|tel|about|sms|ftp|ws|wss):/i.test(s)) return false;
    if (s.indexOf(P) > -1) return false;
    return true;
  }
  function abs(u){
    try { return new URL(String(u), BASE).href; } catch(e){ return null; }
  }
  function proxify(u){
    if (!shouldRewrite(u)) return u;
    var a = abs(u);
    if (!a) return u;
    /* URL mal resuelta contra nuestro origen (location) → re-resolver contra BASE */
    try {
      var p = new URL(a);
      if (p.host === location.host && p.pathname.indexOf('/api/proxy') !== 0) {
        var fixed = new URL(p.pathname + p.search + p.hash, BASE);
        a = fixed.href;
      }
    } catch(e){}
    if (/^https?:/i.test(a)) return enc(a);
    return u;
  }
  window.__AXCS = { base: function(){ return BASE; }, proxify: proxify, abs: abs };

  /* ---- shims de storage (origen opaco del sandbox) ---- */
  try { window.localStorage.getItem('__axcs'); } catch (e) {
    var mk = function(){ var m = {}; return {
      setItem: function(k,v){ m[k] = String(v); },
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(m,k) ? m[k] : null; },
      removeItem: function(k){ delete m[k]; },
      clear: function(){ m = {}; },
      key: function(i){ return Object.keys(m)[i] || null; },
      get length(){ return Object.keys(m).length; }
    }; };
    try {
      Object.defineProperty(window, 'localStorage', { value: mk(), configurable: true });
      Object.defineProperty(window, 'sessionStorage', { value: mk(), configurable: true });
    } catch (e2) {}
  }

  /* ---- document.cookie / domain en origen opaco lanzan SecurityError ---- */
  try { document.cookie; } catch (e) {
    var cookieMem = '';
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function(){ return cookieMem; },
        set: function(v){ cookieMem = cookieMem ? cookieMem + '; ' + v : '' + v; }
      });
    } catch (e2) {}
  }
  try { document.domain; } catch (e) {
    try {
      var hostMatch = /\\/\\/([^\\/]+)\\//.exec(BASE);
      var fakeDomain = hostMatch ? hostMatch[1] : 'localhost';
      Object.defineProperty(document, 'domain', {
        configurable: true,
        get: function(){ return fakeDomain; },
        set: function(){}
      });
    } catch (e2) {}
  }

  /* ---- document.write/writeln: reescribir srcs escritos dinámicamente ---- */
  try {
    var FRAG_SRC_RE = /\\s(src|href)\\s*=\\s*(["'])([^"']+)\\2/gi;
    function fixFragment(html){
      try {
        if (typeof html !== 'string' || html.indexOf('<') === -1) return html;
        return html.replace(FRAG_SRC_RE, function(m, attr, q, u){
          if (!shouldRewrite(u)) return m;
          return ' ' + attr + '=' + q + proxify(u) + q;
        });
      } catch(e){ return html; }
    }
    var dw = document.write ? document.write.bind(document) : null;
    var dwl = document.writeln ? document.writeln.bind(document) : null;
    if (dw) document.write = function(html){ return dw(fixFragment(html)); };
    if (dwl) document.writeln = function(html){ return dwl(fixFragment(html)); };
  } catch(e){}

  /* ---- setAttribute global: cubre scripts creados vía setAttribute('src') ---- */
  try {
    var sa = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value){
      try {
        var ln = String(name).toLowerCase();
        if (typeof value === 'string' && (ln === 'src' || ln === 'href' || ln === 'action' || ln === 'formaction' || ln === 'poster' || ln === 'data-src' || ln === 'data-original')) {
          if (value.charAt(0) === '#') value = proxify(BASE + value);
          else if (shouldRewrite(value)) value = proxify(value);
        }
      } catch(e){}
      return sa.call(this, name, value);
    };
  } catch(e){}

  /* ---- reescritura de atributos ---- */
  var ATTRS = ['href','src','action','formaction','poster','data-src','data-original','data-lazy-src','data-thumb','data-poster'];

  /* ---- hooks de prototipo: capturan TODO src/href asignado por JS (sin carrera) ---- */
  var HOOKS = [
    [window.HTMLScriptElement, 'src'],
    [window.HTMLImageElement, 'src'],
    [window.HTMLIFrameElement, 'src'],
    [window.HTMLLinkElement, 'href'],
    [window.HTMLAnchorElement, 'href'],
    [window.HTMLSourceElement, 'src'],
    [window.HTMLMediaElement, 'src'],
    [window.HTMLFormElement, 'action'],
    [window.HTMLTrackElement, 'src'],
    [window.HTMLEmbedElement, 'src']
  ];
  for (var hi = 0; hi < HOOKS.length; hi++) {
    try {
      (function(Cls, prop){
        if (!Cls) return;
        var d = Object.getOwnPropertyDescriptor(Cls.prototype, prop);
        if (!d || !d.set) return;
        Object.defineProperty(Cls.prototype, prop, {
          configurable: true,
          get: function(){ return d.get.call(this); },
          set: function(v){
            try {
              if (typeof v === 'string') {
                if (v.charAt(0) === '#') v = proxify(BASE + v);
                else if (shouldRewrite(v)) v = proxify(v);
              }
            } catch(e){}
            d.set.call(this, v);
          }
        });
      })(HOOKS[hi][0], HOOKS[hi][1]);
    } catch(e){}
  }
  function fixSrcset(el){
    var which = el.getAttribute('srcset') !== null ? 'srcset' : (el.getAttribute('data-srcset') !== null ? 'data-srcset' : (el.getAttribute('imagesrcset') !== null ? 'imagesrcset' : null));
    if (!which) return;
    var ss = el.getAttribute(which);
    if (!ss) return;
    var out = ss.split(',').map(function(part){
      var t = part.trim().split(/\\s+/);
      if (t[0] && shouldRewrite(t[0])) t[0] = proxify(t[0]);
      return t.join(' ');
    }).join(', ');
    try { el.setAttribute(which, out); } catch(e){}
  }
  function fixEl(el){
    if (!el || !el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++){
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (v && shouldRewrite(v)) { try { el.setAttribute(a, proxify(v)); } catch(e){} }
    }
    if (el.tagName === 'IMG' || el.tagName === 'SOURCE') fixSrcset(el);
    var st = el.getAttribute('style');
    if (st && st.indexOf('url(') > -1) {
      try {
        el.setAttribute('style', st.replace(/url\\(\\s*(["']?)([^)'"]+)\\1\\s*\\)/g, function(m, q, u){
          return shouldRewrite(u) ? 'url("' + proxify(u) + '")' : m;
        }));
      } catch(e){}
    }
  }

  /* ---- observer: contenido añadido por JS (portadas de YouTube, etc.) ---- */
  var mo = new MutationObserver(function(muts){
    for (var i = 0; i < muts.length; i++){
      var m = muts[i];
      if (m.type === 'childList' && m.addedNodes){
        for (var j = 0; j < m.addedNodes.length; j++){
          var n = m.addedNodes[j];
          if (!n || n.nodeType !== 1) continue;
          fixEl(n);
          if (n.querySelectorAll) {
            try {
              var els = n.querySelectorAll('img,source,a,link,script,iframe,form,video,audio,embed,track,[style]');
              for (var k = 0; k < els.length; k++) fixEl(els[k]);
            } catch(e){}
          }
        }
      } else if (m.type === 'attributes' && m.target) {
        fixEl(m.target);
      }
    }
  });
  function startMo(){
    try {
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS.concat(['srcset','data-srcset','imagesrcset','style']) });
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMo);
  else startMo();

  /* ---- reportar título + URL al OS ---- */
  function report(){
    try {
      parent.postMessage({ __axcs: 'nav', title: document.title || '', url: BASE }, '*');
    } catch(e){}
  }
  report();

  /* ---- canal de errores JS hacia el OS (diagnóstico) ---- */
  window.addEventListener('error', function(e){
    try {
      parent.postMessage({ __axcs: 'jserror', msg: String(e.message || ''), file: String(e.filename || '').slice(0, 140), line: e.lineno, col: e.colno, stack: String((e.error && e.error && e.error.stack) || '').slice(0, 400) }, '*');
    } catch(err){}
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    try {
      var r = e.reason;
      parent.postMessage({ __axcs: 'jserror', msg: 'unhandledrejection: ' + String((r && r.message) || r || '').slice(0, 200), file: '', line: 0, col: 0, stack: String((r && r.stack) || '').slice(0, 400) }, '*');
    } catch(err){}
  });
  try {
    new MutationObserver(report).observe(document.querySelector('head') || document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch(e){}

  /* ---- history: mantener coherencia ---- */
  try {
    var ps = history.pushState ? history.pushState.bind(history) : null;
    var rs = history.replaceState ? history.replaceState.bind(history) : null;
    function norm(u){
      if (!u) return BASE;
      var s = String(u);
      if (/^https?:/i.test(s)) return s;
      var a = abs(s);
      return a || BASE;
    }
    if (ps) history.pushState = function(st, t, u){ BASE = norm(u); try { ps(st, t, null); } catch(e){} report(); };
    if (rs) history.replaceState = function(st, t, u){ BASE = norm(u); try { rs(st, t, null); } catch(e){} report(); };
  } catch(e){}
  window.addEventListener('popstate', report);
  window.addEventListener('hashchange', report);

  /* ---- comandos desde el OS (Safari) ---- */
  window.addEventListener('message', function(e){
    var d = e && e.data;
    if (!d || !d.__axcsCmd) return;
    try {
      if (d.__axcsCmd === 'back') history.back();
      else if (d.__axcsCmd === 'forward') history.forward();
      else if (d.__axcsCmd === 'reload') location.reload();
    } catch(err){}
  });

  /* ---- window.open por proxy ---- */
  try {
    var wo = window.open ? window.open.bind(window) : null;
    if (wo) window.open = function(u, n, f){
      var s = u == null ? u : String(u);
      if (s && shouldRewrite(s)) {
        var p = proxify(s);
        if (p.charAt(0) === '/') p = location.origin + p;
        s = p;
      } else if (s && s.charAt(0) === '/') {
        s = location.origin + s;
      }
      return wo(s, n, f);
    };
  } catch(e){}

  /* ---- fetch por proxy (APIs de los sitios) ---- */
  try {
    var of = window.fetch ? window.fetch.bind(window) : null;
    if (of) window.fetch = function(input, init){
      try {
        var u = null;
        if (typeof input === 'string') u = input;
        else if (input && input.url) u = input.url;
        else if (input && input.href) u = input.href;
        if (u && shouldRewrite(u)) {
          var p = proxify(u);
          if (typeof input === 'string') return of(p, init);
          if (input && typeof input === 'object' && input.method) {
            /* Request: reconstruir con nueva URL preservando método/cuerpo/cabeceras */
            try { return of(new Request(p, input), init); } catch (e3) { return of(p, init); }
          }
          return of(p, init);
        }
      } catch(e){}
      return of(input, init);
    };
  } catch(e){}

  /* ---- XHR por proxy ---- */
  try {
    var oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u){
      var args = Array.prototype.slice.call(arguments);
      if (u && shouldRewrite(u)) args[1] = proxify(u);
      return oo.apply(this, args);
    };
  } catch(e){}

  /* ---- descargas al OS ---- */
  var DL_RE = /\\.(zip|rar|7z|tar|gz|tgz|dmg|pkg|exe|msi|iso|pdf|mp3|wav|ogg|flac|m4a|mp4|mkv|mov|avi|webm|doc|docx|xls|xlsx|ppt|pptx|csv|epub|apk|jar|ttf|otf|woff2?)(\\?|#|$)/i;
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.hasAttribute('download') || DL_RE.test(href)) {
        var au = abs(href);
        if (au && /^https?:/i.test(au)) {
          e.preventDefault(); e.stopPropagation();
          var name = a.getAttribute('download') || (au.split('/').pop() || 'archivo').split('?')[0];
          parent.postMessage({ __axcs: 'download', url: au, name: decodeURIComponent(name || 'archivo') }, '*');
        }
      }
    } catch(err){}
  }, true);

  /* ---- imágenes fallidas → reintentar por proxy (una sola vez, sin bucles) ---- */
  document.addEventListener('error', function(e){
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.getAttribute) {
      var cur = t.getAttribute('src') || '';
      if (!cur) return;
      if (cur.indexOf(P) > -1 || cur.indexOf('/api/proxy') > -1) return; // ya proxificada
      if (/^(data|blob):/i.test(cur)) return;
      if (t.getAttribute('data-axcs-retried')) return; // solo un intento
      var a = abs(cur);
      if (a && /^https?:/i.test(a)) {
        try { t.setAttribute('data-axcs-retried', '1'); } catch(err){}
        t.src = enc(a);
      }
    }
  }, true);
})();
`;

function rewriteHtml(html: string, baseUrl: string): string {
  let base = baseUrl;
  const baseTag = /<base\b[^>]*href=(["'])(.*?)\1[^>]*>/i.exec(html);
  if (baseTag) {
    try {
      base = new URL(baseTag[2], base).href;
    } catch {
      /* ignore */
    }
  }
  html = html.replace(/<base\b[^>]*>/gi, "");
  // CSP meta fuera, integrity fuera (los recursos reescritos cambian de hash)
  html = html.replace(
    /<meta[^>]+http-equiv=(["']?)content-security-policy\1[^>]*>/gi,
    ""
  );
  html = html.replace(/\s+integrity=(["'][^"']*["']|[^\s>]+)/gi, "");
  html = html.replace(/\s+crossorigin(=(["'][^"']*["']|[^\s>]+))?/gi, "");
  // PRE-PASO: reescribir src/href de las etiquetas de APERTURA de <script>
  // (el split por bloques no las reescribe al quedar dentro del segmento script)
  html = html.replace(/<script\b([^>]*)>/gi, (tag, attrs: string) => {
    const nextAttrs = attrs.replace(ATTR_RE, (m, attr: string, dq?: string, sq?: string, uq?: string) => {
      const raw = dq ?? sq ?? uq ?? "";
      if (!raw) return m;
      const value = decodeEntities(raw);
      const next = proxify(value, base);
      if (next === raw || next === value) return m;
      return ` ${attr}="${next.replace(/"/g, "&quot;")}"`;
    });
    return nextAttrs === attrs ? tag : `<script${nextAttrs}>`;
  });
  // dividir por bloques <script> y reescribir solo el resto
  const parts = html.split(/(<script\b[\s\S]*?<\/script>|<\/script>)/gi);
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) parts[i] = rewriteSegment(parts[i], base);
  }
  html = parts.join("");
  // meta refresh
  html = html.replace(
    /(<meta[^>]*http-equiv=(["'])refresh\2[^>]*content=(["'])\s*[^"']*?url=)([^"';"]+)/gi,
    (m, pre: string, _q1: string, _q2: string, url: string) =>
      shouldProxy(url) ? pre + proxify(url, base) : m
  );
  // inyectar <base> (recursos relativos dinámicos resuelven al sitio real) + shim
  const inject =
    `<base href="${base.replace(/"/g, "&quot;")}">` +
    `<meta name="referrer" content="no-referrer">` +
    `<script>${CLIENT_SHIM.replace("__BASE_URL__", escapeJs(base))}</script>`;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, (m) => m + inject);
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, (m) => m + inject);
  } else {
    html = inject + html;
  }
  return html;
}

/* ---------------- detección de charset ---------------- */
function decodeBody(buf: ArrayBuffer, contentType: string): { text: string; charset: string } {
  const ctMatch = /charset=([\w-]+)/i.exec(contentType);
  let charset = ctMatch ? ctMatch[1].toLowerCase() : "";
  if (!charset) {
    const head = new Uint8Array(buf.slice(0, 4096));
    const headStr = new TextDecoder("latin1").decode(head);
    const m1 = /<meta[^>]+charset=["']?([\w-]+)/i.exec(headStr);
    const m2 = /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(headStr);
    charset = (m1?.[1] || m2?.[1] || "utf-8").toLowerCase();
  }
  try {
    return { text: new TextDecoder(charset).decode(buf), charset };
  } catch {
    return { text: new TextDecoder("utf-8").decode(buf), charset: "utf-8" };
  }
}

/* ---------------- tipos de contenido ---------------- */
const STATIC_RE =
  /^(image\/|font\/|video\/|audio\/|application\/(font|octet-stream|pdf|zip|x-rar|wasm|protobuf))/i;

function isAssetCacheable(contentType: string) {
  return STATIC_RE.test(contentType);
}

/* ---------------- fetch al destino ---------------- */
async function fetchTarget(
  url: URL,
  req: NextRequest,
  method: string,
  body?: ArrayBuffer | null
) {
  const cookie = getCookieHeader(url);
  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: req.headers.get("accept") ?? "*/*",
    "accept-language": "es-ES,es;q=0.9,en;q=0.8",
    referer: url.origin + "/",
  };
  if (cookie) headers.cookie = cookie;
  const range = req.headers.get("range");
  if (range) headers.range = range;
  if (body && method === "POST") {
    headers["content-type"] =
      req.headers.get("content-type") ?? "application/x-www-form-urlencoded";
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    return await fetch(url.href, {
      method,
      headers,
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal: ctrl.signal,
      body: method === "POST" && body ? body : undefined,
    });
  } finally {
    clearTimeout(timer);
  }
}

function errorPage(title: string, message: string, url: string): string {
  const safeUrl = url.replace(/[<>&"]/g, "");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0b0b0d;color:#e8e8ea;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
  .card{max-width:420px;padding:38px 34px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;backdrop-filter:blur(20px)}
  h1{font-size:17px;margin:0 0 8px;font-weight:600}
  p{font-size:13px;line-height:1.55;color:#b9b9c0;margin:6px 0}
  .u{font-size:11px;color:#77777d;word-break:break-all;margin-top:14px}
  .b{margin-top:20px;display:inline-block;padding:9px 18px;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:12px;text-decoration:none;border:1px solid rgba(255,255,255,.16)}
  </style></head><body><div class="card"><div style="font-size:40px;margin-bottom:10px">🌐</div><h1>${title}</h1><p>${message}</p><div class="u">${safeUrl}</div><a class="b" href="javascript:location.reload()">Reintentar</a></div></body></html>`;
}

/* ============================================================
   Handlers
   ============================================================ */

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function handle(req: NextRequest, method: "GET" | "POST") {
  const params = req.nextUrl.searchParams;
  let target = params.get("u");
  if (!target) {
    return new Response("axcsOS proxy: falta ?u=", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", ...CORS },
    });
  }
  // params extra de formularios GET → añadirlos a la URL destino
  const extras = [...params.entries()].filter(([k]) => k !== "u");
  if (extras.length && method === "GET") {
    try {
      const t = new URL(target);
      for (const [k, v] of extras) t.searchParams.append(k, v);
      target = t.href;
    } catch {
      /* ignore */
    }
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return new Response("URL inválida", {
      status: 400,
      headers: { "content-type": "text/plain", ...CORS },
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return new Response("Protocolo no permitido", {
      status: 400,
      headers: { "content-type": "text/plain", ...CORS },
    });
  }
  // origen público robusto (detrás de proxies inversos usa x-forwarded-*)
  const hHost =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const hProto =
    req.headers.get("x-forwarded-proto") ??
    (/^(localhost|127\.|0\.0\.0\.0|\[)/.test(hHost) ? "http" : "https");
  OWN_ORIGIN = `${hProto}://${hHost}`;

  /* ---- cliente YouTube especial (la SPA de youtube.com no hidrata bajo proxy) ---- */
  const withShim = (html: string, base: string) =>
    html.replace(
      "</body>",
      `<script>${CLIENT_SHIM.replace("__BASE_URL__", escapeJs(base))}</script></body>`
    );
  try {
    const watchId = isYouTubeWatch(url);
    if (watchId) {
      const info = await ytVideoInfo(watchId);
      const v = info?.video ?? null;
      const streamUrl = info?.streamUrl ?? null;
      const related = await getHomeFeed();
      return new Response(
        withShim(
          renderWatch(v, watchId, streamUrl, related, OWN_ORIGIN),
          `https://www.youtube.com/watch?v=${watchId}`
        ),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...CORS } }
      );
    }
    if (isYouTubeBrowse(url)) {
      const q = url.searchParams.get("search_query") ?? "";
      if (url.pathname.startsWith("/results") && q) {
        const videos = await ytSearch(q);
        return new Response(
          withShim(renderSearch(videos, q, OWN_ORIGIN), `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`),
          { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...CORS } }
        );
      }
      const videos = await getHomeFeed();
      return new Response(
        withShim(renderHome(videos, OWN_ORIGIN), "https://www.youtube.com/"),
        { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...CORS } }
      );
    }
  } catch {
    /* si falla, sigue el proxy normal */
  }
  // bloquear bucles hacia nuestro propio servidor (URLs relativas mal resueltas)
  const reqHost = (req.headers.get("host") ?? "").toLowerCase();
  if (
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(url.hostname) ||
    (reqHost && url.host.toLowerCase() === reqHost)
  ) {
    return new Response("", { status: 404, headers: { "content-type": "text/plain", ...CORS } });
  }

  let body: ArrayBuffer | null = null;
  if (method === "POST") {
    body = await req.arrayBuffer();
  }

  let res: Response;
  try {
    res = await fetchTarget(url, req, method, body);
  } catch {
    return new Response(
      errorPage(
        "No se pudo conectar",
        "El sitio tardó demasiado en responder o no está disponible. Vuelve a intentarlo.",
        url.href
      ),
      { status: 504, headers: { "content-type": "text/html; charset=utf-8", ...CORS } }
    );
  }
  storeCookies(url, res);

  // respuestas sin cuerpo: devolver 200 vacío (el runtime no permite construir 204)
  if (res.status === 204 || res.status === 205 || res.status === 304) {
    return new Response(null, { status: 200, headers: CORS });
  }

  const finalUrl = res.url || url.href;
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers(CORS);

  /* --- peticiones con Range (vídeo/audio) --- */
  if (req.headers.get("range")) {
    const cr = res.headers.get("content-range");
    headers.set("content-type", contentType);
    if (cr) headers.set("content-range", cr);
    headers.set("accept-ranges", "bytes");
    const buf = await res.arrayBuffer();
    headers.set("content-length", String(buf.byteLength));
    return new Response(buf, { status: res.status, headers });
  }

  const ct = contentType.toLowerCase();

  /* --- assets: pasar en crudo con caché --- */
  if (!ct.includes("html") && !ct.includes("xml") && !ct.startsWith("text/css")) {
    const cacheKey = url.href;
    const hit = cacheGet(cacheKey);
    if (hit && !res.headers.get("set-cookie")) {
      headers.set("content-type", hit.contentType);
      headers.set("x-axcs-cache", "hit");
      headers.set("cache-control", "public, max-age=3600");
      headers.set("content-length", String(hit.body.byteLength));
      return new Response(hit.body, { status: hit.status, headers });
    }
    const buf = await res.arrayBuffer();
    if (res.ok && isAssetCacheable(ct)) {
      cacheSet(cacheKey, { body: buf, contentType: ct, status: res.status });
      headers.set("cache-control", "public, max-age=3600");
    } else {
      headers.set("cache-control", "no-store");
    }
    const cd = res.headers.get("content-disposition");
    if (cd) headers.set("content-disposition", cd);
    headers.set("content-type", ct);
    headers.set("content-length", String(buf.byteLength));
    headers.set("x-axcs-final-url", finalUrl);
    return new Response(buf, { status: res.status, headers });
  }

  /* --- HTML --- */
  if (ct.includes("html") || ct.includes("xml")) {
    const buf = await res.arrayBuffer();
    const { text, charset } = decodeBody(buf, ct);
    const rewritten = rewriteHtml(text, finalUrl);
    headers.set("content-type", `text/html; charset=${charset}`);
    headers.set("cache-control", "no-store");
    headers.set("x-axcs-final-url", finalUrl);
    return new Response(rewritten, { status: res.status, headers });
  }

  /* --- CSS --- */
  if (ct.startsWith("text/css")) {
    const buf = await res.arrayBuffer();
    const css = new TextDecoder("utf-8").decode(buf);
    const rewritten = rewriteCssUrls(css, finalUrl);
    headers.set("content-type", "text/css; charset=utf-8");
    headers.set("cache-control", "public, max-age=600");
    headers.set("x-axcs-final-url", finalUrl);
    return new Response(rewritten, { status: res.status, headers });
  }

  /* --- otros --- */
  const buf = await res.arrayBuffer();
  headers.set("content-type", ct);
  headers.set("cache-control", "no-store");
  headers.set("x-axcs-final-url", finalUrl);
  return new Response(buf, { status: res.status, headers });
}

export async function GET(req: NextRequest) {
  return handle(req, "GET");
}
export async function POST(req: NextRequest) {
  return handle(req, "POST");
}
