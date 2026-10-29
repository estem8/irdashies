const NAMES = { lf: 'Front left', rf: 'Front right', lr: 'Rear left', rr: 'Rear right' };
const SERIES = [['tread', '#94a3b8', 1.5], ['real', '#fb923c', 1.5], ['dash', '#22d3ee', 1.5]];
let data = null, view = [0, 1], hover = null;
const grid = document.getElementById('grid');
const canvases = {};
for (const k of Object.keys(NAMES)) { const cell = document.createElement('div'); cell.className = 'cell'; const c = document.createElement('canvas'); cell.appendChild(c); grid.appendChild(cell); canvases[k] = c; }

async function load(file) {
  const r = await window.viewer.load(file);
  if (!r) return;
  document.getElementById('msg').textContent = r.error || '';
  if (!r.ok) return;
  data = r.ok; view = [data.t[0], data.t[data.t.length - 1]];
  document.getElementById('name').textContent = `${data.file} (${data.car})`;
  draw();
}
document.getElementById('open').onclick = () => load();
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(window.viewer.pathOf(f)); });

const bar = document.getElementById('scroll');
let syncing = false;
function syncBar() {
  const total = data.t[data.t.length - 1] - data.t[0], span = view[1] - view[0];
  syncing = true;
  bar.firstChild.style.width = Math.max(100, total / span * 100) + '%';
  bar.scrollLeft = (view[0] - data.t[0]) / total * bar.scrollWidth;
  setTimeout(() => { syncing = false; }, 0);
}
bar.addEventListener('scroll', () => {
  if (syncing || !data) return;
  const total = data.t[data.t.length - 1] - data.t[0], span = view[1] - view[0];
  const s = data.t[0] + bar.scrollLeft / bar.scrollWidth * total;
  view = [s, s + span]; draw(true);
});

function stats(cr, a, b) {
  let rs = 0, rb = 0, rn = 0, ds = 0, dn = 0;
  for (let i = a; i < b; i++) {
    const e = cr.real[i] - cr.tread[i];
    if (isFinite(e)) { rs += e * e; rb += e; rn++; }
    // the carcass reading refreshes only at stops: compare where it just changed
    if (i > 0 && cr.carcass[i] !== cr.carcass[i - 1] && cr.carcass[i] > 0) { const d = cr.dash[i] - cr.carcass[i]; if (isFinite(d)) { ds += d * d; dn++; } }
  }
  return { real: rn ? Math.sqrt(rs / rn) : 0, realBias: rn ? rb / rn : 0, dash: dn ? Math.sqrt(ds / dn) : 0, n: dn };
}

function draw(fromBar) {
  if (!data) return;
  const lim = [data.t[0], data.t[data.t.length - 1]];
  if (view[1] - view[0] > lim[1] - lim[0]) view = [...lim];
  if (view[0] < lim[0]) view = [lim[0], lim[0] + view[1] - view[0]];
  if (view[1] > lim[1]) view = [lim[1] - (view[1] - view[0]), lim[1]];
  if (fromBar !== true) syncBar();
  for (const [k, c] of Object.entries(canvases)) {
    const dpr = devicePixelRatio, w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const m = { l: 44, r: 10, t: 22, b: 22 }, W = w - m.l - m.r, H = h - m.t - m.b;
    const cr = data.corners[k];
    const i0 = data.t.findIndex((t) => t >= view[0]), i1 = data.t.findIndex((t) => t > view[1]);
    const a = Math.max(0, i0), b = i1 < 0 ? data.t.length : i1;
    let lo = Infinity, hi = -Infinity;
    for (const [s] of SERIES) for (let i = a; i < b; i++) { const v = cr[s][i]; if (v > -50 && v < 400) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (!isFinite(lo)) { lo = 0; hi = 100; }
    lo = Math.floor(lo - 2); hi = Math.ceil(hi + 2);
    const X = (t) => m.l + (t - view[0]) / (view[1] - view[0]) * W, Y = (v) => m.t + H - (v - lo) / (hi - lo) * H;
    g.fillStyle = '#e2e8f0'; g.font = '13px system-ui'; g.fillText(NAMES[k], m.l, 14);
    const st = stats(cr, a, b);
    g.font = '11px system-ui'; g.fillStyle = '#fb923c';
    g.fillText(`Real vs tread rms ${st.real.toFixed(1)} bias ${st.realBias.toFixed(1)}`, w - m.r - 360, 14);
    g.fillStyle = '#22d3ee';
    g.fillText(st.n ? `Dash vs carcass at stops rms ${st.dash.toFixed(1)} (n=${st.n})` : 'Dash vs carcass: no stop in view', w - m.r - 190, 14);
    g.font = '13px system-ui';
    g.strokeStyle = '#1f2937'; g.fillStyle = '#64748b'; g.font = '11px system-ui';
    const step = [1, 2, 5, 10, 20, 50].find((s) => (hi - lo) / s <= 8) || 50;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { g.beginPath(); g.moveTo(m.l, Y(v)); g.lineTo(w - m.r, Y(v)); g.stroke(); g.fillText(String(v), 6, Y(v) + 4); }
    const ts = [1, 5, 10, 30, 60, 120, 300].find((s) => (view[1] - view[0]) / s <= 10) || 600;
    for (let t = Math.ceil(view[0] / ts) * ts; t <= view[1]; t += ts) g.fillText(Math.round(t - data.t[0]) + 's', X(t) - 8, h - 6);
    g.save(); g.beginPath(); g.rect(m.l, m.t, W, H); g.clip();
    // ibt carcass middle refreshes only at stops: draw as a stepped line
    g.strokeStyle = '#34d399'; g.lineWidth = 1; g.setLineDash([4, 3]); g.beginPath();
    for (let i = a; i < b; i++) { const v = cr.carcass[i]; if (!(v > -50)) continue; if (i === a) g.moveTo(X(data.t[i]), Y(v)); else g.lineTo(X(data.t[i]), Y(v)); }
    g.stroke(); g.setLineDash([]);
    for (const [s, col, lw] of SERIES) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); let on = false;
      for (let i = a; i < b; i++) { const v = cr[s][i]; if (!(v > -50 && v < 400)) { on = false; continue; } if (on) g.lineTo(X(data.t[i]), Y(v)); else g.moveTo(X(data.t[i]), Y(v)); on = true; }
      g.stroke();
    }
    g.restore();
    if (hover !== null) {
      const t = view[0] + (hover - m.l) / W * (view[1] - view[0]);
      let i = data.t.findIndex((x) => x >= t); if (i < 0) i = data.t.length - 1;
      g.strokeStyle = '#475569'; g.beginPath(); g.moveTo(X(data.t[i]), m.t); g.lineTo(X(data.t[i]), m.t + H); g.stroke();
      g.fillStyle = '#e2e8f0'; g.font = '12px system-ui';
      const f = (v) => (v > -50 ? v.toFixed(1) : '-');
      g.fillText(`${Math.round(data.t[i] - data.t[0])}s  ${Math.round(data.speed[i])} km/h  tread ${f(cr.tread[i])}  real ${f(cr.real[i])}  dash ${f(cr.dash[i])}  carcass ${f(cr.carcass[i])}`, m.l + 130, 14);
    }
  }
}
for (const c of Object.values(canvases)) {
  c.addEventListener('mousemove', (e) => { const r = c.getBoundingClientRect(); hover = e.clientX - r.left; if (drag) { const dt = (drag.x - e.clientX) / (r.width - 54) * (view[1] - view[0]); view = [drag.v[0] + dt, drag.v[1] + dt]; } draw(); });
  c.addEventListener('mouseleave', () => { hover = null; drag = null; draw(); });
  c.addEventListener('mousedown', (e) => { drag = { x: e.clientX, v: [...view] }; });
  c.addEventListener('mouseup', () => { drag = null; });
  c.addEventListener('dblclick', () => { if (data) { view = [data.t[0], data.t[data.t.length - 1]]; draw(); } });
  c.addEventListener('wheel', (e) => {
    if (!data) return; e.preventDefault();
    const r = c.getBoundingClientRect(), f = (e.clientX - r.left - 44) / (r.width - 54), t = view[0] + f * (view[1] - view[0]), z = e.deltaY > 0 ? 1.25 : 0.8;
    view = [t - (t - view[0]) * z, t + (view[1] - t) * z]; draw();
  }, { passive: false });
}
let drag = null;
addEventListener('resize', draw);
