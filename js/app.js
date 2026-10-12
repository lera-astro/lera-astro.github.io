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
  const VERSION = 'Астро-мастерская 1.0 · база знаний ' + KB.version;
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
      w = new Worker('js/worker.js');
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
      </div></div></div>`;
  }
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
  function renderCityList(el, local, geo, state) {
    const list = el.querySelector('.citylist');
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
  async function resolvePlaces() {
    // если город написан, но не выбран из списка: ищем на карте сами
    for (const el of $$('#persons .person')) {
      const i = +el.dataset.i, p = F.persons[i];
      if (!p || p.manual || p.lat != null || !p.cityText) continue;
      if (el.querySelector('.p-use') && !p.use) continue;
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
      const blocks = [];
      if (job.product === 'synastry') {
        const [a, b] = job.inputs;
        const r1 = await W('natal', { input: a, opt: Object.assign({ scope: 'short', role: 'заказчик' }, base) }, f => btn.textContent = `Считаю… ${Math.round(f * 40)}%`);
        const r2 = await W('natal', { input: b, opt: Object.assign({ scope: 'short', role: 'партнёр' }, base) }, f => btn.textContent = `Считаю… ${40 + Math.round(f * 40)}%`);
        const pr = await W('pair', { a, b, opt: base });
        blocks.push(r1.text, r2.text, pr.text);
        job.data = { text: blocks.join('\n\n'), json: r1.json, json2: r2.json, cross: pr.cross, appendix: pr.appendix, summary: [r1.summary, r2.summary] };
      } else if (job.product === 'child') {
        const [a, b] = job.inputs;
        const r1 = await W('natal', { input: a, opt: Object.assign({ scope: 'short', role: 'ребёнок' }, base) }, f => btn.textContent = `Считаю… ${Math.round(f * 60)}%`);
        blocks.push(r1.text); let app = r1.appendix; const sums = [r1.summary];
        if (b) {
          const r2 = await W('natal', { input: b, opt: Object.assign({ scope: 'short', role: 'родитель' }, base) });
          const pr = await W('pair', { a, b, opt: Object.assign({ kind: 'parent' }, base) });
          blocks.push(r2.text, pr.text); sums.push(r2.summary);
        }
        job.data = { text: blocks.join('\n\n'), json: r1.json, appendix: app, summary: sums };
      } else {
        const opt = Object.assign({ scope: job.product === 'money' ? 'short' : 'full', money: job.product === 'money' }, base);
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
      ${s.map((x, i) => x ? `<div class="sum"><b>${esc(j.persons[i] && j.persons[i].name || '')}</b>: ${x.lines.map(esc).join('; ')}. Пояс на дату рождения UTC${x.offset >= 0 ? '+' : '−'}${Math.abs(x.offset) / 60}.</div>` : '').join('')}
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
  let busy = false;
  $('#btnGen').onclick = async () => {
    if (JOB.text) { jobTab('text'); return; }
    if (busy) return; busy = true;
    const btn = $('#btnGen'); btn.disabled = true; $('#btnRegen').hidden = true;
    const st = $('#genStatus'); st.className = 'status'; st.textContent = 'Начинаю. Не закрывайте страницу: разбор пишется несколько минут.';
    try {
      await Pipeline.generate(JOB, { status: t => st.textContent = 'Пишет: ' + t, step: stepState, save });
      stepState('final', 'done', 'готово');
      $('#mdEdit').value = JOB.text; save();
      st.textContent = 'Готово. Проверьте текст и оформите PDF.';
      renderChecks(); jobTab(JOB.checks && JOB.checks.errors.length ? 'check' : 'text');
      toast('Разбор готов');
    } catch (e) {
      st.className = 'status err'; st.textContent = e.message + '\n\nМожно нажать «Продолжить» позже (готовые части сохранены) или сделать шаг вручную ниже.';
    } finally { busy = false; btn.disabled = false; renderSteps(); }
  };
  $('#btnRegen').onclick = () => { if (!confirm('Переписать разбор заново? Текущий текст будет удалён.')) return; JOB.parts = {}; JOB.plan = ''; JOB.text = ''; JOB.checks = null; save(); renderSteps(); $('#btnGen').click(); };

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
    const c = JOB.checks || Pipeline.check(JOB.text, { data: JOB.data.text, product: JOB.product, final: true });
    JOB.checks = c;
    const item = (x, cls) => `<div class="chk ${cls}"><b>${esc(x.title)}</b>${x.count > 1 ? ' · ' + x.count : ''}${x.samples && x.samples.length ? '<ul>' + x.samples.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>' : ''}</div>`;
    el.innerHTML = `<p class="hint">Объём текста: ${Math.round(c.chars / 1000)} тыс. знаков (около ${Math.round(c.chars / 1600) + 2} стр. в книге).</p>` +
      (c.errors.length ? c.errors.map(x => item(x, 'e')).join('') : '<div class="chk ok"><b>Машинные проверки пройдены</b></div>') +
      c.warns.map(x => item(x, 'w')).join('') +
      '<p class="hint">Красное исправляется кнопкой ниже. Жёлтое стоит перечитать глазами. Смысл, противоречия и «откуда ты знаешь» машина не проверит: прочитайте текст целиком.</p>';
    $('#btnFixAll').hidden = !c.errors.length;
  }
  $('#btnRecheck').onclick = () => { JOB.text = $('#mdEdit').value || JOB.text; JOB.checks = null; renderChecks(); save(); };
  $('#btnFixAll').onclick = async () => {
    const st = $('#fixStatus'); st.className = 'status'; st.textContent = 'Исправляю…'; $('#btnFixAll').disabled = true;
    const before = JOB.text;
    try { const r = await Pipeline.fixAll(JOB, { status: t => st.textContent = 'Пишет: ' + t }); JOB.prev = before; $('#mdEdit').value = JOB.text; save(); renderChecks(); st.textContent = r.changed ? 'Готово. Осталось: ' + (JOB.checks.errors.length ? JOB.checks.errors.map(e => e.title).join(', ') : 'ничего') : 'Модель не справилась без потерь текста, исправьте вручную во вкладке «Текст».'; }
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
    const book = $('#book');
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
  segInit($('#textSeg'), v => { $('#tx-comment').hidden = v !== 'comment'; $('#tx-post').hidden = v !== 'post'; });
  let IMGS = [];
  $('#cShot').onchange = async e => {
    IMGS = []; $('#cThumbs').innerHTML = '';
    for (const f of [].slice.call(e.target.files || []).slice(0, 4)) {
      const data = await shrink(f); IMGS.push({ mime: 'image/jpeg', data });
      $('#cThumbs').insertAdjacentHTML('beforeend', `<img src="data:image/jpeg;base64,${data}">`);
    }
  };
  function shrink(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = rej;
      fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85).split(',')[1]); }; im.onerror = rej; im.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  function outCards(text, el) {
    const parts = String(text).split(/^###\s+/m).map(x => x.trim()).filter(Boolean);
    const blocks = parts.length > 1 || /^###/m.test(text) ? parts.map(p => { const i = p.indexOf('\n'); return { h: i > 0 ? p.slice(0, i) : p, t: i > 0 ? p.slice(i + 1).trim() : '' }; }) : [{ h: '', t: text.trim() }];
    el.innerHTML = blocks.map((b, k) => `<div class="out${/заметка/i.test(b.h) ? ' note' : ''}">${b.h ? `<h4>${esc(b.h)}</h4>` : ''}<div class="txt">${esc(b.t)}</div>${/заметка/i.test(b.h) ? '' : `<button class="btn ghost small" data-k="${k}">Скопировать</button>`}</div>`).join('');
    el.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => copy(blocks[+b.dataset.k].t));
  }
  $('#btnComment').onclick = async () => {
    const txt = $('#cText').value.trim(); if (!txt && !IMGS.length) { toast('Вставьте комментарий или скриншот'); return; }
    const st = $('#cStatus'); st.className = 'status'; st.textContent = 'Думаю…'; $('#btnComment').disabled = true;
    try {
      const user = `${$('#cPost').value.trim() ? 'МОЙ ПОСТ:\n' + $('#cPost').value.trim() + '\n\n' : ''}${txt ? 'КОММЕНТАРИЙ:\n' + txt + '\n\n' : ''}${IMGS.length ? 'На скриншоте переписка: прочитай её внимательно, ответить нужно на последний комментарий, адресованный мне.\n\n' : ''}${$('#cNote').value.trim() ? 'ЧТО УЧЕСТЬ: ' + $('#cNote').value.trim() + '\n\n' : ''}Сегодня ${new Date().toLocaleDateString('ru-RU')}. Дай три варианта ответа.`;
      const r = await AI.run({ task: IMGS.length ? 'vision' : 'short', system: KB.comments, user, images: IMGS, maxTokens: 2500, temperature: 0.8, onStatus: t => st.textContent = 'Пишет: ' + t });
      outCards(r.text, $('#cOut')); st.textContent = 'Готово · ' + r.label;
    } catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnComment').disabled = false; }
  };
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
  $('#btnPost').onclick = async () => {
    const topic = $('#pTopic').value.trim(); if (!topic && !PIMGS.length) { toast('Напишите тему или прикрепите пример'); return; }
    const st = $('#pStatus'); st.className = 'status'; st.textContent = 'Пишу…'; $('#btnPost').disabled = true;
    try {
      let sky = '';
      if ($('#pSky').checked) { const a = new Date($('#pFrom').value + 'T00:00:00+03:00').getTime(), b = new Date($('#pTo').value + 'T23:59:00+03:00').getTime(); sky = (await W('sky', { from: a, to: b, tz: 'Europe/Moscow' })).text; }
      const fv = segGet($('#postFmt'));
      if (fv === 'like' && !PIMGS.length) { st.textContent = ''; toast('Для формата «Как в примере» прикрепите скриншот'); return; }
      const fmt = { long: 'Формат 1. «Записки астролога»', thread: 'Формат 2. Цепочка для Threads', short: 'Формат 3. Короткий пост', like: 'Формат как в примере на скриншоте: та же длина, то же деление на части или посты, тот же тип заголовков, списков и финала' }[fv];
      const refs = fv === 'thread' ? KB.refs.postThread : fv === 'long' ? KB.refs.postLong : '';
      const ex = PIMGS.length ? '\nК заданию приложен скриншот примера поста (' + PIMGS.length + ' изобр.). Работай с ним по правилу «Если приложен скриншот примера».\n' : '';
      const user = `Напиши пост. ${fmt}.\nТЕМА: ${topic || 'не указана: возьми тему примера со скриншота и раскрой её по-своему'}\n${ex}${$('#pDetails').value.trim() ? 'ЧТО ВАЖНО СКАЗАТЬ: ' + $('#pDetails').value.trim() + '\n' : ''}Сегодня ${new Date().toLocaleDateString('ru-RU')}.\n${sky ? '\n' + KB.skyPost + '\n' + sky + '\n' : '\nБлока неба нет: не называй точных дат, времени и градусов.\n'}${refs ? '\n=== ЭТАЛОН ПОСТА (форма, ритм и голос; содержание не копировать) ===\n' + refs + '\n=== КОНЕЦ ЭТАЛОНА ===' : ''}`;
      const r = await AI.run({ task: PIMGS.length ? 'visionpost' : sky.length > 9000 ? 'long' : 'short', system: KB.posts, user, images: PIMGS, maxTokens: 6000, temperature: 0.9, onStatus: t => st.textContent = 'Пишет: ' + t });
      outCards(r.text, $('#pOut')); st.textContent = 'Готово · ' + r.label;
    } catch (e) { st.className = 'status err'; st.textContent = e.message; }
    finally { $('#btnPost').disabled = false; }
  };

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
        showTab('texts'); segSet($('#textSeg'), 'post'); $('#tx-comment').hidden = true; $('#tx-post').hidden = false; toast('Тема поста заполнена');
      });
    } catch (e) { $('#skyOut').innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
  };

  // ---------- архив
  async function renderArchive() {
    let all = []; try { all = (await DB.all()) || []; } catch (e) { }
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
    try { const j = JSON.parse(await f.text()); let n = 0; for (const x of (j.jobs || [])) { if (x && x.id) { await DB.put(x); n++; } } toast('Загружено разборов: ' + n); renderArchive(); }
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

  $('#help').innerHTML = `<div class="help">
  <h3>1. Один раз: ключи</h3>
  <ol><li>Откройте ссылку «получить ключ» у Gemini, войдите через Google-аккаунт, нажмите Create API key, скопируйте ключ и вставьте сюда.</li>
  <li>Так же можно добавить Groq и OpenRouter: Groq быстро отвечает на комментарии, OpenRouter подстрахует, когда лимит Gemini на сегодня закончится.</li>
  <li>Нажмите «Проверить ключи». Зелёная строка значит, что всё работает.</li></ol>
  <h3>2. Один раз: приложение на экран</h3>
  <p>В Safari нажмите «Поделиться» → «На экран Домой». Так сайт открывается как приложение и надёжнее хранит архив.</p>
  <h3>3. Разбор</h3>
  <ol><li>Вкладка «Разбор»: выберите продукт, введите имя, дату, время и город (начните печатать и выберите из списка).</li>
  <li>Вопрос клиента впишите своими словами. В поле «что рассказал о себе» только то, что человек сказал сам.</li>
  <li>«Посчитать карту», потом «Написать разбор». Код Луны пишется 2–4 минуты, полный разбор 6–12 минут. Экран можно не трогать.</li>
  <li>Вкладка «Проверка»: красное исправляется кнопкой, жёлтое перечитайте. Обязательно прочитайте весь текст сами.</li>
  <li>Правки: во вкладке «Текст» напишите замечание обычными словами, например «в части IV убрать фразу про бабушку». Можно править и руками прямо в тексте.</li>
  <li>«Конспект»: текст для голосовых. Розовое это крючки на продажу.</li>
  <li>«PDF» → «Открыть книгу» → «Поделиться PDF» → «Отправить или сохранить». Файл можно сразу отправить клиенту в Telegram или сохранить в Файлы.</li></ol>
  <h3>4. Комментарии и посты</h3>
  <p>«Тексты» → вставьте комментарий или скриншот переписки → «Ответить»: будет три варианта. Для поста выберите формат и тему. Можно прикрепить скриншот поста, на который хочется равняться: с него возьмутся формат и подача, а текст будет вашим. Во вкладке «Небо» нажмите на событие, и тема поста заполнится сама с точными датами.</p>
  <h3>5. Приватность</h3>
  <p>В ИИ уходят только имя и готовый расчёт: дата, время и место рождения не передаются (галочка выше). Фамилии, телефоны и ники клиентов в поля не пишите.</p>
  <h3>6. Если что-то не так</h3>
  <ul><li>«Нет рабочих ключей» или «лимит»: добавьте второй ключ или продолжите завтра, готовые части сохраняются.</li>
  <li>Без ключей: «Создание» → «Сделать вручную в чате» → скопируйте задание, вставьте в Qwen Chat или DeepSeek, ответ вставьте обратно.</li>
  <li>Город не находится: «ввести координаты вручную».</li>
  <li>Раз в неделю: «Архив» → «Скачать копию архива».</li></ul></div>`;

  // ---------- старт
  renderProducts(); renderPersons();
  if (!Object.keys(AI.keys()).length) $('#topnote').innerHTML = '<span style="color:var(--warn)">добавьте ключ в «Ещё»</span>';
})();
