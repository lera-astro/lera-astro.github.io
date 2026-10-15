/* Астро-мастерская: сборка заданий для модели, проверки, правки */
(function (G) {
  'use strict';
  const MONTHS = { 'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12 };
  const pad = n => String(n).padStart(2, '0');

  function clientText(md) {
    const out = [];
    let app = false;
    String(md || '').split('\n').forEach(l => {
      const t = l.trim();
      if (!t || t.startsWith('@') || t.startsWith('|')) return;
      if (/^#\s+(Приложение)/i.test(t)) app = true;
      if (app) return;
      out.push(t.replace(/^(#{1,3}|[>!+~_]|-\s|\d+[.)]\s)\s*/, ''));
    });
    return out.join('\n');
  }

  // ---------- структура текста: части, разделители, повторы
  const PREFIX_RE = /^(#{1,3}\s+|[>!+~]\s*|-\s+|\d+[.)]\s+)/;
  const normLine = s => String(s || '').trim().replace(PREFIX_RE, '').replace(/^@[^:]+:\s*/, '').replace(/\*\*/g, '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  function partKey(h) {
    let t = String(h).trim().replace(/^#+\s*/, '');
    const bar = t.indexOf('|'); if (bar >= 0) t = t.slice(bar + 1);
    t = t.replace(/^часть\s+[ivxlc\d]+\s*[:.|]?\s*/i, '');
    return normLine(t);
  }
  function sections(md) {
    const out = [{ head: null, lines: [] }];
    String(md || '').split('\n').forEach(l => { if (/^#\s/.test(l.trim())) out.push({ head: l.trim(), lines: [] }); else out[out.length - 1].lines.push(l); });
    return out;
  }
  // лишние «##»: разрешены только разделители продукта, «## Часть …» становится частью
  function fixEras(md, P) {
    const allowed = new Set();
    ((P && P.system) || '').split('\n').forEach(l => { const m = /^##\s+([^|\n(]+)/.exec(l); if (m) { const w = normLine(m[1]).split(' ')[0]; if (w) allowed.add(w); if (w === 'какой') allowed.add('какая'); } });
    const L = String(md || '').split('\n'), out = [], seen = new Set();
    for (let i = 0; i < L.length; i++) {
      const t = L[i].trim();
      if (/^(название|заголовок)\s*:/i.test(t)) continue;
      const m = /^##(?!#)\s*(.*)$/.exec(t);
      if (!m) { out.push(L[i]); continue; }
      const title = m[1].trim();
      if (/^часть\s+[ivxlc\d]+/i.test(title)) {
        let j = i + 1; while (j < L.length && !L[j].trim()) j++;
        const nx = (L[j] || '').trim();
        if (/^#\s/.test(nx) && partKey(nx) === partKey(title)) continue;
        out.push('# ' + title.replace(/^часть\s+([ivxlc\d]+)\s*[:.|]?\s*(.)/i, (x, n, c) => 'Часть ' + n.toUpperCase() + ' | ' + c.toUpperCase())); continue;
      }
      const first = normLine(title.split('|')[0]).split(' ')[0];
      if (first && allowed.has(first)) { const k = normLine(title.split('|')[0]); if (seen.has(k)) continue; seen.add(k); out.push(L[i]); }
    }
    return out.join('\n');
  }
  // повторы частей и абзацев: оставляем первое вхождение
  function dedupe(md, prevMd) {
    const parts = new Set(), paras = new Set();
    if (prevMd) sections(prevMd).forEach(x => { if (x.head) parts.add(partKey(x.head)); x.lines.forEach(l => { const k = normLine(l); if (k.length >= 40 && !/^\s*[@|]/.test(l)) paras.add(k); }); });
    const out = []; let dropped = 0;
    sections(md).forEach(x => {
      if (x.head) {
        const k = partKey(x.head);
        if (k && parts.has(k) && !/^приложение/.test(k)) { dropped++; return; }
        parts.add(k); out.push(x.head);
      }
      x.lines.forEach(l => { const k = normLine(l); if (k.length >= 40 && !/^\s*[@|]/.test(l)) { if (paras.has(k)) { dropped++; return; } paras.add(k); } out.push(l); });
    });
    return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped };
  }
  const ROMAN = n => { let s = ''; for (const [v, c] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += c; n -= v; } return s; };
  function renumber(md) { let n = 0; return String(md).replace(/^#\s+Часть\s+[IVXLC\d]+\s*\|/gm, () => '# Часть ' + ROMAN(++n) + ' |'); }
  // тире и потерянные дефисы правит программа, без модели
  function fixDashes(md) {
    let app = false;
    return String(md || '').split('\n').map(l => {
      if (/^#\s+Приложение/i.test(l.trim())) app = true;
      if (app || /^\s*\|/.test(l) || !/[—–]/.test(l)) return l;
      let s = l;
      s = s.replace(/(\d{4})\s*[—–]\s*(\d{4})/g, '$1 и $2');
      s = s.replace(/(\d{1,3})\s*[—–]\s*(\d{1,3})(?!\d)/g, '$1 или $2');
      s = s.replace(/\s*[—–]\s*(это|значит)(?=[\s,.:;])/gi, ' $1');
      s = s.replace(/(\*\*[^*\n]+[.!?]\*\*)\s*[—–]\s*/g, '$1 ');
      s = s.replace(/(\*\*[^*\n]+\*\*)\s*[—–]\s*/g, '$1: ');
      s = s.replace(/\)\s*[—–]\s*/g, '): ');
      s = s.replace(/^(\s*(?:@[^:]+:\s*|[>!+~]\s*|-\s+|\d+[.)]\s+)?)[—–]\s*/, '$1');
      s = s.replace(/\s*[—–]\s*/g, ', ');
      return s.replace(/,\s*,/g, ',').replace(/:\s*,/g, ':').replace(/,\s*([.:;!?])/g, '$1');
    }).join('\n');
  }
  const HY_FIX = [[/(^|[^а-яё])(из) (за|под)(?=[^а-яё]|$)/gi, '$1$2-$3'], [/(^|[^а-яё])(вс[её]) таки(?=[^а-яё]|$)/gi, '$1$2-таки'], [/(^|[^а-яё])(по) (прежнему)(?=[^а-яё]|$)/gi, '$1$2-$3'],
    [/(^|[^а-яё])(во) (первых|вторых)(?=[^а-яё]|$)/gi, '$1$2-$3'], [/(^|[^а-яё])(кто|где|когда|почему|зачем|куда|откуда|какой|какая|какое|какие|каким|какую|какого|какой|чей|чья|чьё|чьи) то(?=[^а-яё,]|$)/gi, '$1$2-то']];
  function fixHyph(md) { let s = String(md || ''); HY_FIX.forEach(([re, to]) => { s = s.replace(re, to); }); return s; }
  // пропущенный мягкий знак во втором лице: «сверяеш» → «сверяешь»
  const SOFT_SKIP = /^(фетиш|кишмиш|шиш|кеш|кэш|леш|меш|клиш)$/i;
  function fixSoft(md) { return String(md || '').replace(/(^|[^а-яё])([а-яё]{3,}(?:е|ё|и)ш)(?=[^а-яёь]|$)/gi, (m0, a, w) => SOFT_SKIP.test(w) ? m0 : a + w + 'ь'); }
  function autoFix(md) { return fixSoft(fixHyph(fixDashes(md))); }

  function datesIn(text) {
    const res = [];
    const re1 = /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/gi;
    let m; while ((m = re1.exec(text))) res.push({ s: m[0], d: +m[1], mo: MONTHS[m[2].toLowerCase()], y: +m[3] });
    const re2 = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
    while ((m = re2.exec(text))) res.push({ s: m[0], d: +m[1], mo: +m[2], y: +m[3] });
    return res;
  }
  function dataDates(data) {
    const set = new Set(); const re = /(\d{2})\.(\d{2})\.(\d{4})/g; let m;
    while ((m = re.exec(data))) set.add(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return set;
  }
  function monthYears(text) {
    const res = [], re = /(^|[^\dа-яё])(январ[а-яё]*|феврал[а-яё]*|март[а-яё]*|апрел[а-яё]*|ма[йяе]|июн[а-яё]*|июл[а-яё]*|август[а-яё]*|сентябр[а-яё]*|октябр[а-яё]*|ноябр[а-яё]*|декабр[а-яё]*)\s+(\d{4})/gi;
    const ST = ['январ', 'феврал', '', 'апрел', '', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
    let m; text = String(text || '');
    while ((m = re.exec(text))) {
      if (/\d\s*$/.test(text.slice(Math.max(0, m.index - 4), m.index + m[1].length))) continue;
      const w = m[2].toLowerCase(); const mo = /^март/.test(w) ? 3 : /^ма[йяе]$/.test(w) ? 5 : ST.findIndex(x => x && w.startsWith(x)) + 1;
      if (mo > 0) res.push({ s: m[2] + ' ' + m[3], mo, y: +m[3] });
    }
    return res;
  }
  function badDates(text, data, client) {
    const known = dataDates(data); const out = [];
    datesIn(client || '').forEach(x => known.add(Date.UTC(x.y, x.mo - 1, x.d)));
    datesIn(text).forEach(x => {
      const t = Date.UTC(x.y, x.mo - 1, x.d); let ok = false;
      for (let k = -2; k <= 2; k++) if (known.has(t + k * 86400000)) { ok = true; break; }
      if (!ok) out.push(x.s);
    });
    const ym = new Set(); known.forEach(t => { const d = new Date(t); ym.add(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1); });
    monthYears(client || '').forEach(x => ym.add(x.y * 100 + x.mo));
    monthYears(text).forEach(x => { const k = x.y * 100 + x.mo; if (!ym.has(k) && !ym.has(k - 1) && !ym.has(k + 1) && !(x.mo === 1 && ym.has((x.y - 1) * 100 + 12)) && !(x.mo === 12 && ym.has((x.y + 1) * 100 + 1))) out.push(x.s); });
    return [...new Set(out)];
  }
  // даты событий жизни, которых не было в рассказе клиента
  function lifeDates(text, client) {
    const cd = new Set(datesIn(client).map(x => x.y * 10000 + x.mo * 100 + x.d));
    const cm = new Set(monthYears(client).map(x => x.y * 100 + x.mo).concat(datesIn(client).map(x => x.y * 100 + x.mo)));
    const EV = /(познакомил|встретил|сошлись|начали жить|стали жить|съехал|переехал|переезд|поженил|свадьб|расстал|развел|развёл|уволил)/i;
    const bad = [];
    String(text).replace(/([.?!…])\s+/g, '$1\n').split('\n').forEach(x => {
      if (!EV.test(x)) return;
      if (datesIn(x).some(d => !cd.has(d.y * 10000 + d.mo * 100 + d.d)) || monthYears(x).some(d => !cm.has(d.y * 100 + d.mo))) bad.push(x.trim().slice(0, 220));
    });
    return bad;
  }

  function sentencesWith(text, re) {
    const out = [];
    text.replace(/([.?!…])\s+/g, '$1\n').split('\n').forEach(s => { re.lastIndex = 0; if (re.test(s)) out.push(s.trim().slice(0, 220)); });
    return out.slice(0, 6);
  }

  function check(md, ctx) {
    ctx = ctx || {};
    const text = clientText(md);
    const errors = [], warns = [];
    (KB.checks || []).forEach(c => {
      if (ctx.skip && ctx.skip.includes(c.id)) return;
      const max = ctx.max && ctx.max[c.id] != null ? ctx.max[c.id] : c.max;
      const n = (text.match(c.re) || []).length;
      if (n > max) errors.push({ id: c.id, title: c.title, count: n, max, fix: c.fix, auto: !!c.auto, samples: sentencesWith(text, new RegExp(c.re.source, c.re.flags.replace('g', ''))) });
    });
    (KB.checksWarn || []).forEach(c => {
      const n = (text.match(c.re) || []).length;
      if (n > c.max) warns.push({ id: c.id, title: c.title, count: n, samples: sentencesWith(text, new RegExp(c.re.source, c.re.flags.replace('g', ''))) });
    });
    if (ctx.data) {
      const bd = badDates(text, ctx.data, ctx.client);
      if (bd.length) errors.push({ id: 'dates', title: 'Даты, которых нет ни в расчёте, ни в рассказе клиента', count: bd.length, fix: 'этой даты нет ни в расчёте, ни в рассказе клиента: если это дата периода, замени её на точную дату из блока расчёта; если это дата события жизни, убери её. Даты из рассказа клиента не трогай', samples: bd });
    }
    if (ctx.client != null) {
      const ld = lifeDates(text, ctx.client);
      if (ld.length) errors.push({ id: 'lifedates', title: 'Даты событий жизни, которых нет в рассказе клиента', count: ld.length, fix: 'дату события жизни (знакомство, переезд, свадьба, расставание) бери только из рассказа клиента; если клиент её не называл, убери дату из предложения, событие оставь', samples: ld.slice(0, 6) });
    }
    const dd = dedupe(md);
    if (dd.dropped) errors.push({ id: 'repeat', title: 'Повторы: одинаковые части или абзацы', count: dd.dropped, auto: true, fix: 'убрать повторы' });
    // длинные абзацы
    const longP = text.split('\n').filter(p => p.length > 900);
    if (longP.length) warns.push({ id: 'long', title: 'Слишком длинные абзацы (на телефоне читаются стеной)', count: longP.length, samples: longP.map(p => p.slice(0, 120) + '…') });
    // продуктовые проверки
    if (ctx.product === 'moon' && ctx.final) {
      const hooks = (md.match(/^\s*!/gm) || []).length;
      if (hooks !== 1) warns.push({ id: 'hook', title: `Рамок-крючков «!» должно быть ровно одна, сейчас ${hooks}`, count: hooks });
      if (!/«?КАРТА»?|«?ПУТЬ»?/.test(md)) errors.push({ id: 'cta', title: 'Нет призыва со словом «КАРТА» или «ПУТЬ»', count: 1, fix: 'добавь в конце плашку с призывом и кодовым словом' });
      if (/^#\s+Приложение/im.test(md)) errors.push({ id: 'app', title: 'В «Коде Луны» не должно быть приложения', count: 1, fix: 'убери приложение' });
      ['Прошлое', 'Настоящее', 'Будущее'].forEach(w => { if (!new RegExp('^##\\s+' + w, 'm').test(md)) warns.push({ id: 'era', title: `Нет разделителя «${w}»`, count: 1 }); });
    }
    if (ctx.final && (ctx.product === 'natal' || ctx.product === 'money')) {
      const m = md.split(/^#\s+/m).find(x => /^(Часть\s+[IVXLC]+\s*\|\s*)?Деньги/i.test(x));
      if (!m && ctx.product === 'natal') errors.push({ id: 'money', title: 'Нет части «Деньги»', count: 1, fix: 'добавь часть «Деньги» с прогнозом по датам' });
      if (m && datesIn(m).length < 2) warns.push({ id: 'money2', title: 'В части про деньги меньше двух дат', count: 1 });
    }
    return { errors, warns, chars: text.length };
  }

  // ---------- задания
  function personLine(p, i) {
    return `${p.name || 'Без имени'}${p.gender === 'm' ? ', мужчина' : p.gender === 'f' ? ', женщина' : ''}${p.child ? ', ребёнок' : ''}${p.age != null ? ', возраст ' + p.age : ''}`;
  }
  function header(job) {
    const P = KB.products[job.product];
    const L = [];
    L.push(`ПРОДУКТ: ${P.title}${job.product === 'natal' ? ' (режим: ' + (job.mode === 'ext' ? 'расширенный, около 25 страниц' : 'базовый, около 15 страниц') + ')' : ''}`);
    L.push(`СЕГОДНЯ: ${new Date().toLocaleDateString('ru-RU')}`);
    const a = job.persons[0];
    if (job.product === 'moon' && job.role === 'parent') {
      L.push(`ЗАКАЗЧИК: ${job.parentGender === 'm' ? 'папа' : 'мама'} (обращение к ${job.parentGender === 'm' ? 'нему' : 'ней'} на «вы»). РАЗБОР ПРО РЕБЁНКА: ${personLine(a)}. О ребёнке в третьем лице.`);
    } else if (job.product === 'child') {
      L.push(`РЕБЁНОК: ${personLine(a)}. ЗАКАЗЧИК: ${job.parentGender === 'm' ? 'папа' : 'мама'}, обращение на «вы».${job.persons[1] ? ' Карта родителя есть: ' + personLine(job.persons[1]) + '.' : ' Карты родителя нет.'}`);
    } else if (job.product === 'synastry') {
      L.push(`ЗАКАЗЧИК: ${personLine(a)} (обращение на «ты»). ПАРТНЁР: ${personLine(job.persons[1] || {})}.`);
    } else {
      L.push(`КЛИЕНТ: ${personLine(a)}. Обращение на «ты».`);
    }
    L.push(`ВОПРОС КЛИЕНТА: ${job.question ? '«' + job.question.trim() + '»' : 'не задан (ответь на главный запрос по карте сам)'}`);
    L.push(`ЧТО КЛИЕНТ РАССКАЗАЛ САМ: ${job.facts ? '«' + job.facts.trim() + '»' : 'ничего'}`);
    return L.join('\n');
  }

  function system(job) {
    const P = KB.products[job.product];
    return [KB.voice, KB.markup, P.system].join('\n\n');
  }

  function stepUser(job, step) {
    const P = KB.products[job.product];
    const L = [];
    L.push('ЗАДАНИЕ: ' + step.task);
    L.push('', header(job));
    L.push('', 'БЛОК РАСЧЁТА (единственный источник положений и дат):', job.data.text);
    if (job.product === 'moon' && KB.refs) {
      const ref = job.role === 'parent' ? KB.refs.moonParent : KB.refs.moonSelf;
      L.push('', '=== ЭТАЛОН ДРУГОГО КЛИЕНТА: образец формы, ритма, глубины и крючков. Это ДРУГОЙ человек с другой картой: не копируй ни факты, ни даты, ни формулировки, бери только уровень и приёмы ===', ref, '=== КОНЕЦ ЭТАЛОНА ===');
    }
    if (job.plan && step.id !== 'plan') L.push('', 'СЛУЖЕБНЫЙ ПЛАН (твой, для опоры):', job.plan);
    const prev = prevParts(job, step);
    if (prev) L.push('', 'УЖЕ НАПИСАНО (это предыдущие части, они уже в разборе: не переписывай и не повторяй их, начни сразу с первой части своего задания):', prev);
    L.push('', 'Напомню: только разметка, только факты и даты из блока расчёта, без тире, без «мы», без градусов.');
    return L.join('\n');
  }

  function prevParts(job, step) {
    const P = KB.products[job.product];
    return P.steps.filter(s => !s.internal && s.id !== step.id && job.parts[s.id] && P.steps.indexOf(s) < P.steps.indexOf(step)).map(s => job.parts[s.id]).join('\n\n');
  }
  // продолжение после обрыва: если модель начала абзац заново, обрывок убираем
  function joinCont(text, cont) {
    const L = text.replace(/\s+$/, '').split('\n'); const last = L[L.length - 1] || '';
    const key = normLine(last).slice(0, 60);
    if (key.length >= 30) {
      const C = cont.split('\n'); const j = C.findIndex(l => normLine(l).startsWith(key));
      if (j >= 0) return L.slice(0, -1).join('\n') + '\n' + C.slice(j).join('\n');
    }
    return text + (text.endsWith('\n') ? '' : ' ') + cont;
  }
  async function callAI(q, hooks) {
    let r = await AI.run(Object.assign({}, q, { onStatus: hooks && hooks.status }));
    let text = r.text; let guard = 0;
    while (r.truncated && guard < 2) {
      guard++;
      hooks && hooks.status && hooks.status('Текст оборвался, прошу продолжить…');
      const tail = text.slice(-1500);
      r = await AI.run(Object.assign({}, q, { user: q.user + '\n\nТЫ УЖЕ НАПИСАЛ ЭТОТ ТЕКСТ, НО ОН ОБОРВАЛСЯ. Продолжи ровно с места обрыва, не повторяя написанное. Последние строки:\n' + tail, onStatus: hooks && hooks.status, prefer: { prov: r.prov, model: r.model } }));
      text = joinCont(text, r.text);
    }
    if (guard) text = dedupe(text).text;
    return { text: tidy(text), prov: r.prov, model: r.model, label: r.label };
  }

  function tidy(t) {
    return String(t || '')
      .replace(/^```[a-z]*\s*|```\s*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // исправление моделью только тех абзацев, где найдены проблемы
  async function fixParas(job, md, issues, hooks) {
    const L = String(md).split('\n');
    const ai = L.findIndex(l => /^#\s+Приложение/i.test(l.trim())); const lim = ai >= 0 ? ai : L.length;
    const strip = l => l.trim().replace(/^@[^:]+:\s*/, '').replace(PREFIX_RE, '');
    const pick = new Set();
    issues.forEach(e => (e.samples || []).forEach(x => {
      const key = String(x).replace(/…$/, '').trim().slice(0, 60); if (key.length < 6) return;
      for (let i = 0; i < lim; i++) if (L[i].trim() && strip(L[i]).indexOf(key) >= 0) pick.add(i);
    }));
    if (!pick.size) return { text: md, changed: 0 };
    const ids = [...pick].sort((a, b) => a - b).slice(0, 40);
    const list = issues.map(e => `- ${e.title}${e.count ? ' (' + e.count + ')' : ''}: ${e.fix || ''}`).join('\n');
    const client = [job.question, job.facts].filter(Boolean).join('\n');
    const needData = issues.some(e => e.id === 'dates' || e.id === 'lifedates' || e.id === 'review');
    const user = `ПРОБЛЕМЫ:\n${list}\n\n${client ? 'РАССКАЗ И ВОПРОС КЛИЕНТА (даты и события отсюда не менять и не убирать):\n' + client + '\n\n' : ''}${needData ? 'БЛОК РАСЧЁТА (для замены дат периодов):\n' + job.data.text + '\n\n' : ''}АБЗАЦЫ:\n${ids.map(i => `[[${i}]] ${L[i]}`).join('\n')}`;
    const r = await callAI({ task: needData ? 'long' : 'short', system: KB.fix + '\n\n' + KB.voice, user, maxTokens: 8000, temperature: 0.3 }, hooks);
    let n = 0;
    String(r.text).split('\n').forEach(line => {
      const m = /^\s*\[\[(\d+)\]\]\s?(.*)$/.exec(line); if (!m) return;
      const i = +m[1]; if (!pick.has(i)) return;
      let t = m[2].trim(); const old = L[i]; if (!t || t.length < strip(old).length * 0.4) return;
      const pm = /^(\s*(?:@[^:]+:\s*|#{1,3}\s+|[>!+~]\s*|-\s+|\d+[.)]\s+))/.exec(old);
      if (pm && t.indexOf(pm[1].trim()) !== 0) t = pm[1] + t.replace(/^@[^:]+:\s*/, '').replace(PREFIX_RE, '');
      L[i] = t; n++;
    });
    return { text: L.join('\n'), changed: n, prov: r.prov, model: r.model };
  }
  // ---------- вторая проверка: другая модель читает готовый текст и ищет ошибки по блоку расчёта
  const normR = x => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/\*\*/g, '').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  function reviewIssues(out, md) {
    const L = String(md).split('\n'); const ai = L.findIndex(l => /^#\s+Приложение/i.test(l.trim())); const lim = ai >= 0 ? ai : L.length;
    const strip = l => l.trim().replace(/^@[^:]+:\s*/, '').replace(PREFIX_RE, '');
    const lines = L.slice(0, lim).map(l => normR(strip(l)));
    const res = [], seen = new Set();
    String(out || '').split('\n').forEach(raw => {
      const m = /ЦИТАТА\s*:\s*(.+?)\s*\|\|\s*ОШИБКА\s*:\s*(.+?)(?:\s*\|\|\s*КАК\s*:\s*(.+))?$/i.exec(raw.replace(/^[-*•\d.)\s]+/, '').trim()); if (!m) return;
      const q = normR(m[1]); if (q.length < 8) return;
      let idx = lines.findIndex(x => x.includes(q));
      if (idx < 0) { const w = q.split(' '); for (let n = w.length - 1; n >= 4 && idx < 0; n--) for (let i = 0; i + n <= w.length && idx < 0; i++) { const part = w.slice(i, i + n).join(' '); idx = lines.findIndex(x => x.includes(part)); } }
      if (idx < 0 || !L[idx].trim()) return; // цитаты в тексте нет: модель ошиблась, пропускаем
      const key = idx + '|' + normR(m[2]).slice(0, 40); if (seen.has(key)) return; seen.add(key);
      res.push({ id: 'review', title: m[2].trim().slice(0, 300), fix: (m[3] || '').trim().slice(0, 300), quote: m[1].trim().replace(/^[«"“]|[»"”]$/g, '').slice(0, 200), line: idx, samples: [strip(L[idx]).slice(0, 60)] });
    });
    return res.slice(0, 25);
  }
  async function review(job, hooks) {
    const md = job.text || ''; const ai = md.search(/^#\s+Приложение/im); const body = ai > 0 ? md.slice(0, ai) : md;
    const client = [job.question, job.facts].filter(Boolean).join('\n');
    const user = `БЛОК РАСЧЁТА (единственный источник фактов и дат):\n${(job.data && job.data.text) || ''}\n\n${client ? 'РАССКАЗ И ВОПРОС КЛИЕНТА (это не ошибки):\n' + client + '\n\n' : ''}ТЕКСТ НА ПРОВЕРКУ:\n${clientText(body)}`;
    const avoid = Object.values(job.models || {}).filter(m => m && m.prov).map(m => ({ prov: m.prov, model: m.model }));
    const r = await callAI({ task: 'review', system: KB.review, user, maxTokens: 4000, temperature: 0.2, avoid }, hooks);
    const issues = /^\s*ЧИСТО\s*\.?\s*$/i.test(r.text) ? [] : reviewIssues(r.text, md);
    job.review = { at: Date.now(), label: r.label, model: r.model, issues };
    return job.review;
  }
  async function fixReview(job, hooks) {
    const iss = ((job.review && job.review.issues) || []).map(e => Object.assign({}, e, { title: `«${e.quote}»: ${e.title}`, count: 0 }));
    if (!iss.length) return { changed: 0 };
    const f = await fixParas(job, job.text, iss, hooks);
    if (f.changed) { job.text = autoFix(f.text); job.checks = check(job.text, checkCtx(job, true)); job.review.fixed = Date.now(); }
    return f;
  }
  function cleanStep(text, prevMd, P) { return dedupe(fixEras(text, P), prevMd).text; }
  const isWeak = r => r.prov === 'groq' || /lite|gemma|[^\d]8b|[^\d]9b|[^\d]7b|mini|nano|small/i.test(r.model || '');
  function targetChars(step) { const m = /около\s+(\d+)(?:\s*[–-]\s*\d+)?\s+тысяч/.exec(step.task || ''); return m ? +m[1] * 1000 : 0; }

  function checkCtx(job, final) {
    const ctx = { data: job.data.text, product: job.product, final, client: [job.question, job.facts].filter(Boolean).join('\n') };
    if (job.product === 'moon') ctx.max = { nums: 2, formula: 0 };
    return ctx;
  }

  async function generate(job, hooks) {
    // hooks: {status(text), step(id, state, info), save()}
    const P = KB.products[job.product];
    job.parts = job.parts || {};
    const sys = system(job);
    for (const step of P.steps) {
      if (step.internal && job.plan) { hooks.step(step.id, 'done', 'готово'); continue; }
      if (!step.internal && job.parts[step.id]) { hooks.step(step.id, 'done', 'готово'); continue; }
      hooks.step(step.id, 'run', 'пишу…');
      const user = stepUser(job, step);
      const q = { task: 'long', system: sys, user, maxTokens: Math.max(8000, Math.round(step.max * 0.9)), temperature: step.internal ? 0.4 : 0.85 };
      let r = await callAI(q, hooks);
      if (step.internal) { job.plan = r.text; hooks.step(step.id, 'done', r.label); hooks.save(); continue; }
      const prevMd = prevParts(job, step);
      let text = cleanStep(r.text, prevMd, P);
      // слишком коротко: одна попытка переписать подробнее, берём более полную
      const tgt = targetChars(step), len = clientText(text).length;
      if (tgt && len < tgt * 0.6) {
        hooks.step(step.id, 'run', 'вышло коротко, переписываю подробнее');
        try {
          const r2 = await callAI(Object.assign({}, q, { user: user + `\n\nВНИМАНИЕ: прошлая попытка этого шага вышла слишком короткой (${len} знаков при норме около ${tgt}). Раскрой каждую часть задания полностью: механизм с двух сторон, примеры из жизни, даты из расчёта. Части по два абзаца не годятся.` }), hooks);
          const t2 = cleanStep(r2.text, prevMd, P);
          if (clientText(t2).length > len) { text = t2; r = r2; }
        } catch (e) { /* оставляем первую версию */ }
      }
      job.models = job.models || {}; job.models[step.id] = { label: r.label, weak: isWeak(r), prov: r.prov, model: r.model };
      // проверка: тире, дефисы и повторы правит программа, остальное модель по абзацам
      text = autoFix(text);
      const ch = check(text, checkCtx(job, false));
      const aiErr = ch.errors.filter(e => !e.auto);
      if (aiErr.length) {
        hooks.step(step.id, 'run', 'исправляю: ' + aiErr.map(e => e.title).join(', '));
        try { const f = await fixParas(job, text, aiErr, hooks); text = f.text; } catch (e) { /* оставляем как есть */ }
      }
      job.parts[step.id] = text;
      hooks.step(step.id, 'done', r.label + (job.models[step.id].weak ? ' · облегчённая модель' : ''));
      hooks.save();
    }
    job.text = assemble(job);
    job.checks = check(job.text, checkCtx(job, true));
    hooks.save();
    return job;
  }

  function assemble(job) {
    const P = KB.products[job.product];
    let md = P.steps.filter(s => !s.internal).map(s => job.parts[s.id] || '').join('\n\n');
    md = renumber(dedupe(fixEras(md, P)).text);
    // одна шапка: оставляем первые вхождения @-строк
    const seen = new Set();
    md = md.split('\n').filter(l => { const m = /^@([^:]+):/.exec(l.trim()); if (!m) return true; const k = m[1].trim().toLowerCase(); if (k === 'качество') return true; if (seen.has(k)) return false; seen.add(k); return true; }).join('\n');
    if (P.appendix && job.data.appendix) md += '\n\n' + job.data.appendix + usedDates(md, job.data.text);
    return md;
  }

  function usedDates(md, data) {
    const ds = datesIn(clientText(md)).map(x => `${pad(x.d)}.${pad(x.mo)}.${x.y}`);
    if (!ds.length) return '';
    const set = new Set(ds); const rows = [];
    data.split('\n').forEach(l => { const m = l.match(/\d{2}\.\d{2}\.\d{4}/g); if (m && m.some(d => set.has(d)) && !/^Дата расчёта|^Рождение|UTC/.test(l)) rows.push(l.trim()); });
    if (!rows.length) return '';
    return '\n### Использованные даты\n| Событие | Даты |\n|---|---|\n' + [...new Set(rows)].slice(0, 40).map(r => { const i = r.indexOf(': '); return i > 0 && i < 90 ? `| ${r.slice(0, i)} | ${r.slice(i + 2)} |` : `| ${r} | |`; }).join('\n');
  }

  async function fixAll(job, hooks) {
    const ch = check(job.text, checkCtx(job, true));
    if (!ch.errors.length) return { changed: false, checks: ch };
    const app = job.text.search(/^#\s+Приложение/im);
    const body = app > 0 ? job.text.slice(0, app) : job.text;
    const tail = app > 0 ? job.text.slice(app) : '';
    const P = KB.products[job.product];
    let fixed = autoFix(renumber(dedupe(fixEras(body, P)).text));
    const ch2 = check(fixed + (tail ? '\n\n' + tail : ''), checkCtx(job, true));
    const aiErr = ch2.errors.filter(e => !e.auto);
    let n = fixed !== body ? 1 : 0;
    if (aiErr.length) { const f = await fixParas(job, fixed, aiErr, hooks); fixed = f.text; n += f.changed; }
    job.text = fixed + (tail ? '\n\n' + tail : '');
    job.checks = check(job.text, checkCtx(job, true));
    return { changed: n > 0, checks: job.checks };
  }

  async function edit(job, remarks, hooks) {
    const app = job.text.search(/^#\s+Приложение/im);
    const body = app > 0 ? job.text.slice(0, app) : job.text;
    const tail = app > 0 ? job.text.slice(app) : '';
    const user = `ЗАМЕЧАНИЯ:\n${remarks}\n\nБЛОК РАСЧЁТА (если для правки нужны даты):\n${job.data.text}\n\nТЕКСТ:\n${body}`;
    const r = await callAI({ task: 'long', system: KB.edit + '\n\n' + KB.voice + '\n\n' + KB.markup + '\n\n' + KB.products[job.product].system, user, maxTokens: 32000, temperature: 0.4 }, hooks);
    if (r.text.length < body.length * 0.6) throw new Error('Модель вернула слишком короткий текст, правка не применена. Попробуйте ещё раз или сформулируйте замечание точнее.');
    job.text = renumber(dedupe(fixEras(r.text, KB.products[job.product])).text) + (tail ? '\n\n' + tail : '');
    job.checks = check(job.text, checkCtx(job, true));
    return job;
  }

  async function conspect(job, hooks) {
    const P = KB.products[job.product];
    const funnel = P.conspect === 'funnel';
    const sys = (funnel ? KB.conspectFunnel : KB.conspectPaid) + '\n\nОбщие правила голоса для справки:\n' + KB.voice;
    const L = [];
    L.push(funnel ? 'Сделай конспект для голосовых к этому разбору.' : 'Сделай конспект для живого разговора по этому разбору.');
    L.push('', header(job));
    if (funnel && KB.refs) L.push('', '=== ЭТАЛОН КОНСПЕКТА ДРУГОГО КЛИЕНТА (только форма и уровень, факты не копировать) ===', job.role === 'parent' ? KB.refs.voiceParent : KB.refs.voiceSelf, '=== КОНЕЦ ЭТАЛОНА ===');
    L.push('', 'БЛОК РАСЧЁТА (для дат):', job.data.text.slice(0, 60000));
    L.push('', 'ГОТОВЫЙ РАЗБОР:', job.text.replace(/^#\s+Приложение[\s\S]*$/im, ''));
    const r = await callAI({ task: 'long', system: sys, user: L.join('\n'), maxTokens: 12000, temperature: 0.7 }, hooks);
    job.conspect = r.text;
    return r.text;
  }

  // ---------- положения из текста собеседника и проверка достоинств планет (считает программа, без модели)
  const SIGNS_N = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
  const SIGNS_R = [/^ов(ен|не|на|ну|ном)$/, /^тел(ец|ьце|ьца|ьцу|ьцом)$/, /^близнец(ы|ах|ов|ам)$/, /^рак(е|а|у|ом)?$/, /^(лев|льв(е|а|у|ом))$/, /^дев(а|е|ы|у|ой)$/, /^вес(ы|ах|ов|ам)$/, /^скорпион(е|а|у|ом)?$/, /^стрел(ец|ьце|ьца|ьцу)$/, /^козерог(е|а|у|ом)?$/, /^водоле(й|е|я|ю)$/, /^рыб(ы|ах|ам)?$/];
  const PLAN_R = [['Асцендент', /^(асц|асцендент(а|е|ом)?|asc|ас)$/], ['Солнце', /^солнц(е|а|ем)$/], ['Луна', /^лун(а|е|ы|у|ой)$/], ['Меркурий', /^меркури(й|я|ем|и)$/], ['Венера', /^венер(а|ы|е|у|ой)$/], ['Марс', /^марс(а|е|ом)?$/], ['Юпитер', /^юпитер(а|е|ом)?$/], ['Сатурн', /^сатурн(а|е|ом)?$/], ['Уран', /^уран(а|е|ом)?$/], ['Нептун', /^нептун(а|е|ом)?$/], ['Плутон', /^плутон(а|е|ом)?$/], ['MC', /^(mc|мс)$/], ['Хирон', /^хирон(а|е)?$/], ['Лилит', /^лилит$/]];
  const DOM = { 'Солнце': [4], 'Луна': [3], 'Меркурий': [2, 5], 'Венера': [1, 6], 'Марс': [0], 'Юпитер': [8], 'Сатурн': [9], 'Уран': [10], 'Нептун': [11], 'Плутон': [7] };
  const DOM_C = { 'Марс': [7], 'Юпитер': [11], 'Сатурн': [10] };
  const EXA = { 'Солнце': 0, 'Луна': 1, 'Меркурий': 5, 'Венера': 11, 'Марс': 9, 'Юпитер': 3, 'Сатурн': 6 };
  const RUL_M = ['Марс', 'Венера', 'Меркурий', 'Луна', 'Солнце', 'Меркурий', 'Венера', 'Плутон', 'Юпитер', 'Сатурн', 'Уран', 'Нептун'];
  const RUL_C = { 7: 'Марс', 10: 'Сатурн', 11: 'Юпитер' };
  function dignityOf(pl, si) {
    const opp = x => (x + 6) % 12;
    if ((DOM[pl] || []).includes(si)) return 'обитель (свой знак)';
    if ((DOM_C[pl] || []).includes(si)) return 'обитель по классической системе';
    if (EXA[pl] === si) return 'экзальтация';
    if ((DOM[pl] || []).map(opp).includes(si)) return 'изгнание';
    if ((DOM_C[pl] || []).map(opp).includes(si)) return 'изгнание по классической системе';
    if (EXA[pl] != null && opp(EXA[pl]) === si) return 'падение';
    return DOM[pl] ? 'не в своих знаках: ни обитель, ни экзальтация, ни изгнание, ни падение' : '';
  }
  function placements(text) {
    const W = String(text || '').toLowerCase().replace(/ё/g, 'е').split(/([.;!?\n]|\s+|,)/).filter(x => x && !/^\s+$/.test(x));
    const out = [];
    for (let i = 0; i < W.length; i++) {
      const pl = PLAN_R.find(([, re]) => re.test(W[i])); if (!pl) continue;
      let sign = -1, house = null;
      for (let j = i + 1; j < Math.min(W.length, i + 8); j++) {
        const w = W[j]; if (/^[.;!?\n]$/.test(w)) break;
        if (PLAN_R.some(([, re]) => re.test(w))) break;
        if (/^\d{1,2}$/.test(w) && /^(дом|доме|дому|-м|м)$/.test(W[j + 1] || '')) house = +w;
        if (/^\d{1,2}(-?м)?$/.test(w) && /^дом/.test(W[j + 1] || '')) house = parseInt(w, 10);
        const k = SIGNS_R.findIndex(re => re.test(w)); if (k >= 0) { sign = k; for (let t = j + 1; t < Math.min(W.length, j + 5) && house == null; t++) { if (/^[.;!?\n,]$/.test(W[t]) || PLAN_R.some(([, re]) => re.test(W[t]))) break; if (/^\d{1,2}(-?м)?$/.test(W[t]) && /^дом/.test(W[t + 1] || '')) house = parseInt(W[t], 10); } break; }
      }
      if (sign >= 0) out.push({ pl: pl[0], sign, house });
    }
    return out;
  }
  function placementFacts(text) {
    const P = placements(text); if (!P.length) return '';
    const seen = new Set(), L = [];
    P.forEach(x => {
      const k = x.pl + x.sign; if (seen.has(k)) return; seen.add(k);
      if (x.pl === 'Асцендент') {
        const r = RUL_M[x.sign], rc = RUL_C[x.sign];
        const rp = P.find(y => y.pl === r);
        L.push(`Асцендент в ${SIGNS_N[x.sign]}: управитель Асцендента ${r}${rc ? ' (в классической астрологии ' + rc + ')' : ''}${rp ? `, он стоит в ${SIGNS_N[rp.sign]}${rp.house ? ', ' + rp.house + ' дом' : ''}: ${dignityOf(r, rp.sign)}` : ''}.`);
      } else if (DOM[x.pl]) L.push(`${x.pl} в ${SIGNS_N[x.sign]}${x.house ? ', ' + x.house + ' дом' : ''}: ${dignityOf(x.pl, x.sign)}.`);
      else L.push(`${x.pl} в ${SIGNS_N[x.sign]}${x.house ? ', ' + x.house + ' дом' : ''}.`);
    });
    return L.join('\n');
  }
  // утверждения о достоинствах, которые не сходятся с таблицей, и выдуманные слова
  function dignityIssues(text, ctxText) {
    const out = [];
    const ctxP = placements(ctxText || '');
    String(text || '').replace(/([.?!…])\s+/g, '$1\n').split('\n').forEach(snt => {
      const low = snt.toLowerCase().replace(/ё/g, 'е');
      if (/обиход|обитани[ея] (венеры|марса|луны|солнца|меркурия|юпитера|сатурна)/.test(low)) { out.push(`«${snt.trim().slice(0, 160)}»: такого термина нет`); return; }
      const claims = [['обитель', /обител|в сво(ем|ей) (знаке|стихии)/], ['экзальтация', /экзальтац/], ['изгнание', /изгнани/], ['падение', /в падени/]];
      const cl = claims.find(([, re]) => re.test(low)); if (!cl) return;
      let P = placements(snt);
      if (!P.length && /управител/.test(low)) { const asc = ctxP.find(y => y.pl === 'Асцендент'); if (asc) { const rp = ctxP.find(y => y.pl === RUL_M[asc.sign]); if (rp) P = [rp]; } }
      P = P.filter(x => DOM[x.pl]); if (!P.length) return;
      if (!P.some(x => dignityOf(x.pl, x.sign).indexOf(cl[0]) === 0)) out.push(`«${snt.trim().slice(0, 160)}»: ${P.map(x => x.pl + ' в ' + SIGNS_N[x.sign] + ': ' + dignityOf(x.pl, x.sign)).join('; ')}`);
    });
    return out;
  }

  // проверки коротких текстов (посты, комментарии): лозунги, «возможно», «мы», формы «(а)», достоинства, возраст узлов
  function textIssues(text, ctxText) {
    const T = String(text || ''), out = [];
    ['slogan', 'maybe', 'we', 'lex'].forEach(id => { const c = (KB.checks || []).find(x => x.id === id); if (!c) return; const sm = sentencesWith(T, new RegExp(c.re.source, c.re.flags.replace('g', ''))); if (sm.length) out.push({ id, title: c.title, fix: c.fix, samples: sm }); });
    const g = sentencesWith(T, /[а-яё]\((а|ла|ая|на|ой)\)/i); if (g.length) out.push({ id: 'gender', title: 'Формы со скобками «(а)»', fix: 'перепиши в женском роде (аудитория в основном женщины) или безлично, без скобок', samples: g });
    const nd = sentencesWith(T, /узл[а-яё]*[^.!?]*(36|38)|(36|38)[^.!?]*узл/i).filter(x => !/37/.test(x)); if (nd.length) out.push({ id: 'nodes', title: 'Возраст возвращения узлов', fix: 'второе возвращение лунных узлов около 37 лет (точно в 37 лет и 2–4 месяца), третье около 56; поправь число', samples: nd });
    const d = dignityIssues(T, ctxText); if (d.length) out.push({ id: 'dignity', title: 'Астрологическая ошибка', fix: 'исправь утверждение о знаке планеты по таблице достоинств: ' + d.map(x => x.replace(/^«[^»]*»:\s*/, '')).join('; '), samples: d.map(x => (/^«([^»]*)»/.exec(x) || [])[1] || x) });
    return out;
  }
  G.Pipeline = { generate, review, reviewIssues, fixReview, check, checkCtx, fixAll, edit, conspect, assemble, clientText, header, system, stepUser, datesIn, badDates, lifeDates, monthYears, dedupe, fixEras, renumber, autoFix, fixDashes, fixHyph, joinCont, placements, placementFacts, dignityIssues, dignityOf, textIssues, fixParas, fixSoft };
})(window);
