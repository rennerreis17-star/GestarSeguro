// Gestar Seguro: funciona sem internet depois da primeira abertura.
const CACHE = "gestar-seguro-v3";
const CORE = ["./", "./index.html", "./apple-touch-icon.png.png", "./video.mp4"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function rangeResponse(req, res) {
  const range = req.headers.get("range"); const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range || ""); const size = buf.byteLength;
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": res.headers.get("Content-Type") || "video/mp4",
    "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  // vídeo: do cache, respeitando pedidos por partes (Safari)
  if (url.pathname.endsWith("/video.mp4")) {
    e.respondWith(caches.open(CACHE).then(async c => {
      let res = await c.match("./video.mp4");
      if (!res) { try { const full = await fetch(url.href); if (full.ok) { await c.put("./video.mp4", full.clone()); res = full; } } catch {} }
      if (!res) return fetch(req);
      return req.headers.get("range") ? rangeResponse(req, res) : res;
    }));
    return;
  }
  // página: tenta a internet primeiro (para receber atualizações), senão usa o cache
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); return r; })
      .catch(() => caches.match("./index.html").then(r => r || caches.match("./"))));
    return;
  }
  // demais arquivos (ícone, fontes): cache primeiro, atualiza em segundo plano
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
