/* Астро-мастерская: интерфейс */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [].slice.call(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  };
  const BUILD = 17;
  const VERSION = 'Астро-мастерская · сборка ' + BUILD + ' · база знаний ' + KB.version;
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 2600); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Скопировано'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Скопировано'); } catch (e2) { toast('Не удалось скопировать'); } ta.remove(); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const translit = s => String(s).replace(/[а-яё]/gi, ch => { const m = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }; const l = ch.toLowerCase(); const r = m[l] != null ? m[l] : ch; return ch === l ? r : r.charAt(0).toUpperCase() + r.slice(1); }).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // ---------- хранилище (IndexedDB, запасной вариант localStorage)
  const DB = (() => {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        try {
          const r = indexedDB.open('astro', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('jobs', { keyPath: 'id' });
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
      return dbp;
    }
    async function tx(mode, fn) {
      try {
        const db = await open();
        return await new Promise((res, rej) => { const t = db.transaction('jobs', mode); const st = t.objectStore('jobs'); const r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
      } catch (e) {
        // localStorage
        const all = LS.get('jobs_fallback', {});
        return fn({ put: j => { all[j.id] = j; LS.set('jobs_fallback', all); return {}; }, delete: id => { delete all[id]; LS.set('jobs_fallback', all); return {}; }, getAll: () => ({ result: Object.values(all) }), get: id => ({ result: all[id] }) }).result;
      }
    }
    return {
      put: j => tx('readwrite', st => st.put(JSON.parse(JSON.stringify(j)))),
      del: id => tx('readwrite', st => st.delete(id)),
      all: () => tx('readonly', st => st.getAll()),
      get: id => tx('readonly', st => st.get(id)),
    };
  })();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }

  // ---------- расчёты в фоне
  const W = (() => {
    let w = null, seq = 0; const wait = {};
    function get() {
      if (w) return w;
      w = new Worker('js/worker.js?v=17');
      w.onmessage = ev => { const m = ev.data; const h = wait[m.id]; if (!h) return; if (m.progress != null) { h.p && h.p(m.progress); return; } delete wait[m.id]; m.ok ? h.res(m.res) : h.rej(new Error(m.error)); };
      w.onerror = e => { Object.values(wait).forEach(h => h.rej(new Error('Ошибка расчёта: ' + (e.message || '')))); };
      return w;
    }
    return (cmd, args, onP) => new Promise((res, rej) => { const id = ++seq; wait[id] = { res, rej, p: onP }; get().postMessage({ id, cmd, args }); });
  })();

  // ---------- вкладки
  function showTab(t) {
    $$('nav.bottom button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.tab').forEach(s => s.hidden = s.id !== 'tab-' + t);
    window.scrollTo(0, 0);
    if (t === 'archive') renderArchive();
    if (t === 'more' && typeof renderLog === 'function') renderLog();
    if (t === 'more') renderKeys();
  }
  $$('nav.bottom button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  function segInit(el, cb) { el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; [].forEach.call(el.children, x => x.classList.toggle('on', x === b)); cb && cb(b.dataset.v); }); }
  function segSet(el, v) { [].forEach.call(el.children, x => x.classList.toggle('on', x.dataset.v === v)); }
  function segGet(el) { const b = el.querySelector('.on'); return b ? b.dataset.v : null; }

  // ---------- форма разбора
  const F = { product: 'moon', role: 'self', parentGender: 'f', mode: 'basic', persons: [] };
  function personTitle(i) {
    if (F.product === 'synastry') return i === 0 ? 'Заказчик' : 'Партнёр';
    if (F.product === 'child') return i === 0 ? 'Ребёнок' : 'Родитель (необязательно, для раздела «вы и ребёнок»)';
    if (F.product === 'moon' && F.role === 'parent') return 'Ребёнок';
    return 'Клиент';
  }
  function personCount() { return F.product === 'synastry' || F.product === 'child' ? 2 : 1; }
  function renderProducts() {
    $('#productChips').innerHTML = KB.productOrder.map(k => `<button class="chip${k === F.product ? ' on' : ''}" data-k="${k}">${esc(KB.products[k].title)}</button>`).join('');
    $('#productHint').textContent = KB.products[F.product].short;
    $('#roleCard').hidden = !(F.product === 'moon' || F.product === 'child');
    $('#roleSeg').hidden = F.product !== 'moon';
    $('#parentGenderRow').hidden = !(F.product === 'child' || (F.product === 'moon' && F.role === 'parent'));
    $('#modeCard').hidden = F.product !== 'natal';
  }
  $('#productChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; collectPersons(); F.product = b.dataset.k; renderProducts(); renderPersons(); };
  segInit($('#roleSeg'), v => { collectPersons(); F.role = v; renderProducts(); renderPersons(); });
  segInit($('#parentGenderSeg'), v => F.parentGender = v);
  segInit($('#modeSeg'), v => F.mode = v);

  function personHTML(i, p) {
    p = p || {};
    const opt = F.product === 'child' && i === 1;
    return `<div class="card person" data-i="${i}">
      <h3>${esc(personTitle(i))}</h3>
      ${opt ? `<label class="check"><input type="checkbox" class="p-use"${p.use ? ' checked' : ''}> Добавить карту родителя</label>` : ''}
      <div class="pbody"${opt && !p.use ? ' hidden' : ''}>
      <div class="row3"><div><label class="lbl">Имя</label><input class="p-name" value="${esc(p.name || '')}" placeholder="Только имя" autocomplete="off"></div>
      <div><label class="lbl">Пол</label><div class="seg p-gender"><button data-v="f"${p.gender !== 'm' ? ' class="on"' : ''}>Ж</button><button data-v="m"${p.gender === 'm' ? ' class="on"' : ''}>М</button></div></div></div>
      <div class="row2"><div><label class="lbl">Дата рождения</label><input class="p-date" inputmode="numeric" placeholder="09.10.1988" value="${esc(p.date || '')}"></div>
      <div><label class="lbl">Время</label><input class="p-time" inputmode="numeric" placeholder="10:45" value="${esc(p.time || '')}"${p.noTime ? ' disabled' : ''}></div></div>
      <label class="check"><input type="checkbox" class="p-notime"${p.noTime ? ' checked' : ''}> Время рождения неизвестно</label>
      <label class="lbl">Место рождения: город, село, посёлок</label>
      <div class="citybox"><input class="p-city" placeholder="Начните вводить: Ставрополь, Заюково…" value="${esc(p.cityText || '')}" autocomplete="off"><div class="citylist" hidden></div></div>
      <div class="cityinfo">${p.lat != null ? cityInfo(p) : ''}</div>
      <button class="linkbtn p-manual">${p.manual ? 'Скрыть ручной ввод' : 'Не находится? Ввести координаты вручную'}</button>
      <div class="manualgeo"${p.manual ? '' : ' hidden'}>
        <div class="row2"><div><label class="lbl">Широта</label><input class="p-lat" inputmode="decimal" placeholder="45.05" value="${p.lat != null ? p.lat : ''}"></div><div><label class="lbl">Долгота</label><input class="p-lon" inputmode="decimal" placeholder="41.97" value="${p.lon != null ? p.lon : ''}"></div></div>
        <label class="lbl">Часовой пояс</label><select class="p-tz">${tzOptions(p.tz)}</select>
        <label class="lbl">Смещение от Гринвича вручную <span class="opt">только если точно знаете, например 4 или 3.5</span></label><input class="p-off" inputmode="decimal" placeholder="авто" value="${p.manualOffset != null && p.manualOffset !== '' ? p.manualOffset / 60 : ''}">
        <p class="hint">Координаты города можно найти в Картах: долгое нажатие на место показывает широту и долготу.</p>
      </div>
      <label class="lbl">Где живёт сейчас <span class="opt">необязательно: карта переносится на место жительства, даты идут по местному времени</span></label>
      <div class="citybox"><input class="p-now" placeholder="Город или село, где человек живёт сейчас" value="${esc(p.now ? p.now.cityText.split(',')[0] : (p.nowText || ''))}" autocomplete="off"><div class="citylist nowlist" hidden></div></div>
      <div class="cityinfo nowinfo">${p.now ? nowInfo(p.now) : ''}</div>
      <div class="nowsince"${p.now || p.nowText ? '' : ' hidden'}>
        <div class="row2"><div><label class="lbl">Живёт там с: месяц</label><select class="p-sm">${monthOpts(p.sinceM)}</select></div>
        <div><label class="lbl">Год</label><select class="p-sy">${yearOpts(p.sinceY, p.date)}</select></div></div>
        <p class="hint">Новое место начинает проявляться не сразу. Если переезд недавний, разбор опирается на карту рождения, а о новом месте говорит как о том, что впереди. Если давно, можно указать только год.</p>
      </div>
      </div></div>`;
  }
  const MONTHS_N = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  function monthOpts(sel) { return `<option value="">не помню</option>` + MONTHS_N.map((m, i) => `<option value="${i + 1}"${+sel === i + 1 ? ' selected' : ''}>${m}</option>`).join(''); }
  function yearOpts(sel, birth) {
    const y0 = new Date().getFullYear(), m = /(\d{4})$/.exec(birth || ''), y1 = m ? Math.max(+m[1], 1920) : 1940;
    let h = `<option value="">выберите</option>`; for (let y = y0; y >= y1; y--) h += `<option value="${y}"${+sel === y ? ' selected' : ''}>${y}</option>`; return h;
  }
  function nowInfo(n) { return `<b>${esc(n.cityText)}</b> · ${esc(n.tz)}`; }
  function cityInfo(p) { return `<b>${esc(p.cityText || '')}</b> · ${(+p.lat).toFixed(2)}, ${(+p.lon).toFixed(2)} · ${esc(p.tz || '')}`; }
  let TZS = null;
  function tzOptions(sel) {
    if (!TZS) { const set = {}; CITIES.forEach(c => { set[c[4]] = set[c[4]] || c[0]; }); TZS = Object.keys(set).sort().map(z => [z, set[z]]); }
    return TZS.map(([z, c]) => `<option value="${z}"${z === sel ? ' selected' : ''}>${z} (${esc(c)})</option>`).join('');
  }
  function renderPersons() {
    const n = personCount();
    while (F.persons.length < n) F.persons.push({});
    $('#persons').innerHTML = F.persons.slice(0, n).map((p, i) => personHTML(i, p)).join('');
    $$('#persons .person').forEach(bindPerson);
  }
  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[-\s]+/g, ' ').trim();
  const PREFIX = /^(город|г\.|село|с\.|деревня|дер\.|д\.|посёлок городского типа|поселок городского типа|пгт\.?|рабочий посёлок|рабочий поселок|рп\.?|посёлок|поселок|пос\.|п\.|станица|ст-ца|ст\.|аул|хутор|х\.|слобода|сл\.|кишлак|улус|аал)\s+/i;
  const cleanPlace = s => String(s || '').trim().replace(PREFIX, '').replace(/,.*$/, '').trim();
  let CITY_IDX = null;
  function citySearch(q) {
    if (!CITY_IDX) CITY_IDX = CITIES.map(c => norm(c[0]));
    q = norm(cleanPlace(q)); if (q.length < 2) return [];
    const a = [], b = [];
    for (let i = 0; i < CITIES.length && a.length < 12; i++) { const n = CITY_IDX[i]; if (n.startsWith(q)) a.push(CITIES[i]); else if (b.length < 12 && n.includes(q)) b.push(CITIES[i]); }
    return a.concat(b).slice(0, 8);
  }
  // ---------- любой населённый пункт: поиск на карте (OpenStreetMap) и часовой пояс по координатам
  const RU_REG = [['Калининградская', 'Europe/Kaliningrad'], ['Астраханская', 'Europe/Astrakhan'], ['Волгоградская', 'Europe/Volgograd'], ['Кировская', 'Europe/Kirov'],
    ['Самарская', 'Europe/Samara'], ['Саратовская', 'Europe/Saratov'], ['Удмурт', 'Europe/Samara'], ['Ульяновская', 'Europe/Ulyanovsk'], ['Крым', 'Europe/Simferopol'], ['Севастополь', 'Europe/Simferopol'],
    ['Башкортостан', 'Asia/Yekaterinburg'], ['Курганская', 'Asia/Yekaterinburg'], ['Оренбургская', 'Asia/Yekaterinburg'], ['Пермский', 'Asia/Yekaterinburg'], ['Свердловская', 'Asia/Yekaterinburg'],
    ['Тюменская', 'Asia/Yekaterinburg'], ['Ханты-Мансийский', 'Asia/Yekaterinburg'], ['Челябинская', 'Asia/Yekaterinburg'], ['Ямало-Ненецкий', 'Asia/Yekaterinburg'],
    ['Новосибирская', 'Asia/Novosibirsk'], ['Томская', 'Asia/Tomsk'], ['Омская', 'Asia/Omsk'], ['Алтай', 'Asia/Barnaul'], ['Кемеровская', 'Asia/Novokuznetsk'], ['Кузбасс', 'Asia/Novokuznetsk'],
    ['Красноярский', 'Asia/Krasnoyarsk'], ['Тыва', 'Asia/Krasnoyarsk'], ['Хакасия', 'Asia/Krasnoyarsk'], ['Иркутская', 'Asia/Irkutsk'], ['Бурятия', 'Asia/Irkutsk'], ['Забайкальский', 'Asia/Chita'],
    ['Амурская', 'Asia/Yakutsk'], ['Приморский', 'Asia/Vladivostok'], ['Хабаровский', 'Asia/Vladivostok'], ['Еврейская', 'Asia/Vladivostok'], ['Магаданская', 'Asia/Magadan'],
    ['Сахалинская', 'Asia/Sakhalin'], ['Камчатский', 'Asia/Kamchatka'], ['Чукотский', 'Asia/Anadyr']];
  const tzOk = z => { try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch (e) { return false; } };
  function nearestTz(lat, lon) {
    let best = null, bd = 1e9;
    for (const c of CITIES) { const d = (c[2] - lat) ** 2 + ((c[3] - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = c; } }
    return best ? best[4] : 'Europe/Moscow';
  }
  function tzFor(lat, lon, a) {
    let z = null; try { z = window.tzlookup ? window.tzlookup(lat, lon) : null; } catch (e) { }
    if (a && a.country_code === 'ru') {
      const st = [a.state, a.region, a.province, a.city].filter(Boolean).join(' ');
      if (/Саха|Якути/.test(st)) return /^Asia\/(Yakutsk|Khandyga|Ust-Nera|Srednekolymsk|Magadan|Vladivostok)$/.test(z) ? z : 'Asia/Yakutsk';
      for (const [k, v] of RU_REG) if (st.indexOf(k) >= 0) return v;
      return 'Europe/Moscow';
    }
    if (z === 'Europe/Kyiv') z = 'Europe/Kiev';
    if (!z || !tzOk(z)) z = nearestTz(lat, lon);
    return z;
  }
  const GEO_CACHE = {};
  async function geoSearch(text) {
    const q = cleanPlace(text); if (q.length < 3) return [];
    if (GEO_CACHE[q]) return GEO_CACHE[q];
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=12&accept-language=ru&q=' + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Поиск на карте не ответил (' + r.status + ')');
    const j = await r.json();
    const PLACE = /^(city|town|village|hamlet|suburb|locality|isolated_dwelling|municipality|neighbourhood|quarter|borough|farm|allotments|croft)$/;
    const out = [], seen = new Set();
    const add = x => {
      const a = x.address || {};
      const name = x.name || a.village || a.town || a.city || a.hamlet || q;
      const sub = [a.county || a.municipality || a.district, a.state || a.region, a.country].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
      const key = name + '|' + sub.join('|'); if (seen.has(key)) return; seen.add(key);
      const lat = +x.lat, lon = +x.lon;
      out.push({ name, sub: sub.join(', '), lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000, tz: tzFor(lat, lon, a), region: a.state || a.region || a.country || '' });
    };
    j.filter(x => x.category === 'place' && PLACE.test(x.type)).forEach(add);
    if (!out.length) j.filter(x => x.category === 'boundary' && x.type === 'administrative').forEach(add);
    GEO_CACHE[q] = out.slice(0, 8);
    return GEO_CACHE[q];
  }
  function applyPlace(el, p, x) {
    Object.assign(p, { cityText: x.name + (x.region ? ', ' + x.region : ''), lat: x.lat, lon: x.lon, tz: x.tz });
    el.querySelector('.p-city').value = x.name;
    el.querySelector('.citylist').hidden = true;
    el.querySelector('.cityinfo').innerHTML = cityInfo(p);
    el.querySelector('.p-lat').value = x.lat; el.querySelector('.p-lon').value = x.lon;
    const sel = el.querySelector('.p-tz');
    if (![].some.call(sel.options, o => o.value === x.tz)) sel.insertAdjacentHTML('beforeend', `<option value="${x.tz}">${x.tz}</option>`);
    sel.value = x.tz;
  }
  function renderCityList(el, local, geo, state, listEl) {
    const list = listEl || el.querySelector('.citylist');
    const items = local.map(c => ({ name: c[0], sub: `${c[1] ? c[1] + ' · ' : ''}${c[4]}`, lat: c[2], lon: c[3], tz: c[4], region: c[1] }));
    let h = items.map((x, k) => `<div data-k="${k}">${esc(x.name)}<small>${esc(x.sub)}</small></div>`).join('');
    const g = geo || [];
    if (g.length) h += '<div class="lh">Найдено на карте</div>' + g.map((x, k) => `<div data-k="${items.length + k}">${esc(x.name)}<small>${esc(x.sub)} · ${x.tz}</small></div>`).join('');
    if (state === 'wait') h += '<div class="lh">Ищу на карте…</div>';
    if (state === 'none' && !items.length) h += '<div class="lh">Не нашлось. Проверьте написание или введите координаты вручную</div>';
    if (state === 'err' && !items.length) h += '<div class="lh">Поиск на карте недоступен. Можно ввести координаты вручную</div>';
    list._r = items.concat(g); list.innerHTML = h; list.hidden = !h;
  }
  function bindPerson(el) {
    const i = +el.dataset.i; const p = F.persons[i];
    const city = el.querySelector('.p-city'), list = el.querySelector('.citylist');
    segInit(el.querySelector('.p-gender'), v => p.gender = v);
    const use = el.querySelector('.p-use'); if (use) use.onchange = () => { p.use = use.checked; el.querySelector('.pbody').hidden = !use.checked; };
    const nt = el.querySelector('.p-notime'); nt.onchange = () => { el.querySelector('.p-time').disabled = nt.checked; };
    const dateEl = el.querySelector('.p-date');
    dateEl.addEventListener('input', () => { let v = dateEl.value.replace(/[^\d]/g, '').slice(0, 8); if (v.length > 4) v = v.slice(0, 2) + '.' + v.slice(2, 4) + '.' + v.slice(4); else if (v.length > 2) v = v.slice(0, 2) + '.' + v.slice(2); dateEl.value = v; });
    const timeEl = el.querySelector('.p-time');
    timeEl.addEventListener('input', () => { let v = timeEl.value.replace(/[^\d]/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2); timeEl.value = v; });
    let tmr = null, seq = 0;
    city.addEventListener('input', () => {
      if (!p.manual) { p.lat = p.lon = null; p.tz = null; el.querySelector('.cityinfo').innerHTML = ''; }
      p.cityText = city.value.trim();
      const local = citySearch(city.value);
      const q = cleanPlace(city.value);
      renderCityList(el, local, null, q.length >= 3 ? 'wait' : '');
      clearTimeout(tmr);
      if (q.length < 3) return;
      const my = ++seq;
      tmr = setTimeout(async () => {
        try { const g = await geoSearch(city.value); if (my !== seq) return; renderCityList(el, local, g, g.length ? '' : 'none'); }
        catch (e) { if (my === seq) renderCityList(el, local, null, 'err'); }
      }, 700);
    });
    city.addEventListener('focus', () => { if (list.innerHTML && p.lat == null) list.hidden = false; });
    list.addEventListener('click', e => {
      const d = e.target.closest('[data-k]'); if (!d) return;
      applyPlace(el, p, list._r[+d.dataset.k]);
    });
    city.addEventListener('blur', () => setTimeout(() => list.hidden = true, 300));
    // где живёт сейчас
    const nowIn = el.querySelector('.p-now'), nowList = el.querySelector('.nowlist');
    let tmr2 = null, seq2 = 0;
    nowIn.addEventListener('input', () => {
      p.now = null; p.nowText = nowIn.value.trim(); el.querySelector('.nowinfo').innerHTML = '';
      el.querySelector('.nowsince').hidden = !p.nowText;
      const local = citySearch(nowIn.value), q = cleanPlace(nowIn.value);
      renderCityList(el, local, null, q.length >= 3 ? 'wait' : '', nowList);
      clearTimeout(tmr2); if (q.length < 3) return;
      const my = ++seq2;
      tmr2 = setTimeout(async () => {
        try { const g = await geoSearch(nowIn.value); if (my === seq2) renderCityList(el, local, g, g.length ? '' : 'none', nowList); }
        catch (e) { if (my === seq2) renderCityList(el, local, null, 'err', nowList); }
      }, 700);
    });
    nowList.addEventListener('click', e => {
      const d = e.target.closest('[data-k]'); if (!d) return; const x = nowList._r[+d.dataset.k];
      setNow(el, p, x);
    });
    nowIn.addEventListener('blur', () => setTimeout(() => nowList.hidden = true, 300));
    const latEl = el.querySelector('.p-lat'), lonEl = el.querySelector('.p-lon');
    const autoTz = () => {
      const la = parseFloat(latEl.value.replace(',', '.')), lo = parseFloat(lonEl.value.replace(',', '.'));
      if (isNaN(la) || isNaN(lo)) return;
      const z = tzFor(la, lo, null); const sel = el.querySelector('.p-tz');
      if (![].some.call(sel.options, o => o.value === z)) sel.insertAdjacentHTML('beforeend', `<option value="${z}">${z}</option>`);
      sel.value = z;
    };
    latEl.addEventListener('change', autoTz); lonEl.addEventListener('change', autoTz);
    el.querySelector('.p-manual').onclick = () => { p.manual = !p.manual; el.querySelector('.manualgeo').hidden = !p.manual; el.querySelector('.p-manual').textContent = p.manual ? 'Скрыть ручной ввод' : 'Не находится? Ввести координаты вручную'; };
  }
  function setNow(el, p, x) {
    p.now = { cityText: x.name + (x.region ? ', ' + x.region : ''), lat: x.lat, lon: x.lon, tz: x.tz };
    el.querySelector('.p-now').value = x.name; el.querySelector('.nowlist').hidden = true;
    el.querySelector('.nowinfo').innerHTML = nowInfo(p.now);
  }
  async function resolvePlaces() {
    // если город написан, но не выбран из списка: ищем на карте сами
    for (const el of $$('#persons .person')) {
      const i = +el.dataset.i, p = F.persons[i];
      if (!p) continue;
      if (el.querySelector('.p-use') && !p.use) continue;
      if (p.nowText && !p.now) {
        const who = personTitle(i).split(' (')[0];
        let g = []; try { g = await geoSearch(p.nowText); } catch (e) { g = []; }
        if (!g.length) { const loc = citySearch(p.nowText).filter(c => norm(c[0]) === norm(cleanPlace(p.nowText))); if (loc.length) g = loc.map(c => ({ name: c[0], region: c[1], lat: c[2], lon: c[3], tz: c[4], sub: c[1] })); }
        if (g.length === 1) setNow(el, p, g[0]);
        else if (!g.length) throw new Error(`${who}: место жительства «${p.nowText}» не нашлось. Проверьте написание или очистите поле`);
        else { renderCityList(el, [], g, '', el.querySelector('.nowlist')); el.querySelector('.nowlist').hidden = false; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); throw new Error(`${who}: нашлось несколько мест «${cleanPlace(p.nowText)}». Выберите, где человек живёт сейчас, в списке под полем`); }
      }
      if (p.manual || p.lat != null || !p.cityText) continue;
      let g = [];
      try { g = await geoSearch(p.cityText); } catch (e) { throw new Error(`${personTitle(i).split(' (')[0]}: поиск места не ответил. Введите координаты вручную`); }
      const local = citySearch(p.cityText).filter(c => norm(c[0]) === norm(cleanPlace(p.cityText)));
      if (local.length === 1 && !g.length) { const c = local[0]; applyPlace(el, p, { name: c[0], region: c[1], lat: c[2], lon: c[3], tz: c[4] }); continue; }
      if (g.length === 1) { applyPlace(el, p, g[0]); continue; }
      if (!g.length) throw new Error(`${personTitle(i).split(' (')[0]}: место «${p.cityText}» не нашлось. Проверьте написание или введите координаты вручную`);
      renderCityList(el, citySearch(p.cityText), g, '');
      el.querySelector('.citylist').hidden = false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      throw new Error(`${personTitle(i).split(' (')[0]}: нашлось несколько мест «${cleanPlace(p.cityText)}». Выберите нужное в списке под полем города`);
    }
  }
  function collectPersons() {
    $$('#persons .person').forEach(el => {
      const i = +el.dataset.i; const p = F.persons[i] = F.persons[i] || {};
      p.name = el.querySelector('.p-name').value.trim();
      p.gender = segGet(el.querySelector('.p-gender')) || 'f';
      p.date = el.querySelector('.p-date').value.trim();
      p.time = el.querySelector('.p-time').value.trim();
      p.noTime = el.querySelector('.p-notime').checked;
      const use = el.querySelector('.p-use'); if (use) p.use = use.checked;
      p.sinceM = el.querySelector('.p-sm').value; p.sinceY = el.querySelector('.p-sy').value;
      if (!el.querySelector('.p-now').value.trim()) { p.now = null; p.nowText = ''; }
      if (p.manual) {
        const la = parseFloat(el.querySelector('.p-lat').value.replace(',', '.')), lo = parseFloat(el.querySelector('.p-lon').value.replace(',', '.'));
        if (!isNaN(la)) p.lat = la; if (!isNaN(lo)) p.lon = lo;
        p.tz = el.querySelector('.p-tz').value;
        const off = el.querySelector('.p-off').value.trim().replace(',', '.');
        p.manualOffset = off === '' ? '' : Math.round(parseFloat(off) * 60);
        if (!p.cityText) p.cityText = el.querySelector('.p-city').value.trim();
      }
      if (!p.cityText) p.cityText = el.querySelector('.p-city').value.trim();
    });
  }
  function toInput(p, label) {
    const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(p.date || '');
    if (!dm) throw new Error(`${label}: дата в формате дд.мм.гггг`);
    const d = +dm[1], mo = +dm[2], y = +dm[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) throw new Error(`${label}: проверьте дату`);
    let h = 12, mi = 0;
    if (!p.noTime) { const tm = /^(\d{1,2}):(\d{2})$/.exec(p.time || ''); if (!tm) throw new Error(`${label}: время в формате чч:мм или отметьте «время неизвестно»`); h = +tm[1]; mi = +tm[2]; if (h > 23 || mi > 59) throw new Error(`${label}: проверьте время`); }
    if (p.lat == null || p.lon == null || !p.tz) throw new Error(`${label}: выберите город из списка или введите координаты`);
    return { name: p.name || label, y, mo, d, h, mi, tz: p.tz, lat: +p.lat, lon: +p.lon, place: (p.cityText || '').split(',')[0], manualOffset: p.manualOffset === '' ? null : p.manualOffset, noTime: !!p.noTime };
  }
  const sameNow = p => !!p.now && Math.abs(p.now.lat - p.lat) < 0.3 && Math.abs(p.now.lon - p.lon) < 0.3;
  const sinceMs = p => p.sinceY ? Date.UTC(+p.sinceY, p.sinceM ? +p.sinceM - 1 : 0, 1) : null;
  const ageOf = p => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(p.date || ''); if (!m) return null; const b = new Date(+m[3], +m[2] - 1, +m[1]); const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };

  // ---------- расчёт
  let JOB = null;
  $('#btnCalc').onclick = async () => {
    collectPersons();
    const out = $('#calcOut'); out.innerHTML = '';
    let inputs;
    try { await resolvePlaces(); } catch (e) { out.innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; return; }
    try {
      const n = personCount();
      inputs = F.persons.slice(0, n).map((p, i) => (F.product === 'child' && i === 1 && !p.use) ? null : toInput(p, personTitle(i).split(' (')[0]));
      F.persons.slice(0, n).forEach((p, i) => {
        if (!inputs[i] || !p.now || sameNow(p)) return;
        const who = personTitle(i).split(' (')[0], city = p.now.cityText.split(',')[0], yNow = new Date().getFullYear();
        if (!p.sinceY) throw new Error(`${who}: укажите, с какого времени человек живёт в месте «${city}». Если точно не знаете, хотя бы год`);
        if (+p.sinceY >= yNow - 1 && !p.sinceM) throw new Error(`${who}: переезд недавний, укажите и месяц: от него зависит, успело ли новое место проявиться`);
        if (sinceMs(p) > Date.now()) throw new Error(`${who}: дата переезда ещё не наступила, проверьте месяц и год`);
        const b = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(p.date || ''); if (b && sinceMs(p) < Date.UTC(+b[3], +b[2] - 1, 1)) throw new Error(`${who}: переезд не может быть раньше рождения, проверьте год`);
      });
    } catch (e) { out.innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; return; }
    const btn = $('#btnCalc'); btn.disabled = true; btn.textContent = 'Считаю…';
    try {
      const job = {
        id: uid(), created: Date.now(), updated: Date.now(), product: F.product, role: F.product === 'moon' ? F.role : (F.product === 'child' ? 'parent' : 'self'),
        parentGender: F.parentGender, mode: F.mode, question: $('#question').value.trim(), facts: $('#facts').value.trim(),
        persons: F.persons.slice(0, personCount()).map((p, i) => Object.assign({}, p, { age: ageOf(p), child: (F.product === 'child' && i === 0) || (F.product === 'moon' && F.role === 'parent') })).filter((p, i) => inputs[i]),
        inputs: inputs.filter(Boolean), parts: {}, plan: '', text: '', conspect: '',
      };
      job.palette = job.product === 'child' || (job.product === 'moon' && job.role === 'parent' && (job.persons[0].age || 99) < 18) ? 'kids' : job.persons[0].gender === 'm' ? 'men' : 'women';
      const priv = LS.get('opt_private', true);
      const base = { private: priv, tz: 'Europe/Moscow' };
      const per = k => {
        const pp = job.persons[k]; if (!pp || !pp.now) return {};
        if (sameNow(pp)) return { tz: pp.now.tz };
        return { tz: pp.now.tz, reloc: { lat: pp.now.lat, lon: pp.now.lon, place: pp.now.cityText.split(',')[0], since: sinceMs(pp), approx: !pp.sinceM } };
      };
      const blocks = [];
      if (job.product === 'synastry') {
        const [a, b] = job.inputs;
        const r1 = await W('natal', { input: a, opt: Object.assign({ scope: 'short', role: 'заказчик' }, base, per(0)) }, f => btn.textContent = `Считаю… ${Math.round(f * 40)}%`);
        const r2 = await W('natal', { input: b, opt: Object.assign({ scope: 'short', role: 'партнёр' }, base, per(1)) }, f => btn.textContent = `Считаю… ${40 + Math.round(f * 40)}%`);
        const pr = await W('pair', { a, b, opt: Object.assign({}, base, { tz: per(0).tz || base.tz }) });
        blocks.push(r1.text, r2.text, pr.text);
        job.data = { text: blocks.join('\n\n'), json: r1.json, json2: r2.json, cross: pr.cross, appendix: pr.appendix, summary: [r1.summary, r2.summary] };
      } else if (job.product === 'child') {
        const [a, b] = job.inputs;
        const r1 = await W('natal', { input: a, opt: Object.assign({ scope: 'short', role: 'ребёнок' }, base, per(0)) }, f => btn.textContent = `Считаю… ${Math.round(f * 60)}%`);
        blocks.push(r1.text); let app = r1.appendix; const sums = [r1.summary];
        if (b) {
          const r2 = await W('natal', { input: b, opt: Object.assign({ scope: 'short', role: 'родитель' }, base, per(1)) });
          const pr = await W('pair', { a, b, opt: Object.assign({ kind: 'parent' }, base, { tz: per(0).tz || base.tz }) });
          blocks.push(r2.text, pr.text); sums.push(r2.summary);
        }
        job.data = { text: blocks.join('\n\n'), json: r1.json, appendix: app, summary: sums };
      } else {
        const opt = Object.assign({ scope: job.product === 'money' ? 'short' : 'full', money: job.product === 'money' }, base, per(0));
        const r = await W('natal', { input: job.inputs[0], opt }, f => btn.textContent = `Считаю… ${Math.round(f * 100)}%`);
        job.data = { text: r.text, json: r.json, appendix: r.appendix, summary: [r.summary] };
      }
      JOB = job; await DB.put(job);
      openJob(job, 'gen');
    } catch (e) { out.innerHTML = `<div class="warnbox">Ошибка расчёта: ${esc(e.message)}</div>`; }
    finally { btn.disabled = false; btn.textContent = 'Посчитать карту'; }
  };

  // ---------- работа
  function jobName(j) { return j.persons.map(p => p.name).filter(Boolean).join(' и ') || 'Без имени'; }
  function openJob(job, tab) {
    JOB = job;
    $('#workForm').hidden = true; $('#workJob').hidden = false;
    $('#jobTitle').innerHTML = `${esc(jobName(job))}<small>${esc(KB.products[job.product].title)}${job.product === 'moon' && job.role === 'parent' ? ' · для родителя' : ''}${job.product === 'natal' ? (job.mode === 'ext' ? ' · расширенный' : ' · базовый') : ''} · ${new Date(job.created).toLocaleDateString('ru-RU')}</small>`;
    renderData(); renderSteps(); renderManual();
    $('#mdEdit').value = job.text || '';
    renderChecks(); renderVoice();
    segSet($('#palSeg'), job.palette || 'women');
    jobTab(tab || (job.text ? 'text' : 'gen'));
    showTab('work');
  }
  function save() { if (!JOB) return; JOB.updated = Date.now(); DB.put(JOB).catch(() => toast('Не удалось сохранить в архив')); }
  $('#btnBackToForm').onclick = () => { $('#workForm').hidden = false; $('#workJob').hidden = true; window.scrollTo(0, 0); };
  function jobTab(t) {
    segSet($('#jobTabs'), t);
    $$('#workJob .jt').forEach(x => x.hidden = x.id !== 'jt-' + t);
    if (t === 'check') renderChecks();
  }
  segInit($('#jobTabs'), v => jobTab(v));

  function renderData() {
    const j = JOB; const s = j.data.summary || [];
    const warn = s.filter(x => x && x.tzNote).map(x => `<div class="warnbox">${esc(x.tzNote)}</div>`).join('');
    $('#dataCard').innerHTML = `<h2>Расчёт готов</h2>
      ${s.map((x, i) => x ? `<div class="sum"><b>${esc(j.persons[i] && j.persons[i].name || '')}</b>: ${x.lines.map(esc).join('; ')}. Пояс на дату рождения UTC${x.offset >= 0 ? '+' : '−'}${Math.abs(x.offset) / 60}.${j.persons[i] && j.persons[i].now ? ` Живёт: ${esc(j.persons[i].now.cityText.split(',')[0])}${j.persons[i].sinceY && !sameNow(j.persons[i]) ? ' с ' + (j.persons[i].sinceM ? String(j.persons[i].sinceM).padStart(2, '0') + '.' : '') + j.persons[i].sinceY : ''}, даты по местному времени.` : ''}</div>` : '').join('')}
      ${warn}
      <details><summary class="linkbtn">Показать блок расчёта</summary><pre class="data">${esc(j.data.text)}</pre><button class="btn ghost small" id="btnCopyData">Скопировать блок</button></details>`;
    const b = $('#btnCopyData'); if (b) b.onclick = () => copy(JOB.data.text);
  }
  function renderSteps() {
    const P = KB.products[JOB.product];
    $('#steps').innerHTML = P.steps.map(s => {
      const done = s.internal ? !!JOB.plan : !!JOB.parts[s.id];
      return `<div class="st ${done ? 'done' : ''}" data-s="${s.id}"><span class="ic">${done ? '✓' : ''}</span><span>${esc(s.title)}<span class="sub">${done ? 'готово' : 'ждёт'}</span></span></div>`;
    }).join('') + `<div class="st ${JOB.text ? 'done' : ''}" data-s="final"><span class="ic">${JOB.text ? '✓' : ''}</span><span>Сборка и проверка<span class="sub">${JOB.text ? 'готово' : 'ждёт'}</span></span></div>`;
    const all = !!JOB.text;
    $('#btnGen').textContent = all ? 'Открыть текст' : (Object.keys(JOB.parts).length || JOB.plan ? 'Продолжить' : 'Написать разбор');
    $('#btnRegen').hidden = !all && !Object.keys(JOB.parts).length;
  }
  function stepState(id, st, info) {
    const el = document.querySelector(`#steps .st[data-s="${id}"]`); if (!el) return;
    el.className = 'st ' + st; el.querySelector('.ic').textContent = st === 'done' ? '✓' : st === 'err' ? '!' : '';
    el.querySelector('.sub').textContent = info || '';
  }
  let busy = false, wakeLock = null, wasHidden = false, resumeId = null;
  async function keepAwake() { try { if (navigator.wakeLock && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; } }
  function letSleep() { try { wakeLock && wakeLock.release(); } catch (e) { } wakeLock = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (busy) wasHidden = true; return; }
    if (busy) keepAwake();
    // разбор прервался, пока телефон был заблокирован: продолжаем сами
    if (!busy && resumeId && JOB && JOB.id === resumeId && !JOB.text) { resumeId = null; toast('Продолжаю разбор с последнего готового шага'); setTimeout(() => $('#btnGen').click(), 600); }
  });
  $('#btnGen').onclick = async () => {
    if (JOB.text) { jobTab('text'); return; }
    if (busy) return; busy = true; wasHidden = false; resumeId = null;
    const btn = $('#btnGen'); btn.disabled = true; $('#btnRegen').hidden = true;
    const st = $('#genStatus'); st.className = 'status'; st.textContent = 'Начинаю. Экран не погаснет сам. Если позвонят или телефон заблокируется, разбор продолжится, когда вы вернётесь на сайт.';
    JOB.running = true; save(); keepAwake();
    try {
      await Pipeline.generate(JOB, { status: t => st.textContent = 'Пишет: ' + t, step: stepState, save });
      stepState('final', 'done', 'готово');
      JOB.running = false;
      $('#mdEdit').value = JOB.text; save();
      st.textContent = 'Готово. Проверьте текст и оформите PDF.';
      renderChecks(); jobTab(JOB.checks && JOB.checks.errors.length ? 'check' : 'text');
      toast('Разбор готов');
    } catch (e) {
      const net = e.kind === 'network' || e.kind === 'all' || /связ|network|load failed/i.test(e.message);
      if ((wasHidden || document.hidden) && net) { resumeId = JOB.id; st.className = 'status'; st.textContent = 'Пауза: телефон был заблокирован. Разбор продолжится сам, когда вы вернётесь на сайт.'; if (!document.hidden) { resumeId = null; setTimeout(() => $('#btnGen').click(), 1500); } }
      else { JOB.running = false; save(); st.className = 'status err'; st.textContent = e.message + '\n\nМожно нажать «Продолжить» позже (готовые части сохранены) или сделать шаг вручную ниже.'; }
    } finally { busy = false; btn.disabled = false; letSleep(); renderSteps(); }
  };
  $('#btnRegen').onclick = () => { if (!confirm('Переписать разбор заново? Текущий текст будет удалён.')) return; JOB.parts = {}; JOB.plan = ''; JOB.text = ''; JOB.checks = null; JOB.models = {}; save(); renderSteps(); $('#btnGen').click(); };

  // ручной режим
  function renderManual() {
    const P = KB.products[JOB.product];
    $('#manualSteps').innerHTML = P.steps.map(s => `<div class="mstep" data-s="${s.id}"><b>${esc(s.title)}</b>
      <div class="btnrow"><button class="btn ghost small m-copy">Скопировать задание</button></div>
      <textarea rows="3" class="m-ans" placeholder="Вставьте сюда ответ чата">${esc(s.internal ? JOB.plan || '' : JOB.parts[s.id] || '')}</textarea>
      <button class="btn ghost small m-save">Сохранить ответ</button></div>`).join('') + '<button class="btn" id="btnAssemble">Собрать разбор из ответов</button>';
    $$('#manualSteps .mstep').forEach(el => {
      const s = P.steps.find(x => x.id === el.dataset.s);
      el.querySelector('.m-copy').onclick = () => copy(Pipeline.system(JOB) + '\n\n=====\n\n' + Pipeline.stepUser(JOB, s));
      el.querySelector('.m-save').onclick = () => { const v = el.querySelector('.m-ans').value.trim(); if (s.internal) JOB.plan = v; else JOB.parts[s.id] = v; save(); renderSteps(); toast('Ответ сохранён'); };
    });
    $('#btnAssemble').onclick = () => {
      const miss = P.steps.filter(s => !s.internal && !JOB.parts[s.id]); if (miss.length) { toast('Не хватает: ' + miss.map(s => s.title).join(', '), 4000); return; }
      JOB.text = Pipeline.assemble(JOB); JOB.checks = Pipeline.check(JOB.text, { data: JOB.data.text, product: JOB.product, final: true }); save(); $('#mdEdit').value = JOB.text; renderSteps(); jobTab('check');
    };
  }

  // текст
  $('#markupHelp').textContent = KB.markup.replace(/^РАЗМЕТКА ОТВЕТА \(обязательно\)\n/, '');
  $('#btnSaveText').onclick = () => { JOB.text = $('#mdEdit').value; JOB.checks = Pipeline.check(JOB.text, { data: JOB.data.text, product: JOB.product, final: true }); save(); toast('Сохранено'); };
  $('#btnCopyText').onclick = () => copy(Pipeline.clientText($('#mdEdit').value));
  $('#btnEdit').onclick = async () => {
    const rem = $('#remarks').value.trim(); if (!rem) { toast('Напишите замечание'); return; }
    JOB.text = $('#mdEdit').value;
    const st = $('#editStatus'); st.className = 'status'; st.textContent = 'Вношу правку…'; $('#btnEdit').disabled = true;
    const before = JOB.text;
    try { await Pipeline.edit(JOB, rem, { status: t => st.textContent = 'Пишет: ' + t }); JOB.prev = before; $('#mdEdit').value = JOB.text; save(); st.textContent = 'Правка внесена. Предыдущая версия сохранена: «Отменить правку».'; $('#remarks').value = ''; addUndo(); }
    catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnEdit').disabled = false; }
  };
  function addUndo() {
    if ($('#btnUndo')) return;
    const b = document.createElement('button'); b.className = 'btn ghost'; b.id = 'btnUndo'; b.textContent = 'Отменить правку';
    b.onclick = () => { if (!JOB.prev) return; JOB.text = JOB.prev; JOB.prev = null; $('#mdEdit').value = JOB.text; save(); b.remove(); toast('Вернула прежний текст'); };
    $('#editStatus').after(b);
  }

  // проверка
  function renderChecks() {
    const el = $('#checkList'); if (!JOB) return;
    if (!JOB.text) { el.innerHTML = '<p class="hint">Сначала нужен текст разбора.</p>'; return; }
    const c = JOB.checks || Pipeline.check(JOB.text, Pipeline.checkCtx(JOB, true));
    JOB.checks = c;
    const weak = Object.values(JOB.models || {}).filter(m => m.weak).map(m => m.label);
    const item = (x, cls) => `<div class="chk ${cls}"><b>${esc(x.title)}</b>${x.count > 1 ? ' · ' + x.count : ''}${x.samples && x.samples.length ? '<ul>' + x.samples.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>' : ''}</div>`;
    el.innerHTML = `<p class="hint">Объём текста: ${Math.round(c.chars / 1000)} тыс. знаков (около ${Math.round(c.chars / 1600) + 2} стр. в книге).</p>` +
      (weak.length ? `<div class="chk w"><b>Часть разбора написала облегчённая модель</b> (${esc([...new Set(weak)].join(', '))}): основная модель на сегодня исчерпала лимит. Такой текст обычно короче и слабее. Если разбор не срочный, лучше написать его заново завтра: «Создание» → «Переписать заново».</div>` : '') +
      (c.errors.length ? c.errors.map(x => item(x, 'e')).join('') : '<div class="chk ok"><b>Машинные проверки пройдены</b></div>') +
      c.warns.map(x => item(x, 'w')).join('') +
      '<p class="hint">Красное исправляется кнопкой ниже. Жёлтое стоит перечитать глазами. Смысл, противоречия и «откуда ты знаешь» машина не проверит: прочитайте текст целиком.</p>';
    $('#btnFixAll').hidden = !c.errors.length;
  }
  $('#btnRecheck').onclick = () => { JOB.text = $('#mdEdit').value || JOB.text; JOB.checks = null; renderChecks(); save(); };
  $('#btnFixAll').onclick = async () => {
    const st = $('#fixStatus'); st.className = 'status'; st.textContent = 'Исправляю…'; $('#btnFixAll').disabled = true;
    const before = JOB.text;
    try { const r = await Pipeline.fixAll(JOB, { status: t => st.textContent = 'Пишет: ' + t }); JOB.prev = before; $('#mdEdit').value = JOB.text; save(); renderChecks(); st.textContent = r.changed ? 'Готово. Осталось: ' + (JOB.checks.errors.length ? JOB.checks.errors.map(e => e.title).join(', ') + '. Можно нажать ещё раз или поправить вручную во вкладке «Текст».' : 'ничего') : 'Не нашлось, что исправить автоматически. Поправьте эти места вручную во вкладке «Текст».'; }
    catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnFixAll').disabled = false; }
  };

  // конспект
  function voiceHTML(t) {
    return String(t || '').split('\n').map(l => {
      const s = l.trim(); if (!s) return '';
      const hk = x => esc(x).replace(/\[\[(.+?)\]\]/g, '<span class="hk">$1</span>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      if (/^#+\s/.test(s)) return `<h4>${hk(s.replace(/^#+\s*/, ''))}</h4>`;
      if (/^_\s/.test(s)) return `<p class="cue">${hk(s.slice(2))}</p>`;
      if (/^-\s/.test(s)) return `<p>• ${hk(s.slice(2))}</p>`;
      return `<p>${hk(s)}</p>`;
    }).join('');
  }
  function renderVoice() {
    const has = !!(JOB && JOB.conspect);
    $('#voiceOut').innerHTML = has ? voiceHTML(JOB.conspect) : '';
    $('#voiceBtns').hidden = !has;
    $('#btnVoice').textContent = has ? 'Сделать заново' : (KB.products[JOB ? JOB.product : 'moon'].conspect === 'funnel' ? 'Сделать конспект для голосовых' : 'Сделать конспект для разговора');
  }
  $('#btnVoice').onclick = async () => {
    if (!JOB.text) { toast('Сначала нужен готовый разбор'); return; }
    const st = $('#voiceStatus'); st.className = 'status'; st.textContent = 'Пишу конспект…'; $('#btnVoice').disabled = true;
    try { await Pipeline.conspect(JOB, { status: t => st.textContent = 'Пишет: ' + t }); save(); renderVoice(); st.textContent = 'Готово. Выделенное розовым это крючки: их лучше сказать почти дословно.'; }
    catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnVoice').disabled = false; }
  };
  $('#btnCopyVoice').onclick = () => copy(JOB.conspect.replace(/\[\[(.+?)\]\]/g, '$1').replace(/^_\s*/gm, '(').replace(/^#+\s*/gm, ''));
  $('#btnPrintVoice').onclick = () => {
    let pv = $('#printVoice'); if (!pv) { pv = document.createElement('div'); pv.id = 'printVoice'; document.body.appendChild(pv); }
    pv.innerHTML = `<style>#printVoice{font-family:Georgia,serif;color:#222;background:#fff;padding:18mm 20mm;font-size:12pt;line-height:1.5}#printVoice h4{color:#0E8C82;font-size:14pt;margin:16pt 0 6pt}#printVoice .cue{color:#777;font-style:italic;font-size:10.5pt}#printVoice .hk{color:#B0287A;font-weight:bold}</style><h3 style="font-family:Georgia">${esc(jobName(JOB))}: конспект</h3>${voiceHTML(JOB.conspect)}`;
    document.body.classList.add('printvoice'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printvoice'), 800); }, 100);
  };

  // ---------- книга и PDF
  segInit($('#palSeg'), v => { JOB.palette = v; save(); });
  let PDF_FILE = null;
  function fmtBirth(p) { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(p.date || ''); if (!m) return ''; return `${+m[1]} ${MONTHS_G[+m[2] - 1]} ${m[3]} года${p.cityText ? ', ' + p.cityText.split(',')[0] : ''}.`; }
  async function openBook() {
    if (!JOB.text) { toast('Сначала нужен текст'); return; }
    JOB.text = $('#mdEdit').value || JOB.text;
    PDF_FILE = null;
    $('#bookView').hidden = false; document.body.style.overflow = 'hidden';
    $('#bookInfo').textContent = 'Собираю страницы…';
    const P = KB.products[JOB.product];
    let footSub = JOB.product === 'synastry' ? '' : fmtBirth(JOB.persons[0]);
    const sig = (/^@подпись:(.*)$/m.exec(JOB.text) || [])[1] || ''; if (footSub && /\d{4}/.test(sig)) footSub = '';
    const label = { moon: 'Код Луны', natal: 'Натальная карта', synastry: 'Совместимость', child: 'Детский разбор', money: 'Деньги' }[JOB.product];
    const book = $('#book'); $('#bookWrap').style.zoom = 1;
    const r = await Book.build(book, { markup: JOB.text, chart: JOB.data.json, chart2: JOB.product === 'synastry' ? JOB.data.json2 : null, cross: JOB.data.cross, palette: JOB.palette || 'women', focus: P.focus, label, footSub });
    $('#bookInfo').textContent = `${r.pages} стр.`;
    fitBook();
  }
  function fitBook() {
    const wrap = $('#bookWrap'); const pw = 793.7;
    const sc = Math.min(1, (window.innerWidth - 12) / pw);
    wrap.style.width = pw + 'px'; wrap.style.zoom = sc;
  }
  window.addEventListener('resize', () => { if (!$('#bookView').hidden) fitBook(); });
  $('#btnBook').onclick = openBook;
  $('#btnBookClose').onclick = () => { $('#bookView').hidden = true; document.body.style.overflow = ''; };
  $('#btnPrint').onclick = () => { const wrap = $('#bookWrap'); const z = wrap.style.zoom; wrap.style.zoom = 1; setTimeout(() => { window.print(); setTimeout(() => wrap.style.zoom = z, 500); }, 150); };
  function pdfName() { const t = { moon: 'Kod_Luny', natal: 'Natalnaya_karta', synastry: 'Sovmestimost', child: 'Detskiy_razbor', money: 'Dengi' }[JOB.product]; return `${t}_${translit(jobName(JOB))}.pdf`; }
  async function buildPdf() {
    if (!window.html2canvas || !window.jspdf) throw new Error('Модули PDF ещё загружаются, попробуйте через пару секунд');
    const ov = $('#bookOverlay'), ovt = $('#bookOvText'); ov.hidden = false;
    const wrap = $('#bookWrap'); const z = wrap.style.zoom; wrap.style.zoom = 1;
    try {
      await new Promise(r => setTimeout(r, 120));
      const pages = [].slice.call($('#book').querySelectorAll('.page'));
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const bg = Book.PALETTES[JOB.palette || 'women'].bg;
      for (let i = 0; i < pages.length; i++) {
        ovt.textContent = `Собираю PDF: страница ${i + 1} из ${pages.length}`;
        const cv = await window.html2canvas(pages[i], { scale: 2, backgroundColor: bg, useCORS: true, logging: false, windowWidth: 820, scrollX: 0, scrollY: -window.scrollY });
        const img = cv.toDataURL('image/jpeg', 0.88);
        if (i) pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        cv.width = cv.height = 0;
      }
      const blob = pdf.output('blob');
      PDF_FILE = new File([blob], pdfName(), { type: 'application/pdf' });
      return PDF_FILE;
    } finally { wrap.style.zoom = z; }
  }
  $('#btnShare').onclick = async () => {
    const ov = $('#bookOverlay'), ovt = $('#bookOvText');
    try {
      if (!PDF_FILE) {
        await buildPdf();
        ovt.innerHTML = `PDF готов (${Math.round(PDF_FILE.size / 1024 / 1024 * 10) / 10} МБ)<br><br><button class="btn pink" id="btnShareNow">Отправить или сохранить</button><button class="btn ghost" id="btnOvClose">Закрыть</button>`;
        $('#btnShareNow').onclick = sharePdf; $('#btnOvClose').onclick = () => ov.hidden = true;
        ov.querySelector('.spin').hidden = true;
        return;
      }
      sharePdf();
    } catch (e) { ov.hidden = false; ov.querySelector('.spin').hidden = true; ovt.innerHTML = esc(e.message) + '<br><br><button class="btn ghost" id="btnOvClose2">Закрыть</button>'; $('#btnOvClose2').onclick = () => { ov.hidden = true; ov.querySelector('.spin').hidden = false; }; }
  };
  async function sharePdf() {
    const ov = $('#bookOverlay');
    try {
      if (navigator.canShare && navigator.canShare({ files: [PDF_FILE] })) { await navigator.share({ files: [PDF_FILE], title: PDF_FILE.name }); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(PDF_FILE); a.download = PDF_FILE.name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) { if (e.name !== 'AbortError') toast('Не получилось: ' + e.message); }
    ov.hidden = true; ov.querySelector('.spin').hidden = false; $('#bookOvText').textContent = 'Готовлю PDF…';
  }

  // ---------- тексты
  function textTab(v) { segSet($('#textSeg'), v); $('#tx-dlg').hidden = v !== 'dlg'; $('#tx-post').hidden = v !== 'post'; $('#tx-plan').hidden = v !== 'plan'; if (v === 'dlg' && !$('#dlgList').hidden) renderDlgList(); }
  segInit($('#textSeg'), v => textTab(v));
  function shrink(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = rej;
      fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85).split(',')[1]); }; im.onerror = rej; im.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  const NOTE_H = /заметка|ошибки|что исправ/i;
  function splitBlocks(text) {
    const parts = String(text).split(/^###\s+/m).map(x => x.trim()).filter(Boolean);
    return parts.length > 1 || /^###/m.test(text) ? parts.map(p => { const i = p.indexOf('\n'); return { h: (i > 0 ? p.slice(0, i) : p).replace(/[:：]\s*$/, '').trim(), t: i > 0 ? p.slice(i + 1).trim() : '' }; }) : [{ h: '', t: String(text).trim() }];
  }
  function outCards(text, el, extra) {
    const blocks = splitBlocks(text).map(b => (NOTE_H.test(b.h) || /^оригинал/i.test(b.h)) ? b : { h: b.h, t: Pipeline.autoFix(b.t) });
    el.innerHTML = (extra || '') + blocks.map((b, k) => /^оригинал/i.test(b.h)
      ? `<details class="out note"><summary class="linkbtn">Оригинал (расшифровка)</summary><div class="txt">${esc(b.t)}</div></details>`
      : `<div class="out${NOTE_H.test(b.h) ? ' note' : ''}">${b.h ? `<h4>${esc(b.h)}</h4>` : ''}<div class="txt">${esc(b.t)}</div>${NOTE_H.test(b.h) ? '' : `<button class="btn ghost small" data-k="${k}">Скопировать</button>`}</div>`).join('');
    el.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => copy(blocks[+b.dataset.k].t));
    return blocks;
  }
  // скриншоты в текст: короткий запрос к любой модели со зрением (облегчённые идут первыми), дальше всё работает с текстом
  const OCR_SYS = `Ты переносишь текст со скриншотов соцсетей (Threads, Instagram, Telegram) в обычный текст. Пиши дословно: те же слова, знаки, эмодзи и переносы строк, без исправлений, без пересказа и без своих комментариев. Не переписывай элементы интерфейса: время, число лайков и ответов, кнопки, «Ответить», «Перевести», «Ещё».
Изображения разбиты на группы, названия групп даны в задании. Для каждой группы напиши раздел «### НАЗВАНИЕ ГРУППЫ» и под ним текст. Если пост или комментарий продолжается на следующем скриншоте, склей его в один текст без повторов.
Ник автора пиши в начале строкой «ник: текст». Комментарии разных людей пиши отдельными абзацами в том же виде. Если в группе сказано переписать только последнее сообщение, перепиши только его.`;
  async function shotsToText(groups, st) {
    const gs = groups.filter(g => g.images && g.images.length);
    if (!gs.length) return {};
    let n = 0; const images = [];
    const plan = gs.map(g => { const a = n + 1; n += g.images.length; g.images.forEach(im => images.push(im)); return `Изображения ${a}${n > a ? '–' + n : ''}: группа «${g.label}»${g.note ? ' (' + g.note + ')' : ''}.`; }).join('\n');
    st.textContent = 'Читаю скриншоты…';
    let r;
    try { r = await AI.run({ task: 'ocr', system: OCR_SYS, user: plan + '\n\nНапиши разделы: ' + gs.map(g => '«### ' + g.label + '»').join(', ') + '.', images, maxTokens: 4000, temperature: 0, onStatus: t => st.textContent = 'Читаю скриншоты: ' + t }); }
    catch (e) { const er = new Error('Не получилось прочитать скриншот: ' + e.message.split('\n')[0] + '\n\nМожно обойтись без скриншота: откройте его в «Фото», нажмите и подержите на тексте, «Выбрать всё» → «Скопировать» и вставьте текст в поле ниже скрина.'); er.kind = e.kind; throw er; }
    const out = {}; const txt = String(r.text || '');
    gs.forEach((g, i) => {
      const re = new RegExp('^\\s*#{2,4}\\s*' + g.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n([\\s\\S]*?)(?=^\\s*#{2,4}\\s|$(?![\\s\\S]))', 'mi');
      const m = re.exec(txt); out[g.key] = m ? m[1].trim() : (gs.length === 1 ? txt.replace(/^\s*#{2,4}[^\n]*\n/, '').trim() : '');
    });
    return out;
  }
  // совпадения с чужим текстом: последовательности от шести слов подряд
  function overlaps(orig, text, n) {
    n = n || 6;
    const w = x => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const A = w(orig), B = w(text); if (A.length < n) return [];
    const set = new Set(); for (let i = 0; i + n <= A.length; i++) set.add(A.slice(i, i + n).join(' '));
    const hits = []; let i = 0;
    while (i + n <= B.length) { if (set.has(B.slice(i, i + n).join(' '))) { let j = i + n; while (j < B.length && set.has(B.slice(j - n + 1, j + 1).join(' '))) j++; hits.push(B.slice(i, j).join(' ')); i = j; } else i++; }
    return hits;
  }

  // ---------- диалоги: комментарий к посту и переписка по шагам
  let DLG = null; const DIMG = { post: [], others: [], mypost: [], reply: [] };
  const isNo = t => !t || /^нет\.?$/i.test(String(t).trim());
  async function dlgAll() { let a = []; try { a = (await DB.all()) || []; } catch (e) { } return a.filter(x => x && x.kind === 'dlg').sort((x, y) => y.updated - x.updated); }
  function dlgSave() { if (!DLG) return; DLG.updated = Date.now(); DB.put(DLG).catch(() => toast('Не удалось сохранить диалог')); }
  function dlgTitle(d) { const t = String(!isNo(d.post) ? d.post : (d.turns[0] && d.turns[0].text) || '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, 70) + (t.length > 70 ? '…' : '') : 'Новый диалог'; }
  async function renderDlgList() {
    const all = await dlgAll();
    $('#dlgItems').innerHTML = all.length ? all.map(d => `<div class="dlgi" data-id="${d.id}"><div class="t"><b>${esc(dlgTitle(d))}</b><small>${d.mode === 'other' ? 'Чужой пост' : 'Мой пост'} · реплик: ${d.turns.length}${d.pending ? ' · есть варианты' : ''} · ${new Date(d.updated).toLocaleDateString('ru-RU')}</small></div><button class="btn small d-open">Открыть</button><button class="btn ghost small d-del">✕</button></div>`).join('') : '<p class="hint">Диалогов пока нет.</p>';
    $$('#dlgItems .dlgi').forEach(el => {
      el.querySelector('.d-open').onclick = async () => { const d = await DB.get(el.dataset.id); if (d) openDlg(d); };
      el.querySelector('.d-del').onclick = async () => { if (!confirm('Удалить диалог?')) return; await DB.del(el.dataset.id); renderDlgList(); };
    });
  }
  function newDlg(mode) { openDlg({ id: 'dlg_' + uid(), kind: 'dlg', mode, created: Date.now(), updated: Date.now(), post: '', others: '', birth: '', questions: '', chart: '', chartNote: '', turns: [], pending: null }); }
  $('#dlgNewOther').onclick = () => newDlg('other');
  $('#dlgNewMine').onclick = () => newDlg('mine');
  $('#dlgBack').onclick = () => { $('#dlgView').hidden = true; $('#dlgList').hidden = false; renderDlgList(); window.scrollTo(0, 0); };
  function clearDlgInputs() { Object.keys(DIMG).forEach(k => { DIMG[k] = []; }); $$('#dlgForm .thumbs').forEach(t => { t.innerHTML = ''; }); ['#dlgPostText', '#dlgMyPost', '#dlgReplyText', '#dlgNote'].forEach(x => { $(x).value = ''; }); }
  function openDlg(d) { DLG = d; clearDlgInputs(); $('#dlgList').hidden = true; $('#dlgView').hidden = false; $('#dlgStatus').textContent = ''; $('#dlgStatus').className = 'status'; renderDlg(); window.scrollTo(0, 0); }
  $$('#dlgForm .dlg-shot').forEach(inp => { inp.onchange = async e => {
    const k = inp.dataset.k; const out = [];
    for (const f of [].slice.call(e.target.files || []).slice(0, 6)) { try { out.push({ mime: 'image/jpeg', data: await shrink(f) }); } catch (err) { toast('Не получилось открыть картинку'); } }
    DIMG[k] = out; document.querySelector(`#dlgForm .thumbs[data-k="${k}"]`).innerHTML = out.map(im => `<img src="data:image/jpeg;base64,${im.data}">`).join(''); e.target.value = '';
  }; });
  const firstOf = d => !d.post && !d.turns.length;
  function renderDlg() {
    const d = DLG; let h = '';
    if (!isNo(d.post)) h += `<div class="b post"><small>${d.mode === 'other' ? 'Пост' : 'Мой пост'}</small>${esc(d.post)}</div>`;
    if (!isNo(d.others)) h += `<details><summary class="linkbtn">Что ответили другие астрологи</summary><div class="b post">${esc(d.others)}</div></details>`;
    if (d.chart) h += `<p class="hint">Карта собеседника посчитана по данным из поста: ${esc(d.chartNote)}.</p>`;
    d.turns.forEach((t, i) => { h += `<div class="b ${t.who}"><small>${t.who === 'me' ? 'Я' : 'Собеседник'}${i === d.turns.length - 1 && !d.pending ? '<button class="del" data-del="1">убрать</button>' : ''}</small>${esc(t.text)}</div>`; });
    $('#dlgFeed').innerHTML = h ? `<div class="feed">${h}</div>` : '';
    const del = $('#dlgFeed [data-del]'); if (del) del.onclick = () => { if (!confirm('Убрать последнюю реплику?')) return; d.turns.pop(); dlgSave(); renderDlg(); };
    const first = firstOf(d);
    $('#dlgFormFirstOther').hidden = !(first && d.mode === 'other');
    $('#dlgFormFirstMine').hidden = !(first && d.mode === 'mine');
    $('#dlgFormReply').hidden = first && d.mode === 'other';
    $('#dlgReplyLbl').textContent = first ? 'Комментарий человека: скрин или текст' : 'Ответ собеседника: скрин или текст';
    $('#dlgAsk').textContent = first && d.mode === 'other' ? 'Написать комментарий' : 'Ответить';
    $('#dlgForm').hidden = !!d.pending;
    renderDlgPending();
  }
  function renderDlgPending() {
    const p = DLG.pending, el = $('#dlgOut');
    if (!p) { el.innerHTML = ''; return; }
    const ctxTxt = [DLG.post, DLG.turns.map(t => t.text).join('\n')].join('\n');
    const iss = []; p.vars.forEach(v => { if (!v.note) v.parts.forEach(t => Pipeline.dignityIssues(t, ctxTxt).forEach(x => iss.push(v.title + ': ' + x))); });
    el.innerHTML = (iss.length ? `<div class="warnbox">Сайт нашёл астрологическую ошибку, этот вариант не отправляйте как есть: ${iss.slice(0, 3).map(esc).join('; ')}. Можно нажать «Другие варианты».</div>` : '') + p.vars.map((v, k) => `<div class="out var${v.note ? ' note' : ''}" data-k="${k}"><h4>${esc(v.title)}</h4>${v.parts.map((t, j) => `<div class="part"><div class="txt">${esc(t)}</div>${v.note ? '' : `<div class="btnrow"><button class="btn ghost small" data-copy="${j}">Скопировать${v.parts.length > 1 ? ' ' + (j + 1) + '/' + v.parts.length : ''}</button></div><span class="cnt${t.length > 500 ? ' over' : ''}">${t.length} из 500 знаков${t.length > 500 ? ': длиннее лимита Threads, сократите' : ''}</span>`}</div>`).join('')}${v.note ? '' : `<div class="btnrow"><button class="btn small" data-sent="1">Отправила этот</button></div><div class="edit" hidden><textarea rows="6"></textarea><p class="hint">Если меняли текст перед отправкой, поправьте здесь: модель будет помнить именно то, что вы написали.</p><button class="btn primary small" data-save="1">Сохранить в диалог</button></div>`}</div>`).join('') +
      `<p class="hint">${esc(p.label || '')}</p><div class="btnrow"><button class="btn ghost" id="dlgRegen">Другие варианты</button><button class="btn ghost" id="dlgOwn">Свой текст</button></div><div class="out" id="dlgOwnBox" hidden><textarea rows="4" placeholder="Вставьте то, что вы отправили"></textarea><button class="btn primary small" id="dlgOwnSave">Сохранить в диалог</button></div>`;
    $$('#dlgOut .var').forEach(card => {
      const v = p.vars[+card.dataset.k];
      card.querySelectorAll('[data-copy]').forEach(b => { b.onclick = () => copy(v.parts[+b.dataset.copy]); });
      const sent = card.querySelector('[data-sent]'); if (!sent) return;
      sent.onclick = () => { const ed = card.querySelector('.edit'); ed.hidden = false; ed.querySelector('textarea').value = v.parts.join('\n\n'); sent.parentNode.hidden = true; };
      card.querySelector('[data-save]').onclick = () => saveMine(card.querySelector('.edit textarea').value);
    });
    $('#dlgRegen').onclick = () => dlgAsk(true);
    $('#dlgOwn').onclick = () => { $('#dlgOwnBox').hidden = false; };
    $('#dlgOwnSave').onclick = () => saveMine($('#dlgOwnBox textarea').value);
  }
  function saveMine(t) {
    t = String(t || '').trim(); if (!t) { toast('Текст пустой'); return; }
    DLG.turns.push({ who: 'me', text: t, ts: Date.now() }); DLG.pending = null; dlgSave(); renderDlg();
    toast('Сохранено. Когда человек ответит, пришлите его ответ', 3500);
  }
  function parseDlg(text) {
    const blocks = []; let cur = null;
    String(text || '').replace(/\r/g, '').split('\n').forEach(l => {
      const m = /^\s*#{2,4}\s*(.+?)\s*$/.exec(l);
      if (m) { cur = { title: m[1].replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim(), body: [] }; blocks.push(cur); return; }
      if (cur) cur.body.push(l);
    });
    const get = re => { const b = blocks.find(x => re.test(x.title)); return b ? b.body.join('\n').trim() : ''; };
    const vars = []; let det = null;
    blocks.forEach(b => {
      const t = b.title.toLowerCase(), body = b.body.join('\n').trim(); if (!body) return;
      if (/^коротко/.test(t)) vars.push({ title: 'Коротко', parts: [body] });
      else if (/^подробнее/.test(t)) { if (!det) { det = { title: 'Подробнее', parts: [] }; vars.push(det); } body.split(/^\s*\(?\d\s*\/\s*\d\)?\s*$/m).map(x => x.trim()).filter(Boolean).forEach(x => det.parts.push(x)); }
      else if (/^с приглашением/.test(t)) vars.push({ title: 'С приглашением', parts: [body] });
      else if (/^заметка/.test(t)) vars.push({ title: 'Заметка для тебя (не для публикации)', parts: [body], note: true });
    });
    if (det && det.parts.length > 1) det.title = `Подробнее: цепочка из ${det.parts.length} комментариев`;
    vars.forEach(v => { if (!v.note) v.parts = v.parts.map(t => Pipeline.autoFix(t)); });
    return { post: get(/^пост/i), others: get(/^комментарии других/i), birth: get(/^данные рождения/i), questions: get(/^вопросы/i), reply: get(/^новый ответ/i), vars };
  }
  function compactChart(t) {
    return String(t).split('\n\n').filter(b => /^(=== БЛОК|ПОЛОЖЕНИЯ|КУСПИДЫ|АСПЕКТЫ|ЛУНА ПОДРОБНО|ТРАНЗИТЫ|СЕЙЧАС И ВПЕРЕДИ|РЕТРОГРАДНОСТИ|Дата расчёта)/.test(b.trim()))
      .map(b => /^СЕЙЧАС И ВПЕРЕДИ/.test(b.trim()) ? b.split('\n').slice(0, 26).join('\n') : b).join('\n\n');
  }
  async function dlgChart(raw) {
    const dm = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(raw || ''); if (!dm) return null;
    const d = +dm[1], mo = +dm[2], y = +dm[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) return null;
    const rest = raw.replace(dm[0], ''); const tm = /(\d{1,2})[:.](\d{2})/.exec(rest);
    const place = cleanPlace(rest.replace(tm ? tm[0] : '', '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').replace(/^(в|г\.?|город)\s+/i, '').trim());
    let geo = null;
    if (place.length >= 2) {
      const loc = citySearch(place).filter(c => norm(c[0]) === norm(place));
      if (loc.length) geo = { lat: loc[0][2], lon: loc[0][3], tz: loc[0][4], name: loc[0][0] };
      else { try { const g = await geoSearch(place); if (g.length) geo = g[0]; } catch (e) { } }
    }
    const noTime = !tm || !geo || +tm[1] > 23 || +tm[2] > 59;
    const input = { name: 'Собеседник', y, mo, d, h: noTime ? 12 : +tm[1], mi: noTime ? 0 : +tm[2], tz: geo ? geo.tz : 'Europe/Moscow', lat: geo ? +geo.lat : 55.75, lon: geo ? +geo.lon : 37.62, place: geo ? geo.name : '', manualOffset: null, noTime };
    const r = await W('natal', { input, opt: { scope: 'short', private: true } });
    return { text: compactChart(r.text), note: !noTime ? 'с временем и местом рождения' : tm ? 'место не нашлось, поэтому без домов и Асцендента' : 'время рождения не указано, поэтому без домов и Асцендента' };
  }
  function dlgContext(d, hist) {
    const L = [`РЕЖИМ: ${d.mode === 'other' ? 'комментарий к чужому посту' : 'ответ под моим постом'}`];
    if (!isNo(d.post)) L.push('', d.mode === 'other' ? 'ПОСТ ЧЕЛОВЕКА:' : 'МОЙ ПОСТ:', d.post);
    if (!isNo(d.others)) L.push('', 'ЧТО УЖЕ ОТВЕТИЛИ ДРУГИЕ АСТРОЛОГИ:', d.others);
    if (!isNo(d.questions)) L.push('', 'ВОПРОСЫ ЧЕЛОВЕКА (из поста):', d.questions);
    if (d.chart) L.push('', `КАРТА ЧЕЛОВЕКА (посчитана программой по данным из поста, ${d.chartNote}):`, d.chart);
    if (hist.length) L.push('', 'ПЕРЕПИСКА ДО ЭТОГО (по порядку):', hist.map(t => (t.who === 'me' ? 'Я: ' : 'Собеседник: ') + t.text).join('\n\n'));
    const facts = Pipeline.placementFacts([d.mode === 'other' ? d.post : '', d.turns.filter(t => t.who === 'them').map(t => t.text).join('\n'), d.extraFacts || ''].join('\n'));
    if (facts) L.push('', 'СПРАВКА ПО ПОЛОЖЕНИЯМ СОБЕСЕДНИКА (посчитано программой по его словам, это верно, опирайся на это и не противоречь):', facts);
    return L.join('\n');
  }
  async function dlgAsk(regen) {
    const d = DLG, st = $('#dlgStatus'), btn = $('#dlgAsk');
    const first = firstOf(d), note = $('#dlgNote').value.trim();
    let images = [], input = '', task = '', hist = d.turns, typed = '';
    if (regen) {
      const last = d.turns[d.turns.length - 1];
      if (last && last.who === 'them') { hist = d.turns.slice(0, -1); input = 'ПОСЛЕДНЕЕ СООБЩЕНИЕ СОБЕСЕДНИКА:\n' + last.text; task = 'Дай другие варианты ответа на последнее сообщение собеседника, не повторяя прошлые. Разделы «Пост», «Новый ответ» и прочие не пиши: только варианты.'; }
      else { task = 'Дай другие варианты комментария к посту, не повторяя прошлые. Только варианты.'; }
    } else if (first && d.mode === 'other') {
      const pt = $('#dlgPostText').value.trim();
      if (!DIMG.post.length && !pt) { toast('Прикрепите скрин поста или вставьте его текст'); return; }
      images = DIMG.post.concat(DIMG.others);
      input = [DIMG.post.length ? `Изображения 1–${DIMG.post.length}: скриншоты поста.` : '', DIMG.others.length ? `Изображения ${DIMG.post.length + 1}–${DIMG.post.length + DIMG.others.length}: скриншоты комментариев других астрологов.` : 'Скриншотов комментариев других астрологов нет.', pt ? 'ТЕКСТ ПОСТА:\n' + pt : ''].filter(Boolean).join('\n');
      task = 'Первый ответ диалога: разметка для первого ответа, затем варианты комментария к посту.';
    } else {
      typed = $('#dlgReplyText').value.trim(); const mp = $('#dlgMyPost').value.trim();
      if (!DIMG.reply.length && !typed) { toast('Прикрепите скрин ответа или вставьте его текст'); return; }
      const mine = first ? DIMG.mypost : [];
      images = mine.concat(DIMG.reply);
      input = [mine.length ? `Изображения 1–${mine.length}: скриншоты моего поста.` : '', first && mp ? 'МОЙ ПОСТ:\n' + mp : '', DIMG.reply.length ? `Изображения ${mine.length + 1}–${mine.length + DIMG.reply.length}: скриншоты переписки, ответить нужно на последнее сообщение, адресованное мне.` : '', typed ? 'НОВЫЙ ОТВЕТ СОБЕСЕДНИКА:\n' + typed : ''].filter(Boolean).join('\n');
      task = first ? 'Первый ответ диалога в режиме «ответ под моим постом»: разметка для первого ответа (с разделом «Новый ответ»), затем варианты.' : 'Следующий ответ диалога: раздел «Новый ответ», затем варианты.';
    }
    // скриншоты сначала переводим в текст, ответ пишет текстовая модель
    if (images.length) {
      const groups = [];
      if (first && d.mode === 'other') { groups.push({ key: 'post', label: 'ПОСТ', images: DIMG.post }); groups.push({ key: 'others', label: 'КОММЕНТАРИИ ДРУГИХ АСТРОЛОГОВ', images: DIMG.others, note: 'каждый комментарий отдельным абзацем «ник: текст»' }); }
      else {
        const nick = LS.get('my_nick', '');
        const me = nick ? `мои сообщения подписаны ником ${nick}` : 'мои сообщения это сообщения автора поста';
        if (first) groups.push({ key: 'mypost', label: 'МОЙ ПОСТ', images: DIMG.mypost });
        groups.push({ key: 'reply', label: 'ОТВЕТ СОБЕСЕДНИКА', images: DIMG.reply, note: first
          ? `на скриншоте комментарии под моим постом (${me}): перепиши все сообщения собеседника по порядку, каждое отдельной строкой «ник: текст», мои сообщения пропусти`
          : `на скриншоте переписка (${me}): перепиши все сообщения собеседника, которые идут после моего последнего сообщения, по порядку, каждое строкой «ник: текст»; если моих сообщений не видно, перепиши все сообщения собеседника` });
      }
      btn.disabled = true;
      let o;
      try { o = await shotsToText(groups, st); } catch (e) { st.className = 'status err'; st.textContent = e.message; btn.disabled = false; return; }
      images = [];
      if (first && d.mode === 'other') {
        const pt = $('#dlgPostText').value.trim();
        input = [(o.post || pt) ? 'ТЕКСТ ПОСТА:\n' + [o.post, pt].filter(Boolean).join('\n\n') : '', o.others ? 'КОММЕНТАРИИ ДРУГИХ АСТРОЛОГОВ (текст со скриншотов):\n' + o.others : 'Комментариев других астрологов нет.'].filter(Boolean).join('\n\n');
      } else {
        typed = typed || o.reply || '';
        const mp = [o.mypost, $('#dlgMyPost').value.trim()].filter(Boolean).join('\n\n');
        input = [first && mp ? 'МОЙ ПОСТ:\n' + mp : '', typed ? 'НОВЫЙ ОТВЕТ СОБЕСЕДНИКА:\n' + typed : ''].filter(Boolean).join('\n\n');
      }
      if (!input) { st.className = 'status err'; st.textContent = 'Не получилось прочитать текст со скриншота. Вставьте текст в поле под скрином.'; btn.disabled = false; return; }
    }
    const sell = LS.get('cp_sell', '') || SELL_DEF;
    const build = () => `${dlgContext(Object.assign({}, d, { extraFacts: input }), hist)}\n\n${input}${note ? '\n\nЧТО УЧЕСТЬ: ' + note : ''}\n\nКУДА ВЕСТИ: ${sell}\nСегодня ${new Date().toLocaleDateString('ru-RU')}.\n\nЗАДАНИЕ: ${task}`;
    btn.disabled = true; st.className = 'status'; st.textContent = images.length ? 'Читаю скриншоты…' : 'Думаю…';
    try {
      let r = await AI.run({ task: images.length ? 'vision' : 'post', system: KB.dialog, user: build(), images, maxTokens: 6000, temperature: 0.7, onStatus: t => st.textContent = 'Пишет: ' + t });
      let p = parseDlg(r.text);
      if (!p.vars.some(v => !v.note)) throw new Error('Модель ответила не по формату. Нажмите ещё раз.');
      if (!regen) {
        if (first) {
          d.post = p.post || $('#dlgPostText').value.trim() || $('#dlgMyPost').value.trim() || 'нет';
          d.others = p.others || 'нет'; d.birth = p.birth || ''; d.questions = p.questions || '';
        }
        if (!(first && d.mode === 'other')) d.turns.push({ who: 'them', text: typed || p.reply || '(не удалось прочитать ответ со скриншота)', ts: Date.now() });
      }
      d.pending = { vars: p.vars, label: 'Написала модель: ' + r.label };
      dlgSave(); clearDlgInputs(); renderDlg(); st.textContent = 'Готово · ' + r.label;
      // в посте есть дата рождения: считаем карту и уточняем ответ по ней
      if (first && !regen && !d.chart && !isNo(d.birth) && /\d{1,2}\.\d{1,2}\.\d{4}/.test(d.birth)) {
        st.textContent = 'В посте есть дата рождения: считаю карту и уточняю ответ…';
        try {
          const ch = await dlgChart(d.birth);
          if (ch) {
            d.chart = ch.text; d.chartNote = ch.note;
            const last = d.turns[d.turns.length - 1];
            hist = last && last.who === 'them' ? d.turns.slice(0, -1) : d.turns;
            input = last && last.who === 'them' ? 'ПОСЛЕДНЕЕ СООБЩЕНИЕ СОБЕСЕДНИКА:\n' + last.text : '';
            task = 'Напиши варианты заново, теперь опираясь на посчитанную карту человека. Разделы «Пост», «Новый ответ» и прочие не пиши: только варианты.';
            r = await AI.run({ task: 'post', system: KB.dialog, user: build(), maxTokens: 6000, temperature: 0.7, onStatus: t => st.textContent = 'Уточняю по карте: ' + t });
            p = parseDlg(r.text);
            if (p.vars.some(v => !v.note)) d.pending = { vars: p.vars, label: 'Написала модель: ' + r.label + ' · по посчитанной карте' };
            dlgSave(); renderDlg(); st.textContent = 'Готово: ответ уточнён по карте · ' + r.label;
          } else st.textContent = 'Готово · дату рождения из поста посчитать не получилось';
        } catch (e) { st.textContent = 'Готово · карту по данным из поста посчитать не получилось'; }
      }
    } catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { btn.disabled = false; }
  }
  $('#dlgAsk').onclick = () => dlgAsk(false);
  segInit($('#postFmt'));
  let PIMGS = [];
  function setPostImgs(list) {
    PIMGS = list; $('#pThumbs').innerHTML = list.map(im => `<img src="data:image/jpeg;base64,${im.data}">`).join('');
    $('#pShotClear').hidden = !list.length; $('#pShotHint').hidden = !list.length;
  }
  $('#pShot').onchange = async e => {
    const out = [];
    for (const f of [].slice.call(e.target.files || []).slice(0, 4)) { try { out.push({ mime: 'image/jpeg', data: await shrink(f) }); } catch (err) { toast('Не получилось открыть картинку'); } }
    setPostImgs(out); e.target.value = '';
  };
  $('#pShotClear').onclick = () => setPostImgs([]);
  $('#pSky').onchange = () => { $('#pSkyRange').hidden = !$('#pSky').checked; };
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('#pFrom').value = iso(new Date()); $('#pTo').value = iso(new Date(Date.now() + 14 * 86400000));
  // режимы: новый пост, по чужому посту, улучшить свой
  let OIMGS = [], otherSeen = false;
  segInit($('#pMyLevel'));
  function postMode() { return segGet($('#postMode')) || 'new'; }
  function setPostMode(v) {
    segSet($('#postMode'), v);
    $$('#tx-post .pm-new').forEach(x => { x.hidden = v !== 'new'; });
    $$('#tx-post .pm-other').forEach(x => { x.hidden = v !== 'other'; });
    $$('#tx-post .pm-mine').forEach(x => { x.hidden = v !== 'mine'; });
    $$('#tx-post .pm-fmt').forEach(x => { x.hidden = v === 'mine'; });
    $('#postFmt [data-v="like"]').textContent = v === 'other' ? 'Как в оригинале' : 'Как в примере';
    $('#pDetailsLbl').innerHTML = (v === 'new' ? 'Что важно сказать' : v === 'other' ? 'Что добавить от себя' : 'Что учесть') + ' <span class="opt">необязательно</span>';
    $('#btnPost').textContent = v === 'new' ? 'Написать пост' : v === 'other' ? 'Написать свой пост' : 'Улучшить пост';
    if (v === 'other' && !otherSeen) { otherSeen = true; segSet($('#postFmt'), 'like'); $('#pSky').checked = true; $('#pSkyRange').hidden = false; }
    $('#pOut').innerHTML = ''; $('#pStatus').textContent = '';
  }
  segInit($('#postMode'), v => setPostMode(v));
  $('#pOtherShot').onchange = async e => {
    const out = [];
    for (const f of [].slice.call(e.target.files || []).slice(0, 6)) { try { out.push({ mime: 'image/jpeg', data: await shrink(f) }); } catch (err) { toast('Не получилось открыть картинку'); } }
    OIMGS = out; $('#pOtherThumbs').innerHTML = out.map(im => `<img src="data:image/jpeg;base64,${im.data}">`).join(''); e.target.value = '';
  };
  async function skyBlock() {
    if (!$('#pSky').checked) return '';
    const a = new Date($('#pFrom').value + 'T00:00:00+03:00').getTime(), b = new Date($('#pTo').value + 'T23:59:00+03:00').getTime();
    return (await W('sky', { from: a, to: b, tz: 'Europe/Moscow' })).text;
  }
  const skyText = sky => sky ? '\n' + KB.skyPost + '\n' + sky + '\n' : '\nБлока неба нет: точных дат, времени и градусов не называй и не подтверждай.\n';
  async function postOther(st) {
    const txt = $('#pOtherText').value.trim();
    if (!OIMGS.length && !txt) { toast('Прикрепите скрин чужого поста или вставьте его текст'); return; }
    let orig = txt;
    if (OIMGS.length) { const o = await shotsToText([{ key: 'post', label: 'ПОСТ', images: OIMGS }], st); orig = [o.post, txt].filter(Boolean).join('\n\n'); }
    if (!orig) throw new Error('Не получилось прочитать текст со скриншота. Вставьте текст поста в поле под скрином.');
    const sky = await skyBlock(); const fv = segGet($('#postFmt'));
    const fmt = { long: 'Формат 1. «Записки астролога»', thread: 'Формат 2. Цепочка для Threads', short: 'Формат 3. Короткий пост', like: 'Как в оригинале: та же длина и то же деление на части, что у оригинала' }[fv];
    const user = `РЕЖИМ «По чужому посту». ${fmt}.\nОригинал уже переписан в текст ниже, раздел «### Оригинал» не пиши: начни с «### Ошибки в оригинале».\nТЕКСТ ЧУЖОГО ПОСТА:\n${orig}\n${$('#pDetails').value.trim() ? 'ЧТО ДОБАВИТЬ ОТ СЕБЯ: ' + $('#pDetails').value.trim() + '\n' : ''}Сегодня ${new Date().toLocaleDateString('ru-RU')}.\n${skyText(sky)}`;
    st.textContent = 'Пишу пост…';
    const r = await AI.run({ task: 'post', system: KB.posts, user, maxTokens: 9000, temperature: 0.85, onStatus: t => st.textContent = 'Пишет: ' + t });
    const blocks = splitBlocks(r.text);
    const mine = blocks.filter(b => !/^оригинал|ошибки|заметка/i.test(b.h)).map(b => b.t).join('\n');
    const hits = overlaps(orig, mine);
    const warn = hits.length ? `<div class="warnbox">Есть совпадения с оригиналом, перепишите эти места своими словами или нажмите «Написать свой пост» ещё раз: ${hits.slice(0, 4).map(h => '«' + esc(h) + '»').join('; ')}</div>` : '';
    const iss = Pipeline.dignityIssues(mine, orig);
    const warn2 = iss.length ? `<div class="warnbox">Сайт нашёл астрологическую ошибку в посте: ${iss.slice(0, 3).map(esc).join('; ')}. Поправьте это место или напишите пост ещё раз.</div>` : '';
    outCards('### Оригинал\n' + orig + '\n' + r.text.replace(/^\s*#{2,4}\s*Оригинал[^\n]*\n[\s\S]*?(?=^\s*#{2,4}\s)/mi, ''), $('#pOut'), warn + warn2); st.textContent = 'Готово · ' + r.label + (hits.length ? ' · есть совпадения' : ' · совпадений с оригиналом нет');
  }
  async function postMine(st) {
    const txt = $('#pMyText').value.trim();
    if (txt.length < 40) { toast('Вставьте текст своего поста'); return; }
    const sky = await skyBlock(); const lvl = segGet($('#pMyLevel')) === 'strong' ? 'сильнее' : 'бережно';
    const user = `РЕЖИМ «Улучшить мой пост». Степень правки: ${lvl}.\n${$('#pDetails').value.trim() ? 'ЧТО УЧЕСТЬ: ' + $('#pDetails').value.trim() + '\n' : ''}Сегодня ${new Date().toLocaleDateString('ru-RU')}.\n${skyText(sky)}\nМОЙ ПОСТ:\n${txt}`;
    st.textContent = 'Читаю ваш текст…';
    const r = await AI.run({ task: 'post', system: KB.posts, user, maxTokens: 9000, temperature: lvl === 'сильнее' ? 0.8 : 0.5, onStatus: t => st.textContent = 'Пишет: ' + t });
    const iss = Pipeline.dignityIssues(splitBlocks(r.text).filter(b => /улучшенный|пост/i.test(b.h)).map(b => b.t).join('\n'), txt);
    outCards(r.text, $('#pOut'), iss.length ? `<div class="warnbox">Сайт нашёл астрологическую ошибку: ${iss.slice(0, 3).map(esc).join('; ')}.</div>` : ''); st.textContent = 'Готово · ' + r.label;
  }
  $('#btnPost').onclick = async () => {
    const mode = postMode();
    if (mode !== 'new') {
      const st = $('#pStatus'); st.className = 'status'; st.textContent = mode === 'other' ? 'Читаю пост…' : 'Читаю ваш текст…'; $('#btnPost').disabled = true;
      try { await (mode === 'other' ? postOther(st) : postMine(st)); if (st.textContent === 'Читаю пост…' || st.textContent === 'Читаю ваш текст…') st.textContent = ''; }
      catch (e) { st.className = 'status err'; st.textContent = e.message; }
      finally { $('#btnPost').disabled = false; }
      return;
    }
    const topic = $('#pTopic').value.trim(); if (!topic && !PIMGS.length) { toast('Напишите тему или прикрепите пример'); return; }
    const st = $('#pStatus'); st.className = 'status'; st.textContent = 'Пишу…'; $('#btnPost').disabled = true;
    try {
      const sky = await skyBlock();
      const fv = segGet($('#postFmt'));
      if (fv === 'like' && !PIMGS.length) { st.textContent = ''; toast('Для формата «Как в примере» прикрепите скриншот'); return; }
      const fmt = { long: 'Формат 1. «Записки астролога»', thread: 'Формат 2. Цепочка для Threads', short: 'Формат 3. Короткий пост', like: 'Формат как в примере на скриншоте: та же длина, то же деление на части или посты, тот же тип заголовков, списков и финала' }[fv];
      const refs = fv === 'thread' ? KB.refs.postThread : fv === 'long' ? KB.refs.postLong : '';
      let ex = '';
      if (PIMGS.length) { const o = await shotsToText([{ key: 'ex', label: 'ОБРАЗЕЦ', images: PIMGS }], st); if (o.ex) ex = '\nК заданию приложен образец поста (текст со скриншота, переносы строк сохранены). Работай с ним по правилу «Если приложен скриншот примера».\n=== ОБРАЗЕЦ ===\n' + o.ex + '\n=== КОНЕЦ ОБРАЗЦА ===\n'; st.textContent = 'Пишу пост…'; }
      const user = `Напиши пост. ${fmt}.\nТЕМА: ${topic || 'не указана: возьми тему примера со скриншота и раскрой её по-своему'}\n${ex}${$('#pDetails').value.trim() ? 'ЧТО ВАЖНО СКАЗАТЬ: ' + $('#pDetails').value.trim() + '\n' : ''}Сегодня ${new Date().toLocaleDateString('ru-RU')}.\n${sky ? '\n' + KB.skyPost + '\n' + sky + '\n' : '\nБлока неба нет: не называй точных дат, времени и градусов.\n'}${refs ? '\n=== ЭТАЛОН ПОСТА (форма, ритм и голос; содержание не копировать) ===\n' + refs + '\n=== КОНЕЦ ЭТАЛОНА ===' : ''}`;
      const r = await AI.run({ task: sky.length > 9000 ? 'long' : 'post', system: KB.posts, user, maxTokens: 9000, temperature: 0.9, onStatus: t => st.textContent = 'Пишет: ' + t });
      outCards(r.text, $('#pOut')); st.textContent = 'Готово · ' + r.label;
      if (CP_CUR != null && CP && CP.items[CP_CUR]) { CP.items[CP_CUR].post = r.text; savePlan(); renderPlan(); st.textContent += ' · сохранён в плане'; }
    } catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnPost').disabled = false; }
  };

  // ---------- контент-план
  const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const dmy = d => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
  const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const parseD = t => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  function easterOrth(y) { const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, s = d + e + 114; return new Date(y, Math.floor(s / 31) - 1, s % 31 + 1 + 13); }
  const HOLI = [['01.01', 'Новый год', 'итоги и прогноз на год, натальная карта'], ['07.01', 'Рождество', ''], ['13.01', 'Старый Новый год', 'второй шанс для намерений на год'],
    ['25.01', 'Татьянин день, День студента', 'учёба в карте: Меркурий, 3 и 9 дом'], ['14.02', 'День всех влюблённых', 'Венера, совместимость, разбор пары'],
    ['23.02', 'День защитника Отечества', 'Марс, мужчины в карте женщины'], ['08.03', 'Международный женский день', 'Луна и Венера: женская сила в карте'],
    ['01.04', 'День смеха', 'лёгкий пост про знаки без обидных стереотипов'], ['12.04', 'День космонавтики', 'небо и планеты: как считается карта'],
    ['01.05', 'Праздник весны и труда', 'работа и призвание: 6 и 10 дом'], ['09.05', 'День Победы', 'памятный день: без продаж и шуток, лучше без поста'],
    ['01.06', 'День защиты детей', 'карта ребёнка'], ['12.06', 'День России', ''], ['08.07', 'День семьи, любви и верности', 'отношения, разбор пары, семья в карте'],
    ['01.09', 'День знаний', 'карта ребёнка: как он учится, Меркурий'], ['05.10', 'День учителя', 'учителя в карте: Юпитер и 9 дом'],
    ['31.10', 'Хэллоуин (у части аудитории)', 'тени карты: Плутон, Лилит, 8 и 12 дом'], ['04.11', 'День народного единства', ''],
    ['01.12', 'Начало зимы', 'сезонная усталость, конец года'], ['01.03', 'Начало весны', 'новое начало'], ['01.06', 'Начало лета', 'отпуск и отдых в карте'], ['31.12', 'Канун Нового года', 'итоги года']];
  function holidays(a, b) {
    const out = [];
    for (let y = a.getFullYear(); y <= b.getFullYear(); y++) {
      const L = HOLI.map(([md, n, h]) => [new Date(y, +md.slice(3) - 1, +md.slice(0, 2)), n, h]);
      const e = easterOrth(y);
      L.push([addD(e, -55), 'Начало Масленицы', 'проводы зимы, отпустить старое'], [addD(e, -49), 'Прощёное воскресенье', 'обиды и прощение: Луна, 12 дом'], [e, 'Пасха', 'светлый праздник: без продаж'], [addD(e, 49), 'Троица', '']);
      const oct1 = new Date(y, 9, 1); L.push([new Date(y, 9, 1 + (7 - oct1.getDay()) % 7 + 14), 'День отца', 'Солнце и Сатурн: фигура отца в карте']);
      const nov30 = new Date(y, 10, 30); L.push([new Date(y, 10, 30 - nov30.getDay()), 'День матери', 'Луна как фигура матери: повод для «Кода Луны»']);
      L.forEach(x => { if (x[0] >= a && x[0] <= b) out.push(x); });
    }
    return out.sort((x, y) => x[0] - y[0]).map(([d, n, h]) => `${dmy(d)} (${WD[d.getDay()]}): ${n}${h ? ' (' + h + ')' : ''}`);
  }
  const SELL_DEF = 'Бесплатный разбор «Код Луны» (вход в воронку). Платные разборы: натальная карта, разбор пары, карта ребёнка, денежный разбор. Ссылка на телеграм в шапке профиля.';
  let CP = LS.get('cplan', null), CP_CUR = null;
  function savePlan() { LS.set('cplan', CP); }
  segInit($('#cpFreq'));
  $('#cpPlat').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; b.classList.toggle('on'); if (!$$('#cpPlat .chip.on').length) b.classList.add('on'); LS.set('cp_plat', $$('#cpPlat .chip.on').map(x => x.dataset.k)); };
  (LS.get('cp_plat', null) || []).forEach((k, i, arr) => { if (i === 0) $$('#cpPlat .chip').forEach(x => x.classList.remove('on')); const b = document.querySelector(`#cpPlat .chip[data-k="${k}"]`); if (b) b.classList.add('on'); });
  if (!$$('#cpPlat .chip.on').length) $('#cpPlat .chip').classList.add('on');
  $('#cpSell').value = LS.get('cp_sell', SELL_DEF);
  $('#cpSell').onchange = () => LS.set('cp_sell', $('#cpSell').value.trim() || SELL_DEF);
  $('#cpFrom').value = iso(new Date()); $('#cpTo').value = iso(new Date(Date.now() + 27 * 86400000));
  const fmtKey = f => /цепоч/i.test(f) ? 'thread' : /запис/i.test(f) ? 'long' : 'short';
  const SKYWORD = /новолун|полнолун|затмен|ретро|директ|разворот|входит|вход |переход|аспект|сезон|соединен|квадрат|оппозиц|трин|секстил/i;
  function parsePlan(text) {
    const parts = String(text || '').replace(/\r/g, '').split(/^##(?!#)\s*/m);
    const intro = parts[0].replace(/^#+\s*Логика плана\s*/im, '').replace(/^#+\s*/gm, '').trim();
    const items = [];
    parts.slice(1).forEach(p => {
      const lines = p.split('\n'); const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(lines[0]); if (!m) return;
      const it = { date: m[1].padStart(2, '0') + '.' + m[2].padStart(2, '0') + '.' + m[3], f: {} };
      lines.slice(1).forEach(l => { const k = /^\s*[-*]?\s*\**([А-Яа-яЁё ]{3,20}?)\**\s*:\s*\**\s*(.+)$/.exec(l); if (k) it.f[k[1].trim().toLowerCase()] = k[2].replace(/\*\*/g, '').trim(); });
      if (it.f['тема']) items.push(it);
    });
    return { intro, items };
  }
  function planContext() {
    const a = parseD(dmy(new Date($('#cpFrom').value + 'T12:00:00'))), b = parseD(dmy(new Date($('#cpTo').value + 'T12:00:00')));
    return { a, b };
  }
  $('#btnPlan').onclick = async () => {
    const { a, b } = planContext();
    if (!a || !b || b < a) { toast('Проверьте даты'); return; }
    const nd = Math.round((b - a) / 86400000) + 1;
    if (nd > 45) { toast('Не больше 45 дней за раз'); return; }
    const freq = +segGet($('#cpFreq')) || 4, n = Math.max(1, Math.round(freq * nd / 7));
    if (n > 32) { toast('Слишком много постов за раз: возьмите период короче'); return; }
    if (CP && CP.items.length && !confirm('Новый план заменит текущий. Продолжить?')) return;
    const st = $('#cpStatus'); st.className = 'status'; st.textContent = 'Считаю небо…'; $('#btnPlan').disabled = true;
    try {
      const sky = (await W('sky', { from: new Date($('#cpFrom').value + 'T00:00:00+03:00').getTime(), to: new Date($('#cpTo').value + 'T23:59:00+03:00').getTime(), tz: 'Europe/Moscow' })).text;
      const days = []; for (let d = a; d <= b; d = addD(d, 1)) days.push(`${dmy(d)} ${WD[d.getDay()]}`);
      const hol = holidays(a, b);
      const plats = $$('#cpPlat .chip.on').map(x => x.dataset.k);
      const sell = $('#cpSell').value.trim() || SELL_DEF; LS.set('cp_sell', sell);
      const news = $('#cpNews').value.trim(), wish = $('#cpWish').value.trim();
      const was = LS.get('cp_done', []);
      const ctx = `ПЕРИОД: с ${dmy(a)} по ${dmy(b)}.\nПЛОЩАДКИ: ${plats.join(', ')}.\nЧТО ПРОДАЮ И КУДА ВЕДУ: ${sell}\nЧТО СЕЙЧАС ОБСУЖДАЮТ: ${news || 'поле не заполнено, держись сезона'}\n${wish ? 'ПОЖЕЛАНИЯ: ' + wish + '\n' : ''}${was.length ? 'УЖЕ ПУБЛИКОВАЛИСЬ ТЕМЫ (не повторять): ' + was.slice(-40).join('; ') + '\n' : ''}Сегодня ${dmy(new Date())}.\n\nДНИ ПЕРИОДА:\n${days.join('\n')}\n\nКАЛЕНДАРЬ ПОВОДОВ:\n${hol.length ? hol.join('\n') : 'праздников в этот период нет'}\n\n${KB.skyPost}\n${sky}`;
      const user = `Составь контент-план. Пунктов ровно ${n}, примерно ${freq} в неделю, равномерно по неделям; дни с событиями неба и праздниками в приоритете.\n\n${ctx}`;
      st.textContent = 'Составляю план…';
      const r = await AI.run({ task: 'long', system: KB.contentPlan, user, maxTokens: 12000, temperature: 0.85, onStatus: t => st.textContent = 'Составляет: ' + t });
      const P = parsePlan(r.text);
      const inRange = P.items.filter(it => { const d = parseD(it.date); return d && d >= a && d <= b; });
      if (!inRange.length) { st.className = 'status err'; st.textContent = 'ИИ ответил не по формату. Нажмите ещё раз.'; outCards(r.text, $('#cpOut')); return; }
      inRange.sort((x, y) => parseD(x.date) - parseD(y.date));
      CP = { created: Date.now(), from: dmy(a), to: dmy(b), intro: P.intro, items: inRange, ctx };
      savePlan(); renderPlan();
      st.textContent = `Готово · ${inRange.length} постов · ${r.label}${Math.abs(inRange.length - n) > Math.max(2, n / 4) ? ` · просили ${n}, можно составить ещё раз` : ''}`;
    } catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnPlan').disabled = false; }
  };
  function weekLabel(d) { const m = addD(d, -((d.getDay() + 6) % 7)); return 'Неделя с ' + m.getDate() + ' ' + MONTHS_G[m.getMonth()]; }
  function planLine(it) { const f = it.f, d = parseD(it.date); return `${d ? d.getDate() + ' ' + MONTHS_G[d.getMonth()] + ', ' + WD[d.getDay()] : it.date} · ${[f['площадка'], f['формат']].filter(Boolean).join(' · ')}\nТема: ${f['тема'] || ''}${f['крючок'] ? '\nКрючок: ' + f['крючок'] : ''}${f['зачем'] ? '\nЗачем: ' + f['зачем'] : ''}${f['повод'] ? '\nПовод: ' + f['повод'] : ''}${f['призыв'] ? '\nПризыв: ' + f['призыв'] : ''}`; }
  function renderPlan() {
    const el = $('#cpOut'); if (!CP || !CP.items || !CP.items.length) { el.innerHTML = ''; return; }
    let h = `<div class="plan"><h2>План с ${esc(CP.from)} по ${esc(CP.to)}</h2>${CP.intro ? `<div class="out note"><h4>Логика плана</h4><div class="txt">${esc(CP.intro)}</div></div>` : ''}`;
    let wk = '';
    CP.items.forEach((it, k) => {
      const d = parseD(it.date), f = it.f, w = d ? weekLabel(d) : '';
      if (w !== wk) { h += `<div class="wk">${esc(w)}</div>`; wk = w; }
      h += `<div class="pi${it.pub ? ' done' : ''}" data-k="${k}"><div class="pd"><span>${d ? d.getDate() + ' ' + MONTHS_G[d.getMonth()] + ', ' + WD[d.getDay()] : esc(it.date)}</span><small>${esc([f['площадка'], f['формат']].filter(Boolean).join(' · '))}</small></div>
        <div class="pt">${esc(f['тема'] || '')}</div>
        ${f['крючок'] ? `<div class="ph">${esc(f['крючок'])}</div>` : ''}
        ${['зачем', 'повод', 'призыв'].filter(x => f[x]).map(x => `<div class="pm"><b>${x[0].toUpperCase() + x.slice(1)}:</b> ${esc(f[x])}</div>`).join('')}
        ${it.post ? `<details><summary class="linkbtn">Текст поста готов</summary><div class="post">${esc(it.post)}</div><button class="btn ghost small" data-a="copypost">Скопировать пост</button></details>` : ''}
        <div class="btnrow"><button class="btn small" data-a="write">${it.post ? 'Переписать пост' : 'Написать этот пост'}</button><button class="btn ghost small" data-a="other">Другая тема</button></div>
        <label class="check"><input type="checkbox" data-a="pub"${it.pub ? ' checked' : ''}> Опубликован</label></div>`;
    });
    h += `<div class="btnrow"><button class="btn ghost" id="cpCopy">Скопировать весь план</button><button class="btn ghost" id="cpClear">Удалить план</button></div></div>`;
    el.innerHTML = h;
    $('#cpCopy').onclick = () => copy(`Контент-план с ${CP.from} по ${CP.to}\n\n${CP.intro ? CP.intro + '\n\n' : ''}${CP.items.map(planLine).join('\n\n')}`);
    $('#cpClear').onclick = () => { if (!confirm('Удалить план? Написанные по нему посты тоже пропадут из плана.')) return; CP = null; LS.set('cplan', null); renderPlan(); };
    $$('#cpOut .pi').forEach(card => {
      const k = +card.dataset.k;
      card.querySelector('[data-a="write"]').onclick = () => planToPost(k);
      card.querySelector('[data-a="other"]').onclick = e => planOther(k, e.target);
      const cp = card.querySelector('[data-a="copypost"]'); if (cp) cp.onclick = () => copy(CP.items[k].post);
      card.querySelector('[data-a="pub"]').onchange = e => {
        const it = CP.items[k]; it.pub = e.target.checked; card.classList.toggle('done', it.pub); savePlan();
        if (it.pub) { const was = LS.get('cp_done', []); if (was.indexOf(it.f['тема']) < 0) { was.push(it.f['тема']); LS.set('cp_done', was.slice(-80)); } }
      };
    });
  }
  function planToPost(k) {
    const it = CP.items[k], f = it.f;
    const fmt = f['формат'] || '', pov = f['повод'] || '';
    $('#pTopic').value = f['тема'] || '';
    $('#pDetails').value = [f['крючок'] ? 'Первая строка: ' + f['крючок'] : '', /вопрос/i.test(fmt) ? 'Это пост-вопрос к аудитории: его задача собрать комментарии' : '', f['зачем'] ? 'Задача поста: ' + f['зачем'] : '', pov && !/без повода/i.test(pov) ? 'Повод: ' + pov : '', f['площадка'] ? 'Площадка: ' + f['площадка'] : '', f['призыв'] ? 'Финал: ' + f['призыв'] : ''].filter(Boolean).join('\n');
    segSet($('#postFmt'), fmtKey(fmt));
    const useSky = SKYWORD.test(pov) || SKYWORD.test(f['тема'] || '');
    $('#pSky').checked = useSky; $('#pSkyRange').hidden = !useSky;
    const d = parseD(it.date); if (d) { $('#pFrom').value = iso(addD(d, -3)); $('#pTo').value = iso(addD(d, 20)); }
    setPostImgs([]); $('#pOut').innerHTML = ''; $('#pStatus').textContent = '';
    setPostMode('new'); CP_CUR = k; $('#pBackPlan').hidden = false; $('#pPlanNote').textContent = 'Пост для плана на ' + (d ? d.getDate() + ' ' + MONTHS_G[d.getMonth()] : it.date) + ', текст сохранится в плане.';
    textTab('post'); window.scrollTo(0, 0); toast('Форма поста заполнена из плана');
  }
  async function planOther(k, btn) {
    const it = CP.items[k];
    btn.disabled = true; btn.textContent = 'Думаю…';
    try {
      const others = CP.items.filter((x, i) => i !== k).map(x => `${x.date}: ${x.f['формат'] || ''}: ${x.f['тема'] || ''}`).join('\n');
      const user = `${CP.ctx || ''}\n\nГОТОВЫЙ ПЛАН (эти темы не повторять):\n${others}\n\nЗамени пункт на ${it.date}. Было: ${it.f['формат'] || ''}: ${it.f['тема'] || ''}. Предложи другую тему и, если уместно, другой формат. Ответ: ровно один пункт в той же разметке, начиная со строки «## ${it.date}», без «Логики плана».`;
      const r = await AI.run({ task: 'short', system: KB.contentPlan, user, maxTokens: 1500, temperature: 0.95 });
      const P = parsePlan(r.text);
      if (!P.items.length) throw new Error('ИИ ответил не по формату, нажмите ещё раз');
      CP.items[k] = { date: it.date, f: P.items[0].f }; savePlan(); renderPlan(); toast('Тема заменена');
    } catch (e) { toast(e.message, 4000); btn.disabled = false; btn.textContent = 'Другая тема'; }
  }
  $('#pUnplan').onclick = () => { CP_CUR = null; $('#pBackPlan').hidden = true; };
  $('#pToPlan').onclick = () => { textTab('plan'); const c = document.querySelector(`#cpOut .pi[data-k="${CP_CUR}"]`); if (c) c.scrollIntoView({ block: 'center' }); };
  renderPlan();

  // ---------- небо
  $('#skyFrom').value = iso(new Date()); $('#skyTo').value = iso(new Date(Date.now() + 31 * 86400000));
  $('#btnSky').onclick = async () => {
    const a = new Date($('#skyFrom').value + 'T00:00:00+03:00').getTime(), b = new Date($('#skyTo').value + 'T23:59:00+03:00').getTime();
    if (!(b > a)) { toast('Проверьте даты'); return; }
    if (b - a > 400 * 86400000) { toast('Не больше года за раз'); return; }
    $('#skyOut').innerHTML = '<p class="hint">Считаю…</p>';
    try {
      const r = await W('sky', { from: a, to: b, tz: 'Europe/Moscow' });
      const secs = r.text.split(/\n\n/).map(s => s.trim()).filter(Boolean);
      $('#skyOut').innerHTML = '<div class="sky">' + secs.slice(1).map(s => { const L = s.split('\n'); return `<h3>${esc(L[0])}</h3>` + L.slice(1).map(l => { const i = l.indexOf(': '); return l === 'нет' ? '<p class="hint">нет</p>' : `<div class="ev" data-t="${esc(l)}"><small>${esc(l.slice(0, i))}</small>${esc(l.slice(i + 2))}</div>`; }).join(''); }).join('') + '</div><button class="btn ghost" id="btnCopySky">Скопировать всё</button>';
      $('#btnCopySky').onclick = () => copy(r.text);
      $$('#skyOut .ev').forEach(el => el.onclick = () => {
        $('#pTopic').value = el.dataset.t; segSet($('#postFmt'), 'thread'); $('#pSky').checked = true; $('#pSkyRange').hidden = false;
        const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(el.dataset.t); if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); $('#pFrom').value = iso(new Date(d.getTime() - 3 * 86400000)); $('#pTo').value = iso(new Date(d.getTime() + 20 * 86400000)); }
        CP_CUR = null; $('#pBackPlan').hidden = true;
        showTab('texts'); textTab('post'); setPostMode('new'); toast('Тема поста заполнена');
      });
    } catch (e) { $('#skyOut').innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
  };

  // ---------- архив
  async function renderArchive() {
    let all = []; try { all = (await DB.all()) || []; } catch (e) { }
    all = all.filter(x => x && x.kind !== 'dlg');
    all.sort((a, b) => b.updated - a.updated);
    $('#archList').innerHTML = all.length ? all.map(j => `<div class="arch" data-id="${j.id}"><div class="t"><b>${esc(jobName(j))}</b><small>${esc(KB.products[j.product] ? KB.products[j.product].title : j.product)} · ${new Date(j.updated).toLocaleDateString('ru-RU')} · ${j.text ? 'готов' : Object.keys(j.parts || {}).length ? 'в работе' : 'расчёт'}</small></div><button class="btn small a-open">Открыть</button><button class="btn ghost small a-del">✕</button></div>`).join('') : '<p class="hint">Пока пусто. Готовые и начатые разборы появятся здесь.</p>';
    $$('#archList .arch').forEach(el => {
      el.querySelector('.a-open').onclick = async () => { const j = await DB.get(el.dataset.id); if (j) openJob(j); };
      el.querySelector('.a-del').onclick = async () => { if (!confirm('Удалить разбор из архива?')) return; await DB.del(el.dataset.id); renderArchive(); };
    });
  }
  $('#btnExport').onclick = async () => {
    const all = (await DB.all()) || [];
    const blob = new Blob([JSON.stringify({ app: 'astro', ver: 1, date: new Date().toISOString(), jobs: all })], { type: 'application/json' });
    const file = new File([blob], `astro_arhiv_${iso(new Date())}.json`, { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#importFile').onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); let n = 0; for (const x of (j.jobs || [])) { if (x && x.id) { await DB.put(x); n++; } } toast('Загружено записей: ' + n); renderArchive(); }
    catch (err) { toast('Не получилось прочитать файл'); }
  };

  // ---------- настройки
  const KEYINFO = {
    gemini: { t: 'Gemini (Google)', d: 'Главная модель для разборов и конспектов. Ключ бесплатный.', how: 'aistudio.google.com/apikey → Create API key' },
    groq: { t: 'Groq (Qwen)', d: 'Быстрые ответы на комментарии и посты. Бесплатно.', how: 'console.groq.com/keys → Create API Key' },
    openrouter: { t: 'OpenRouter', d: 'Ещё один запасной вариант с бесплатными моделями.', how: 'openrouter.ai/settings/keys' },
  };
  function renderKeys() {
    const k = AI.keys(); const st = LS.get('key_status', {});
    $('#keys').innerHTML = Object.keys(KEYINFO).map(p => `<div class="keyrow"><div class="kh"><b>${KEYINFO[p].t}</b><a href="${AI.providers[p].site}" target="_blank" rel="noopener">получить ключ</a></div>
      <p class="hint">${KEYINFO[p].d} ${KEYINFO[p].how}</p>
      <input type="password" data-p="${p}" value="${esc(k[p] || '')}" placeholder="вставьте ключ" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="ks ${st[p] && st[p].ok ? 'ok' : st[p] ? 'err' : ''}">${st[p] ? esc(st[p].msg) : ''}</div></div>`).join('');
    $$('#keys input').forEach(i => { i.onfocus = () => i.type = 'text'; i.onblur = () => { i.type = 'password'; const all = AI.keys(); const v = i.value.trim(); if (v) all[i.dataset.p] = v; else delete all[i.dataset.p]; AI.setKeys(all); }; });
    const u = AI.usage(); $('#usage').textContent = u.n ? 'Запросов сегодня: ' + Object.entries(u.n).map(([p, n]) => `${AI.providers[p].label} ${n}`).join(', ') : '';
  }
  $('#btnTestKeys').onclick = async () => {
    $$('#keys input').forEach(i => i.blur());
    const all = {}; $$('#keys input').forEach(i => { if (i.value.trim()) all[i.dataset.p] = i.value.trim(); }); AI.setKeys(all);
    const st = {}; $('#keyStatus').textContent = 'Проверяю…';
    for (const p of Object.keys(all)) {
      try { const r = await AI.test(p); st[p] = { ok: true, msg: `работает · моделей ${r.models}${r.best ? ' · для разборов: ' + (r.best.long || '—') + ', для коротких: ' + r.best.short : ''}` }; }
      catch (e) { st[p] = { ok: false, msg: 'не работает: ' + e.message.slice(0, 160) }; }
      LS.set('key_status', st); renderKeys();
    }
    $('#keyStatus').textContent = Object.keys(all).length ? 'Проверка закончена' : 'Ключей нет';
  };
  $('#btnResetLimits').onclick = () => { AI.resetExhausted(); toast('Отметки сброшены'); };
  $('#optPrivate').checked = LS.get('opt_private', true);
  $('#optPrivate').onchange = () => LS.set('opt_private', $('#optPrivate').checked);
  $('#ver').textContent = VERSION;
  $('#optNick').value = LS.get('my_nick', '');
  $('#optNick').onchange = () => LS.set('my_nick', $('#optNick').value.trim().replace(/^@/, ''));
  function logText() {
    return AI.log().slice().reverse().map(x => `${new Date(x.t).toLocaleString('ru-RU')} · ${x.task || ''} · ${x.prov}/${x.model} · ${x.ok ? 'ок, ' + x.s + ' с' : 'ошибка ' + x.kind + ': ' + x.msg}`).join('\n');
  }
  function renderLog() { const t = logText(); $('#aiLog').innerHTML = t ? '<pre class="data">' + esc(t.split('\n').slice(0, 12).join('\n')) + '</pre>' : 'Пока пусто.'; }
  $('#btnCopyLog').onclick = () => copy(VERSION + '\n' + (logText() || 'журнал пуст'));
  $('#btnClearLog').onclick = () => { AI.clearLog(); renderLog(); };
  renderLog();

  $('#help').innerHTML = `<div class="help">
  <h3>1. Один раз: ключи</h3>
  <ol><li>Откройте ссылку «получить ключ» у Gemini, войдите через Google-аккаунт, нажмите Create API key, скопируйте ключ и вставьте сюда.</li>
  <li>Так же можно добавить Groq и OpenRouter: Groq быстро отвечает на комментарии, OpenRouter подстрахует, когда лимит Gemini на сегодня закончится.</li>
  <li>Нажмите «Проверить ключи». Зелёная строка значит, что всё работает.</li></ol>
  <h3>2. Один раз: приложение на экран</h3>
  <p>В Safari нажмите «Поделиться» → «На экран Домой». Так сайт открывается как приложение и надёжнее хранит архив.</p>
  <h3>3. Разбор</h3>
  <ol><li>Вкладка «Разбор»: выберите продукт, введите имя, дату, время и место рождения (начните печатать и выберите из списка; находится любой город, село или посёлок).</li>
  <li>«Где живёт сейчас»: если человек переехал, впишите город, где он живёт, и с какого месяца и года. Карта перенесётся на это место, а все даты в разборе будут по местному времени. Если переезд меньше полугода назад, разбор опирается на карту рождения, а о новом месте говорит как о том, что впереди. Если живёт там же, где родился, поле можно не заполнять.</li>
  <li>Вопрос клиента впишите своими словами. В поле «что рассказал о себе» только то, что человек сказал сам.</li>
  <li>«Посчитать карту», потом «Написать разбор». Код Луны пишется от 2 до 4 минут, полный разбор от 6 до 12 минут. Экран сам не погаснет. Если позвонили или телефон заблокировался, разбор продолжится с последнего готового шага, когда вы вернётесь на сайт.</li>
  <li>Вкладка «Проверка»: красное исправляется кнопкой, жёлтое перечитайте. Обязательно прочитайте весь текст сами.</li>
  <li>Правки: во вкладке «Текст» напишите замечание обычными словами, например «в части IV убрать фразу про бабушку». Можно править и руками прямо в тексте.</li>
  <li>«Конспект»: текст для голосовых. Розовое это крючки на продажу.</li>
  <li>«PDF» → «Открыть книгу» → «Поделиться PDF» → «Отправить или сохранить». Файл можно сразу отправить клиенту в Telegram или сохранить в Файлы.</li></ol>
  <h3>4. Диалоги и посты</h3>
  <ol><li>«Тексты» → «Диалоги» → «Комментирую чужой пост»: прикрепите скрин поста и, если есть, скрины ответов других астрологов → «Написать комментарий». Будут варианты: «Коротко», «Подробнее» (цепочка из 2 или 3 комментариев до 500 знаков, у каждого своя кнопка «Скопировать»), «С приглашением» и заметка для вас.</li>
  <li>Отправили комментарий в Threads: нажмите «Отправила этот» под выбранным вариантом. Если меняли текст, поправьте его там же, чтобы модель помнила именно ваши слова.</li>
  <li>Человек ответил: откройте этот диалог, прикрепите скрин его ответа → «Ответить». Модель помнит пост, ответы других и всю вашу переписку. Так можно вести разговор сколько угодно шагов.</li>
  <li>Если в посте есть дата рождения, сайт сам посчитает карту человека и уточнит ответ по ней.</li>
  <li>«Комментарий под моим постом»: то же самое для комментариев под вашими постами.</li></ol>
  <p>«Пост» → «Новый пост»: выберите формат и тему. Можно прикрепить скриншот поста, на который хочется равняться: с него возьмутся формат и подача, а текст будет вашим. Во вкладке «Небо» нажмите на событие, и тема поста заполнится сама с точными датами.</p>
  <p>«Пост» → «По чужому посту»: прикрепите скрин чужого поста. Получится ваш пост на ту же тему, вашим языком и без копирования. Ошибки оригинала будут списком отдельно, а в вашем посте исправлены. Если в тексте нашлись совпадения с оригиналом, сайт их покажет.</p>
  <p>«Пост» → «Улучшить мой»: вставьте свой текст и выберите «Бережно» или «Сильнее». Будет список того, что исправлено и почему, улучшенный пост и два варианта первой строки.</p>
  <h3>5. Контент-план</h3>
  <ol><li>«Тексты» → «Контент-план»: выберите даты (до 45 дней), сколько постов в неделю и где публикуете.</li>
  <li>«Что продаю и куда веду» запоминается, его достаточно заполнить один раз. В «Что сейчас обсуждают» можно вписать, о чём говорят в ленте и что спрашивают подписчики.</li>
  <li>«Составить план»: план собирается по точным событиям неба за период, праздникам и вашим пожеланиям. Под каждым пунктом есть «Написать этот пост»: форма поста заполнится сама, а готовый текст сохранится в плане.</li>
  <li>Не нравится пункт: «Другая тема». Опубликовали: отметьте галочкой, и в следующих планах эта тема не повторится.</li></ol>
  <h3>6. Приватность</h3>
  <p>В ИИ уходят только имя и готовый расчёт: дата, время и место рождения не передаются (галочка выше). Фамилии, телефоны и ники клиентов в поля не пишите.</p>
  <h3>7. Если что-то не так</h3>
  <ul><li>«Нет рабочих ключей» или «лимит»: добавьте второй ключ или продолжите завтра, готовые части сохраняются.</li>
  <li>Без ключей: «Создание» → «Сделать вручную в чате» → скопируйте задание, вставьте в Qwen Chat или DeepSeek, ответ вставьте обратно.</li>
  <li>Место не находится: проверьте написание или нажмите «ввести координаты вручную».</li>
  <li>Раз в неделю: «Архив» → «Скачать копию архива».</li></ul></div>`;

  // ---------- старт
  renderProducts(); renderPersons();
  if (!Object.keys(AI.keys()).length) $('#topnote').innerHTML = '<span style="color:var(--warn)">добавьте ключ в «Ещё»</span>';
  // вышла новая версия сайта, а телефон показывает старую из кэша: предлагаем обновить
  let verChecked = 0;
  async function checkUpdate() {
    if (Date.now() - verChecked < 10 * 60000) return; verChecked = Date.now();
    try {
      const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
      if (j && +j.v > BUILD && !$('#updBar')) {
        document.body.insertAdjacentHTML('beforeend', '<div id="updBar">Вышло обновление сайта <button class="btn small primary" id="updBtn">Обновить</button></div>');
        $('#updBtn').onclick = () => location.replace(location.pathname + '?u=' + j.v);
      }
    } catch (e) { }
  }
  checkUpdate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  // iPhone выгрузил страницу посреди разбора: открываем его и продолжаем
  (async () => {
    let all = []; try { all = (await DB.all()) || []; } catch (e) { return; }
    const j = all.filter(x => x && x.running && !x.text && Date.now() - (x.updated || 0) < 12 * 3600000).sort((a, b) => b.updated - a.updated)[0];
    if (!j) return;
    openJob(j, 'gen'); toast('Продолжаю разбор, который прервался', 3500);
    setTimeout(() => $('#btnGen').click(), 1200);
  })();
})();
