/* Астро-мастерская: бесплатные модели, выбор и запасные варианты */
(function (G) {
  'use strict';
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  class AIError extends Error {
    constructor(kind, msg, status, retryAfter) { super(msg); this.kind = kind; this.status = status; this.retryAfter = retryAfter; }
  }
  async function httpErr(r) {
    let txt = ''; try { txt = await r.text(); } catch (e) { }
    let msg = txt; try { const j = JSON.parse(txt); msg = (j.error && (j.error.message || j.error)) || j.message || txt; } catch (e) { }
    msg = String(msg).slice(0, 300);
    const ra = parseFloat(r.headers.get('retry-after') || '') || (/retry in ([\d.]+)s/i.exec(msg) || [])[1];
    const low = (msg + ' ' + txt).toLowerCase();
    let kind = 'other';
    if (/api key not valid|invalid api key|incorrect api key|api_key_invalid|invalid_api_key|unauthorized|authentication/.test(low)) kind = 'key';
    else if (r.status === 401 || r.status === 403 && /key|permission|unauth|api_key|invalid/.test(low)) kind = 'key';
    else if (r.status === 429 || /quota|rate limit|resource_exhausted|too many/.test(low)) kind = /per.?day|daily|requests per day|perday/.test(low) ? 'daily' : 'rate';
    else if (r.status === 413 || /too large|context length|maximum context|tokens.*exceed|request too large|reduce the length/.test(low)) kind = 'size';
    else if (r.status >= 500) kind = 'server';
    else if (r.status === 404) kind = 'model';
    else if (r.status === 400 && /model/.test(low) && /not found|not supported|does not exist|decommission/.test(low)) kind = 'model';
    return new AIError(kind, msg, r.status, ra ? +ra : 0);
  }
  // запросы, которые шли, пока телефон был заблокирован, после возвращения прерываем и повторяем
  const LIVE = new Set(); let hiddenAt = 0, shownAt = 0;
  // пока модель пишет, экран не гаснет (иначе iPhone обрывает запрос)
  let wlock = null, active = 0;
  async function wakeOn() { try { if (G.navigator && G.navigator.wakeLock && G.document && !G.document.hidden && !wlock) { wlock = await G.navigator.wakeLock.request('screen'); if (wlock.addEventListener) wlock.addEventListener('release', () => { wlock = null; }); } } catch (e) { wlock = null; } }
  function wakeOff() { if (active > 0) return; try { if (wlock) wlock.release(); } catch (e) { } wlock = null; }
  const waitVisible = () => new Promise(res => { if (!G.document || !G.document.hidden) return res(); const h = () => { if (!G.document.hidden) { G.document.removeEventListener('visibilitychange', h); res(); } }; G.document.addEventListener('visibilitychange', h); });
  if (G.document) G.document.addEventListener('visibilitychange', () => {
    if (G.document.hidden) { hiddenAt = Date.now(); return; }
    shownAt = Date.now();
    if (hiddenAt && Date.now() - hiddenAt > 10000) LIVE.forEach(c => { c.resumed = true; c.abort(); });
    hiddenAt = 0;
    if (active > 0) wakeOn();
  });
  async function fetchT(url, opt, ms) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 240000);
    LIVE.add(ctl);
    try { return await fetch(url, Object.assign({}, opt, { signal: ctl.signal })); }
    catch (e) {
      if (ctl.resumed) { const er = new AIError('network', 'Связь прервалась, пока экран был выключен'); er.bg = true; throw er; }
      throw new AIError(e.name === 'AbortError' ? 'timeout' : 'network', e.name === 'AbortError' ? 'Модель не ответила вовремя' : 'Нет связи с сервисом: ' + e.message);
    }
    finally { clearTimeout(t); setTimeout(() => LIVE.delete(ctl), 0); }
  }
  const stripThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

  // ---------- мост (Cloudflare Worker): через него идут сервисы, которые не принимают запросы прямо из браузера
  const BRIDGE_DEFAULT = 'https://astro-most.cruiserprojectmotion.workers.dev';
  function bridge() { return String(LS.get('ai_bridge', '') || BRIDGE_DEFAULT).trim().replace(/\/+$/, ''); }
  async function bridgeCheck() {
    const b = bridge(); if (!b) throw new AIError('nokey', 'Адрес моста не указан');
    const r = await fetchT(b + '/health', {}, 20000);
    if (!r.ok) throw await httpErr(r);
    const j = await r.json(); if (!j || j.name !== 'astro-most') throw new AIError('other', 'По этому адресу отвечает не мост');
    return j;
  }
  // ответ потоком (SSE): текст приходит по кусочку, связь не простаивает, видно, сколько уже написано
  async function readSSE(r, onLen) {
    const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '', text = '', fin = null, lastTick = 0, sawDone = false;
    const IDLE = 120000;
    const read = () => { let t; return Promise.race([rd.read().finally(() => clearTimeout(t)), new Promise((_, rej) => { t = setTimeout(() => rej(new AIError('timeout', 'Модель замолчала и не дописала ответ')), IDLE); })]); };
    try {
      for (;;) {
        const { done, value } = await read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim(); if (d === '[DONE]') { sawDone = true; continue; } if (!d) continue;
          let j; try { j = JSON.parse(d); } catch (e) { continue; }
          if (j.error) throw new AIError('server', String(j.error.message || j.error).slice(0, 300));
          const ch = j.choices && j.choices[0]; if (!ch) continue;
          let c = ch.delta && ch.delta.content; if (Array.isArray(c)) c = c.map(x => x.text || '').join('');
          if (c) { text += c; if (onLen && Date.now() - lastTick > 1000) { lastTick = Date.now(); onLen(text.length); } }
          if (ch.finish_reason) fin = ch.finish_reason;
        }
      }
    } catch (e) {
      try { rd.cancel(); } catch (x) { }
      // связь оборвалась посреди длинного ответа: отдаём написанное, остальное программа допросит продолжением
      if (stripThink(text).length >= 1500 && !(e instanceof AIError && e.kind === 'server')) return { text, fin: 'length', cut: true };
      if (e instanceof AIError) throw e;
      throw new AIError('network', 'Связь оборвалась посреди ответа');
    }
    // поток кончился без финальной отметки: значит, связь оборвалась по дороге
    if (!fin && !sawDone) {
      if (stripThink(text).length >= 1500) return { text, fin: 'length', cut: true };
      throw new AIError('network', 'Связь оборвалась посреди ответа');
    }
    return { text, fin };
  }

  // ---------- провайдеры
  const OA = (baseIn, extraHeaders, opt) => ({
    async list(key) {
      const base = typeof baseIn === 'function' ? baseIn() : baseIn;
      const r = await fetchT(base + '/models', { headers: Object.assign({ Authorization: 'Bearer ' + key }, extraHeaders || {}) }, 30000);
      if (!r.ok) throw await httpErr(r);
      const j = await r.json();
      return (j.data || []).map(m => ({ id: m.id, ctx: m.context_length || m.context_window || (m.max_context_length) || 0, free: /:free$/.test(m.id) || (m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0), vision: !!(m.architecture && /image/.test(String(m.architecture.input_modalities || m.architecture.modality || ''))) || (m.capabilities && m.capabilities.vision) }));
    },
    async chat(key, model, q) {
      const base = typeof baseIn === 'function' ? baseIn() : baseIn;
      const stream = !!(opt && (typeof opt.stream === 'function' ? opt.stream() : opt.stream));
      const content = q.images && q.images.length
        ? [{ type: 'text', text: q.user }].concat(q.images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })))
        : q.user;
      const msgs = []; if (q.system) msgs.push({ role: 'system', content: q.system }); msgs.push({ role: 'user', content });
      const body = { model, messages: msgs, temperature: q.temperature != null ? q.temperature : 0.8, max_tokens: q.maxTokens || 8000 };
      if (base.includes('groq') && /qwen3|qwq|deepseek-r1/.test(model)) body.reasoning_format = 'hidden';
      if (stream) body.stream = true;
      const r = await fetchT(base + '/chat/completions', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, extraHeaders || {}), body: JSON.stringify(body) }, q.timeout);
      if (!r.ok) { const e = await httpErr(r); if (opt && opt.nv && r.status === 403 && !/invalid|expired|unauthor/i.test(e.message)) e.kind = 'model'; throw e; }
      if (stream && /event-stream/.test(r.headers.get('content-type') || '')) {
        const lab = q.onStatus ? q.statusLabel || '' : '';
        const o = await readSSE(r, n => q.onStatus && q.onStatus(`${lab}${lab ? ' · ' : ''}${n} знаков`));
        if (!o.text) throw new AIError('other', 'Пустой ответ модели');
        return { text: stripThink(o.text), truncated: o.fin === 'length' };
      }
      const j = await r.json();
      const ch = j.choices && j.choices[0];
      if (!ch) throw new AIError('other', 'Пустой ответ модели');
      let text = ch.message && ch.message.content; if (Array.isArray(text)) text = text.map(x => x.text || '').join('');
      return { text: stripThink(text), truncated: ch.finish_reason === 'length' };
    },
  });

  const P = {
    gemini: {
      label: 'Gemini', site: 'https://aistudio.google.com/apikey',
      async list(key) {
        const r = await fetchT('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } }, 30000);
        if (!r.ok) throw await httpErr(r);
        const j = await r.json();
        return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => ({ id: m.name.replace(/^models\//, ''), ctx: m.inputTokenLimit, out: m.outputTokenLimit, vision: true }));
      },
      async chat(key, model, q) {
        const gemma = /gemma/.test(model);
        const parts = [{ text: gemma && q.system ? q.system + '\n\n' + q.user : q.user }];
        (q.images || []).forEach(im => parts.push({ inline_data: { mime_type: im.mime, data: im.data } }));
        const body = {
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: q.temperature != null ? q.temperature : 0.8, maxOutputTokens: q.maxTokens || 8000 },
          safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(c => ({ category: c, threshold: 'BLOCK_ONLY_HIGH' })),
        };
        if (q.system && !gemma) body.systemInstruction = { parts: [{ text: q.system }] };
        const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }, q.timeout);
        if (!r.ok) throw await httpErr(r);
        const j = await r.json();
        const c = j.candidates && j.candidates[0];
        if (!c || !c.content) throw new AIError('other', 'Модель не дала ответ' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (фильтр: ' + j.promptFeedback.blockReason + ')' : c && c.finishReason ? ' (' + c.finishReason + ')' : ''));
        const text = (c.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
        return { text: stripThink(text), truncated: c.finishReason === 'MAX_TOKENS' };
      },
    },
    groq: Object.assign({ label: 'Groq', site: 'https://console.groq.com/keys' }, OA('https://api.groq.com/openai/v1')),
    deepseek: Object.assign({ label: 'DeepSeek', site: 'https://platform.deepseek.com/api_keys' }, OA('https://api.deepseek.com')),
    mistral: Object.assign({ label: 'Mistral', site: 'https://console.mistral.ai/api-keys' }, OA(() => bridge() ? bridge() + '/mistral' : 'https://api.mistral.ai/v1', null, { stream: () => !!bridge() })),
    nvidia: Object.assign({ label: 'NVIDIA', site: 'https://build.nvidia.com/settings/api-keys', needBridge: true }, OA(() => bridge() + '/nvidia', null, { stream: true, nv: true })),
    openrouter: Object.assign({ label: 'OpenRouter', site: 'https://openrouter.ai/settings/keys' }, OA('https://openrouter.ai/api/v1', { 'HTTP-Referer': (G.location && G.location.origin) || 'https://astro.local', 'X-Title': 'Astro Workshop' })),
  };

  // ---------- выбор моделей
  const BAD = /tts|image|embed|live|audio|native|computer|robotics|learnlm|aqa|veo|imagen|vision-only|guard|whisper|moderation|ocr|codestral|devstral|embed|transcri|prompt-guard|safeguard|compound|playai|orpheus/i;
  function verOf(id) { const m = /(\d+(?:\.\d+)?)/.exec(id.replace(/^.*?(gemini|qwen|llama|mistral|gemma)[^\d]*/i, '')); return m ? parseFloat(m[1]) : 0; }
  function score(prov, m, task) {
    const id = m.id.toLowerCase();
    if (BAD.test(id)) return -1;
    let s = 0; const v = verOf(id);
    if (task === 'review') task = 'long';
    const big = task === 'long' || task === 'visionpost' || task === 'post';
    if (prov === 'gemini') {
      if (/gemma/.test(id)) s = (big ? 5 : 8) + v;
      else if (/flash-lite/.test(id)) s = (big ? 40 : 95) + v * 2;
      else if (/flash/.test(id)) s = (big ? 100 : 70) + v * 2;
      else if (/pro/.test(id)) s = (big ? 60 : 20) + v * 2;
      else return -1;
      if (/preview|exp/.test(id)) s -= 6;
      if (/latest/.test(id)) s += 4;
      if (/thinking/.test(id)) s -= 3;
      if (/\d{3}$/.test(id)) s -= 1; // датированные версии ниже алиасов
    } else if (prov === 'groq') {
      if (/^(vision|ocr)/.test(task)) { if (/llama-4|scout|maverick|vision/.test(id)) s = 50; else return -1; }
      else if (task === 'long') { if (/llama-4-scout/.test(id)) s = 60; else if (/kimi|gpt-oss-120b|llama-3\.3-70b/.test(id)) s = 40; else return -1; }
      else if (/qwen/.test(id)) s = 90 + v;
      else if (/gpt-oss-120b/.test(id)) s = 80;
      else if (/kimi|deepseek/.test(id)) s = 75;
      else if (/llama-3\.3-70b|llama-4-maverick/.test(id)) s = 70;
      else if (/gpt-oss|llama-4/.test(id)) s = 60;
      else return -1;
    } else if (prov === 'deepseek') {
      if (/^(vision|ocr)/.test(task) || /vision/.test(id)) return -1;
      if (/reason|r1/.test(id)) return task === 'long' ? 40 : -1;
      if (/flash|chat/.test(id)) s = 95; else if (/pro/.test(id)) s = 85; else s = 60;
    } else if (prov === 'mistral') {
      if (/^(vision|ocr)/.test(task)) { if (/pixtral-large|mistral-medium|mistral-small/.test(id)) s = /medium/.test(id) ? 60 : 50; else return -1; }
      else if (/mistral-large/.test(id)) s = 90;
      else if (/mistral-medium/.test(id)) s = 85;
      else if (/magistral-medium/.test(id)) s = 70;
      else if (/mistral-small/.test(id)) s = task === 'short' ? 88 : 60;
      else return -1;
      if (/latest/.test(id)) s += 3;
    } else if (prov === 'nvidia') {
      if (/embed|rerank|retriev|guard|safety|reward|nemoretriever|parse|clip|cosmos|vila|nv-|riva|fuyu|kosmos|deplot|paligemma|starcoder|codegemma|codellama|coder|math|-base$|bge|e5|arctic-embed|usdcode|chatqa|translate|sea-lion|swallow|taiwan|sarvam|baichuan|bielik|breeze|zamba|jamba|solar|dbrx|granite|phi-3|aya/i.test(id)) return -1;
      const vis = /vision|-vl|vl-|multimodal|maverick|scout|gemma-3|gemma-4|pixtral|kimi-k2\.[5-9]|mistral-medium-3|mistral-small-3\.[1-9]/i.test(id);
      if (/^(vision|ocr)/.test(task)) {
        if (!vis) return -1;
        s = /maverick|qwen.*vl|kimi/.test(id) ? 60 : /90b-vision|mistral-medium|gemma-4/.test(id) ? 55 : 40;
      } else {
        if (/deepseek-r1|thinking|reason|qwq|magistral/.test(id)) return task === 'long' || task === 'review' ? 30 : -1;
        if (/deepseek/.test(id)) s = 95; else if (/kimi-k2/.test(id)) s = 92; else if (/qwen3\.?[5-9]?-?(235|397|480|max)|qwen3-next/.test(id)) s = 86;
        else if (/glm-?[45]/.test(id)) s = 84; else if (/mistral-large|mistral-medium/.test(id)) s = 82;
        else if (/gpt-oss-120b/.test(id)) s = 74; else if (/llama-4-maverick/.test(id)) s = 72; else if (/nemotron.*(ultra|super)/.test(id)) s = 66;
        else if (/llama-3\.3-70b|llama-3\.1-405b/.test(id)) s = 64; else return -1;
        if (task === 'short' && /flash|mini|small|maverick|gpt-oss/.test(id)) s += 6;
      }
      const vm = /(\d+(?:\.\d+)?)/.exec(id.replace(/^[^/]*\//, '').replace(/^(deepseek|kimi|qwen|glm|mistral|llama|gpt-oss|nemotron)[^\d]*/i, ''));
      if (vm) s += Math.min(6, parseFloat(vm[1]) / 2);
    } else if (prov === 'openrouter') {
      if (!m.free) return -1;
      if (/^(vision|ocr)/.test(task) && !m.vision) return -1;
      if (/deepseek/.test(id)) s = 80; else if (/qwen/.test(id)) s = 78; else if (/llama-4|llama-3\.3/.test(id)) s = 70;
      else if (/gemini|gemma/.test(id)) s = 65; else if (/mistral|kimi|glm|gpt-oss/.test(id)) s = 66; else s = 40;
      s += Math.min(10, (m.ctx || 0) / 50000);
    }
    return s;
  }
  const ORDER = {
    long: [['gemini', 2], ['deepseek', 1], ['nvidia', 2], ['mistral', 1], ['openrouter', 2], ['gemini', 99], ['groq', 1]],
    short: [['deepseek', 1], ['nvidia', 1], ['groq', 2], ['mistral', 1], ['gemini', 2], ['openrouter', 1], ['gemini', 99]],
    vision: [['gemini', 3], ['nvidia', 1], ['mistral', 1], ['groq', 1], ['openrouter', 1], ['gemini', 99]],
    ocr: [['gemini', 3], ['nvidia', 1], ['mistral', 1], ['groq', 1], ['openrouter', 1], ['gemini', 99]],
    post: [['deepseek', 1], ['nvidia', 2], ['gemini', 2], ['mistral', 1], ['openrouter', 1], ['gemini', 99], ['groq', 2]],
    visionpost: [['gemini', 4], ['nvidia', 1], ['mistral', 1], ['openrouter', 1], ['groq', 1], ['gemini', 99]],
    // вторая проверка: по возможности другая модель, не та, что писала
    review: [['nvidia', 2], ['deepseek', 1], ['mistral', 1], ['gemini', 2], ['openrouter', 1], ['gemini', 99]],
  };

  function keys() { return LS.get('ai_keys', {}); }
  function setKeys(k) { LS.set('ai_keys', k); }
  function models() { return LS.get('ai_models', {}); }
  function exhausted() { const e = LS.get('ai_exh', {}); return e.day === today() ? e : { day: today() }; }
  function markExhausted(prov, model) { const e = exhausted(); e[prov + ':' + model] = 1; LS.set('ai_exh', e); }
  function bump(prov) { const u = LS.get('ai_usage', {}); if (u.day !== today()) { u.day = today(); u.n = {}; } u.n = u.n || {}; u.n[prov] = (u.n[prov] || 0) + 1; LS.set('ai_usage', u); }

  async function refresh(prov) {
    const k = keys()[prov]; if (!k) throw new AIError('key', 'Ключ не введён');
    const list = await P[prov].list(k);
    const all = models(); all[prov] = { ts: Date.now(), list }; LS.set('ai_models', all);
    return list;
  }
  async function ensureModels() {
    const k = keys(), all = models(); const jobs = [];
    Object.keys(P).forEach(p => { if (k[p] && !(P[p].needBridge && !bridge()) && (!all[p] || Date.now() - all[p].ts > 3 * 86400000)) jobs.push(refresh(p).catch(() => null)); });
    await Promise.all(jobs);
  }
  function candidates(task) {
    const k = keys(), all = models(), ex = exhausted(), out = [], seen = new Set();
    (ORDER[task] || ORDER.long).forEach(([prov, n]) => {
      if (!k[prov] || !all[prov]) return;
      if (P[prov].needBridge && !bridge()) return;
      const ranked = all[prov].list.map(m => ({ m, s: score(prov, m, task) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
      let added = 0;
      for (const x of ranked) {
        const key = prov + ':' + x.m.id;
        if (seen.has(key)) continue;
        if (ex[key]) continue;
        out.push({ prov, model: x.m.id }); seen.add(key); added++;
        if (added >= n) break;
      }
    });
    return out;
  }

  // ---------- главный вызов
  // журнал последних запросов: что пробовали, сколько ждали, чем кончилось (виден в «Настройках»)
  function logAdd(x) { const L = LS.get('ai_log', []); L.push(Object.assign({ t: Date.now() }, x)); LS.set('ai_log', L.slice(-40)); }
  async function run(q) {
    // q: {task, system, user, images, maxTokens, temperature, onStatus, prefer:{prov,model}}
    active++; wakeOn();
    // в статусе видно, сколько секунд идёт запрос
    const t0 = Date.now(); let last = ''; const orig = q.onStatus;
    const qq = Object.assign({}, q, { onStatus: t => { last = t; orig && orig(t); } });
    const tick = orig ? setInterval(() => { if (last) orig(last + ' · ' + Math.round((Date.now() - t0) / 1000) + ' с'); }, 5000) : null;
    try { return await runInner(qq); } finally { if (tick) clearInterval(tick); active--; wakeOff(); }
  }
  async function runInner(q) {
    await ensureModels();
    let list = candidates(q.task || 'long');
    if (q.prefer && q.prefer.prov) list = [q.prefer].concat(list.filter(x => !(x.prov === q.prefer.prov && x.model === q.prefer.model)));
    if (q.avoid && q.avoid.length) { const av = new Set(q.avoid.map(x => x.prov + ':' + x.model)); const rest = list.filter(x => !av.has(x.prov + ':' + x.model)); if (rest.length) list = rest; }
    if (!list.length) throw new AIError('nokey', 'Нет ни одного рабочего ключа. Откройте «Настройки» и добавьте бесплатный ключ (лучше всего Gemini).');
    const errors = [], kinds = [];
    const badProv = new Set();
    const tmo = { long: 300000, review: 240000, visionpost: 180000, vision: 120000, post: 150000, ocr: 75000 }[q.task] || 100000;
    let pauses = 0;
    for (const c of list) {
      if (badProv.has(c.prov)) continue;
      const k = keys()[c.prov];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          q.onStatus && q.onStatus(`${P[c.prov].label} · ${c.model}`);
          const ta = Date.now();
          const r = await P[c.prov].chat(k, c.model, Object.assign({ timeout: tmo, statusLabel: `${P[c.prov].label} · ${c.model}` }, q));
          bump(c.prov);
          if (!r.text) throw new AIError('other', 'Пустой ответ');
          logAdd({ task: q.task, prov: c.prov, model: c.model, ok: true, s: Math.round((Date.now() - ta) / 1000), n: r.text.length });
          return Object.assign(r, { prov: c.prov, model: c.model, label: P[c.prov].label });
        } catch (e) {
          const kind = e.kind || (e.name === 'AbortError' || e.name === 'TypeError' ? 'network' : 'other');
          // экран гас или открывали другое приложение: ждём возвращения и повторяем ту же модель, попытка не считается
          const bg = e.bg || (G.document && (G.document.hidden || Date.now() - shownAt < 20000));
          if ((kind === 'network' || kind === 'timeout') && bg && pauses < 4) {
            pauses++;
            q.onStatus && q.onStatus('Пауза: экран выключался. Продолжу, как только вы вернётесь на сайт');
            await waitVisible(); await sleep(800); attempt--; continue;
          }
          errors.push(`${P[c.prov].label} ${c.model}: ${e.message}`); kinds.push(kind);
          logAdd({ task: q.task, prov: c.prov, model: c.model, ok: false, kind, msg: String(e.message || '').slice(0, 160) });
          if (kind === 'key') { badProv.add(c.prov); break; }
          if (kind === 'daily' || (kind === 'model' && e.status === 403)) { markExhausted(c.prov, c.model); break; }
          if (kind === 'rate' && attempt === 0 && (e.retryAfter || 0) <= 40) { q.onStatus && q.onStatus(`${P[c.prov].label}: лимит в минуту, жду ${Math.ceil(e.retryAfter || 20)} с`); await sleep(((e.retryAfter || 20) + 1) * 1000); continue; }
          if (kind === 'rate') { if (attempt === 0) { break; } markExhausted(c.prov, c.model); break; }
          if (kind === 'server' && attempt === 0) { q.onStatus && q.onStatus(`${P[c.prov].label}: сервис перегружен, пробую ещё раз`); await sleep(5000); continue; }
          if (kind === 'network' && attempt === 0) { await sleep(3000); continue; }
          break; // size, model, other: следующий кандидат
        }
      }
    }
    const over = errors.filter(x => /high demand|overload|unavailable|try again later|503/i.test(x)).length;
    const head = over && over >= errors.length / 2 ? 'Сервис ИИ сейчас перегружен: так бывает в часы пик. Подождите несколько минут и нажмите ещё раз. Если есть запасные ключи (Groq, OpenRouter), добавьте их в «Настройках»: тогда сайт сам переключится.'
      : kinds.includes('network') || kinds.includes('timeout') ? 'Связь с сервисом обрывалась. Проверьте интернет и нажмите ещё раз.'
        : kinds.every(k => k === 'daily' || k === 'rate') ? 'На сегодня бесплатные лимиты закончились. Продолжите завтра или добавьте запасной ключ в «Настройках».'
          : 'Ни одна модель не ответила.';
    throw new AIError('all', head + '\n\nПодробности:\n' + errors.slice(-6).join('\n'));
  }

  async function test(prov) {
    const list = await refresh(prov);
    // пробуем несколько лучших моделей: у NVIDIA часть моделей бывает закрыта для нового ключа
    const ids = [];
    candidates('short').concat(candidates('long')).forEach(x => { if (x.prov === prov && !ids.includes(x.model)) ids.push(x.model); });
    list.map(m => ({ m, s: score(prov, m, 'long') })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).forEach(x => { if (!ids.includes(x.m.id)) ids.push(x.m.id); });
    if (!ids.length) return { ok: true, models: list.length, note: 'ключ рабочий, но подходящих моделей не найдено' };
    let last = null;
    for (const id of ids.slice(0, 4)) {
      try {
        const r = await P[prov].chat(keys()[prov], id, { user: 'Ответь одним словом: работает', maxTokens: 400, temperature: 0, timeout: 60000 });
        return { ok: true, models: list.length, model: id, answer: r.text.slice(0, 40), best: { long: (candidates('long').find(x => x.prov === prov) || {}).model || id, short: id } };
      } catch (e) { last = e; if (e.kind === 'key' || e.kind === 'nokey') throw e; if (e.kind === 'model' && e.status === 403) markExhausted(prov, id); }
    }
    throw last;
  }

  G.AI = { log: () => LS.get('ai_log', []), clearLog: () => LS.set('ai_log', []), run, test, refresh, keys, setKeys, candidates, providers: P, bridge, setBridge: v => LS.set('ai_bridge', String(v || '').trim()), bridgeCheck, readSSE, usage: () => LS.get('ai_usage', {}), resetExhausted: () => LS.set('ai_exh', { day: today() }), AIError };
})(window);
