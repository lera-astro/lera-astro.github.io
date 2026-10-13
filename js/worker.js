/* Расчёты в фоне, чтобы экран не зависал */
importScripts('astronomy.browser.min.js?v=17', 'data_astro.js?v=17', 'engine.js?v=17');
const E = self.AstroEngine;



self.onmessage = function (ev) {
  const { id, cmd, args } = ev.data;
  const prog = f => self.postMessage({ id, progress: f });
  try {
    let res;
    if (cmd === 'natal') {
      const c = E.chart(args.input);
      res = {
        text: E.natalText(c, Object.assign({}, args.opt, { onProgress: prog })),
        json: E.chartJSON(c),
        appendix: E.appendixNatal(c, args.opt),
        summary: summary(c),
      };
    } else if (cmd === 'pair') {
      const c1 = E.chart(args.a), c2 = E.chart(args.b);
      res = {
        text: E.synastryText(c1, c2, args.opt),
        appendix: E.appendixPair(c1, c2, args.opt),
        cross: cross(c1, c2),
      };
    } else if (cmd === 'sky') {
      res = { text: E.sky(args.from, args.to, args.tz || 'Europe/Moscow') };
    } else if (cmd === 'tz') {
      res = E.localToUTC(args.y, args.mo, args.d, args.h, args.mi, args.tz, args.manual);
    }
    self.postMessage({ id, ok: true, res });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};

function summary(c) {
  const p = c.pts; const out = [];
  ['Солнце', 'Луна', 'ASC', 'MC'].forEach(k => { if (p[k]) out.push(`${k === 'ASC' ? 'Асцендент' : k}: ${E.fmtPos(p[k].lon)}${p[k].house && k !== 'ASC' && k !== 'MC' ? ', ' + p[k].house + ' дом' : ''}`); });
  return { lines: out, offset: c.offset, tzNote: c.tzNote, utc: E.fmtDate(c.ms, 'UTC', true) };
}
function cross(c1, c2) {
  const keys = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн'];
  const out = [];
  keys.forEach(a => keys.forEach(b => {
    const d = Math.abs(((c1.pts[a].lon - c2.pts[b].lon + 540) % 360) - 180);
    [[0, 'c'], [180, 't'], [90, 't'], [120, 'h'], [60, 'h']].forEach(([ang, k]) => { const o = Math.abs(d - ang); if (o <= 2 && k !== 'c') out.push({ a, b, k, o }); });
  }));
  return out;
}
