/* Астро-мастерская: расчётный движок. Требует глобальные Astronomy (astronomy-engine), DATA_CHIRON, DATA_STARS. */
(function (G) {
  'use strict';
  const A = G.Astronomy;
  const DEG = Math.PI / 180;
  const norm = x => ((x % 360) + 360) % 360;
  const diff = (a, b) => ((a - b + 540) % 360) - 180;

  const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
  const SIGNS_G = ['Овна', 'Тельца', 'Близнецов', 'Рака', 'Льва', 'Девы', 'Весов', 'Скорпиона', 'Стрельца', 'Козерога', 'Водолея', 'Рыб'];
  const SIGNS_P = ['Овне', 'Тельце', 'Близнецах', 'Раке', 'Льве', 'Деве', 'Весах', 'Скорпионе', 'Стрельце', 'Козероге', 'Водолее', 'Рыбах'];
  const PLANETS = [['Sun', 'Солнце'], ['Moon', 'Луна'], ['Mercury', 'Меркурий'], ['Venus', 'Венера'], ['Mars', 'Марс'],
    ['Jupiter', 'Юпитер'], ['Saturn', 'Сатурн'], ['Uranus', 'Уран'], ['Neptune', 'Нептун'], ['Pluto', 'Плутон']];
  const RU = Object.fromEntries(PLANETS);
  const RULER = ['Марс', 'Венера', 'Меркурий', 'Луна', 'Солнце', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Сатурн', 'Юпитер'];
  const MODERN = { 7: 'Плутон', 10: 'Уран', 11: 'Нептун' };
  const EXALT = { 'Солнце': 0, 'Луна': 1, 'Меркурий': 5, 'Венера': 11, 'Марс': 9, 'Юпитер': 3, 'Сатурн': 6 };
  const ASPECTS = [[0, 'соединение', 8], [180, 'оппозиция', 8], [120, 'трин', 7], [90, 'квадрат', 7], [60, 'секстиль', 5],
    [150, 'квинконс', 2.5], [30, 'полусекстиль', 2], [45, 'полуквадрат', 2], [135, 'полутораквадрат', 2]];
  const PHASES = ['новолуние', 'серп (растущая Луна)', 'первая четверть', 'выпуклая растущая', 'полнолуние', 'рассеивающая', 'последняя четверть', 'бальзамическая'];
  const PHASE_MEAN = ['начало, импульс, действие по наитию', 'рост через усилие, отрыв от старого', 'кризис действия, решения, стройка',
    'совершенствование, доводка', 'осознание, отношения, видимость', 'передача, учительство, делиться смыслом',
    'кризис убеждений, переосмысление', 'завершение, отпускание, взгляд в будущее'];

  const fmtDeg = lon => { const d = lon % 30; const m = Math.floor(d * 60 + 1e-6); return `${Math.floor(m / 60)}°${String(m % 60).padStart(2, '0')}′`; };
  const fmtPos = lon => `${fmtDeg(lon)} ${SIGNS_G[Math.floor(norm(lon) / 30)]}`;
  const fmtOrb = o => { const m = Math.round(Math.abs(o) * 60); return `${Math.floor(m / 60)}°${String(m % 60).padStart(2, '0')}′`; };
  const signOf = lon => Math.floor(norm(lon) / 30);

  // ---------- время и пояса
  function tzOffsetMin(tz, ms) {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {}; dtf.formatToParts(new Date(ms)).forEach(x => { if (x.type !== 'literal') p[x.type] = x.value; });
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return Math.round((asUTC - ms) / 60000);
  }
  function localToUTC(y, mo, d, h, mi, tz, manualOffsetMin) {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    if (manualOffsetMin !== undefined && manualOffsetMin !== null && manualOffsetMin !== '') {
      return { ms: guess - manualOffsetMin * 60000, offset: +manualOffsetMin, note: 'смещение задано вручную' };
    }
    const o1 = tzOffsetMin(tz, guess);
    let ms = guess - o1 * 60000;
    const o2 = tzOffsetMin(tz, ms);
    let note = '';
    if (o2 !== o1) { ms = guess - o2 * 60000; note = 'время попадает на перевод часов, проверьте вручную'; }
    return { ms, offset: tzOffsetMin(tz, ms), note };
  }
  function fmtDate(ms, tz, withTime) {
    const o = { timeZone: tz || 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; o.hourCycle = 'h23'; }
    return new Intl.DateTimeFormat('ru-RU', o).format(new Date(ms)).replace(',', '');
  }
  const offStr = m => `UTC${m >= 0 ? '+' : '−'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? ':' + String(Math.abs(m) % 60).padStart(2, '0') : ''}`;
  const T = ms => A.MakeTime(new Date(ms));
  const msOf = t => t.date.getTime();

  // ---------- положения
  function lonOf(name, t) {
    if (name === 'Moon') return norm(A.EclipticGeoMoon(t).lon);
    if (name === 'Sun') return norm(A.SunPosition(t).elon);
    const v = A.GeoVector(name, t, true);
    const s = A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_ECT(t), v));
    return norm(s.lon);
  }
  function trueNode(t) {
    const s = A.GeoMoonState(t);
    const r = A.Rotation_EQJ_ECT(t);
    const p = A.RotateVector(r, new A.Vector(s.x, s.y, s.z, t));
    const v = A.RotateVector(r, new A.Vector(s.vx, s.vy, s.vz, t));
    const hx = p.y * v.z - p.z * v.y, hy = p.z * v.x - p.x * v.z;
    return norm(Math.atan2(hx, -hy) / DEG);
  }
  function meanLilith(t) {
    const Tc = t.tt / 36525;
    const per = 83.3532465 + 4069.0137287 * Tc - 0.0103200 * Tc * Tc - Tc * Tc * Tc / 80053 + Tc ** 4 / 18999000;
    let corr = 0; const D = G.DATA_LILITH;
    if (D) { const x = (t.ut + 2451545.0 - D.start) / D.step; const i = Math.floor(x); if (i >= 0 && i + 1 < D.vals.length) corr = (D.vals[i] + (D.vals[i + 1] - D.vals[i]) * (x - i)) / 3600; }
    return norm(per + 180 + corr);
  }
  function chiron(t) {
    const C = G.DATA_CHIRON; const jd = t.ut + 2451545.0;
    const x = (jd - C.start) / C.step; let i = Math.floor(x) - 1;
    if (i < 0 || i + 3 >= C.vals.length) return null;
    const ys = [0, 1, 2, 3].map(k => C.vals[i + k] / 100);
    for (let k = 1; k < 4; k++) { while (ys[k] - ys[k - 1] > 180) ys[k] -= 360; while (ys[k] - ys[k - 1] < -180) ys[k] += 360; }
    const u = x - i; // 1..2
    const L = (j) => { let r = 1; for (let m = 0; m < 4; m++) if (m !== j) r *= (u - m) / (j - m); return r; };
    return norm(ys.reduce((s, y, j) => s + y * L(j), 0));
  }
  // быстрые таблицы медленных планет (Swiss Ephemeris, шаг 10 дней, кубическая интерполяция)
  const SLOWTAB = {};
  if (G.DATA_SLOW) ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].forEach(k => {
    const d = G.DATA_SLOW[k]; const a = new Float64Array(d.length); let acc = 0;
    for (let i = 0; i < d.length; i++) { acc += d[i]; a[i] = acc / 1000; }
    SLOWTAB[k] = a;
  });
  function tableLon(key, t) {
    const a = SLOWTAB[key]; if (!a) return null;
    const x = (t.ut + 2451545.0 - G.DATA_SLOW.start) / G.DATA_SLOW.step; const i = Math.floor(x) - 1;
    if (i < 0 || i + 3 >= a.length) return null;
    const u = x - i; let y = 0;
    for (let j = 0; j < 4; j++) { let r = 1; for (let m = 0; m < 4; m++) if (m !== j) r *= (u - m) / (j - m); y += a[i + j] * r; }
    return norm(y);
  }
  function pointLon(key, t) {
    if (SLOWTAB[key]) { const v = tableLon(key, t); if (v !== null) return v; }
    if (key === 'Node') return trueNode(t);
    if (key === 'Chiron') return chiron(t);
    if (key === 'Lilith') return meanLilith(t);
    return lonOf(key, t);
  }
  function speedOf(key, t) {
    const a = pointLon(key, t.AddDays(-0.25)), b = pointLon(key, t.AddDays(0.25));
    if (a === null || b === null) return 0;
    return diff(b, a) * 2;
  }

  // ---------- дома
  function houses(t, lat, lonE) {
    const ramc = norm(A.SiderealTime(t) * 15 + lonE);
    const eps = A.e_tilt(t).tobl;
    const e = eps * DEG, f = lat * DEG, R = ramc * DEG;
    const mc = norm(Math.atan2(Math.sin(R), Math.cos(R) * Math.cos(e)) / DEG);
    const asc = norm(Math.atan2(Math.cos(R), -(Math.sin(R) * Math.cos(e) + Math.tan(f) * Math.sin(e))) / DEG);
    function plac(fr, upper) {
      let lam = upper ? norm(mc + fr * diff(asc, mc + 0) * (diff(asc, mc) < 0 ? -1 : 1)) : norm(asc + fr * 30);
      lam = upper ? norm(mc + fr * norm(asc - mc)) : norm(asc + (1 - fr) * norm(mc + 180 - asc));
      for (let i = 0; i < 60; i++) {
        const dec = Math.asin(Math.sin(e) * Math.sin(lam * DEG));
        const x = Math.tan(f) * Math.tan(dec);
        if (Math.abs(x) > 1) return null;
        const AD = Math.asin(x) / DEG;
        const ra = upper ? ramc + fr * (90 + AD) : ramc + 180 - fr * (90 - AD);
        const nl = norm(Math.atan2(Math.sin(ra * DEG), Math.cos(ra * DEG) * Math.cos(e)) / DEG);
        if (Math.abs(diff(nl, lam)) < 1e-8) { lam = nl; break; }
        lam = nl;
      }
      return lam;
    }
    let c11 = plac(1 / 3, true), c12 = plac(2 / 3, true), c2 = plac(2 / 3, false), c3 = plac(1 / 3, false);
    let system = 'Плацидус';
    if ([c11, c12, c2, c3].some(v => v === null)) {
      system = 'Порфирий (Плацидус не работает на этой широте)';
      const q1 = norm(asc - mc), q2 = norm(mc + 180 - asc);
      c11 = norm(mc + q1 / 3); c12 = norm(mc + 2 * q1 / 3); c2 = norm(asc + q2 / 3); c3 = norm(asc + 2 * q2 / 3);
    }
    const cusps = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180), norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12];
    return { asc, mc, cusps, system, ramc, eps };
  }
  function houseOf(lon, cusps) {
    for (let i = 0; i < 12; i++) { const a = cusps[i], b = cusps[(i + 1) % 12]; if (norm(lon - a) < norm(b - a)) return i + 1; }
    return 1;
  }
  function dignity(planet, s) {
    if (!(planet in EXALT)) return '';
    if (RULER[s] === planet) return 'обитель';
    if (EXALT[planet] === s) return 'экзальтация';
    if (RULER[(s + 6) % 12] === planet) return 'изгнание';
    if (EXALT[planet] === (s + 6) % 12) return 'падение';
    return '';
  }

  // ---------- карта
  function chart(input) {
    // input: {name, y, mo, d, h, mi, tz, lat, lon, place, manualOffset, noTime}
    const lt = localToUTC(input.y, input.mo, input.d, input.noTime ? 12 : input.h, input.noTime ? 0 : input.mi, input.tz, input.manualOffset);
    const t = T(lt.ms);
    const pts = {};
    PLANETS.forEach(([k, ru]) => { pts[ru] = { key: k, lon: lonOf(k, t), spd: speedOf(k, t) }; });
    pts['Узел'] = { key: 'Node', lon: trueNode(t), spd: speedOf('Node', t) };
    pts['Лилит'] = { key: 'Lilith', lon: meanLilith(t), spd: 0.111 };
    const ch = chiron(t); if (ch !== null) pts['Хирон'] = { key: 'Chiron', lon: ch, spd: speedOf('Chiron', t) };
    const H = input.noTime ? null : houses(t, input.lat, input.lon);
    if (H) {
      pts['ASC'] = { key: 'ASC', lon: H.asc, spd: 0 }; pts['MC'] = { key: 'MC', lon: H.mc, spd: 0 };
      const sunH = houseOf(pts['Солнце'].lon, H.cusps);
      const day = sunH >= 7;
      const fort = day ? norm(H.asc + pts['Луна'].lon - pts['Солнце'].lon) : norm(H.asc + pts['Солнце'].lon - pts['Луна'].lon);
      pts['Фортуна'] = { key: 'Fortune', lon: fort, spd: 0, day };
    }
    Object.entries(pts).forEach(([ru, p]) => {
      p.sign = signOf(p.lon); p.retro = p.spd < 0 && !['ASC', 'MC', 'Фортуна', 'Лилит', 'Узел'].includes(ru);
      p.house = H ? houseOf(p.lon, H.cusps) : null; p.dig = dignity(ru, p.sign);
    });
    return { input, t, ms: lt.ms, offset: lt.offset, tzNote: lt.note, pts, H };
  }

  const TEN = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Плутон'];
  function aspectsOf(pts, list) {
    const keys = (list || Object.keys(pts)).filter(k => list || k !== 'Фортуна');
    const out = [];
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j]; if (!pts[a] || !pts[b]) continue;
      if ((a === 'ASC' && b === 'MC') || (a === 'MC' && b === 'ASC')) continue;
      const bothPlanets = TEN.includes(a) && TEN.includes(b);
      const minorPt = ['Лилит', 'Узел', 'Хирон', 'Фортуна'].includes(a) || ['Лилит', 'Узел', 'Хирон', 'Фортуна'].includes(b);
      const d = Math.abs(diff(pts[a].lon, pts[b].lon));
      for (const [ang, nm, orb] of ASPECTS) {
        if ([30, 45, 135].includes(ang) && !bothPlanets) continue;
        if (ang === 150 && minorPt) continue;
        const o = Math.abs(d - ang);
        if (o <= orb) {
          const sd = ((signOf(pts[b].lon) - signOf(pts[a].lon)) % 12 + 12) % 12, k = ang / 30;
          const outOfSign = Number.isInteger(k) && sd !== k && sd !== (12 - k) % 12;
          out.push({ a, b, name: nm, ang, orb: o, outOfSign }); break;
        }
      }
    }
    return out.sort((x, y) => x.orb - y.orb);
  }

  function starsOn(pts, t) {
    const Tc = t.tt / 36525; const out = [];
    for (const [nm, l2000, mag] of G.DATA_STARS) {
      const L = norm(l2000 + 1.3969712 * Tc);
      for (const [p, v] of Object.entries(pts)) {
        if (['Фортуна', 'Лилит'].includes(p)) continue;
        const o = Math.abs(diff(L, v.lon));
        if (o <= 1.5) out.push({ star: nm, point: p, orb: o, mag });
      }
    }
    return out.sort((a, b) => a.orb - b.orb);
  }

  function dispositors(pts) {
    const names = PLANETS.map(p => p[1]);
    const chains = {}; const finals = new Set(); const mutual = [];
    names.forEach(n => {
      const seq = [n]; let cur = n;
      for (let k = 0; k < 12; k++) {
        const r = RULER[pts[cur].sign];
        if (r === cur) { finals.add(cur); break; }
        if (seq.includes(r)) { seq.push(r); break; }
        seq.push(r); cur = r;
      }
      chains[n] = seq;
    });
    for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
      const a = names[i], b = names[j];
      if (RULER[pts[a].sign] === b && RULER[pts[b].sign] === a) mutual.push([a, b]);
    }
    return { chains, finals: [...finals], mutual };
  }

  function combustion(pts) {
    const out = [];
    ['Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн'].forEach(p => {
      const d = Math.abs(diff(pts[p].lon, pts['Солнце'].lon));
      if (d <= 17 / 60) out.push(`${p}: казими (в сердце Солнца), ${fmtOrb(d)}`);
      else if (d <= 8.5) out.push(`${p}: сожжён, ${fmtOrb(d)} от Солнца`);
      else if (d <= 17) out.push(`${p}: под лучами, ${fmtOrb(d)} от Солнца`);
    });
    return out;
  }

  // ---------- Луна
  function lunations(t0, t1) {
    const out = []; let mq = A.SearchMoonQuarter(t0);
    while (mq.time.ut < t1.ut) {
      if (mq.quarter === 0 || mq.quarter === 2) out.push({ kind: mq.quarter === 0 ? 'новолуние' : 'полнолуние', time: mq.time, lon: lonOf('Moon', mq.time) });
      mq = A.NextMoonQuarter(mq);
    }
    return out;
  }
  function moonBlock(c) {
    const p = c.pts, m = p['Луна'];
    const el = norm(m.lon - p['Солнце'].lon);
    const before = lunations(c.t.AddDays(-32), c.t).pop();
    const after = lunations(c.t, c.t.AddDays(32)).find(x => x.kind === 'новолуние');
    const ruled = c.H ? c.H.cusps.map((cu, i) => RULER[signOf(cu)] === 'Луна' ? i + 1 : 0).filter(Boolean) : [];
    return { el, phase: PHASES[Math.floor(el / 45)], phaseMean: PHASE_MEAN[Math.floor(el / 45)], speed: m.spd, prenatal: before, nextNew: after, ruled };
  }

  // ---------- прогрессии
  const progT = (c, ms) => c.t.AddDays((ms - c.ms) / 86400000 / 365.2422);
  function progressed(c, ms) {
    const pt = progT(c, ms); const o = {};
    ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'].forEach(k => { o[RU[k]] = lonOf(k, pt); });
    return o;
  }
  function progSearch(c, fnVal, fromMs, toMs, stepDays, targets) {
    // находит моменты (реальное время), когда fnVal(прогрессия) пересекает targets (градусы)
    const out = []; let a = fromMs; let va = fnVal(progT(c, a));
    while (a < toMs) {
      const b = a + stepDays * 86400000; const vb = fnVal(progT(c, b));
      for (const tg of targets) {
        const da = diff(va, tg), db = diff(vb, tg);
        if (da < 0 && db >= 0 && Math.abs(da) < 30) {
          let lo = a, hi = b;
          for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (diff(fnVal(progT(c, mid)), tg) < 0) lo = mid; else hi = mid; }
          out.push({ ms: hi, target: tg });
        }
      }
      a = b; va = vb;
    }
    return out.sort((x, y) => x.ms - y.ms);
  }

  // ---------- транзиты
  const SLOW = [['Jupiter', 'Юпитер', 2], ['Saturn', 'Сатурн', 3], ['Chiron', 'Хирон', 4], ['Uranus', 'Уран', 4], ['Neptune', 'Нептун', 5], ['Pluto', 'Плутон', 5], ['Node', 'Сев. узел', 2]];
  const TR_ASP = [[0, 'соединение'], [180, 'оппозиция'], [90, 'квадрат'], [120, 'трин'], [60, 'секстиль']];
  function transits(c, fromMs, toMs, o) {
    o = o || {};
    const targets = (o.targets || ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'ASC', 'MC']).filter(n => c.pts[n]);
    const bodies = SLOW.filter(b => !o.bodies || o.bodies.includes(b[1]));
    const out = [];
    bodies.forEach(([key, ru, step], bi) => {
      let asps = o.asps ? TR_ASP.filter(x => o.asps.includes(x[1])) : TR_ASP;
      if (key === 'Node') asps = asps.filter(x => x[0] === 0 || x[0] === 180);
      let a = fromMs, la = pointLon(key, T(a));
      while (a < toMs) {
        const b = Math.min(a + step * 86400000, toMs); const lb = pointLon(key, T(b));
        if (la !== null && lb !== null) {
          for (const tn of targets) {
            const tl = c.pts[tn].lon;
            for (const [ang, an] of asps) {
              for (const sg of (ang === 0 || ang === 180 ? [1] : [1, -1])) {
                const goal = norm(tl + sg * ang);
                const da = diff(la, goal), db = diff(lb, goal);
                if ((da < 0) !== (db < 0) && Math.abs(da) < 10 && Math.abs(db) < 10) {
                  let lo = a, hi = b, dlo = da;
                  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; const dm = diff(pointLon(key, T(mid)), goal); if ((dm < 0) === (dlo < 0)) { lo = mid; dlo = dm; } else hi = mid; }
                  out.push({ key, body: ru, target: tn, asp: an, goal, ms: (lo + hi) / 2 });
                }
              }
            }
          }
        }
        a = b; la = lb;
      }
      if (o.onProgress) o.onProgress((bi + 1) / bodies.length);
    });
    return out.sort((x, y) => x.ms - y.ms);
  }
  function orbEdge(key, goal, ms, dir, orb) {
    // от точного прохода идём в сторону dir (-1 назад, +1 вперёд), пока планета не выйдет из орба
    const step = 2 * 86400000; let a = ms;
    for (let k = 0; k < 400; k++) {
      const b = a + dir * step; const v = pointLon(key, T(b)); if (v === null) return null;
      if (Math.abs(diff(v, goal)) > orb) {
        let lo = a, hi = b; // lo внутри, hi снаружи
        for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (Math.abs(diff(pointLon(key, T(m)), goal)) <= orb) lo = m; else hi = m; }
        return lo;
      }
      a = b;
    }
    return null;
  }
  function groupTransits(list, tz, withOrb) {
    const g = {}; const order = [];
    list.forEach(e => { const k = `${e.body} ${e.asp} ${e.target}`; if (!g[k]) { g[k] = []; order.push(k); } g[k].push(e); });
    const rows = [];
    order.forEach(k => {
      let cur = [];
      g[k].forEach(e => { if (cur.length && e.ms - cur[cur.length - 1].ms > 2 * 365 * 86400000) { rows.push({ k, ev: cur }); cur = []; } cur.push(e); });
      if (cur.length) rows.push({ k, ev: cur });
    });
    rows.sort((x, y) => x.ev[0].ms - y.ev[0].ms);
    return rows.map(r => {
      const o = { text: r.k, first: r.ev[0].ms, last: r.ev[r.ev.length - 1].ms, dates: r.ev.map(e => fmtDate(e.ms, tz)) };
      if (withOrb) {
        const e0 = r.ev[0], e1 = r.ev[r.ev.length - 1];
        const s = orbEdge(e0.key, e0.goal, e0.ms, -1, 1), f = orbEdge(e1.key, e1.goal, e1.ms, 1, 1);
        if (s && f) { o.orb = `в орбе 1° с ${fmtDate(s, tz)} по ${fmtDate(f, tz)}`; o.os = s; o.oe = f; }
      }
      return o;
    });
  }

  // ---------- небо
  function stations(key, fromMs, toMs) {
    const out = []; let a = fromMs, sa = speedOf(key, T(a));
    while (a < toMs) {
      const b = a + 86400000; const sb = speedOf(key, T(b));
      if ((sa < 0) !== (sb < 0)) {
        let lo = a, hi = b;
        for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if ((speedOf(key, T(m)) < 0) === (sa < 0)) lo = m; else hi = m; }
        out.push({ ms: hi, kind: sb < 0 ? 'разворот назад (ретро)' : 'разворот вперёд (директ)', retro: sb < 0, lon: pointLon(key, T(hi)) });
      }
      a = b; sa = sb;
    }
    return out;
  }
  function ingresses(key, fromMs, toMs) {
    const out = []; let a = fromMs, sa = signOf(pointLon(key, T(a)));
    const step = key === 'Moon' ? 0.1 : 1;
    while (a < toMs) {
      const b = a + step * 86400000; const sb = signOf(pointLon(key, T(b)));
      if (sb !== sa) {
        let lo = a, hi = b;
        for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (signOf(pointLon(key, T(m))) === sa) lo = m; else hi = m; }
        out.push({ ms: hi, sign: sb, from: sa });
      }
      a = b; sa = sb;
    }
    return out;
  }
  const ECL_L = { penumbral: 'полутеневое', partial: 'частное', total: 'полное' };
  const ECL_S = { partial: 'частное', annular: 'кольцеобразное', total: 'полное', hybrid: 'гибридное' };
  function eclipses(fromMs, toMs) {
    const t0 = T(fromMs), t1 = T(toMs), out = [];
    let le = A.SearchLunarEclipse(t0);
    while (le.peak.ut < t1.ut) { out.push({ ms: msOf(le.peak), kind: 'лунное затмение (' + (ECL_L[le.kind] || le.kind) + ')', lon: lonOf('Moon', le.peak) }); le = A.NextLunarEclipse(le.peak); }
    let se = A.SearchGlobalSolarEclipse(t0);
    while (se.peak.ut < t1.ut) { out.push({ ms: msOf(se.peak), kind: 'солнечное затмение (' + (ECL_S[se.kind] || se.kind) + ')', lon: lonOf('Sun', se.peak) }); se = A.NextGlobalSolarEclipse(se.peak); }
    return out.sort((a, b) => a.ms - b.ms);
  }
  function eclipsesOn(points, fromMs, toMs, orb, tz, label) {
    const out = [];
    eclipses(fromMs, toMs).forEach(e => Object.entries(points).forEach(([n, v]) => {
      if (['Фортуна', 'Лилит'].includes(n) || v == null) return;
      const lon = typeof v === 'number' ? v : v.lon;
      const o = Math.abs(diff(e.lon, lon)), o2 = Math.abs(diff(e.lon, lon + 180));
      if (o <= orb || o2 <= orb) out.push(`${fmtDate(e.ms, tz)}: ${e.kind} в ${fmtPos(e.lon)} ${o <= orb ? 'на точке' : 'напротив точки'} ${label ? label + ': ' : ''}${dn(n)} (${fmtOrb(Math.min(o, o2))})`);
    }));
    return out;
  }
  function retroPeriods(key, fromMs, toMs, tz, H) {
    const st = stations(key, fromMs - 120 * 86400000, toMs), out = [];
    for (let i = 0; i < st.length; i++) if (st[i].retro) {
      const d2 = st[i + 1]; if (d2 && d2.ms < fromMs) continue; if (st[i].ms > toMs) break;
      out.push(`${RU[key]}: с ${fmtDate(st[i].ms, tz)} по ${d2 ? fmtDate(d2.ms, tz) : '...'}, от ${fmtPos(st[i].lon)} до ${d2 ? fmtPos(d2.lon) : '...'}${H ? ', дом ' + houseOf(st[i].lon, H.cusps) : ''}`);
    }
    return out;
  }
  function sky(fromMs, toMs, tz) {
    const L = [];
    const sec = (title, ev) => { L.push('', title); if (!ev.length) L.push('нет'); ev.sort((a, b) => a.ms - b.ms).forEach(e => L.push(`${fmtDate(e.ms, tz, true)}: ${e.t}`)); };
    L.push(`=== НЕБО С ${fmtDate(fromMs, tz)} ПО ${fmtDate(toMs, tz)} (время: ${tz}) ===`);
    sec('НОВОЛУНИЯ И ПОЛНОЛУНИЯ', lunations(T(fromMs), T(toMs)).map(l => ({ ms: msOf(l.time), t: `${l.kind} в ${fmtPos(l.lon)}` })));
    sec('ЗАТМЕНИЯ', eclipses(fromMs, toMs).map(e => ({ ms: e.ms, t: `${e.kind} в ${fmtPos(e.lon)}` })));
    const st = [];
    ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].forEach(k => stations(k, fromMs, toMs).forEach(s => st.push({ ms: s.ms, t: `${RU[k]}: ${s.kind} в ${fmtPos(s.lon)}` })));
    sec('РАЗВОРОТЫ ПЛАНЕТ (начало и конец ретроградности)', st);
    const ing = [];
    ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].forEach(k => ingresses(k, fromMs, toMs).forEach(s => ing.push({ ms: s.ms, t: `${RU[k]} входит в знак ${SIGNS_G[s.sign]}${s.sign === (s.from + 11) % 12 ? ' (обратным ходом)' : ''}` })));
    sec('ПЕРЕХОДЫ ПЛАНЕТ В ЗНАКИ', ing);
    const asp = [];
    const slowK = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    for (let i = 0; i < slowK.length; i++) for (let j = i + 1; j < slowK.length; j++) {
      const a = slowK[i], b = slowK[j]; let x = fromMs, dx = null;
      for (const [ang, nm] of [[0, 'соединение'], [180, 'оппозиция'], [90, 'квадрат'], [120, 'трин'], [60, 'секстиль']]) {
        x = fromMs; const f = m => { const d = Math.abs(diff(pointLon(a, T(m)), pointLon(b, T(m)))); return d - ang; };
        dx = f(x);
        while (x < toMs) { const y = x + 2 * 86400000; const dy = f(y); if ((dx < 0) !== (dy < 0) && Math.abs(dx) < 3) { let lo = x, hi = y; for (let k = 0; k < 25; k++) { const m = (lo + hi) / 2; if ((f(m) < 0) === (dx < 0)) lo = m; else hi = m; } asp.push({ ms: hi, t: `${RU[a]} ${nm} ${RU[b]} (точный аспект)` }); } x = y; dx = dy; }
      }
    }
    sec('АСПЕКТЫ МЕЖДУ МЕДЛЕННЫМИ ПЛАНЕТАМИ', asp);
    return L.join('\n');
  }

  // ---------- текстовый блок данных
  const dn = k => k === 'Узел' ? 'Сев. узел' : k;
  const Y = 365.25 * 86400000;
  function natalText(c, opt) {
    opt = opt || {}; const tz = opt.tz || 'Europe/Moscow';
    const scope = opt.scope || 'full';
    const p = c.pts, H = c.H, inp = c.input; const L = [];
    const nowMs = opt.nowMs || Date.now();
    L.push(`=== БЛОК ДАННЫХ: ${inp.name || 'Карта'}${opt.role ? ' (' + opt.role + ')' : ''} ===`);
    if (opt.private) {
      L.push(`Рождение: ${inp.noTime ? 'время неизвестно (дома, ASC, MC и Фортуна не считаются)' : 'время известно'}. Дата, место и координаты не передаются (приватность), все расчёты уже выполнены программой.`);
    } else {
      L.push(`Рождение: ${String(inp.d).padStart(2, '0')}.${String(inp.mo).padStart(2, '0')}.${inp.y}, ${inp.noTime ? 'время неизвестно (взят полдень; дома, ASC, MC и Фортуна не считаются, Луна указана на полдень)' : String(inp.h).padStart(2, '0') + ':' + String(inp.mi).padStart(2, '0') + ' местного времени'}, ${inp.place || ''} (${inp.lat.toFixed(2)}, ${inp.lon.toFixed(2)})`);
      L.push(`Часовой пояс на дату рождения: ${offStr(c.offset)} (${inp.manualOffset != null && inp.manualOffset !== '' ? 'задан вручную' : inp.tz}), UTC ${fmtDate(c.ms, 'UTC', true)}${c.tzNote ? '. ВНИМАНИЕ: ' + c.tzNote : ''}`);
    }
    L.push(`Возраст на дату расчёта: ${Math.floor((nowMs - c.ms) / (365.2422 * 86400000))}. Тропический зодиак${H ? ', дома: ' + H.system : ''}. Все даты ниже по времени: ${tz}.`);
    L.push('', 'ПОЛОЖЕНИЯ');
    Object.entries(p).forEach(([n, v]) => {
      L.push(`${n === 'Узел' ? 'Северный узел' : n}: ${fmtPos(v.lon)}${v.house ? ', дом ' + v.house : ''}${v.retro ? ', ретроградный' : ''}${v.dig ? ', ' + v.dig : ''}`);
      if (n === 'Узел') L.push(`Южный узел: ${fmtPos(norm(v.lon + 180))}${H ? ', дом ' + houseOf(norm(v.lon + 180), H.cusps) : ''}`);
    });
    if (H) {
      L.push('', 'КУСПИДЫ И УПРАВИТЕЛИ (традиционные; в скобках современные)');
      H.cusps.forEach((cu, i) => {
        const s = signOf(cu); const r = RULER[s]; const rp = p[r];
        L.push(`Дом ${i + 1}: ${fmtPos(cu)}; управитель ${r}${MODERN[s] ? ' (' + MODERN[s] + ')' : ''} в ${SIGNS_P[rp.sign]}, дом ${rp.house}`);
      });
      const occ = {}; Object.entries(p).forEach(([n, v]) => { if (TEN.includes(n)) (occ[v.house] = occ[v.house] || []).push(n); });
      const st = Object.entries(occ).filter(([h, a]) => a.length >= 3);
      if (st.length) L.push('Скопления (3+ планеты в доме): ' + st.map(([h, a]) => `дом ${h}: ${a.join(', ')}`).join('; '));
      const age = Math.floor((nowMs - c.ms) / (365.2422 * 86400000));
      const ph = age % 12 + 1; const ps = (signOf(H.asc) + age % 12) % 12;
      L.push(`Профекция: возраст ${age}, год ${ph} дома (знак ${SIGNS_G[ps]}), управитель года ${RULER[ps]}`);
      L.push(`Рождение ${p['Фортуна'].day ? 'дневное' : 'ночное'}`);
    }
    L.push('', 'АСПЕКТЫ (орбы: соединение и оппозиция 8°, трин и квадрат 7°, секстиль 5°, квинконс 2°30′, минорные 2°)');
    aspectsOf(p).forEach(a => L.push(`${dn(a.a)} ${a.name} ${dn(a.b)}: ${fmtOrb(a.orb)}${a.orb < 0.25 ? ' (опорная, точнее 15′)' : a.orb < 1 ? ' (точная, точнее 1°)' : ''}${a.outOfSign ? ' (через границу знака)' : ''}`));
    const cmb = combustion(p); if (cmb.length) { L.push('', 'СОЖЖЕНИЕ'); cmb.forEach(x => L.push(x)); }
    const D = dispositors(p);
    L.push('', 'УПРАВИТЕЛИ ПЛАНЕТ (цепочки)');
    Object.values(D.chains).forEach(ch => L.push(ch.join(' → ')));
    L.push(`Финальные управители: ${D.finals.join(', ') || 'нет'}; взаимные рецепции: ${D.mutual.map(m => m.join(' и ')).join('; ') || 'нет'}`);
    const st = starsOn(p, c.t);
    L.push('', 'ЗВЁЗДЫ (орб 1°30′)'); if (!st.length) L.push('нет'); st.forEach(s => L.push(`${dn(s.point)}: звезда ${s.star}, ${fmtOrb(s.orb)}`));
    const M = moonBlock(c);
    L.push('', 'ЛУНА ПОДРОБНО');
    L.push(`Фаза при рождении: ${M.phase} (${Math.round(M.el)}° от Солнца): ${M.phaseMean}`);
    L.push(`Скорость: ${M.speed.toFixed(2)}° в сутки при средней 13,18°: ${M.speed < 12.4 ? 'медленная Луна' : M.speed > 14.2 ? 'быстрая Луна' : 'средняя'}`);
    if (M.prenatal) L.push(`Предродовая лунация: ${M.prenatal.kind} ${fmtDate(msOf(M.prenatal.time), tz)} в ${fmtPos(M.prenatal.lon)}${H ? ', дом ' + houseOf(M.prenatal.lon, H.cusps) : ''}`);
    if (M.nextNew) L.push(`Ближайшее новолуние после рождения: ${fmtDate(msOf(M.nextNew.time), tz)}`);
    if (H) L.push(`Луна управляет домами: ${M.ruled.join(', ') || 'нет (Рак перехвачен)'}`);
    L.push(`Управитель Луны: ${RULER[p['Луна'].sign]} в ${SIGNS_P[p[RULER[p['Луна'].sign]].sign]}${H ? ', дом ' + p[RULER[p['Луна'].sign]].house : ''}`);
    L.push('Связи Луны: ' + (aspectsOf(p).filter(a => a.a === 'Луна' || a.b === 'Луна').map(a => `${dn(a.a === 'Луна' ? a.b : a.a)} ${a.name} ${fmtOrb(a.orb)}`).join('; ') || 'нет'));
    // прогрессии
    const PN = { 0: 'новолуние: старт нового большого цикла', 45: 'серп', 90: 'первая четверть: фаза действия', 135: 'выпуклая', 180: 'полнолуние: пик и видимость', 225: 'рассеивающая', 270: 'последняя четверть: пересмотр', 315: 'бальзамическая: завершение' };
    const ph = progSearch(c, t => norm(lonOf('Moon', t) - lonOf('Sun', t)), c.ms, Math.min(c.ms + 95 * Y, nowMs + 30 * Y), 20, [0, 45, 90, 135, 180, 225, 270, 315]);
    L.push('', 'БОЛЬШОЙ ЛУННЫЙ ЦИКЛ (прогрессивные фазы, цикл около 30 лет)');
    ph.forEach(x => L.push(`${fmtDate(x.ms, tz)}: ${PN[x.target]}${x.ms > nowMs ? '' : ''}`));
    const pr = progressed(c, nowMs);
    L.push(`Сейчас прогрессивная Луна в ${fmtPos(pr['Луна'])}${H ? ', дом ' + houseOf(pr['Луна'], H.cusps) : ''}; прогрессивное Солнце в ${fmtPos(pr['Солнце'])}${H ? ', дом ' + houseOf(pr['Солнце'], H.cusps) : ''}`);
    const pf = scope === 'short' ? nowMs - Y : nowMs - 3 * Y, pt = scope === 'short' ? nowMs + 3 * Y : nowMs + 8 * Y;
    const ingS = progSearch(c, t => lonOf('Moon', t), pf, pt, 10, [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    ingS.forEach(x => L.push(`${fmtDate(x.ms, tz)}: прогрессивная Луна входит в знак ${SIGNS_G[Math.round(x.target / 30) % 12]}`));
    if (H) {
      const ingH = progSearch(c, t => lonOf('Moon', t), pf, pt, 10, H.cusps);
      ingH.forEach(x => L.push(`${fmtDate(x.ms, tz)}: прогрессивная Луна входит в ${H.cusps.indexOf(x.target) + 1} дом`));
      const sH = progSearch(c, t => lonOf('Sun', t), c.ms, pt, 60, H.cusps);
      sH.forEach(x => L.push(`${fmtDate(x.ms, tz)}: прогрессивное Солнце входит в ${H.cusps.indexOf(x.target) + 1} дом`));
    }
    const pa = [];
    ['Луна', 'Солнце'].forEach(pn => {
      const key = pn === 'Луна' ? 'Moon' : 'Sun';
      ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'ASC', 'MC'].forEach(tn => {
        if (!p[tn] || tn === pn) return;
        [[0, 'соединение'], [90, 'квадрат'], [180, 'оппозиция'], [270, 'квадрат']].forEach(([ang, an]) => {
          progSearch(c, t => lonOf(key, t), pf, pt, key === 'Moon' ? 10 : 60, [norm(p[tn].lon + ang)]).forEach(x => pa.push({ ms: x.ms, t: `прогрессивное ${pn === 'Луна' ? 'Луна' : 'Солнце'} ${an} натальн. ${dn(tn)}` }));
        });
      });
    });
    pa.sort((a, b) => a.ms - b.ms).forEach(x => L.push(`${fmtDate(x.ms, tz)}: ${x.t.replace('прогрессивное Луна', 'прогрессивная Луна')}`));
    // транзиты
    if (opt.transits !== false) {
      const pastFrom = c.ms + 90 * 86400000;
      const split = scope === 'short' ? nowMs - Y : Math.max(nowMs - 3 * Y, pastFrom);
      const to = opt.trTo || pt;
      const prog = f => opt.onProgress && opt.onProgress(f);
      L.push('', 'ТРАНЗИТЫ: формат «транзитная планета, аспект, натальная точка: даты точных проходов». Даты в тексте брать ТОЛЬКО отсюда.');
      if (scope !== 'short' && split > pastFrom) {
        L.push('', `ПРОШЛОЕ (с ${fmtDate(pastFrom, tz)} по ${fmtDate(split, tz)}): только напряжённые аспекты медленных планет к личным точкам`);
        groupTransits(transits(c, pastFrom, split, { bodies: ['Сатурн', 'Хирон', 'Уран', 'Нептун', 'Плутон'], asps: ['соединение', 'оппозиция', 'квадрат'], targets: ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'ASC', 'MC'], onProgress: f => prog(f * 0.4) }), tz)
          .forEach(r => L.push(`${r.text}: ${r.dates.join(', ')}`));
      }
      let cc = c;
      if (opt.money && H) { cc = { pts: Object.assign({}, p, { 'куспид 2 дома': { lon: H.cusps[1] }, 'куспид 8 дома': { lon: H.cusps[7] } }) }; }
      const tg = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'ASC', 'MC'].concat(opt.money && H ? ['куспид 2 дома', 'куспид 8 дома'] : []);
      L.push('', `СЕЙЧАС И ВПЕРЕДИ (с ${fmtDate(split, tz)} по ${fmtDate(to, tz)}), с периодами действия в орбе 1°`);
      groupTransits(transits(cc, split, to, { targets: tg, onProgress: f => prog(0.4 + f * 0.6) }), tz, true)
        .forEach(r => { const end = r.oe || r.last, st = r.os || r.first; const stt = end < nowMs ? ', уже прошло' : st <= nowMs ? ', ИДЁТ СЕЙЧАС' : ''; L.push(`${r.text}: ${r.dates.join(', ')}${r.orb ? ' (' + r.orb + stt + ')' : stt}`); });
      L.push('', 'РЕТРОГРАДНОСТИ (ближайшие 12 месяцев)');
      ['Mercury', 'Venus', 'Mars'].forEach(k => retroPeriods(k, nowMs, nowMs + 365 * 86400000, tz, H).forEach(x => L.push(x)));
      L.push('', 'ЗАТМЕНИЯ НА ЛИЧНЫЕ ТОЧКИ (ближайшие 3 года, орб 3°)');
      const ec = eclipsesOn(p, nowMs, nowMs + 3 * Y, 3, tz); if (!ec.length) L.push('нет'); ec.forEach(x => L.push(x));
    }
    L.push('', `Дата расчёта: ${fmtDate(nowMs, tz)}`);
    return L.join('\n');
  }

  function synastryText(c1, c2, opt) {
    opt = opt || {}; const L = []; const tz = opt.tz || 'Europe/Moscow'; const nowMs = opt.nowMs || Date.now();
    const parent = opt.kind === 'parent';
    const keys = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'ASC', 'MC', 'Узел', 'Лилит', 'Хирон'];
    const n1 = c1.input.name || 'Первый', n2 = c2.input.name || 'Второй';
    L.push(parent ? `=== СВЯЗЬ КАРТ: ${n1} (ребёнок) и ${n2} (родитель) ===` : `=== СИНАСТРИЯ: ${n1} и ${n2} ===`);
    L.push('МЕЖКАРТНЫЕ СВЯЗИ (несущие до 1°, рабочие 1–3°, фоновые 3–5°; полуквадрат и полутораквадрат только до 1°). Формат: планета первого, аспект, планета второго.');
    const rows = [];
    keys.forEach(a => keys.forEach(b => {
      const A1 = c1.pts[a], B2 = c2.pts[b]; if (!A1 || !B2) return;
      const d = Math.abs(diff(A1.lon, B2.lon));
      for (const [ang, nm] of [[0, 'соединение'], [180, 'оппозиция'], [90, 'квадрат'], [120, 'трин'], [60, 'секстиль'], [45, 'полуквадрат'], [135, 'полутораквадрат']]) {
        const o = Math.abs(d - ang); const lim = (ang === 45 || ang === 135) ? 1 : 5;
        if (o <= lim) rows.push({ t: `${n1}: ${dn(a)} ${nm} ${n2}: ${dn(b)}`, o, w: o <= 1 ? 'несущая' : o <= 3 ? 'рабочая' : 'фоновая' });
      }
    }));
    rows.sort((x, y) => x.o - y.o).forEach(r => L.push(`${r.t}: ${fmtOrb(r.o)} (${r.w})`));
    const overlay = (ca, cb, na, nb) => {
      if (!cb.H) { L.push('', `НАЛОЖЕНИЯ на дома ${nb}: не считаются, время рождения ${nb} неизвестно`); return; }
      L.push('', `НАЛОЖЕНИЯ: планеты ${na} в домах ${nb}`);
      const cnt = {};
      ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Плутон', 'Узел', 'Хирон', 'Лилит', 'ASC', 'MC'].forEach(k => { if (ca.pts[k]) { const h = houseOf(ca.pts[k].lon, cb.H.cusps); L.push(`${dn(k)} ${na} → ${h} дом ${nb}`); if (TEN.includes(k)) (cnt[h] = cnt[h] || []).push(k); } });
      Object.entries(cnt).filter(([h, a]) => a.length >= 3).forEach(([h, a]) => L.push(`СКОПЛЕНИЕ: ${a.join(', ')} ${na} в ${h} доме ${nb}`));
    };
    overlay(c1, c2, n1, n2); overlay(c2, c1, n2, n1);
    // синастрические прогрессии
    const pf = nowMs - Y, pt = nowMs + 3 * Y; const pr = [];
    [[c1, n1, c2, n2], [c2, n2, c1, n1]].forEach(([ca, na, cb, nb]) => {
      [['Moon', 'Луна', 10], ['Sun', 'Солнце', 60]].forEach(([key, ru, stp]) => {
        ['Солнце', 'Луна', 'Венера', 'Марс', 'Сатурн', 'ASC', 'MC'].forEach(tn => {
          if (!cb.pts[tn]) return;
          [[0, 'соединение'], [90, 'квадрат'], [180, 'оппозиция'], [270, 'квадрат']].forEach(([ang, an]) => {
            progSearch(ca, t => lonOf(key, t), pf, pt, stp, [norm(cb.pts[tn].lon + ang)]).forEach(x => pr.push({ ms: x.ms, t: `прогрессивн. ${ru} ${na} ${an} натальн. ${dn(tn)} ${nb}` }));
          });
        });
      });
    });
    L.push('', `ПРОГРЕССИИ ОДНОГО НА ТОЧКИ ДРУГОГО (с ${fmtDate(pf, tz)} по ${fmtDate(pt, tz)})`);
    if (!pr.length) L.push('нет'); pr.sort((a, b) => a.ms - b.ms).forEach(x => L.push(`${fmtDate(x.ms, tz)}: ${x.t}`));
    if (!parent) {
      L.push('', 'КАРТА ОТНОШЕНИЙ (композит, средние точки)');
      const mid = (x, y) => norm(x + diff(y, x) / 2);
      const comp = {};
      ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Плутон', 'Узел', 'ASC', 'MC'].forEach(k => { if (c1.pts[k] && c2.pts[k]) { comp[k] = { lon: mid(c1.pts[k].lon, c2.pts[k].lon) }; comp[k].sign = signOf(comp[k].lon); } });
      let cusps = null;
      if (c1.H && c2.H) {
        cusps = c1.H.cusps.map((cu, i) => { const m = mid(cu, c2.H.cusps[i]); const ref = norm(comp['ASC'].lon + i * 30); return Math.abs(diff(m, ref)) <= 90 ? m : norm(m + 180); });
        cusps[0] = comp['ASC'].lon; cusps[9] = comp['MC'].lon;
        if (Math.abs(diff(cusps[9], norm(cusps[0] - 90))) > 90) { comp['MC'].lon = norm(comp['MC'].lon + 180); cusps[9] = comp['MC'].lon; }
      }
      Object.entries(comp).forEach(([k, v]) => L.push(`${dn(k)}: ${fmtPos(v.lon)}${cusps ? ', дом ' + houseOf(v.lon, cusps) : ''}`));
      if (cusps) { L.push('Куспиды карты отношений: ' + cusps.map((c, i) => `${i + 1}: ${fmtPos(c)}`).join('; ')); L.push(`Управитель 2 зоны союза: ${RULER[signOf(cusps[1])]}, 8 зоны: ${RULER[signOf(cusps[7])]}`); }
      L.push('Связи внутри карты отношений (до 3°):'); aspectsOf(comp).filter(a => a.orb <= 3 && TEN.concat(['ASC', 'MC']).includes(a.a) && TEN.concat(['ASC', 'MC']).includes(a.b)).forEach(a => L.push(`${dn(a.a)} ${a.name} ${dn(a.b)}: ${fmtOrb(a.orb)}`));
      L.push('', `ТРАНЗИТЫ ПО КАРТЕ ОТНОШЕНИЙ (с ${fmtDate(pf, tz)} по ${fmtDate(pt, tz)})`);
      const ct = groupTransits(transits({ pts: comp }, pf, pt, { targets: ['Солнце', 'Луна', 'Венера', 'ASC', 'MC'].filter(k => comp[k] && (cusps || !['ASC', 'MC'].includes(k))), asps: ['соединение', 'оппозиция', 'квадрат', 'трин'] }), tz, true);
      if (!ct.length) L.push('нет');
      ct.forEach(r => { const end = r.oe || r.last, st = r.os || r.first; const stt = end < nowMs ? ', уже прошло' : st <= nowMs ? ', ИДЁТ СЕЙЧАС' : ''; L.push(`${r.text}: ${r.dates.join(', ')}${r.orb ? ' (' + r.orb + stt + ')' : stt}`); });
      L.push('', 'ЗАТМЕНИЯ НА УГЛЫ И СВЕТИЛА КАРТЫ ОТНОШЕНИЙ (3 года, орб 2°30′)');
      const ce = eclipsesOn({ 'Солнце': comp['Солнце'], 'Луна': comp['Луна'], ASC: cusps ? comp['ASC'] : null, MC: cusps ? comp['MC'] : null }, nowMs, nowMs + 3 * Y, 2.5, tz, 'карта отношений');
      if (!ce.length) L.push('нет'); ce.forEach(x => L.push(x));
    }
    L.push('', 'РЕТРОГРАДНОСТИ НА ПРОГНОЗНЫЙ ПЕРИОД (2 года)');
    ['Mercury', 'Venus', 'Mars'].forEach(k => retroPeriods(k, nowMs, nowMs + 2 * Y, tz, null).forEach(x => L.push(x)));
    L.push('', `Дата расчёта: ${fmtDate(nowMs, tz)}`);
    return L.join('\n');
  }


  // ---------- таблицы для приложения (разметка книги)
  function appendixNatal(c, opt) {
    opt = opt || {}; const p = c.pts, H = c.H, inp = c.input, tz = opt.tz || 'Europe/Moscow';
    const L = [];
    L.push('# Приложение | Расчётная механика');
    L.push(`Служебный раздел. ${String(inp.d).padStart(2, '0')}.${String(inp.mo).padStart(2, '0')}.${inp.y}, ${inp.noTime ? 'время рождения неизвестно' : String(inp.h).padStart(2, '0') + ':' + String(inp.mi).padStart(2, '0') + ' местного времени'}, ${inp.place || ''}. Часовой пояс ${offStr(c.offset)}, по Гринвичу ${fmtDate(c.ms, 'UTC', true)}${c.tzNote ? ' (' + c.tzNote + ')' : ''}. Тропический зодиак${H ? ', дома: ' + H.system : ''}. Даты по времени ${tz === 'Europe/Moscow' ? 'Москвы' : tz}.`);
    L.push('### 1. Положения');
    L.push('| Точка | Положение | Дом | Состояние |'); L.push('|---|---|---|---|');
    Object.entries(p).forEach(([n, v]) => L.push(`| ${n === 'Узел' ? 'Северный узел' : n} | ${fmtPos(v.lon)} | ${v.house || ''} | ${[v.retro ? 'ретроградный' : '', v.dig].filter(Boolean).join(', ')} |`));
    if (H) {
      L.push('### 2. Куспиды и управители');
      L.push('| Дом | Куспид | Управитель | Где стоит |'); L.push('|---|---|---|---|');
      H.cusps.forEach((cu, i) => { const s = signOf(cu), r = RULER[s], rp = p[r]; L.push(`| ${i + 1} | ${fmtPos(cu)} | ${r}${MODERN[s] ? ' (' + MODERN[s] + ')' : ''} | ${SIGNS_P[rp.sign]}, ${rp.house} дом |`); });
    }
    L.push('### 3. Аспекты точнее 3°');
    L.push('| Пара | Связь и отклонение |'); L.push('|---|---|');
    aspectsOf(p).filter(a => a.orb <= 3).forEach(a => L.push(`| ${dn(a.a)} и ${dn(a.b)} | ${a.name}, ${fmtOrb(a.orb)}${a.outOfSign ? ', через границу знака' : ''} |`));
    const st = starsOn(p, c.t);
    if (st.length) { L.push('### 4. Звёзды (орб 1°30′)'); L.push('| Точка | Звезда и отклонение |'); L.push('|---|---|'); st.forEach(x => L.push(`| ${dn(x.point)} | ${x.star}, ${fmtOrb(x.orb)} |`)); }
    const D = dispositors(p);
    L.push('### 5. Цепочки управителей');
    L.push(`Финальные управители: ${D.finals.join(', ') || 'нет'}. Взаимные рецепции: ${D.mutual.map(m => m.join(' и ')).join('; ') || 'нет'}.`);
    return L.join('\n');
  }
  function appendixPair(c1, c2, opt) {
    opt = opt || {}; const L = []; const n1 = c1.input.name || 'Первый', n2 = c2.input.name || 'Второй';
    L.push('# Приложение | Расчётная механика');
    [c1, c2].forEach(c => { const i = c.input; L.push(`${i.name}: ${String(i.d).padStart(2, '0')}.${String(i.mo).padStart(2, '0')}.${i.y}, ${i.noTime ? 'время неизвестно, дома не используются' : String(i.h).padStart(2, '0') + ':' + String(i.mi).padStart(2, '0')}, ${i.place || ''}, ${offStr(c.offset)}.`); });
    L.push('### 1. Положения');
    L.push(`| Точка | ${n1} | ${n2} |`); L.push('|---|---|---|');
    Object.keys(c1.pts).forEach(k => { if (k === 'Фортуна') return; const a = c1.pts[k], b = c2.pts[k]; L.push(`| ${dn(k)} | ${a ? fmtPos(a.lon) + (a.house ? ', ' + a.house + ' дом' : '') + (a.retro ? ' R' : '') : ''} | ${b ? fmtPos(b.lon) + (b.house ? ', ' + b.house + ' дом' : '') + (b.retro ? ' R' : '') : ''} |`); });
    const keys = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'ASC', 'MC', 'Узел', 'Лилит', 'Хирон'];
    const rows = [];
    keys.forEach(a => keys.forEach(b => { const A1 = c1.pts[a], B2 = c2.pts[b]; if (!A1 || !B2) return; const d = Math.abs(diff(A1.lon, B2.lon)); for (const [ang, nm] of [[0, 'соединение'], [180, 'оппозиция'], [90, 'квадрат'], [120, 'трин'], [60, 'секстиль']]) { const o = Math.abs(d - ang); if (o <= 3) rows.push([`${dn(a)} ${n1} и ${dn(b)} ${n2}`, `${nm}, ${fmtOrb(o)}`, o]); } }));
    L.push('### 2. Межкартные связи: несущие и рабочие');
    L.push('| Пара | Связь и отклонение |'); L.push('|---|---|');
    rows.sort((x, y) => x[2] - y[2]).forEach(r => L.push(`| ${r[0]} | ${r[1]}${r[2] <= 1 ? ', несущая' : ''} |`));
    const ov = (ca, cb, na, nb) => { if (!cb.H) return; L.push(`### Планеты ${na} в домах ${nb}`); L.push('| Планета | Дом |'); L.push('|---|---|'); ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Плутон'].forEach(k => L.push(`| ${k} | ${houseOf(ca.pts[k].lon, cb.H.cusps)} |`)); };
    ov(c1, c2, n1, n2); ov(c2, c1, n2, n1);
    return L.join('\n');
  }

  function chartJSON(c) {
    const o = { name: c.input.name || '', date: `${String(c.input.d).padStart(2, '0')}.${String(c.input.mo).padStart(2, '0')}.${c.input.y}`, place: c.input.place || '', pos: {}, retro: {}, cusps: c.H ? c.H.cusps.map(x => +x.toFixed(4)) : null, asc: c.H ? +c.H.asc.toFixed(4) : null, mc: c.H ? +c.H.mc.toFixed(4) : null };
    Object.entries(c.pts).forEach(([k, v]) => { o.pos[k] = +v.lon.toFixed(4); if (v.retro) o.retro[k] = 1; });
    return o;
  }

  G.AstroEngine = { chart, natalText, synastryText, sky, chartJSON, appendixNatal, appendixPair, eclipses, transits, groupTransits, aspectsOf, localToUTC, tzOffsetMin, fmtDate, fmtPos, fmtOrb, SIGNS, SIGNS_G, houses, lonOf, trueNode, meanLilith, chiron, T, progressed, starsOn, moonBlock };
})(typeof window !== 'undefined' ? window : globalThis);
