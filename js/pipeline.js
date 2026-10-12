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
  function badDates(text, data) {
    const known = dataDates(data); const out = [];
    datesIn(text).forEach(x => {
      const t = Date.UTC(x.y, x.mo - 1, x.d); let ok = false;
      for (let k = -2; k <= 2; k++) if (known.has(t + k * 86400000)) { ok = true; break; }
      if (!ok) out.push(x.s);
    });
    return [...new Set(out)];
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
      if (n > max) errors.push({ id: c.id, title: c.title, count: n, max, fix: c.fix, samples: sentencesWith(text, new RegExp(c.re.source, c.re.flags.replace('g', ''))) });
    });
    (KB.checksWarn || []).forEach(c => {
      const n = (text.match(c.re) || []).length;
      if (n > c.max) warns.push({ id: c.id, title: c.title, count: n, samples: sentencesWith(text, new RegExp(c.re.source, c.re.flags.replace('g', ''))) });
    });
    if (ctx.data) {
      const bd = badDates(text, ctx.data);
      if (bd.length) errors.push({ id: 'dates', title: 'Даты, которых нет в расчёте', count: bd.length, fix: 'эти даты не из блока расчёта: замени каждую на точную дату из блока расчёта или убери дату', samples: bd });
    }
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
    const prev = P.steps.filter(s => !s.internal && s.id !== step.id && job.parts[s.id] && P.steps.indexOf(s) < P.steps.indexOf(step)).map(s => job.parts[s.id]).join('\n\n');
    if (prev) L.push('', 'УЖЕ НАПИСАНО (продолжай отсюда, не повторяй):', prev);
    L.push('', 'Напомню: только разметка, только факты и даты из блока расчёта, без тире, без «мы», без градусов.');
    return L.join('\n');
  }

  async function callAI(q, hooks) {
    let r = await AI.run(Object.assign({}, q, { onStatus: hooks && hooks.status }));
    let text = r.text; let guard = 0;
    while (r.truncated && guard < 2) {
      guard++;
      hooks && hooks.status && hooks.status('Текст оборвался, прошу продолжить…');
      const tail = text.slice(-1500);
      r = await AI.run(Object.assign({}, q, { user: q.user + '\n\nТЫ УЖЕ НАПИСАЛ ЭТОТ ТЕКСТ, НО ОН ОБОРВАЛСЯ. Продолжи ровно с места обрыва, не повторяя написанное. Последние строки:\n' + tail, onStatus: hooks && hooks.status, prefer: { prov: r.prov, model: r.model } }));
      text += (text.endsWith('\n') ? '' : ' ') + r.text;
    }
    return { text: tidy(text), prov: r.prov, model: r.model, label: r.label };
  }

  function tidy(t) {
    return String(t || '')
      .replace(/^```[a-z]*\s*|```\s*$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function fixText(job, md, issues, hooks) {
    const list = issues.map(e => `- ${e.title}${e.count ? ' (' + e.count + ')' : ''}: ${e.fix || ''}${e.samples && e.samples.length ? '\n  Примеры: ' + e.samples.map(s => '«' + s + '»').join('; ') : ''}`).join('\n');
    const user = `ПРОБЛЕМЫ, КОТОРЫЕ НУЖНО ИСПРАВИТЬ:\n${list}\n\nБЛОК РАСЧЁТА (для замены дат):\n${job.data.text}\n\nТЕКСТ:\n${md}`;
    const r = await callAI({ task: 'long', system: KB.fix + '\n\n' + KB.voice + '\n\n' + KB.markup, user, maxTokens: 32000, temperature: 0.3 }, hooks);
    // защита: если модель сильно сократила текст, оставляем исходник
    if (r.text.length < md.length * 0.8) return { text: md, skipped: true };
    return { text: r.text, prov: r.prov, model: r.model };
  }

  function checkCtx(job, final) {
    const ctx = { data: job.data.text, product: job.product, final };
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
      const r = await callAI({ task: 'long', system: sys, user: stepUser(job, step), maxTokens: Math.max(8000, Math.round(step.max * 0.9)), temperature: step.internal ? 0.4 : 0.85 }, hooks);
      if (step.internal) { job.plan = r.text; hooks.step(step.id, 'done', r.label); hooks.save(); continue; }
      let text = r.text;
      // проверка и одна волна исправлений
      const ch = check(text, checkCtx(job, false));
      if (ch.errors.length) {
        hooks.step(step.id, 'run', 'исправляю: ' + ch.errors.map(e => e.title).join(', '));
        try { const f = await fixText(job, text, ch.errors, hooks); text = f.text; } catch (e) { /* оставляем как есть */ }
      }
      job.parts[step.id] = text;
      hooks.step(step.id, 'done', r.label);
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
    const f = await fixText(job, body, ch.errors, hooks);
    job.text = f.text + (tail ? '\n\n' + tail : '');
    job.checks = check(job.text, checkCtx(job, true));
    return { changed: !f.skipped, checks: job.checks };
  }

  async function edit(job, remarks, hooks) {
    const app = job.text.search(/^#\s+Приложение/im);
    const body = app > 0 ? job.text.slice(0, app) : job.text;
    const tail = app > 0 ? job.text.slice(app) : '';
    const user = `ЗАМЕЧАНИЯ:\n${remarks}\n\nБЛОК РАСЧЁТА (если для правки нужны даты):\n${job.data.text}\n\nТЕКСТ:\n${body}`;
    const r = await callAI({ task: 'long', system: KB.edit + '\n\n' + KB.voice + '\n\n' + KB.markup + '\n\n' + KB.products[job.product].system, user, maxTokens: 32000, temperature: 0.4 }, hooks);
    if (r.text.length < body.length * 0.6) throw new Error('Модель вернула слишком короткий текст, правка не применена. Попробуйте ещё раз или сформулируйте замечание точнее.');
    job.text = r.text + (tail ? '\n\n' + tail : '');
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

  G.Pipeline = { generate, check, fixAll, edit, conspect, assemble, clientText, header, system, stepUser, datesIn, badDates };
})(window);
