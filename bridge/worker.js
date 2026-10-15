/*
 * Астро-мастерская: мост к моделям ИИ (Cloudflare Worker).
 * Мост ничего не хранит и ничего не записывает. Ключи приходят из браузера
 * (из «Настроек» сайта) и сразу уходят в сервис модели. Мост нужен потому,
 * что часть сервисов (NVIDIA, Mistral) не принимает запросы прямо из браузера.
 * Работает только для сайта lera-astro.github.io.
 */
const VERSION = '1';

const ROUTES = {
  nvidia: 'https://integrate.api.nvidia.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com',
};

const ORIGINS = ['https://lera-astro.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const PASS_REQ = ['content-type', 'accept', 'http-referer', 'x-title'];
const PASS_RES = ['content-type', 'retry-after', 'x-ratelimit-limit-requests', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-requests'];

function allowed(origin, env) {
  if (!origin) return false;
  const extra = String((env && env.EXTRA_ORIGINS) || '').split(',').map(s => s.trim()).filter(Boolean);
  return ORIGINS.includes(origin) || extra.includes(origin) || LOCAL.test(origin);
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, x-goog-api-key, HTTP-Referer, X-Title',
    'Access-Control-Expose-Headers': 'retry-after, x-bridge, x-bridge-key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-bridge': VERSION }, headers || {}) });
}

// несколько ключей через запятую: при отказе ключа или лимите пробуем следующий
function splitKeys(req) {
  const auth = req.headers.get('authorization') || '';
  const goog = req.headers.get('x-goog-api-key') || '';
  if (goog) return { type: 'goog', keys: goog.split(',').map(s => s.trim()).filter(Boolean) };
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) return { type: 'bearer', keys: m[1].split(',').map(s => s.trim()).filter(Boolean) };
  return { type: 'none', keys: [''] };
}

export default {
  async fetch(req, env) {
    env = env || {};
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    const ok = allowed(origin, env);
    const ch = ok ? cors(origin) : {};

    if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: ch });
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, name: 'astro-most', version: VERSION, routes: Object.keys(ROUTES) }, 200, ch);
    }
    if (!ok) return json({ error: { message: 'Мост работает только для сайта Астро-мастерской' } }, 403);
    if (req.method !== 'GET' && req.method !== 'POST') return json({ error: { message: 'Метод не поддерживается' } }, 405, ch);

    const m = /^\/([a-z]+)(\/.*)?$/.exec(url.pathname);
    const name = m && m[1];
    if (!name || !ROUTES[name]) return json({ error: { message: 'Неизвестный сервис: ' + (name || '') } }, 404, ch);
    const base = env.UPSTREAM_OVERRIDE ? env.UPSTREAM_OVERRIDE.replace(/\/$/, '') + '/' + name : ROUTES[name];
    const target = base + (m[2] || '') + url.search;

    const body = req.method === 'POST' ? await req.arrayBuffer() : undefined;
    const { type, keys } = splitKeys(req);
    const start = keys.length > 1 ? Math.floor(Math.random() * keys.length) : 0;

    let last = null;
    for (let i = 0; i < keys.length; i++) {
      const idx = (start + i) % keys.length;
      const h = new Headers();
      PASS_REQ.forEach(k => { const v = req.headers.get(k); if (v) h.set(k, v); });
      if (type === 'bearer') h.set('authorization', 'Bearer ' + keys[idx]);
      if (type === 'goog') h.set('x-goog-api-key', keys[idx]);
      let up;
      try {
        up = await fetch(target, { method: req.method, headers: h, body });
      } catch (e) {
        last = json({ error: { message: 'Мост не достучался до сервиса ' + name + ': ' + (e && e.message || e) } }, 502, ch);
        continue;
      }
      const retryable = keys.length > 1 && i < keys.length - 1 && (up.status === 401 || up.status === 403 || up.status === 429);
      if (retryable) {
        try { await up.body?.cancel(); } catch (e) { }
        last = up;
        continue;
      }
      const out = new Headers(ch);
      PASS_RES.forEach(k => { const v = up.headers.get(k); if (v) out.set(k, v); });
      out.set('cache-control', 'no-store');
      out.set('x-bridge', VERSION);
      if (keys.length > 1) out.set('x-bridge-key', String(idx + 1));
      return new Response(up.body, { status: up.status, headers: out });
    }
    if (last instanceof Response && last.headers.get('x-bridge')) return last;
    const out = new Headers(ch);
    if (last) PASS_RES.forEach(k => { const v = last.headers.get(k); if (v) out.set(k, v); });
    out.set('x-bridge', VERSION);
    return new Response(last ? last.body : null, { status: last ? last.status : 502, headers: out });
  },
};
