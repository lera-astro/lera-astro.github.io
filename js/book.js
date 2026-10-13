/* Астро-мастерская: вёрстка книги (разметка → страницы A4 → печать в PDF) */
(function (G) {
  'use strict';

  const PALETTES = {
    women: { name: 'Тиффани и розовый', bg: '#04171B', panel: '#0A2A2E', line: '#163A3D', line2: '#24575B', text: '#E6F4F2', dim: '#93AAA8', neon: '#2FD8C9', acc: '#FF5CC8', accRGB: '255,92,200', neonRGB: '47,216,201', g1: '#0F4A4C', g2: '#062427' },
    men: { name: 'Ночной синий и янтарь', bg: '#070E1F', panel: '#0F1B34', line: '#1A2A4C', line2: '#2C426E', text: '#E8EEF8', dim: '#97A3BA', neon: '#56B8FF', acc: '#FFB54A', accRGB: '255,181,74', neonRGB: '86,184,255', g1: '#173566', g2: '#0B1A3A' },
    kids: { name: 'Небесный и солнечный', bg: '#0C1C2E', panel: '#142A42', line: '#1F3A57', line2: '#315578', text: '#F0F6FC', dim: '#A2B6CA', neon: '#8AD4FF', acc: '#FFC864', accRGB: '255,200,100', neonRGB: '138,212,255', g1: '#21507A', g2: '#123452' },
  };

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function inline(s) {
    return esc(s)
      .replace(/\[\[(.+?)\]\]/g, '<b class="d">$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b class="d">$1</b>')
      .replace(/(^|[\s(«])\*(?!\s)([^*]+?)\*(?=[\s.,;:!?)»]|$)/g, '$1<i>$2</i>');
  }

  // ---------- разбор разметки
  function parse(md) {
    const meta = { qual: [] }; const blocks = []; const toc = [];
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    let rules = null, table = null, inApp = false, afterIntro = false, firstHead = true;
    const push = (html, keep, brk) => blocks.push({ html, keep: keep || 0, brk: !!brk });
    const flushRules = () => { if (rules) { push('<ol class="rules">' + rules.map(r => `<li><span class="ru">${r}</span></li>`).join('') + '</ol>'); rules = null; } };
    const flushTable = () => {
      if (!table) return;
      const rows = table.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => inline(c.trim())));
      if (rows.length) {
        const head = rows.length > 1 && table[1] && /^\s*\|?\s*:?-{2,}/.test(table[1]);
        let h = '<table>';
        if (head) h += '<thead><tr>' + rows[0].map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
        h += '<tbody>' + rows.slice(head ? 1 : 0).map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
        push(`<div class="app">${h}</div>`);
      }
      table = null;
    };
    for (let raw of lines) {
      const line = raw.trimEnd();
      const t = line.trim();
      if (t.startsWith('|')) { flushRules(); (table = table || []).push(t); continue; } else flushTable();
      if (/^- /.test(t) || /^\d+[.)] /.test(t)) { (rules = rules || []).push(inline(t.replace(/^(- |\d+[.)] )/, ''))); continue; } else if (t) flushRules();
      if (!t) { flushRules(); continue; }
      let m;
      if ((m = t.match(/^@([^:]+):\s*(.*)$/))) {
        const k = m[1].trim().toLowerCase(), v = m[2].trim();
        if (k === 'качество') { const [a, b] = v.split('|'); meta.qual.push([inline((a || '').trim()), inline((b || '').trim())]); }
        else meta[k] = v;
        continue;
      }
      if (t === '---') { push('<div class="sp"></div>', 0, true); continue; }
      if ((m = t.match(/^##\s+(.+)$/)) && !t.startsWith('###')) {
        const [a, b] = m[1].split('|').map(x => x.trim());
        push(`<div class="era"><span class="et">${inline(a)}</span>${b ? `<span class="es">${inline(b)}</span>` : ''}</div>`, 2, true);
        toc.push([a + (b ? ': ' + b : ''), 'grp']); continue;
      }
      if ((m = t.match(/^###\s+(.+)$/))) { push(`<h3 class="${inApp ? 'ah3' : 'sh3'}">${inline(m[1])}</h3>`, 1); continue; }
      if ((m = t.match(/^#\s+(.+)$/))) {
        let [a, b] = m[1].split('|').map(x => x.trim());
        let num = '', title = a;
        if (b) { num = a; title = b; }
        else if ((m = a.match(/^(Часть\s+[IVXLC\d]+)[.:]\s*(.+)$/))) { num = m[1]; title = m[2]; }
        inApp = /^приложение/i.test(num || title);
        const brk = inApp || /^(резюме|приложение)/i.test(title);
        push(`<div class="head${inApp ? ' apph' : ''}">${num ? `<span class="pn">${inline(num)}</span>` : ''}<h2>${inline(title)}</h2></div>`, 2, brk);
        toc.push(inApp ? ['Приложение: ' + title.toLowerCase(), 'no'] : [title, num ? 'num' : 'no']);
        afterIntro = /^введение/i.test(title); firstHead = false; continue;
      }
      if (t.startsWith('!')) { push(`<div class="hook"><p>${inline(t.replace(/^!+\s*/, ''))}</p></div>`); continue; }
      if (t.startsWith('>')) { push(`<p class="strong">${inline(t.replace(/^>\s*/, ''))}</p>`); continue; }
      if (t.startsWith('+')) { push(`<div class="acc"><p>${inline(t.replace(/^\+\s*/, '')).replace(/^<b class="d">/, '<b class="lab">')}</p></div>`); continue; }
      if (t.startsWith('~')) { push(`<p class="close">${inline(t.replace(/^~\s*/, ''))}</p>`); continue; }
      const cls = inApp ? ' class="note"' : afterIntro ? ' class="lead"' : '';
      afterIntro = false;
      push(`<p${cls}>${inline(t)}</p>`);
    }
    flushRules(); flushTable();
    return { meta, blocks, toc };
  }

  // ---------- круг карты
  const GLYPH = { 'Солнце': '☉', 'Луна': '☽', 'Меркурий': '☿', 'Венера': '♀', 'Марс': '♂', 'Юпитер': '♃', 'Сатурн': '♄', 'Уран': '♅', 'Нептун': '♆', 'Плутон': '♇', 'Узел': '☊', 'Хирон': '⚷' };
  const SG = '♈♉♊♋♌♍♎♏♐♑♒♓';
  const VS = '︎';
  const dms = L => { const m = Math.floor(((L % 30) + 30) % 30 * 60 + 1e-6); return `${Math.floor(m / 60)}°${String(m % 60).padStart(2, '0')}′`; };
  const dd = (a, b) => ((a - b + 540) % 360) - 180;
  const MAJ = [[0, 8, 'c'], [180, 8, 't'], [90, 7, 't'], [120, 7, 'h'], [60, 5, 'h']];

  function wheel(ch, pal, opt) {
    opt = opt || {};
    const P = pal, cx = 400, cy = 400, asc = ch.asc != null ? ch.asc : 0;
    const outer = opt.outer || null; // вторая карта (синастрия)
    const rIn = outer ? 150 : 206, rAsp = outer ? 146 : 200;
    const xy = (L, r) => { const a = Math.PI + (L - asc) * Math.PI / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const f = n => n.toFixed(1);
    const o = [];
    const GP = G.GLYPH_PATHS || {};
    const glyph = (ch, x, y, size, col, op, extra) => GP[ch]
      ? `<path d="${GP[ch]}" transform="translate(${f(x)} ${f(y)}) scale(${size})" fill="${col}" opacity="${op}"${extra}/>`
      : `<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${col}" opacity="${op}" text-anchor="middle" dominant-baseline="central"${extra}>${ch}${VS}</text>`;
    o.push(`<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">`);
    o.push(`<defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="mh"><stop offset="0" stop-color="${P.acc}" stop-opacity=".45"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/></radialGradient></defs>`);
    [[372, .9], [330, .9], [300, .6], [rIn, .6]].concat(outer ? [[206, .6]] : []).forEach(([r, w]) => o.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${P.line2}" stroke-width="${w}"/>`));
    const names = Object.keys(GLYPH).filter(n => ch.pos[n] != null);
    const occ = new Set(names.map(n => Math.floor(ch.pos[n] / 30)));
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = xy(i * 30, 372), [x2, y2] = xy(i * 30, 330);
      o.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${P.line2}" stroke-width=".9"/>`);
      const [gx, gy] = xy(i * 30 + 15, 351);
      o.push(glyph(SG[i], gx, gy, 21, occ.has(i) ? P.neon : P.dim, occ.has(i) ? 1 : .55, ''));
    }
    for (let d = 0; d < 360; d++) {
      if (d % 30 === 0) continue;
      const ln = d % 10 === 0 ? 7 : d % 5 === 0 ? 5 : 3;
      const [x1, y1] = xy(d, 330), [x2, y2] = xy(d, 330 + ln);
      o.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${P.line2}" stroke-width=".45"/>`);
    }
    if (ch.cusps) {
      ch.cusps.forEach((c, i) => {
        const ax = [0, 3, 6, 9].includes(i);
        const [x1, y1] = xy(c, ax ? 330 : 300), [x2, y2] = xy(c, rIn);
        o.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${ax ? P.neon : P.line2}" stroke-width="${ax ? 1.3 : .7}" opacity="${ax ? .85 : 1}"/>`);
        const nx = ch.cusps[(i + 1) % 12]; const mid = c + (((nx - c) % 360) + 360) % 360 / 2;
        const [hx, hy] = xy(mid, outer ? 212 : 214);
        o.push(`<text x="${f(hx)}" y="${f(hy)}" font-family="Golos,-apple-system,Helvetica,sans-serif" font-size="10.5" fill="${P.dim}" text-anchor="middle" dominant-baseline="central">${i + 1}</text>`);
      });
      [['ASC', ch.asc], ['MC', ch.mc], ['DSC', ch.asc + 180], ['IC', ch.mc + 180]].forEach(([lab, L]) => { const [x, y] = xy(L, 388); o.push(`<text x="${f(x)}" y="${f(y)}" font-family="Golos,-apple-system,Helvetica,sans-serif" font-weight="600" font-size="12" fill="${P.neon}" text-anchor="middle" dominant-baseline="central">${lab}</text>`); });
    }
    // аспекты
    const focus = opt.focus || null;
    const asp = [];
    const pl = names.filter(n => n !== 'Узел' && n !== 'Хирон');
    for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
      const a = pl[i], b = pl[j], d = Math.abs(dd(ch.pos[a], ch.pos[b]));
      for (const [ang, orb, k] of MAJ) { if (k === 'c') continue; if (Math.abs(d - ang) <= orb) { asp.push({ a, b, k, o: Math.abs(d - ang) }); break; } }
    }
    const line = (La, Lb, col, w, dash, glow, op) => {
      const [x1, y1] = xy(La, rAsp), [x2, y2] = xy(Lb, rAsp);
      o.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} opacity="${op}"${glow ? ' filter="url(#gl)"' : ''}/>`);
    };
    if (outer && opt.cross) {
      opt.cross.forEach(x => line(ch.pos[x.a], outer.pos[x.b], x.k === 't' ? P.acc : P.neon, x.o < 1 ? 1.6 : 1, x.k === 't' ? '6 4' : '', x.o < 1, x.o < 1 ? 1 : .55));
    } else {
      asp.sort((x, y) => y.o - x.o).forEach(x => {
        const isF = focus && (x.a === focus || x.b === focus);
        if (focus && !isF) { if (x.o < 2) line(ch.pos[x.a], ch.pos[x.b], P.neon, .8, '', false, .3); return; }
        const tense = x.k === 't';
        line(ch.pos[x.a], ch.pos[x.b], tense ? P.acc : P.neon, isF ? 1.8 : (x.o < 2 ? 1.1 : .8), tense ? (isF ? '7 4' : '5 4') : '', isF, isF ? 1 : (x.o < 2 ? .75 : .4));
      });
    }
    // планеты с разносом
    function ring(pos, retro, rTick0, rTick1, rG, rLab, small) {
      const items = names.filter(n => pos[n] != null).sort((a, b) => pos[a] - pos[b]);
      const disp = {}; items.forEach(n => disp[n] = pos[n]);
      const gap0 = small ? 8.2 : 9.4;
      for (let it = 0; it < 80; it++) {
        let moved = false;
        for (let i = 0; i < items.length; i++) {
          const a = items[i], b = items[(i + 1) % items.length];
          const gap = (((disp[b] - disp[a]) % 360) + 360) % 360;
          if (gap < gap0) { const p = (gap0 - gap) / 2; disp[a] -= p; disp[b] += p; moved = true; }
        }
        if (!moved) break;
      }
      items.forEach(n => {
        const L = pos[n], D = disp[n], isF = n === focus && !small;
        const [x0, y0] = xy(L, rTick0), [x1, y1] = xy(L, rTick1);
        o.push(`<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${isF ? P.acc : (small ? P.acc : P.neon)}" stroke-width="1.2"/>`);
        const [gx, gy] = xy(D, rG);
        if (isF) o.push(`<circle cx="${f(gx)}" cy="${f(gy)}" r="26" fill="url(#mh)"/>`);
        o.push(glyph(GLYPH[n], gx, gy, isF ? 27 : small ? 17 : 21, isF ? P.acc : small ? P.acc : P.text, 1, isF ? ' filter="url(#gl)"' : ''));
        const [tx, ty] = xy(D, rLab);
        o.push(`<text x="${f(tx)}" y="${f(ty)}" font-family="Golos,-apple-system,Helvetica,sans-serif" font-size="${small ? 8.6 : 9.6}" fill="${isF ? P.acc : P.dim}" text-anchor="middle" dominant-baseline="central">${dms(L)}${retro && retro[n] && n !== 'Узел' ? ' R' : ''}</text>`);
      });
    }
    ring(ch.pos, ch.retro, 300, 292, 270, 240, false);
    if (outer) ring(outer.pos, outer.retro, rIn, rIn + 8, 186, 164, true);
    o.push('</svg>');
    return o.join('');
  }

  function wave(ch, pal, focus) {
    const W = 1000, H = 190, N = 118, P = pal;
    const base = { 'Солнце': .5, 'Луна': .5, 'Меркурий': .46, 'Венера': .44, 'Марс': .46, 'Сатурн': .42, 'Юпитер': .36, 'Уран': .34, 'Нептун': .26, 'Плутон': .24, 'Хирон': .2, 'Узел': .18, 'Лилит': .16 };
    if (focus && base[focus] != null) base[focus] = 1;
    const pts = Object.assign({}, ch.pos); if (ch.mc != null) { pts.MC = ch.mc; base.MC = .35; }
    const o = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style="width:100%;height:100%;display:block"><defs><linearGradient id="wg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${P.neon}" stop-opacity=".18"/><stop offset=".62" stop-color="${P.neon}" stop-opacity=".95"/><stop offset="1" stop-color="${P.acc}" stop-opacity="1"/></linearGradient><filter id="wgl" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#wgl)">`];
    const step = W / N, vals = [];
    for (let i = 0; i < N; i++) {
      const L = (i + .5) / N * 360; let v = .04;
      for (const n in base) { if (pts[n] == null) continue; const d = Math.abs(dd(L, pts[n])); v += base[n] * Math.exp(-((d / 6.5) ** 2)); }
      vals.push(v);
    }
    const mx = Math.max.apply(null, vals);
    vals.forEach((v, i) => { const h = 6 + v / mx * 168; o.push(`<rect x="${(i * step + step * .22).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${(step * .56).toFixed(2)}" height="${h.toFixed(2)}" rx="1.6" fill="url(#wg)"/>`); });
    o.push('</g></svg>');
    return o.join('');
  }

  // ---------- стили книги
  function css(P) {
    return `
@font-face{font-family:Unbounded;src:url(fonts/unbounded-cyrillic-wght-normal.woff2) format('woff2');font-weight:200 900;font-display:block;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Unbounded;src:url(fonts/unbounded-latin-wght-normal.woff2) format('woff2');font-weight:200 900;font-display:block;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:Golos;src:url(fonts/golos-text-cyrillic-wght-normal.woff2) format('woff2');font-weight:400 900;font-display:block;unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Golos;src:url(fonts/golos-text-latin-wght-normal.woff2) format('woff2');font-weight:400 900;font-display:block;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:AstroG;src:url(fonts/astro.woff2) format('woff2');font-display:block}
.bk{--bg:${P.bg};--panel:${P.panel};--line:${P.line};--line2:${P.line2};--text:${P.text};--dim:${P.dim};--neon:${P.neon};--pink:${P.acc}}
.bk *{box-sizing:border-box}
.bk{color:var(--text);font-family:Golos,sans-serif;font-size:10.6pt;line-height:1.64;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:geometricPrecision;-webkit-text-size-adjust:100%}
.bk .page{position:relative;width:210mm;height:297mm;padding:23mm 19mm 17mm;overflow:hidden;background:var(--bg);break-after:page;page-break-after:always}
.bk .page:last-child{break-after:auto;page-break-after:auto}
.bk .pg{position:absolute;left:19mm;bottom:9mm;font-family:Unbounded;font-weight:200;font-size:7.6pt;letter-spacing:.2em;color:var(--dim);opacity:.7}
.bk .pg i{font-style:normal;color:var(--pink)}
.bk p{margin:0 0 .74em}
.bk h2{font-family:Unbounded;font-weight:500;font-size:19pt;line-height:1.16;letter-spacing:-.018em;color:#fff;margin:0}
.bk .head{margin:0 0 6mm}
.bk .head.rule{padding-top:6.6mm;border-top:1px solid var(--line)}
.bk .pn{font-family:Unbounded;font-weight:200;font-size:9.2pt;letter-spacing:.3em;color:var(--neon);display:block;margin:0 0 3.2mm;text-transform:uppercase}
.bk .lead{font-size:12pt;line-height:1.56;color:#fff}
.bk .lab{color:var(--pink);font-weight:600}
.bk .d{color:var(--pink);font-weight:600}
.bk .close{margin-top:4mm;font-size:11.6pt;line-height:1.54;color:#fff}
.bk .acc{margin:5.4mm 0 6mm;padding:5mm 6.6mm 5mm 7.6mm;background:var(--panel);border-left:2.4px solid var(--neon)}
.bk .acc p{margin:0;font-size:11pt;line-height:1.52;color:#fff}
.bk p.strong{margin:5mm 0 5.6mm;padding:4.6mm 6.4mm 4.6mm 7.4mm;border-left:2.4px solid var(--pink);background:linear-gradient(90deg,rgba(${P.accRGB},.10),rgba(${P.accRGB},0) 85%);font-size:11.2pt;line-height:1.55;color:#fff}
.bk ol.rules{list-style:none;counter-reset:r;margin:2mm 0 4mm;padding:0}
.bk ol.rules li{counter-increment:r;position:relative;padding:0 0 0 13mm;margin:0 0 4.6mm}
.bk ol.rules li::before{content:counter(r);position:absolute;left:0;top:-1.6mm;font-family:Unbounded;font-weight:200;font-size:19pt;color:var(--pink);opacity:.8}
.bk ol.rules .d{color:#fff}
.bk .sh3{font-family:Unbounded;font-weight:500;font-size:11pt;color:var(--neon);margin:5mm 0 2.4mm}
.bk .ah3{font-family:Unbounded;font-weight:500;font-size:9.6pt;color:var(--neon);margin:3.4mm 0 1.6mm}
.bk .apph h2{font-size:16pt}
.bk p.note{color:var(--dim);font-size:8.4pt;margin:0 0 1.6mm;line-height:1.45}
.bk .app table{width:100%;border-collapse:collapse;margin:0 0 2mm;font-size:7.9pt;table-layout:fixed}
.bk .app th{text-align:left;font-weight:400;color:var(--neon);padding:1mm 2.4mm 1mm 0;border-bottom:1px solid var(--line2)}
.bk .app td{padding:1.05mm 2.4mm 1.05mm 0;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.36}
.bk .app td:first-child{color:#fff;width:32%}
.bk .cover{display:flex;flex-direction:column;padding:26mm 19mm 17mm;background:radial-gradient(125% 72% at 10% -10%,${P.g1} 0%,${P.g2} 44%,var(--bg) 80%)}
.bk .eyebrow{font-family:Unbounded;font-weight:300;font-size:9.2pt;letter-spacing:.3em;color:var(--neon);margin:0 0 18mm;text-transform:uppercase}
.bk .cover h1{font-family:Unbounded;font-weight:700;font-size:64pt;line-height:.96;letter-spacing:-.035em;margin:0;color:#fff;text-shadow:0 0 30px rgba(${P.neonRGB},.28);overflow-wrap:anywhere}
.bk .cover h1.long{font-size:44pt}
.bk .ded{font-family:Unbounded;font-weight:200;font-size:13.2pt;line-height:1.46;color:var(--neon);margin:6.6mm 0 0;max-width:150mm}
.bk .wavebox{margin:13mm 0 0;height:36mm}
.bk .qual{margin:13mm 0 0;display:grid;grid-template-columns:1fr 1fr;column-gap:11mm;row-gap:7.6mm}
.bk .q{border-top:1px solid var(--line2);padding-top:3mm}
.bk .qt{font-family:Unbounded;font-weight:500;font-size:9.8pt;color:var(--text);display:block;margin-bottom:1.3mm}
.bk .qt .d{color:var(--text)}
.bk .qd{font-size:9.3pt;line-height:1.5;color:var(--dim)}
.bk .foot{margin-top:auto;padding-top:9mm}
.bk .foot .t{font-family:Unbounded;font-weight:400;font-size:20pt;color:var(--pink);margin:0 0 2.4mm;text-shadow:0 0 18px rgba(${P.accRGB},.35)}
.bk .foot .s{font-size:9.5pt;color:var(--dim);line-height:1.62;margin:0}
.bk .wheel{max-width:120mm;margin:-6mm auto 0}
.bk .legend{margin:4mm auto 0;max-width:160mm;font-size:8.5pt;color:var(--dim);line-height:1.55}
.bk .legend b{font-weight:400;color:var(--text)}
.bk .legend .pk{color:var(--pink)}
.bk .legend .n{color:var(--neon)}
.bk .toc{margin:5mm auto 0;max-width:160mm}
.bk .toc h3{font-family:Unbounded;font-weight:400;font-size:9pt;letter-spacing:.24em;color:var(--neon);margin:0 0 2.4mm}
.bk .toc ol{list-style:none;margin:0;padding:0;counter-reset:t}
.bk .toc li{counter-increment:t;display:flex;gap:4mm;align-items:baseline;border-bottom:1px solid var(--line);padding:1mm 0;font-size:8.8pt;break-inside:avoid}
.bk .toc li.no{counter-increment:none}
.bk .toc li::before{content:counter(t,upper-roman);font-family:Unbounded;font-weight:300;font-size:7.8pt;color:var(--pink);min-width:8mm}
.bk .toc li.no::before{content:'\\00b7';color:var(--dim)}
.bk .toc li.grp{counter-increment:none;border-bottom:none;padding:2.4mm 0 .4mm;font-family:Unbounded;font-weight:400;font-size:7.8pt;letter-spacing:.16em;color:var(--neon);text-transform:uppercase}
.bk .toc li.grp::before{content:'';min-width:0}
.bk .toc.c2 ol{columns:2;column-gap:10mm}
.bk .era{margin:0 0 7mm;padding:0 0 3.4mm;border-bottom:1px solid var(--line2)}
.bk .era .et{font-family:Unbounded;font-weight:600;font-size:26pt;letter-spacing:-.02em;color:var(--neon);text-shadow:0 0 22px rgba(${P.neonRGB},.25);display:block;line-height:1.1}
.bk .era .es{font-family:Unbounded;font-weight:200;font-size:10pt;letter-spacing:.22em;color:var(--pink);display:block;margin-top:1.6mm}
.bk .era + .head.rule{border-top:none;padding-top:0}
.bk .hook{margin:6mm 0 4mm;padding:4.4mm 6mm;border:1px solid rgba(${P.accRGB},.55);border-radius:2px}
.bk .hook p{margin:0;font-size:10.8pt;line-height:1.55;color:#fff}
.bk .box{height:100%}
.bk .sp{height:0}
`;
  }

  // ---------- сборка
  const LEGENDS = {
    moon: 'Круг зодиака, двенадцать зон жизни и планеты на момент рождения. <b class="pk">Луна</b> выделена, её связи показаны <b class="pk">пунктиром</b> (напряжённые) и <b class="n">сплошной линией</b> (гармоничные): это фигура, вокруг которой построен весь разбор. Буква R означает обратный ход.',
    natal: 'Круг зодиака, двенадцать зон жизни и планеты на момент рождения. <b class="pk">Пунктиром</b> показаны напряжённые связи, <b class="n">сплошными линиями</b> гармоничные; чем ярче линия, тем точнее связь. Оси ASC, MC, DSC и IC выделены. Буква R означает обратный ход.',
    pair: 'Две карты, наложенные друг на друга. Во внутреннем кругу планеты первого человека, во внешнем, <b class="pk">выделенные цветом</b>, планеты второго. Линии показывают самые точные связи между картами: <b class="pk">пунктир</b> напряжённые, <b class="n">сплошные</b> гармоничные.',
  };

  function build(container, opt) {
    // opt: {markup, chart, chart2, cross, palette, focus, product, label, eyebrow, footSub}
    const P = PALETTES[opt.palette] || PALETTES.women;
    const { meta, blocks, toc } = parse(opt.markup);
    const name = meta['имя'] || (opt.chart && opt.chart.name) || '';
    const label = meta['колонтитул'] || opt.label || 'Разбор';
    let st = document.getElementById('bookcss');
    if (!st) { st = document.createElement('style'); st.id = 'bookcss'; document.head.appendChild(st); }
    st.textContent = css(P);
    container.className = 'bk';
    container.innerHTML = '';
    const out = document.createElement('div'); out.className = 'pages'; container.appendChild(out);
    const qual = meta.qual.slice(0, 6);
    const longName = name.length > 9;
    const cover = `<div class="page cover"><p class="eyebrow">${esc(meta['надзаголовок'] || opt.eyebrow || label)}</p><h1${longName ? ' class="long"' : ''}>${esc(name)}</h1>${meta['посвящение'] ? `<p class="ded">${inline(meta['посвящение'])}</p>` : ''}${opt.chart ? `<div class="wavebox">${wave(opt.chart, P, opt.focus)}</div>` : ''}${qual.length ? `<div class="qual">${qual.map(([a, b]) => `<div class="q"><span class="qt">${a}</span><span class="qd">${b}</span></div>`).join('')}</div>` : ''}<div class="foot"><p class="t">${esc(meta['подвал'] || label)}</p><p class="s">${inline(meta['подпись'] || '')}${opt.footSub ? (meta['подпись'] ? '<br>' : '') + esc(opt.footSub) : ''}</p></div></div>`;
    out.insertAdjacentHTML('beforeend', cover);
    if (opt.chart) {
      const kind = opt.chart2 ? 'pair' : opt.focus ? 'moon' : 'natal';
      const tocHtml = toc.length ? `<div class="toc${toc.length > 16 ? ' c2' : ''}"><h3>ЧТО ВНУТРИ</h3><ol>${toc.map(([t, c]) => `<li class="${c}"><span>${esc(t)}</span></li>`).join('')}</ol></div>` : '';
      out.insertAdjacentHTML('beforeend', `<div class="page"><div class="wheel">${wheel(opt.chart, P, { focus: opt.focus, outer: opt.chart2, cross: opt.cross })}</div><p class="legend">${meta['легенда'] ? inline(meta['легенда']) : LEGENDS[kind]}</p>${tocHtml}</div>`);
    }
    // измерение и раскладка
    // меряем в настоящей странице вне экрана, прямо в body: масштаб просмотра (zoom) на iPhone не влияет на расчёт
    const mroot = document.createElement('div'); mroot.className = 'bk';
    mroot.style.cssText = 'position:absolute;left:-9999px;top:0;zoom:1;transform:none;visibility:hidden;pointer-events:none';
    mroot.innerHTML = '<div class="page flow"><div class="box"><div class="mz"></div></div></div>';
    document.body.appendChild(mroot);
    const mbox = mroot.querySelector('.box'), meas = mroot.querySelector('.mz');
    return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
      const Hh = mbox.clientHeight;
      const pages = []; let buf = [];
      const mk = (b, rule) => { const w = document.createElement('div'); w.innerHTML = b.html; const el = w.firstElementChild; if (rule && el.classList.contains('head')) el.classList.add('rule'); return el; };
      const reset = () => { meas.innerHTML = ''; buf = []; };
      const flush = () => { if (buf.length) pages.push(buf.join('')); };
      reset();
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.brk && buf.length) { flush(); reset(); }
        if (b.html === '<div class="sp"></div>') continue;
        let el = mk(b, buf.length > 0);
        meas.appendChild(el); buf.push(el.outerHTML);
        if (meas.offsetHeight > Hh) {
          meas.removeChild(el); buf.pop();
          if (!buf.length) { meas.appendChild(el); buf.push(el.outerHTML); }
          else { flush(); reset(); el = mk(b, false); meas.appendChild(el); buf.push(el.outerHTML); }
        }
        if (b.keep && i + 1 < blocks.length) {
          const tmp = [];
          for (let k = 1; k <= b.keep && i + k < blocks.length; k++) { if (blocks[i + k].brk) break; const nx = mk(blocks[i + k], false); meas.appendChild(nx); tmp.push(nx); }
          const ok = meas.offsetHeight <= Hh;
          tmp.forEach(t => meas.removeChild(t));
          if (!ok && buf.length > 1) { meas.removeChild(el); buf.pop(); flush(); reset(); el = mk(b, false); meas.appendChild(el); buf.push(el.outerHTML); }
        }
      }
      flush();
      pages.forEach(h => out.insertAdjacentHTML('beforeend', `<div class="page flow"><div class="box">${h}</div></div>`));
      [].slice.call(out.querySelectorAll('.page')).forEach((p, idx) => { if (idx === 0) return; p.insertAdjacentHTML('beforeend', `<div class="pg">${esc(label)}&nbsp;&nbsp;<i>${String(idx + 1).padStart(2, '0')}</i></div>`); });
      mroot.remove();
      return { pages: out.querySelectorAll('.page').length, meta };
    });
  }

  G.Book = { build, parse, wheel, wave, PALETTES };
})(typeof window !== 'undefined' ? window : globalThis);
