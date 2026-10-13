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

  // ---------- провайдеры
  const OA = (base, extraHeaders) => ({
    async list(key) {
      const r = await fetchT(base + '/models', { headers: Object.assign({ Authorization: 'Bearer ' + key }, extraHeaders || {}) }, 30000);
      if (!r.ok) throw await httpErr(r);
      const j = await r.json();
      return (j.data || []).map(m => ({ id: m.id, ctx: m.context_length || m.context_window || (m.max_context_length) || 0, free: /:free$/.test(m.id) || (m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0), vision: !!(m.architecture && /image/.test(String(m.architecture.input_modalities || m.architecture.modality || ''))) || (m.capabilities && m.capabilities.vision) }));
    },
    async chat(key, model, q) {
      const content = q.images && q.images.length
        ? [{ type: 'text', text: q.user }].concat(q.images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })))
        : q.user;
      const msgs = []; if (q.system) msgs.push({ role: 'system', content: q.system }); msgs.push({ role: 'user', content });
      const body = { model, messages: msgs, temperature: q.temperature != null ? q.temperature : 0.8, max_tokens: q.maxTokens || 8000 };
      if (base.includes('groq') && /qwen3|qwq|deepseek-r1/.test(model)) body.reasoning_format = 'hidden';
      const r = await fetchT(base + '/chat/completions', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, extraHeaders || {}), body: JSON.stringify(body) }, q.timeout);
      if (!r.ok) throw await httpErr(r);
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
    mistral: Object.assign({ label: 'Mistral', site: 'https://console.mistral.ai/api-keys' }, OA('https://api.mistral.ai/v1')),
    openrouter: Object.assign({ label: 'OpenRouter', site: 'https://openrouter.ai/settings/keys' }, OA('https://openrouter.ai/api/v1', { 'HTTP-Referer': (G.location && G.location.origin) || 'https://astro.local', 'X-Title': 'Astro Workshop' })),
  };

  // ---------- выбор моделей
  const BAD = /tts|image|embed|live|audio|native|computer|robotics|learnlm|aqa|veo|imagen|vision-only|guard|whisper|moderation|ocr|codestral|devstral|embed|transcri|prompt-guard|safeguard|compound|playai|orpheus/i;
  function verOf(id) { const m = /(\d+(?:\.\d+)?)/.exec(id.replace(/^.*?(gemini|qwen|llama|mistral|gemma)[^\d]*/i, '')); return m ? parseFloat(m[1]) : 0; }
  function score(prov, m, task) {
    const id = m.id.toLowerCase();
    if (BAD.test(id)) return -1;
    let s = 0; const v = verOf(id);
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
    } else if (prov === 'mistral') {
      if (/^(vision|ocr)/.test(task)) { if (/pixtral-large|mistral-medium|mistral-small/.test(id)) s = /medium/.test(id) ? 60 : 50; else return -1; }
      else if (/mistral-large/.test(id)) s = 90;
      else if (/mistral-medium/.test(id)) s = 85;
      else if (/magistral-medium/.test(id)) s = 70;
      else if (/mistral-small/.test(id)) s = task === 'short' ? 88 : 60;
      else return -1;
      if (/latest/.test(id)) s += 3;
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
    long: [['gemini', 2], ['openrouter', 2], ['gemini', 99], ['groq', 1]],
    short: [['groq', 2], ['gemini', 2], ['openrouter', 1], ['gemini', 99]],
    vision: [['gemini', 3], ['groq', 1], ['openrouter', 1], ['gemini', 99]],
    ocr: [['gemini', 3], ['groq', 1], ['openrouter', 1], ['gemini', 99]],
    post: [['gemini', 2], ['groq', 2], ['openrouter', 1], ['gemini', 99]],
    visionpost: [['gemini', 4], ['openrouter', 1], ['groq', 1], ['gemini', 99]],
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
    Object.keys(P).forEach(p => { if (k[p] && (!all[p] || Date.now() - all[p].ts > 3 * 86400000)) jobs.push(refresh(p).catch(() => null)); });
    await Promise.all(jobs);
  }
  function candidates(task) {
    const k = keys(), all = models(), ex = exhausted(), out = [], seen = new Set();
    (ORDER[task] || ORDER.long).forEach(([prov, n]) => {
      if (!k[prov] || !all[prov]) return;
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
  async function run(q) {
    // q: {task, system, user, images, maxTokens, temperature, onStatus, prefer:{prov,model}}
    active++; wakeOn();
    try { return await runInner(q); } finally { active--; wakeOff(); }
  }
  async function runInner(q) {
    await ensureModels();
    let list = candidates(q.task || 'long');
    if (q.prefer && q.prefer.prov) list = [q.prefer].concat(list.filter(x => !(x.prov === q.prefer.prov && x.model === q.prefer.model)));
    if (!list.length) throw new AIError('nokey', 'Нет ни одного рабочего ключа. Откройте «Настройки» и добавьте бесплатный ключ (лучше всего Gemini).');
    const errors = [], kinds = [];
    const badProv = new Set();
    const tmo = { long: 300000, visionpost: 240000, vision: 180000, post: 180000, ocr: 90000 }[q.task] || 120000;
    let pauses = 0;
    for (const c of list) {
      if (badProv.has(c.prov)) continue;
      const k = keys()[c.prov];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          q.onStatus && q.onStatus(`${P[c.prov].label} · ${c.model}`);
          const r = await P[c.prov].chat(k, c.model, Object.assign({ timeout: tmo }, q));
          bump(c.prov);
          if (!r.text) throw new AIError('other', 'Пустой ответ');
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
          if (kind === 'key') { badProv.add(c.prov); break; }
          if (kind === 'daily') { markExhausted(c.prov, c.model); break; }
          if (kind === 'rate' && attempt === 0 && (e.retryAfter || 0) <= 40) { q.onStatus && q.onStatus(`${P[c.prov].label}: лимит в минуту, жду ${Math.ceil(e.retryAfter || 20)} с`); await sleep(((e.retryAfter || 20) + 1) * 1000); continue; }
          if (kind === 'rate') { if (attempt === 0) { break; } markExhausted(c.prov, c.model); break; }
          if (kind === 'server' && attempt === 0) { q.onStatus && q.onStatus(`${P[c.prov].label}: сервис перегружен, пробую ещё раз`); await sleep(5000); continue; }
          if ((kind === 'network' || kind === 'timeout') && attempt === 0) { await sleep(3000); continue; }
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
    const short = candidates('short').filter(x => x.prov === prov)[0] || candidates('long').filter(x => x.prov === prov)[0];
    if (!short) return { ok: true, models: list.length, note: 'ключ рабочий, но подходящих моделей не найдено' };
    const r = await P[prov].chat(keys()[prov], short.model, { user: 'Ответь одним словом: работает', maxTokens: 400, temperature: 0, timeout: 60000 });
    return { ok: true, models: list.length, model: short.model, answer: r.text.slice(0, 40), best: { long: (candidates('long').find(x => x.prov === prov) || {}).model, short: short.model } };
  }

  G.AI = { run, test, refresh, keys, setKeys, candidates, providers: P, usage: () => LS.get('ai_usage', {}), resetExhausted: () => LS.set('ai_exh', { day: today() }), AIError };
})(window);
