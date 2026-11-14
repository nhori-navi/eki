'use strict';
// 鉄道のひろがり — 新橋開業から現在まで、首都圏の鉄道の広がりを地図で見る
// 線路と駅：国土数値情報（鉄道時系列）を加工した rails.json
const Y0 = 1872, Y1 = new Date().getFullYear();
const PREF = 'eki_pref_v1';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 事業者の種類と色（rails.json の番号の順）
const ORDER = ['shin', 'sub', 'tram', 'jr', 'pvt'];
const CATS = {
  shin: {name: '新幹線', color: '#d84315'},
  jr: {name: 'JR・国鉄', color: '#2e8b57'},
  pvt: {name: '私鉄など', color: '#2f6db5'},
  sub: {name: '地下鉄', color: '#8e44ad'},
  tram: {name: '路面電車', color: '#a0522d'}
};

// 年表（号外で知らせる出来事）
const EV = {
  1872: '新橋〜横浜間で日本初の鉄道が開業',
  1882: '東京馬車鉄道が新橋〜日本橋間で開業',
  1883: '日本鉄道 上野〜熊谷間が開業',
  1885: '品川〜赤羽間（のちの山手線の一部）が開業',
  1889: '東海道線 新橋〜神戸間が全通',
  1891: '日本鉄道 上野〜青森間が全通',
  1903: '東京電車鉄道が品川〜新橋間で路面電車を開業',
  1906: '鉄道国有法が公布され、主要な私鉄が国有化へ',
  1914: '東京駅が開業',
  1923: '関東大震災。各地の鉄道が大きな被害を受ける',
  1925: '山手線の環状運転が始まる',
  1927: '上野〜浅草間に東洋初の地下鉄が開業',
  1945: '終戦。空襲で多くの路線・駅が被災',
  1949: '日本国有鉄道（国鉄）が発足',
  1954: '丸ノ内線 池袋〜御茶ノ水間が開業',
  1964: '東海道新幹線が開業。東京モノレールも開業',
  1972: '鉄道開業100年',
  1982: '東北・上越新幹線が開業（大宮発着）',
  1987: '国鉄が分割民営化され、JRグループが発足',
  1991: '東北・上越新幹線が東京駅に乗り入れ',
  1997: '長野新幹線（北陸新幹線）が開業',
  2005: 'つくばエクスプレスが開業',
  2019: '相鉄・JR直通線が開業',
  2020: '高輪ゲートウェイ駅が開業',
  2023: '相鉄・東急直通線が開業'
};
const ERAS = [['明治', 1872], ['大正', 1912], ['昭和（戦前）', 1926], ['戦後', 1945], ['高度成長期', 1955], ['平成', 1989], ['令和', 2019]];
// 地理院タイルの年代別空中写真 [この年から, この年まで, タイルID, 説明]
const PHOTOS = [
  [1945, 1960, 'ort_USA10', '1945〜1950年撮影（一部地域のみ）'],
  [1961, 1973, 'ort_old10', '1961〜1969年撮影'],
  [1974, 1978, 'gazo1', '1974〜1978年撮影'],
  [1979, 1983, 'gazo2', '1979〜1983年撮影'],
  [1984, 1987, 'gazo3', '1984〜1986年撮影'],
  [1988, 2003, 'gazo4', '1988〜1990年撮影'],
  [2004, 9999, 'seamlessphoto', '最新の写真']
];
const PENTA = [659, 784, 880, 988, 1175, 1319, 1568];

// ---------- 設定（この端末に記憶） ----------
const opt = {cats: {shin: 1, jr: 1, pvt: 1, sub: 1, tram: 1}, emph: true, ghost: true, follow: true, gogai: true, sound: false, bg: 'pale'};
try { Object.assign(opt, JSON.parse(localStorage.getItem(PREF) || '{}'), {sound: false}); } catch (e) {}
const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(opt)); } catch (e) {} };

// ---------- 地図 ----------
const map = L.map('map', {preferCanvas: true, zoomControl: false}).setView([35.52, 139.66], 10);
L.control.zoom({position: 'topright'}).addTo(map);
const pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>｜<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報</a>（国交省）を加工'
}).addTo(map);
let photo = null, photoId = '';
const R0 = L.canvas({padding: 0.3});
const layer = L.layerGroup().addTo(map), fx = L.layerGroup().addTo(map), lbl = L.layerGroup().addTo(map);
map.createPane('cmpL'); map.createPane('cmpR');
map.getPane('cmpL').style.zIndex = 450; map.getPane('cmpR').style.zIndex = 450;
const RL = L.canvas({pane: 'cmpL'}), RR = L.canvas({pane: 'cmpR'});
const gL = L.layerGroup().addTo(map), gR = L.layerGroup().addTo(map);

let LN = [], S = [], P = [], counts = {}, lineList = [], gen = 0, lastNew = 0, lastOrder = [], focus = null;
const curYear = () => +$('slider').value;

// ---------- データ ----------
async function load() {
  const r = await fetch('rails.json?v=4');
  if (!r.ok) throw new Error('rails.json: HTTP ' + r.status);
  const d = await r.json();
  LN = d.L;
  S = d.S.map(([n, lat, lon, k, o, c, ls]) => ({n, lat, lon, k: [...k].map(i => ORDER[+i]), o, c: c || null, ls}));
  P = d.P.map(([k, s, e, f, l, a, b, enc]) => {
    const pts = []; let la = 0, lo = 0;
    for (let i = 0; i < enc.length; i += 2) { la += enc[i]; lo += enc[i + 1]; pts.push([la / 1e5, lo / 1e5]); }
    return {cat: ORDER[k], s, e: e || null, o: !!(f & 1), g: !!(f & 2), l, a, b, pts};
  });
}

const isOpen = (s, y) => s.o <= y && (s.c == null || s.c > y);
const present = (p, y) => p.s <= y && (p.e == null || y <= p.e);
const isNewP = (p, y) => p.s === y && p.o;
const ghostAt = (p, y) => p.g && p.e != null && p.e < y;
const onLineS = s => focus == null || s.ls.some(t => t[0] === focus);
const onLineP = p => focus == null || p.l === focus;
const stOn = s => s.k.some(c => opt.cats[c]);
const ll = i => [S[i].lat, S[i].lon];

function prep() {
  counts = {};
  for (let y = Y0; y <= Y1; y++) { let n = 0; for (const s of S) if (isOpen(s, y)) n++; counts[y] = n; }
  S.forEach((s, i) => { s.i = i; });
  const names = [...new Set(S.map(s => s.n))].sort();
  $('names').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  const lc = new Array(LN.length).fill(0);
  for (const s of S) for (const [l] of s.ls) lc[l]++;
  lineList = LN.map((n, i) => i).filter(i => lc[i] >= 3).sort((a, b) => lc[b] - lc[a]);
  $('lineNames').innerHTML = lineList.map(i => `<option value="${esc(LN[i])}">`).join('');
  // 駅ごとにつながる区間
  S.forEach(s => { s.p = []; });
  P.forEach((p, j) => { if (p.a >= 0) S[p.a].p.push(j); if (p.b >= 0) S[p.b].p.push(j); });
}

function era(y) {
  const f = (name, n) => name + (n === 1 ? '元' : n) + '年';
  if (y >= 2019) return f('令和', y - 2018);
  if (y >= 1989) return f('平成', y - 1988);
  if (y >= 1926) return f('昭和', y - 1925);
  if (y >= 1912) return f('大正', y - 1911);
  return f('明治', y - 1867);
}
const trainIcon = y => y < 1925 ? '🚂' : y < 1964 ? '🚃' : '🚄';

// ---------- 描きかた ----------
function line(p, style, G, R, pts) {
  const col = CATS[p.cat].color, ph = opt.bg === 'photo';
  const base = {renderer: R, interactive: false, smoothFactor: 1.2};
  pts = pts || p.pts;
  if (style === 'new') {
    L.polyline(pts, {...base, color: '#ffd54f', weight: 9, opacity: .65}).addTo(G);
    return L.polyline(pts, {...base, color: col, weight: 3.5, opacity: 1}).addTo(G);
  }
  const st = {
    full: {color: col, weight: 2.5, opacity: ph ? .95 : .85},
    base: {color: col, weight: 2, opacity: ph ? .75 : .4},
    faint: {color: '#8a8a8a', weight: 1.5, opacity: .3},
    ghost: {color: '#7a6a55', weight: 1.6, opacity: ph ? .9 : .6, dashArray: '4 5'}
  }[style];
  return L.polyline(pts, {...base, ...st}).addTo(G);
}
function dot(i, style, G, R) {
  const s = S[i], col = CATS[s.k[0]].color;
  const st = {
    normal: {radius: 3, weight: 1.2, color: col, fillColor: '#fff', fillOpacity: 1},
    faint: {radius: 2, weight: 1, color: '#999', fillColor: '#ddd', fillOpacity: .5, opacity: .5},
    closed: {radius: 3, weight: 1, color: '#999', fillColor: '#ccc', fillOpacity: .6, opacity: .7},
    new: {radius: 6, weight: 2, color: '#c62828', fillColor: '#ffd54f', fillOpacity: 1}
  }[style];
  const m = L.circleMarker(ll(i), {renderer: R, ...st}).addTo(G);
  if (!quiz.on && style !== 'faint') m.bindPopup(() => card(i), {maxWidth: 280});
  return m;
}
function labels(y) {
  lbl.clearLayers();
  if (map.getZoom() < 14 || cmp.on) return;
  const b = map.getBounds(); let n = 0;
  for (const s of S) {
    if (!isOpen(s, y) || !stOn(s) || !onLineS(s) || !b.contains([s.lat, s.lon])) continue;
    if (++n > 250) break;
    L.marker([s.lat, s.lon], {icon: L.divIcon({className: 'lbl', html: `<span style="left:7px;top:-8px">${esc(s.n)}</span>`, iconSize: [0, 0]}), interactive: false}).addTo(lbl);
  }
}

function draw(y, animate) {
  if (cmp.on) return drawCompare();
  const g = ++gen;
  layer.clearLayers(); fx.clearLayers();
  const z = map.getZoom(), newP = [], newSt = [];
  for (const p of P) {
    if (!opt.cats[p.cat]) continue;
    const fo = onLineP(p);
    if (present(p, y)) {
      if (isNewP(p, y) && fo) newP.push(p);
      else line(p, !fo ? 'faint' : opt.emph ? 'base' : 'full', layer, R0);
    } else if (opt.ghost && ghostAt(p, y)) line(p, 'ghost', layer, R0);
  }
  let shown = 0;
  for (const s of S) {
    if (!stOn(s)) continue;
    const open = isOpen(s, y), fo = onLineS(s);
    if (open) shown++;
    const newHere = focus == null ? s.o === y : s.ls.some(t => t[0] === focus && t[1] === y);
    if (open && newHere && fo) newSt.push(s.i);
    else if (open) { if (focus != null ? true : z >= 11) dot(s.i, fo ? 'normal' : 'faint', layer, R0); }
    else if (s.c === y && z >= 11 && fo) dot(s.i, 'closed', layer, R0);
  }
  const order = popOrder(y, newSt, newP);
  lastNew = order.length; lastOrder = order;
  if (animate) animateYear(y, order, newP, g);
  else { newP.forEach(p => line(p, 'new', fx, R0)); order.forEach(i => dot(i, 'new', fx, R0)); }
  labels(y);
  $('year').textContent = y;
  $('era').textContent = era(y);
  $('cnt').textContent = '駅数 ' + shown;
  $('news').textContent = order.length ? 'この年の開業：' + order.slice(0, 15).map(i => S[i].n).join('、') + (order.length > 15 ? ` ほか${order.length - 15}駅` : '') : '';
  background(y); spark(y);
  if (opt.gogai && !quiz.on && EV[y]) gogai(y);
  else if (!animate) $('gogai').classList.remove('show');
  if (animate && opt.follow && order.length && !quiz.on) {
    const c = L.latLngBounds(order.map(ll)).getCenter();
    if (!map.getBounds().pad(-0.15).contains(c)) map.panTo(c, {duration: 0.6});
  }
}

// 新しい駅の出る順番：すでにある駅から、新しい線路をたどって近い順に
function popOrder(y, newSt, newP) {
  const isNew = new Set(newSt), adj = new Map(), seen = new Set(), out = [];
  for (const p of newP) {
    if (p.a < 0 || p.b < 0) continue;
    if (!adj.has(p.a)) adj.set(p.a, []); if (!adj.has(p.b)) adj.set(p.b, []);
    adj.get(p.a).push(p.b); adj.get(p.b).push(p.a);
  }
  let q = [];
  for (const [n] of adj) if (!isNew.has(n) && isOpen(S[n], y)) { seen.add(n); q.push(n); }
  while (q.length) {
    const nx = [];
    for (const n of q) for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); if (isNew.has(m)) out.push(m); nx.push(m); }
    q = nx;
  }
  // 端の駅（つながりが1本）から始める
  const rest = newSt.filter(i => !seen.has(i)).sort((a, b) => ((adj.get(a) || []).length > 1) - ((adj.get(b) || []).length > 1));
  // 古い駅につながっていない新しい路線は、端からたどる
  for (const i of rest) {
    if (seen.has(i)) continue;
    seen.add(i); out.push(i); let fr = [i];
    while (fr.length) { const nx = []; for (const n of fr) for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); if (isNew.has(m)) out.push(m); nx.push(m); } fr = nx; }
  }
  return out;
}

// 同じ年の駅を一つずつポンポンと出し、線路はつながった時に伸ばす
const baseStep = () => clamp(+$('speed').value / 4, 30, 220);
const popStep = n => n > 30 ? baseStep() * 30 / n : baseStep();
const delay = y => +$('speed').value * (EV[y] && opt.gogai ? 4 : 1) + Math.min(lastNew, 30) * baseStep() + 250;
function animateYear(y, order, newP, g) {
  const step = popStep(order.length), t = {};
  order.forEach((i, k) => { t[i] = k * step; });
  order.forEach((i, k) => setTimeout(() => {
    if (g !== gen) return;
    popDot(i, g);
    if (k < 40) beep([PENTA[k % PENTA.length]], 0.12, 0.035);
  }, t[i]));
  if (EV[y] && opt.gogai) beep([523, 659], 0.7, 0.1);
  const dur = Math.min(700, step * 4 + 300);
  let trains = 0, freeAt = -1e9;
  newP.sort((p, q) => Math.max(t[p.a] || 0, t[p.b] || 0) - Math.max(t[q.a] || 0, t[q.b] || 0));
  for (const p of newP) {
    const ta = t[p.a] || 0, tb = t[p.b] || 0, due = Math.max(ta, tb);
    const pts = ta <= tb ? p.pts : p.pts.slice().reverse();
    // 列車は前の列車が走り終えてから（同じ場所に重ならないように）
    let icon = null;
    if (trains < 6 && due >= freeAt && pathLen(pts) > 0.008) { icon = trainIcon(y); trains++; freeAt = due + dur; }
    setTimeout(() => { if (g === gen) growLine(p, pts, dur, icon, g); }, Math.max(ta, tb));
  }
}
function pathLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }
function popDot(i, g) {
  const m = dot(i, 'new', fx, R0); m.setRadius(0);
  const t0 = performance.now();
  (function step(now) {
    if (g !== gen) return;
    const k = (now - t0) / 300;
    m.setRadius(k < .5 ? 18 * k : k < 1 ? 9 - 6 * (k - .5) : 6);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function growLine(p, pts, dur, icon, g) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1e-9;
  const halo = L.polyline([pts[0], pts[0]], {renderer: R0, interactive: false, color: '#ffd54f', weight: 9, opacity: .65}).addTo(fx);
  const ln = L.polyline([pts[0], pts[0]], {renderer: R0, interactive: false, color: CATS[p.cat].color, weight: 3.5}).addTo(fx);
  const mk = icon ? L.marker(pts[0], {icon: L.divIcon({className: 'train', html: icon, iconSize: [20, 20]}), interactive: false}).addTo(fx) : null;
  const t0 = performance.now();
  (function step(now) {
    if (g !== gen) return;
    const k = Math.min(1, (now - t0) / dur), d = k * total;
    let j = 1; while (j < pts.length - 1 && cum[j] < d) j++;
    const r = (d - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1e-9);
    const P1 = [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * Math.min(1, r), pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * Math.min(1, r)];
    const part = pts.slice(0, j).concat([P1]);
    halo.setLatLngs(part); ln.setLatLngs(part); if (mk) mk.setLatLng(P1);
    if (k < 1) requestAnimationFrame(step); else if (mk) fx.removeLayer(mk);
  })(t0);
}

// ---------- 背景（時代の色合い・空中写真） ----------
function background(y) {
  const t = clamp((1970 - y) / 90, 0, 1), c = pale.getContainer();
  if (c) c.style.filter = `sepia(${t}) saturate(${1 - .3 * t}) brightness(${1 - .06 * t})`;
  let note = '';
  const ph = opt.bg === 'photo' ? PHOTOS.find(p => y >= p[0] && y <= p[1]) : null;
  if (ph) {
    if (photoId !== ph[2]) {
      if (photo) map.removeLayer(photo);
      photo = L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${ph[2]}/{z}/{x}/{y}.jpg`, {
        maxZoom: 18, maxNativeZoom: ph[2] === 'seamlessphoto' ? 18 : 17, minZoom: ph[2] === 'seamlessphoto' ? 0 : 10
      }).addTo(map);
      photoId = ph[2];
    }
    note = '空中写真：' + ph[3] + (map.getZoom() < 10 && ph[2] !== 'seamlessphoto' ? '（拡大すると表示）' : '');
  } else {
    if (photo) { map.removeLayer(photo); photo = null; photoId = ''; }
    if (opt.bg === 'photo') note = 'この時代の空中写真はありません';
  }
  $('bgNote').textContent = note;
  $('bgNote').style.display = note ? 'block' : 'none';
}

// ---------- 演出（音・号外・グラフ） ----------
let audio = null;
function beep(freqs, len, vol) {
  if (!opt.sound || !audio) return;
  const t = audio.currentTime;
  for (const f of freqs) {
    const o = audio.createOscillator(), gn = audio.createGain();
    o.type = 'sine'; o.frequency.value = f;
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + .02); gn.gain.exponentialRampToValueAtTime(.001, t + len);
    o.connect(gn).connect(audio.destination); o.start(t); o.stop(t + len + .05);
  }
}
let gTimer = null;
function gogai(y) {
  $('gEra').textContent = y + '年（' + era(y) + '）';
  $('gText').textContent = EV[y];
  $('gogai').classList.add('show');
  clearTimeout(gTimer);
  gTimer = setTimeout(() => $('gogai').classList.remove('show'), Math.max(2400, +$('speed').value * 4));
}
function spark(y) {
  const cv = $('spark'), dpr = window.devicePixelRatio || 1, W = 130, H = 32;
  cv.width = W * dpr; cv.height = H * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const max = Math.max(1, ...Object.values(counts)), X = v => (v - Y0) / (Y1 - Y0) * (W - 2) + 1, Yp = v => H - 2 - v / max * (H - 6);
  c.beginPath(); c.moveTo(X(Y0), H - 2);
  for (let v = Y0; v <= Y1; v++) c.lineTo(X(v), Yp(counts[v] || 0));
  c.lineTo(X(Y1), H - 2); c.closePath(); c.fillStyle = 'rgba(31,78,121,.18)'; c.fill();
  c.beginPath(); for (let v = Y0; v <= Y1; v++) c[v === Y0 ? 'moveTo' : 'lineTo'](X(v), Yp(counts[v] || 0));
  c.strokeStyle = '#1f4e79'; c.lineWidth = 1.2; c.stroke();
  c.beginPath(); c.moveTo(X(y), 0); c.lineTo(X(y), H); c.strokeStyle = '#c62828'; c.lineWidth = 1.5; c.stroke();
}

// ---------- 駅カード ----------
function neighborsAt(i, y) {
  const out = new Set();
  for (const j of S[i].p) { const p = P[j]; if (!present(p, y)) continue; const o = p.a === i ? p.b : p.a; if (o >= 0 && o !== i) out.add(S[o].n); }
  return [...out];
}
function card(i) {
  const s = S[i];
  const same = S.filter(x => x !== s && x.o === s.o)
    .sort((a, b) => ((a.lat - s.lat) ** 2 + (a.lon - s.lon) ** 2) - ((b.lat - s.lat) ** 2 + (b.lon - s.lon) ** 2));
  const nb = neighborsAt(i, s.o);
  const ls = s.ls.map(([l, o]) => `${esc(LN[l])}（${o}年〜）`).join('<br>');
  return `<div class="cardS"><div class="cn">${esc(s.n)}</div><div class="cl">${ls}</div>
  <div>開業：<b>${s.o}年</b>（${era(s.o)}）</div>
  <div>${s.c ? `${s.c}年に廃止` : `今年で <b>${Y1 - s.o}歳</b>`}</div>
  ${nb.length ? `<div>開業時の隣の駅：${esc(nb.join('・'))}</div>` : ''}
  <div>同じ年に開業：${same.length}駅${same.length ? '（' + esc(same.slice(0, 4).map(x => x.n).join('・')) + (same.length > 4 ? ' など' : '') + '）' : ''}</div>
  <div class="row" style="margin-top:6px"><button data-act="year" data-id="${i}">開業した年へ</button>
  ${s.ls.slice(0, 3).map(([l]) => `<button data-act="story" data-line="${l}">📖 ${esc(LN[l])}</button>`).join('')}</div></div>`;
}
map.on('popupopen', e => {
  e.popup.getElement().querySelectorAll('button[data-act]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.act === 'year') goStation(+b.dataset.id, false);
      else { map.closePopup(); if (cmp.on) cmpEnd(); if (quiz.on) qQuit(); storyStart(+b.dataset.line); }
    };
  });
});
function goStation(i, fly) {
  const s = S[i];
  stop(); $('slider').value = s.o; draw(s.o, false);
  if (fly) map.flyTo(ll(i), 13, {duration: 1.2});
  setTimeout(() => L.popup({maxWidth: 280}).setLatLng(ll(i)).setContent(card(i)).openOn(map), fly ? 1300 : 50);
}

// ---------- 再生 ----------
let timer = null, playing = false;
function stop() { playing = false; clearTimeout(timer); $('play').textContent = '▶'; }
function tick() {
  const y = curYear() + 1;
  if (y > Y1) return stop();
  $('slider').value = y; draw(y, true);
  timer = setTimeout(tick, delay(y));
}
$('play').onclick = () => {
  if (playing) return stop();
  playing = true; $('play').textContent = '❚❚';
  if (curYear() >= Y1) { $('slider').value = Y0; draw(Y0, true); timer = setTimeout(tick, delay(Y0)); }
  else tick();
};
const jump = y => { stop(); $('slider').value = clamp(y, Y0, Y1); draw(curYear(), false); };
$('slider').oninput = () => jump(curYear());
$('back10').onclick = () => jump(curYear() - 10);
$('fwd10').onclick = () => jump(curYear() + 10);
$('eraJump').innerHTML = '<option value="">—</option>' + ERAS.map(([n, y]) => `<option value="${y}">${n}（${y}年〜）</option>`).join('');
$('eraJump').onchange = e => { if (e.target.value) jump(+e.target.value); e.target.value = ''; };
map.on('zoomend', () => { if (cmp.on) drawCompare(); else if (!playing && !story.auto) draw(curYear(), false); else labels(curYear()); });
map.on('moveend', () => { if (!cmp.on && map.getZoom() >= 14) labels(curYear()); });

// ---------- 表示設定 ----------
$('optBtn').onclick = () => { const d = $('drawer'); const open = d.style.display !== 'block'; d.style.display = open ? 'block' : 'none'; $('optBtn').classList.toggle('on', open); };
$('chips').innerHTML = Object.entries(CATS).map(([k, c]) => `<label><input type="checkbox" data-cat="${k}"${opt.cats[k] ? ' checked' : ''}><span class="sw" style="background:${c.color}"></span>${c.name}</label>`).join('');
$('chips').onchange = e => { const k = e.target.dataset.cat; if (!k) return; opt.cats[k] = e.target.checked ? 1 : 0; savePref(); redraw(); };
for (const k of ['emph', 'ghost', 'follow', 'gogai', 'sound']) {
  const el = $('o_' + k); el.checked = !!opt[k];
  el.onchange = () => {
    opt[k] = el.checked; savePref();
    if (k === 'sound' && el.checked && !audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (k === 'gogai' && !el.checked) $('gogai').classList.remove('show');
    if (k === 'emph' || k === 'ghost') redraw();
  };
}
$('o_bg').value = opt.bg;
$('o_bg').onchange = () => { opt.bg = $('o_bg').value; savePref(); redraw(); };
function redraw() { if (cmp.on) drawCompare(); else draw(curYear(), false); }

// ---------- 駅さがし ----------
function findStation() {
  const q = $('q').value.trim(); if (!q) return;
  let hit = S.filter(s => s.n === q || s.n === q + '駅');
  if (!hit.length) hit = S.filter(s => s.n.includes(q));
  if (!hit.length) { $('news').textContent = '「' + q + '」は見つかりませんでした'; return; }
  hit.sort((a, b) => (a.c == null ? 0 : 1) - (b.c == null ? 0 : 1) || a.o - b.o);
  goStation(hit[0].i, true);
}
$('find').onclick = findStation;
$('q').onkeydown = e => { if (e.key === 'Enter') findStation(); };

// ---------- パネルの切り替え ----------
function showCard(name) { for (const c of ['panel', 'quiz', 'story', 'cmp']) $(c).style.display = c === name ? 'block' : 'none'; }

// ---------- クイズ：この駅、何年生まれ？ ----------
const quiz = {on: false, n: 0, score: 0, t: null, ring: null, phase: ''};
const TOTAL = 5;
function qShowYear() { const v = +$('qSlider').value; $('qYear').textContent = v; $('qEra').textContent = era(v); }
$('qSlider').max = Y1; $('qSlider').oninput = qShowYear;
function qStart() {
  if (!S.length) return;
  stop(); map.closePopup(); Object.assign(quiz, {on: true, n: 0, score: 0});
  showCard('quiz'); qNext();
}
function qNext() {
  if (quiz.n >= TOTAL) return qEnd();
  quiz.n++; quiz.phase = 'ask';
  const pool = S.filter(s => s.c == null && stOn(s) && !/（/.test(s.n));
  const s = pool[Math.floor(Math.random() * pool.length)];
  quiz.t = s.i;
  $('slider').value = Y1; draw(Y1, false);
  $('qHead').textContent = `第${quiz.n}問／全${TOTAL}問　この駅、何年生まれ？`;
  $('qScore').textContent = quiz.score + '点';
  $('qName').textContent = s.n; $('qLine').textContent = s.ls.map(([l]) => LN[l]).join('・');
  $('qSlider').value = 1930; qShowYear();
  $('qAsk').style.display = 'block'; $('qRes').innerHTML = ''; $('qNext').style.display = 'none';
  if (quiz.ring) map.removeLayer(quiz.ring);
  quiz.ring = L.marker(ll(s.i), {icon: L.divIcon({className: '', html: '<div class="pulse"></div>', iconSize: [30, 30]}), interactive: false}).addTo(map);
  map.flyTo(ll(s.i), 12, {duration: 1});
}
function qAnswer() {
  const s = S[quiz.t], g = +$('qSlider').value, d = Math.abs(g - s.o), p = Math.max(0, 100 - d * 4);
  quiz.score += p; quiz.phase = 'res';
  const word = d === 0 ? '🎯 ぴったり！' : d <= 3 ? '惜しい！' : d <= 10 ? 'いい線！' : 'これは難問…';
  $('qRes').innerHTML = `${word} 正解は <b>${s.o}年（${era(s.o)}）</b>。差は${d}年で <b>${p}点</b>`;
  $('qScore').textContent = quiz.score + '点';
  $('qAsk').style.display = 'none';
  $('qNext').textContent = quiz.n >= TOTAL ? '結果を見る' : '次へ'; $('qNext').style.display = 'inline-block';
  $('slider').value = s.o; draw(s.o, true);
  beep(d <= 3 ? [784, 988] : [392], .3, .1);
}
function qEnd() {
  quiz.phase = 'end';
  const sc = quiz.score, title = sc >= 400 ? '🏅 名誉駅長' : sc >= 300 ? '🚉 駅長' : sc >= 200 ? '🎫 助役' : '🔰 見習い';
  $('qHead').textContent = 'クイズ終了'; $('qName').textContent = `${sc}点／${TOTAL * 100}点`; $('qLine').textContent = '';
  $('qRes').innerHTML = `あなたの称号は <b>${title}</b>`;
  $('qNext').textContent = 'もう一度';
  if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
}
function qQuit() {
  quiz.on = false; if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
  showCard('panel'); draw(curYear(), false);
}
$('quizBtn').onclick = qStart;
$('qGo').onclick = qAnswer;
$('qNext').onclick = () => quiz.phase === 'end' ? qStart() : qNext();
$('qQuit').onclick = qQuit;

// ---------- 路線ものがたり ----------
const story = {steps: [], i: 0, ids: [], auto: false, timer: null};
$('storyBtn').onclick = () => { stop(); showCard('story'); $('sPick').style.display = 'block'; $('sMain').style.display = 'none'; $('sLine').focus(); };
$('sCancel').onclick = () => showCard('panel');
$('sGo').onclick = () => {
  const q = $('sLine').value.trim(); if (!q) return;
  const i = LN.indexOf(q) >= 0 ? LN.indexOf(q) : lineList.find(k => LN[k].includes(q));
  if (i == null || i < 0) { $('sLine').value = ''; $('sLine').placeholder = '見つかりませんでした'; return; }
  storyStart(i);
};
$('sLine').onkeydown = e => { if (e.key === 'Enter') $('sGo').onclick(); };
function storyStart(li) {
  const ids = S.filter(s => s.ls.some(t => t[0] === li)).map(s => s.i);
  const ps = P.filter(p => p.l === li);
  if (!ids.length && !ps.length) return;
  stop(); map.closePopup(); focus = li; story.ids = ids;
  const ys = new Set();
  for (const i of ids) { for (const [l, o] of S[i].ls) if (l === li) ys.add(o); if (S[i].c) ys.add(S[i].c); }
  for (const p of ps) { if (p.o) ys.add(p.s); if (p.g && p.e) ys.add(p.e + 1); }
  story.steps = [...ys].filter(y => y >= Y0 && y <= Y1).sort((a, b) => a - b);
  showCard('story'); $('sPick').style.display = 'none'; $('sMain').style.display = 'block';
  $('sTitle').textContent = '📖 ' + LN[li];
  const pts = ps.flatMap(p => [p.pts[0], p.pts[p.pts.length - 1]]).concat(ids.map(ll));
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.12));
  setTimeout(() => storyGo(0, true), 700);
}
function storyGo(k, animate) {
  story.i = clamp(k, 0, story.steps.length - 1);
  const y = story.steps[story.i];
  $('slider').value = y; draw(y, animate);
  const rank = new Map(lastOrder.map((i, k) => [i, k]));
  const op = story.ids.filter(i => S[i].ls.some(t => t[0] === focus && t[1] === y)).sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
  const cl = story.ids.filter(i => S[i].c === y);
  let txt = `<b>${y}年（${era(y)}）</b>`;
  if (EV[y]) txt += `<br><span style="color:#6b5a44">${esc(EV[y])}</span>`;
  if (op.length) txt += `<br>${esc(op.map(i => S[i].n).join('・'))} が開業`;
  if (cl.length) txt += `<br>${esc(cl.map(i => S[i].n).join('・'))} が廃止`;
  if (!op.length && !cl.length) txt += '<br>線路が変わりました';
  $('sText').innerHTML = txt;
  $('sCount').textContent = `${story.i + 1}／${story.steps.length}`;
}
function storyAuto(on) {
  story.auto = on; clearTimeout(story.timer);
  $('sAuto').textContent = on ? '■ 停止' : '▶ 自動';
  if (!on) return;
  const next = () => {
    if (!story.auto) return;
    if (story.i >= story.steps.length - 1) return storyAuto(false);
    storyGo(story.i + 1, true);
    story.timer = setTimeout(next, delay(story.steps[story.i]) + 1500);
  };
  story.timer = setTimeout(next, 600);
}
$('sPrev').onclick = () => { storyAuto(false); storyGo(story.i - 1, false); };
$('sNext').onclick = () => { storyAuto(false); storyGo(story.i + 1, true); };
$('sAuto').onclick = () => storyAuto(!story.auto);
$('sQuit').onclick = () => { storyAuto(false); focus = null; showCard('panel'); draw(curYear(), false); };

// ---------- 2つの年を比べる ----------
const cmp = {on: false, x: .5};
$('cmpA').max = Y1; $('cmpB').max = Y1;
function staticInto(y, G, R) {
  for (const p of P) {
    if (!opt.cats[p.cat]) continue;
    if (present(p, y)) line(p, 'full', G, R);
    else if (opt.ghost && ghostAt(p, y)) line(p, 'ghost', G, R);
  }
  if (map.getZoom() >= 11) for (const s of S) if (isOpen(s, y) && stOn(s)) dot(s.i, 'normal', G, R);
}
function drawCompare() {
  gL.clearLayers(); gR.clearLayers();
  const a = +$('cmpA').value, b = +$('cmpB').value;
  staticInto(a, gL, RL); staticInto(b, gR, RR);
  $('cA').textContent = a; $('cB').textContent = b;
  $('tagA').textContent = `${a}年（${era(a)}）`; $('tagB').textContent = `${b}年（${era(b)}）`;
  background(Math.round((a + b) / 2)); clip();
}
function clip() {
  if (!cmp.on) return;
  const w = map.getSize().x, nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(map.getSize());
  const cx = nw.x + w * cmp.x;
  map.getPane('cmpL').style.clip = `rect(${nw.y}px, ${cx}px, ${se.y}px, ${nw.x}px)`;
  map.getPane('cmpR').style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${cx}px)`;
  $('divider').style.left = (w * cmp.x) + 'px';
}
map.on('move zoom resize', clip);
function cmpStart() {
  stop(); map.closePopup(); cmp.on = true; gen++;
  layer.clearLayers(); fx.clearLayers(); lbl.clearLayers();
  if (!$('cmpA').dataset.set) { $('cmpA').value = 1900; $('cmpB').value = Y1; $('cmpA').dataset.set = 1; }
  showCard('cmp');
  for (const e of ['divider', 'tagA', 'tagB']) $(e).style.display = 'block';
  $('gogai').classList.remove('show');
  drawCompare();
}
function cmpEnd() {
  cmp.on = false; gL.clearLayers(); gR.clearLayers();
  map.getPane('cmpL').style.clip = map.getPane('cmpR').style.clip = '';
  for (const e of ['divider', 'tagA', 'tagB']) $(e).style.display = 'none';
  showCard('panel'); draw(curYear(), false);
}
$('cmpBtn').onclick = cmpStart;
$('cmpQuit').onclick = cmpEnd;
$('cmpA').oninput = $('cmpB').oninput = drawCompare;
(() => {
  const dv = $('divider'); let drag = false;
  dv.addEventListener('pointerdown', e => { drag = true; dv.setPointerCapture(e.pointerId); e.preventDefault(); });
  dv.addEventListener('pointermove', e => { if (!drag) return; cmp.x = clamp(e.clientX / map.getSize().x, .02, .98); clip(); });
  dv.addEventListener('pointerup', () => { drag = false; });
})();

// ---------- 起動 ----------
async function start() {
  $('msg').style.display = 'block';
  $('msg').textContent = '線路データを読み込み中…';
  try {
    await load();
    prep();
    $('msg').style.display = 'none';
    draw(curYear(), false);
  } catch (e) {
    $('msg').innerHTML = '読み込みに失敗しました（' + esc(e.message) + '）。<button id="retry">もう一度</button>';
    $('retry').onclick = () => start();
  }
}
$('slider').max = Y1;
try { localStorage.removeItem('eki_data_v3'); localStorage.removeItem('railmap_kanto_v1'); } catch (e) {}
start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js', {scope: './'}).catch(() => {});
