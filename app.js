'use strict';
// 鉄道のひろがり — 新橋開業から現在まで、首都圏の鉄道の広がりを地図で見る
// 線路と駅：国土数値情報（鉄道時系列）を加工した rails.json
const Y0 = 1872, Y1 = new Date().getFullYear();
const PREF = 'eki_pref_v1';
// 前の版から使っている人か（古い版の仕組みがこのページを受け持っているか）を最初に確かめておく
const HAD_SW = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
const T0 = Date.now();
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
// [この年から, この年まで, タイルID, 説明, 画像の形式]（1945〜1969年の写真だけ png）
const PHOTOS = [
  [1945, 1960, 'ort_USA10', '1945〜1950年撮影（一部地域のみ）', 'png'],
  [1961, 1973, 'ort_old10', '1961〜1969年撮影', 'png'],
  [1974, 1978, 'gazo1', '1974〜1978年撮影', 'jpg'],
  [1979, 1983, 'gazo2', '1979〜1983年撮影', 'jpg'],
  [1984, 1987, 'gazo3', '1984〜1986年撮影', 'jpg'],
  [1988, 2003, 'gazo4', '1988〜1990年撮影', 'jpg'],
  [2004, 9999, 'seamlessphoto', '最新の写真', 'jpg']
];
const PENTA = [659, 784, 880, 988, 1175, 1319, 1568];

// ---------- 設定（この端末に記憶） ----------
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches, COARSE = matchMedia('(pointer: coarse)').matches;
const opt = {cats: {shin: 1, jr: 1, pvt: 1, sub: 1, tram: 1}, emph: true, ghost: true, follow: true, gogai: true, sound: false, bg: 'pale', legend: true, shake: !REDUCED};
try { Object.assign(opt, JSON.parse(localStorage.getItem(PREF) || '{}'), {sound: false}); } catch (e) {}
const savePref = () => { try { localStorage.setItem(PREF, JSON.stringify(opt)); } catch (e) {} };

// ---------- 地図 ----------
const map = L.map('map', {preferCanvas: true, zoomControl: false, rotate: !!L.Map.prototype.setBearing, bearing: 0, rotateControl: false, touchRotate: false, shiftKeyRotate: false, compassBearing: false}).setView([35.52, 139.66], 10);
L.control.zoom({position: 'topright'}).addTo(map);
const pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>｜<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報</a>（国交省）を加工'
}).addTo(map);
let photo = null, photoId = '';
const R0 = L.canvas({padding: 0.3, tolerance: COARSE ? 12 : 6});  // 駅の点を押しやすく
const layer = L.layerGroup().addTo(map), fx = L.layerGroup().addTo(map), lbl = L.layerGroup().addTo(map);
map.createPane('cmpL'); map.createPane('cmpR');
map.getPane('cmpL').style.zIndex = 450; map.getPane('cmpR').style.zIndex = 450;
const RL = L.canvas({pane: 'cmpL'}), RR = L.canvas({pane: 'cmpR'});
const gL = L.layerGroup().addTo(map), gR = L.layerGroup().addTo(map);

var RIDING = false;  // 乗車中か
let LN = [], S = [], P = [], counts = {}, lineList = [], gen = 0, lastNew = 0, lastOrder = [], focus = null;
const curYear = () => +$('slider').value;

// ---------- データ ----------
async function load() {
  const r = await fetch('rails.json?v=9');
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
const trainIcon = (y, cat) => cat === 'shin' ? '🚄' : cat === 'tram' ? '🚋' : y < 1925 ? '🚂' : '🚃';

// ---------- 描きかた ----------
// ポップアップがパネルの下に隠れないように、パネルのある側に余白をとる
let PP = {};
function popPad() {
  const c = ['panel', 'menu', 'quiz', 'story', 'cmp', 'ride', 'me', 'haisen'].map($).find(e => getComputedStyle(e).display !== 'none');
  const tl = [20, 20], br = [20, 20];
  if (c) { const r = c.getBoundingClientRect(), H = innerHeight; if (r.top < H / 2) tl[1] = r.bottom + 10; else br[1] = H - r.top + 10; }
  PP = {autoPanPaddingTopLeft: tl, autoPanPaddingBottomRight: br};
  return PP;
}
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
    base: {color: col, weight: 2.2, opacity: ph ? .8 : .55},
    faint: {color: '#9a9a9a', weight: 1.5, opacity: .3},
    ghost: {color: ph ? '#eeeeee' : '#8d8d8d', weight: 1.6, opacity: ph ? .9 : .7, dashArray: '2 6'}
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
  if (!quiz.on && style !== 'faint') m.bindPopup(() => card(i), {maxWidth: 280, ...PP});
  return m;
}
function labels(y) {
  lbl.clearLayers();
  if (map.getZoom() < 14 || cmp.on || quiz.on) return;
  const b = map.getBounds(); let n = 0;
  for (const s of S) {
    if (!isOpen(s, y) || !stOn(s) || !onLineS(s) || !b.contains([s.lat, s.lon])) continue;
    if (++n > 250) break;
    L.marker([s.lat, s.lon], {icon: L.divIcon({className: 'lbl', html: `<span style="left:7px;top:-8px">${esc(s.n)}</span>`, iconSize: [0, 0]}), interactive: false}).addTo(lbl);
  }
}

function draw(y, animate) {
  if (cmp.on) return drawCompare();
  if (haisen.on) return drawHaisen();
  const g = ++gen;
  layer.clearLayers(); fx.clearLayers(); popPad();
  const z = map.getZoom(), newP = [], newSt = [];
  for (const p of P) {
    if (!opt.cats[p.cat]) continue;
    const fo = onLineP(p);
    if (present(p, y)) {
      if (isNewP(p, y) && fo) newP.push(p);
      else line(p, !fo ? 'faint' : (opt.emph && !(quiz.on && quiz.mode === 'line')) ? 'base' : 'full', layer, R0);
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
  $('era').textContent = era(y) + ageText(y);
  $('cnt').textContent = '駅数 ' + shown;
  $('news').textContent = order.length ? 'この年の開業：' + order.slice(0, 15).map(i => S[i].n).join('、') + (order.length > 15 ? ` ほか${order.length - 15}駅` : '') : '';
  background(y); spark(y);
  if (opt.gogai && !quiz.on && !ride.on && (EV[y] || y === opt.birth)) gogai(y, order.length);
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
let hl = false;  // 見どころ再生中
const delay = y => {
  if (hl && !EV[y] && y !== opt.birth) return lastNew >= 25 ? 1500 : 110;  // 見どころ再生：開業の多い年だけ少し止まり、静かな年は早送り
  return +$('speed').value * (EV[y] && opt.gogai ? 4 : 1) + Math.min(lastNew, 30) * baseStep() + 250;
};
const rangeFrom = () => (opt.range && opt.range.from) || Y0, rangeTo = () => (opt.range && opt.range.to) || Y1;
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
    if (trains < 6 && due >= freeAt && pathLen(pts) > 0.008) { icon = trainIcon(y, p.cat); trains++; freeAt = due + dur; }
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
  const night = !RIDING && opt.bg === 'night';
  document.body.classList.toggle('night', night);
  const t = clamp((1970 - y) / 90, 0, 1), c = pale.getContainer();
  if (c) c.style.filter = night ? 'invert(1) hue-rotate(180deg) brightness(.7) contrast(1.15) saturate(.45)' : `sepia(${t}) saturate(${1 - .3 * t}) brightness(${1 - .06 * t})`;
  let note = '';
  const wantPhoto = RIDING ? $('rScene').value === 'auto' : opt.bg === 'photo';
  const ph = wantPhoto ? PHOTOS.find(p => y >= p[0] && y <= p[1]) : null;
  if (ph) {
    if (photoId !== ph[2]) {
      if (photo) map.removeLayer(photo);
      photo = L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${ph[2]}/{z}/{x}/{y}.${ph[4]}`, {
        maxZoom: 18, maxNativeZoom: ph[2] === 'seamlessphoto' ? 18 : 17, minZoom: ph[2] === 'seamlessphoto' ? 0 : 10
      }).addTo(map);
      photoId = ph[2];
    }
    note = '空中写真：' + ph[3] + (map.getZoom() < 10 && ph[2] !== 'seamlessphoto' ? '（拡大すると表示）' : '');
  } else {
    if (photo) { map.removeLayer(photo); photo = null; photoId = ''; }
    if (wantPhoto) note = RIDING ? 'この時代の空中写真はないので、地図で走ります' : 'この時代の空中写真はありません';
  }
  if (quiz.on && quiz.mode === 'year' && quiz.phase === 'ask') note = '';
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
function gogai(y, nNew) {
  $('gEra').textContent = y + '年（' + era(y) + '）';
  const me = y === opt.birth ? `🎂 あなたが生まれた年！この年に開業した駅：${nNew || 0}駅` : '';
  $('gText').textContent = [me, EV[y] || ''].filter(Boolean).join('　／　');
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
  if (opt.birth >= Y0 && opt.birth <= Y1) { c.beginPath(); c.arc(X(opt.birth), H - 3, 2.5, 0, 7); c.fillStyle = '#ef6c00'; c.fill(); }
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
  ${s.ls.slice(0, 3).map(([l]) => `<button data-act="story" data-line="${l}">📖 ${esc(LN[l])}</button>`).join('')}
  ${s.ls.length ? `<button data-act="ride" data-line="${s.ls[0][0]}">🚂 ${esc(LN[s.ls[0][0]])}に乗る</button>` : ''}</div></div>`;
}
map.on('popupopen', e => {
  e.popup.getElement().querySelectorAll('button[data-act]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.act === 'jumpy') jump(+b.dataset.y);
      else if (b.dataset.act === 'year') goStation(+b.dataset.id, false);
      else if (b.dataset.act === 'ride') { map.closePopup(); if (cmp.on) cmpEnd(); quiz.on = false; rideOpen(+b.dataset.line); }
      else { map.closePopup(); if (cmp.on) cmpEnd(); if (quiz.on) qQuit(); storyStart(+b.dataset.line); }
    };
  });
});
function goStation(i, fly) {
  const s = S[i];
  stop(); $('slider').value = s.o; draw(s.o, false);
  if (fly) map.flyTo(ll(i), 13, {duration: 1.2});
  setTimeout(() => L.popup({maxWidth: 280, ...popPad()}).setLatLng(ll(i)).setContent(card(i)).openOn(map), fly ? 1300 : 50);
}

// ---------- 再生 ----------
let timer = null, playing = false;
function stop() { const was = playing; playing = false; hl = false; clearTimeout(timer); $('play').textContent = '▶'; if (was && typeof autoFold === 'function') autoFold(false); }
function tick() {
  const y = curYear() + 1;
  if (y > rangeTo()) return stop();
  $('slider').value = y; draw(y, true);
  timer = setTimeout(tick, delay(y));
}
$('play').onclick = () => {
  if (playing) return stop();
  playing = true; $('play').textContent = '❚❚'; autoFold(true);
  const f = rangeFrom();
  if (curYear() >= rangeTo() || curYear() < f - 1) { $('slider').value = f; draw(f, true); timer = setTimeout(tick, delay(f)); }
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
$('menuBtn').onclick = () => { if (getComputedStyle($('menu')).display !== 'none') return showCard('panel'); stop(); showCard('menu'); placeCards(); };
$('menuClose').onclick = () => showCard('panel');
$('hlBtn').onclick = () => { showCard('panel'); stop(); $('slider').value = rangeTo(); hl = true; $('play').onclick(); toast('⭐ 見どころ再生：大きな出来事や開業の多い年はじっくり、静かな年は早送りで進みます', 4000); };
$('pFrom').value = rangeFrom(); $('pTo').value = rangeTo(); $('pFrom').max = $('pTo').max = Y1;
$('pFrom').onchange = $('pTo').onchange = () => {
  let f = clamp(+$('pFrom').value || Y0, Y0, Y1), t = clamp(+$('pTo').value || Y1, Y0, Y1);
  if (f > t) [f, t] = [t, f];
  $('pFrom').value = f; $('pTo').value = t; opt.range = {from: f, to: t}; savePref();
};
$('chips').innerHTML = Object.entries(CATS).map(([k, c]) => `<label><input type="checkbox" data-cat="${k}"${opt.cats[k] ? ' checked' : ''}><span class="sw" style="background:${c.color}"></span>${c.name}</label>`).join('');
$('chips').onchange = e => { const k = e.target.dataset.cat; if (!k) return; opt.cats[k] = e.target.checked ? 1 : 0; savePref(); legend(); redraw(); };
// 凡例（いつも左上に小さく表示。タップで小さく／大きく）
function legend() {
  const el = $('legend');
  el.style.display = opt.legend && !RIDING ? 'block' : 'none';
  el.classList.toggle('min', !!opt.legendMin);
  el.innerHTML = Object.entries(CATS).map(([k, c]) => `<div class="lg${opt.cats[k] ? '' : ' off'}"><span class="sw" style="background:${c.color}"></span>${c.name}</div>`).join('')
    + `<div class="lg"><span class="sw" style="background:repeating-linear-gradient(90deg,#8d8d8d 0 3px,transparent 3px 7px)"></span>廃線</div>`
    + `<div class="lg"><span class="sw" style="background:#ffd54f;height:6px"></span>その年の開業</div>`;
}
if (opt.legendMin === undefined) opt.legendMin = innerWidth < 500;  // スマホでは最初は小さく
$('legend').onclick = () => { opt.legendMin = !opt.legendMin; savePref(); legend(); };
legend();
for (const k of ['emph', 'ghost', 'follow', 'gogai', 'sound', 'legend', 'shake']) {
  const el = $('o_' + k); el.checked = !!opt[k];
  el.onchange = () => {
    opt[k] = el.checked; savePref();
    if (k === 'sound' && el.checked && !audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (k === 'gogai' && !el.checked) $('gogai').classList.remove('show');
    if (k === 'emph' || k === 'ghost') redraw();
    if (k === 'legend') legend();
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
function showCard(name) { if (name !== 'haisen' && typeof haisen !== 'undefined') haisen.on = false; for (const c of ['panel', 'menu', 'quiz', 'story', 'cmp', 'ride', 'me', 'haisen']) $(c).style.display = c === name ? 'block' : 'none'; }

// ---------- クイズ（3種類） ----------
const quiz = {on: false, n: 0, score: 0, t: null, ring: null, phase: '', mode: '', ans: null};
const TOTAL = 5;
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function qShowYear() { const v = +$('qSlider').value; $('qYear').textContent = v; $('qEra').textContent = era(v); }
$('qSlider').max = Y1; $('qSlider').oninput = qShowYear;
function qMenu() {
  if (!S.length) return;
  stop(); map.closePopup(); storyAuto(false); focus = null;
  quiz.on = false; if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
  showCard('quiz'); $('qMenu').style.display = 'block'; $('qMain').style.display = 'none';
}
function qBegin(mode) {
  Object.assign(quiz, {on: true, n: 0, score: 0, mode});
  $('qMenu').style.display = 'none'; $('qMain').style.display = 'block';
  qNext();
}
function qLineFirst(li) {
  let y = 9999;
  for (const p of P) if (p.l === li && p.s < y) y = p.s;
  for (const s of S) for (const [l, o] of s.ls) if (l === li && o < y) y = o;
  return y;
}
function qNext() {
  if (quiz.n >= TOTAL) return qEnd();
  quiz.n++; quiz.phase = 'ask';
  if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
  $('qScore').textContent = quiz.score + '点';
  $('qRes').innerHTML = ''; $('qNext').style.display = 'none'; $('qChoices').innerHTML = '';
  $('qAsk').style.display = quiz.mode === 'line' ? 'none' : 'block';
  $('qSlider').value = 1930; qShowYear();
  const head = `第${quiz.n}問／全${TOTAL}問　`;
  if (quiz.mode === 'station') {
    focus = null;
    const pool = S.filter(s => s.c == null && stOn(s) && !/（/.test(s.n));
    const s = pool[rnd(pool.length)];
    quiz.t = s.i;
    $('slider').value = Y1; draw(Y1, false);
    $('qHead').textContent = head + 'この駅、何年生まれ？';
    $('qName').textContent = s.n; $('qLine').textContent = s.ls.map(([l]) => LN[l]).join('・');
    quiz.ring = L.marker(ll(s.i), {icon: L.divIcon({className: '', html: '<div class="pulse"></div>', iconSize: [30, 30]}), interactive: false}).addTo(map);
    map.flyTo(ll(s.i), 12, {duration: 1});
  } else if (quiz.mode === 'year') {
    focus = null;
    const y = 1880 + rnd(Y1 - 1880);
    quiz.ans = y;
    $('slider').value = y; draw(y, false);
    map.flyTo([35.52, 139.66], 10, {duration: 1});
    $('qHead').textContent = head + 'この路線図は何年？';
    $('qName').textContent = '🗾 何年の路線図でしょう？';
    $('qLine').textContent = '線路の広がり具合や地図の色合いから当ててください';
  } else {
    const now = new Set(P.filter(p => present(p, Y1)).map(p => p.l));
    const pool = lineList.filter(l => now.has(l) && S.filter(s => isOpen(s, Y1) && s.ls.some(t => t[0] === l)).length >= 5);
    const li = pool[rnd(pool.length)];
    quiz.ans = li;
    const cat = (P.find(p => p.l === li) || {}).cat;
    const same = shuffle(pool.filter(l => l !== li && (P.find(p => p.l === l) || {}).cat === cat));
    const other = shuffle(pool.filter(l => l !== li && !same.includes(l)));
    const choices = shuffle([li, ...same.concat(other).slice(0, 3)]);
    focus = li;
    $('slider').value = Y1; draw(Y1, false);
    const pts = P.filter(p => p.l === li).flatMap(p => [p.pts[0], p.pts[p.pts.length - 1]]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.25), {duration: 1});
    $('qHead').textContent = head + '光っている路線はどれ？';
    $('qName').textContent = '🛤 この路線の名前は？';
    $('qLine').textContent = '色の付いた線と白い駅が、その路線です';
    $('qChoices').innerHTML = choices.map(l => `<button class="qc" data-l="${l}">${esc(LN[l])}</button>`).join('');
    $('qChoices').querySelectorAll('button').forEach(b => { b.onclick = () => qAnswer(+b.dataset.l); });
  }
}
function qAnswer(choice) {
  if (quiz.phase !== 'ask') return;
  quiz.phase = 'res';
  let p = 0, html = '';
  if (quiz.mode === 'station') {
    const s = S[quiz.t], g = +$('qSlider').value, d = Math.abs(g - s.o); p = Math.max(0, 100 - d * 4);
    const word = d === 0 ? '🎯 ぴったり！' : d <= 3 ? '惜しい！' : d <= 10 ? 'いい線！' : 'これは難問…';
    html = `${word} 正解は <b>${s.o}年（${era(s.o)}）</b>。差は${d}年で <b>${p}点</b>`;
    $('slider').value = s.o; draw(s.o, true);
  } else if (quiz.mode === 'year') {
    const y = quiz.ans, g = +$('qSlider').value, d = Math.abs(g - y); p = Math.max(0, 100 - d * 3);
    const word = d === 0 ? '🎯 ぴったり！' : d <= 3 ? '惜しい！' : d <= 10 ? 'いい線！' : 'これは難問…';
    html = `${word} 正解は <b>${y}年（${era(y)}）</b>。差は${d}年で <b>${p}点</b>` + (EV[y] ? `<br><span style="color:#6b5a44">この年：${esc(EV[y])}</span>` : '');
    background(y);
  } else {
    const li = quiz.ans, ok = choice === li; p = ok ? 100 : 0;
    $('qChoices').querySelectorAll('button').forEach(b => { const l = +b.dataset.l; b.disabled = true; if (l === li) b.classList.add('ok'); else if (l === choice) b.classList.add('ng'); });
    html = `${ok ? '⭕ 正解！' : '❌ 残念…'} 正解は <b>${esc(LN[li])}</b>（${qLineFirst(li)}年に開業）。<b>${p}点</b>`;
  }
  quiz.score += p;
  $('qRes').innerHTML = html;
  $('qScore').textContent = quiz.score + '点';
  $('qAsk').style.display = 'none';
  $('qNext').textContent = quiz.n >= TOTAL ? '結果を見る' : '次へ'; $('qNext').style.display = 'inline-block';
  beep(p >= 88 ? [784, 988] : [392], .3, .1);
}
function qEnd() {
  quiz.phase = 'end';
  const sc = quiz.score, title = sc >= 400 ? '🏅 名誉駅長' : sc >= 300 ? '🚉 駅長' : sc >= 200 ? '🎫 助役' : '🔰 見習い';
  $('qHead').textContent = 'クイズ終了'; $('qName').textContent = `${sc}点／${TOTAL * 100}点`; $('qLine').textContent = '';
  $('qChoices').innerHTML = ''; $('qAsk').style.display = 'none';
  $('qRes').innerHTML = `あなたの称号は <b>${title}</b>`;
  $('qNext').textContent = 'ほかのクイズへ';
  if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
}
function qQuit() {
  quiz.on = false; focus = null; if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
  showCard('panel'); draw(curYear(), false);
}
$('quizBtn').onclick = qMenu;
document.querySelectorAll('#qMenu [data-mode]').forEach(b => { b.onclick = () => qBegin(b.dataset.mode); });
$('qMenuQuit').onclick = qQuit;
$('qGo').onclick = () => qAnswer();
$('qNext').onclick = () => quiz.phase === 'end' ? qMenu() : qNext();
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
  stop(); map.closePopup(); quiz.on = false; if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; } focus = li; story.ids = ids;
  const ys = new Set();
  for (const i of ids) { for (const [l, o] of S[i].ls) if (l === li) ys.add(o); if (S[i].c) ys.add(S[i].c); }
  for (const p of ps) { if (p.o) ys.add(p.s); if (p.g && p.e) ys.add(p.e + 1); }
  story.steps = [...ys].filter(y => y >= Y0 && y <= Y1).sort((a, b) => a - b);
  showCard('story'); $('sPick').style.display = 'none'; $('sMain').style.display = 'block';
  $('sTitle').textContent = '📖 ' + LN[li];
  const pts = ps.flatMap(p => [p.pts[0], p.pts[p.pts.length - 1]]).concat(ids.map(ll));
  if (pts.length) fitVisible(L.latLngBounds(pts).pad(0.05), false);
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

// ---------- 版の表示とお知らせ ----------
const APP_VER = 9;
const HISTORY = [
  [9, ['🎥 乗ってみるに「3D（前面展望）」：列車の少し上から前を見る立体の眺め。地形の起伏つき、地面はその時代の空中写真か地図、駅名標が立つ', '3Dでは実際の速さの8倍で走る（×0.5〜×4で調整）。カメラの「高さ」も選べる']],
  [8.1, ['不具合の修正：1945〜1969年の空中写真が表示されなかったのを直しました']],
  [8, ['🚂 乗ってみるに「眺め」：前を見る（進む方向が上）・横の窓・北が上を選べる', '乗車中は、その時代の空中写真の上を走る（1945年より前はセピア色の地図）', '👻 廃線探検：廃止された区間を光らせ、一覧から選ぶと場所と年代、最後の年に乗ることも', '🌙 夜の地図：背景を暗くして線路が光って見える']],
  [7, ['パネルを1段にまとめ、道具は「≡ メニュー」へ。ボタンを大きく、駅の点も押しやすく', '色の凡例をいつも表示。廃線は灰色の点線に', '⭐ 見どころ再生（静かな年は早送り）と、再生する期間の指定', '🚂 乗ってみるが本格的に：切符と改札、発車の音（汽笛・発車ベル・発車メロディ）、ガタンゴトン、加速と減速、揺れ、速度計と時計、車内の文字案内', '🔗 この画面を共有（年・場所・路線をリンクで送れる）', '初めての人向けの使い方案内、パソコンのキー操作（スペース：再生、←→：1年、Shift＋←→：10年、M：メニュー）']],
  [6, ['🚂「乗ってみる」：その時代の列車に乗って、駅名標を見ながら路線を走る（当時の所要時間の目安つき）', '🎂「わたしの年表」：生まれた年を入れると、同い年の駅や、年ごとの自分の年齢が地図に出る']],
  [5, ['何版かを表示し、版が変わったらお知らせ', 'パネルを好きな場所へ動かせる・たためる（再生中だけ小さくもできる）', '📍「この辺りの鉄道史」：地図の場所を選ぶ（長押し・右クリックでも）と、その辺りに鉄道が来た年と駅の年表', 'クイズが3種類に：「この路線図は何年？」「光っている路線はどれ？」を追加']],
  [4, ['線路を実際の形に（国土数値情報）', '駅が線路をたどって順に出る', '読み込みが止まる不具合を修正']],
  [3, ['GitHubで公開', '色分けと絞り込み、路線ものがたり、2つの年を比べる、時代の空中写真、廃線の幽霊、駅カード']],
  [2, ['汽車が走る、号外、駅さがし、駅の年齢クイズ']],
  [1, ['最初の版（駅と、駅どうしを結ぶ直線）']]
];
document.querySelectorAll('.verTag').forEach(e => { e.textContent = `第${APP_VER}版`; });
let toastTimer = null;
function toast(html, ms) {
  $('toastBody').innerHTML = html; $('toast').style.display = 'block';
  clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => { $('toast').style.display = 'none'; }, ms);
}
$('toastX').onclick = () => { $('toast').style.display = 'none'; };
const histHtml = list => list.map(([v, items]) => `<div><b>第${v}版</b><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('');
$('aboutBtn').onclick = () => toast(`<b>鉄道のひろがり　いまは第${APP_VER}版</b>` + histHtml(HISTORY));
async function versionNotice() {
  let seen = 0, used = false;
  try { seen = +localStorage.getItem('eki_ver') || 0; used = !!localStorage.getItem(PREF); localStorage.setItem('eki_ver', APP_VER); } catch (e) {}
  if (!seen) {
    // 版の記録を始める前（第4版まで）から使っている場合
    let old = used || HAD_SW;
    try { if (!old && window.caches) old = (await caches.keys()).some(k => k.startsWith('eki') && k !== 'eki-v' + APP_VER); } catch (e) {}
    if (old) seen = 4;
  }
  if (seen && seen < APP_VER) toast(`<b>🆕 第${APP_VER}版になりました</b>` + histHtml(HISTORY.filter(([v]) => v > seen)));
  else if (!seen) guide(0);
}

// ---------- パネルを動かす・たたむ ----------
opt.fold = opt.fold || {};
function placeCards() {
  const W = innerWidth, H = innerHeight;
  document.querySelectorAll('.card').forEach(c => {
    if (opt.pos) {
      c.classList.add('moved');
      const w = c.offsetWidth || Math.min(640, W - 24);
      c.style.left = clamp(opt.pos.x, 4, Math.max(4, W - w - 4)) + 'px';
      c.style.top = clamp(opt.pos.y, 4, Math.max(4, H - 48)) + 'px';
    } else { c.classList.remove('moved'); c.style.left = c.style.top = ''; }
  });
}
function setFold(id, on, save) {
  $(id).classList.toggle('folded', on);
  $(id).querySelector('.fold').textContent = on ? '▴' : '▾';
  if (save) { opt.fold[id] = on; savePref(); }
}
document.querySelectorAll('.grip').forEach(g => {
  const id = g.dataset.card, card = $(id);
  setFold(id, !!opt.fold[id], false);
  g.querySelector('.fold').onclick = e => { e.stopPropagation(); setFold(id, !card.classList.contains('folded'), true); };
  let st = null;
  g.addEventListener('pointerdown', e => {
    if (e.target.closest('.fold')) return;
    st = {x: e.clientX, y: e.clientY, l: card.getBoundingClientRect().left, t: card.getBoundingClientRect().top};
    g.setPointerCapture(e.pointerId); e.preventDefault();
  });
  g.addEventListener('pointermove', e => {
    if (!st) return;
    opt.pos = {x: st.l + e.clientX - st.x, y: st.t + e.clientY - st.y};
    placeCards();
  });
  g.addEventListener('pointerup', () => { if (st) { st = null; savePref(); } });
  g.addEventListener('dblclick', () => { opt.pos = null; savePref(); placeCards(); });
});
$('posReset').onclick = () => { opt.pos = null; savePref(); placeCards(); };
addEventListener('resize', placeCards);
$('o_autofold').checked = !!opt.autofold;
$('o_autofold').onchange = () => { opt.autofold = $('o_autofold').checked; savePref(); };
function autoFold(playingNow) {
  if (!opt.autofold) return;
  setFold('panel', playingNow ? true : !!opt.fold.panel, false);
  if (!playingNow) placeCards();
}

// ---------- この辺りの鉄道史 ----------
const placeLayer = L.layerGroup().addTo(map);
let placeMode = false;
const km = (a, b, c, d) => Math.hypot((d - b) * Math.cos(a * Math.PI / 180) * 111.32, (c - a) * 110.57);
function setPlaceMode(on) {
  placeMode = on; $('placeBtn').classList.toggle('on', on);
  map.getContainer().style.cursor = on ? 'crosshair' : '';
  if (on) toast('📍 調べたい場所を地図でタップしてください（いつでも、長押し・右クリックでも調べられます）', 5000);
}
$('placeBtn').onclick = () => { showCard('panel'); setPlaceMode(true); };
map.on('click', e => { if (placeMode) { setPlaceMode(false); $('toast').style.display = 'none'; placeInfo(e.latlng); } });
map.on('contextmenu', e => { if (!cmp.on && !quiz.on) placeInfo(e.latlng); });
function placeInfo(at) {
  const R = 2;
  const near = S.map(s => [s, km(at.lat, at.lng, s.lat, s.lon)]).filter(([, d]) => d <= R);
  let first = null;
  for (const p of P) {
    if (first && p.s >= first.s) continue;
    for (const q of p.pts) if (km(at.lat, at.lng, q[0], q[1]) < R) { first = p; break; }
  }
  const nearest = near.slice().sort((a, b) => a[1] - b[1])[0];
  const tl = near.slice().sort((a, b) => a[0].o - b[0].o || a[1] - b[1]);
  let html = `<div class="cardS"><div class="cn">📍 この辺りの鉄道史</div><div class="cl">選んだ場所から半径2km</div>`;
  if (first) html += `<div>最初に線路が通った年：<b>${first.s}年</b>（${era(first.s)}・${esc(LN[first.l])}）</div>`;
  else html += `<div>半径2km以内には、線路が通ったことがありません</div>`;
  if (nearest) html += `<div>いちばん近い駅：${esc(nearest[0].n)}（${nearest[1].toFixed(1)}km、${nearest[0].o}年開業）</div>`;
  if (tl.length) {
    html += `<div style="margin-top:4px;font-weight:700">駅の年表（${tl.length}駅）</div>`;
    html += tl.slice(0, 14).map(([s]) => `<div class="tl"><button data-act="jumpy" data-y="${s.o}">${s.o}</button><span>${esc(s.n)}<span style="color:#6b5a44">（${esc(s.ls.map(([l]) => LN[l]).slice(0, 2).join('・'))}）${s.c ? '　' + s.c + '年に廃止' : ''}</span></span></div>`).join('');
    if (tl.length > 14) html += `<div class="tl" style="color:#6b5a44">ほか${tl.length - 14}駅</div>`;
  } else html += `<div>半径2km以内に駅はありません</div>`;
  html += '</div>';
  L.popup({maxWidth: 300, maxHeight: 340, ...popPad()}).setLatLng(at).setContent(html).openOn(map);
  placeLayer.clearLayers();
  L.circle(at, {radius: R * 1000, color: '#1f4e79', weight: 1.5, dashArray: '5 5', fillOpacity: .05, interactive: false}).addTo(placeLayer);
}
map.on('popupclose', () => placeLayer.clearLayers());

// ---------- 🚂 乗ってみる ----------
const rideLayer = L.layerGroup().addTo(map);
const ride = {on: false, li: null, y: 0, R: null, pos: 0, next: 0, dwell: 0, speed: 1, paused: false, rev: false, mk: null, trail: null, ti: 0, last: 0};
const KM_PER_SEC = 1.6;  // 画面上の速さ（×1・最高速のとき1秒で1.6km）
// 当時の速さの目安（km/h、停車時間込みのおおよそ）
// 当時の最高速度の目安（km/h）
const eraTop = (y, cat) => cat === 'shin' ? (y < 1985 ? 210 : y < 1997 ? 240 : 275) : cat === 'tram' ? 30 : cat === 'sub' ? (y < 1960 ? 55 : 75) : y < 1900 ? 38 : y < 1925 ? 55 : y < 1960 ? 70 : y < 1990 ? 95 : 110;
function plen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += km(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); return d; }
function buildRoute(li, y, rev) {
  const ps = P.filter(p => p.l === li && present(p, y));
  if (!ps.length) return null;
  const key = (p, end) => { const st = end ? p.b : p.a; if (st >= 0) return 's' + st; const q = end ? p.pts[p.pts.length - 1] : p.pts[0]; return q[0].toFixed(3) + ',' + q[1].toFixed(3); };
  const adj = new Map();
  const add = (u, v, p, len) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push([v, p, len]); };
  for (const p of ps) { p._u = key(p, 0); p._v = key(p, 1); const len = plen(p.pts); add(p._u, p._v, p, len); add(p._v, p._u, p, len); }
  const dij = src => {
    const dist = new Map([[src, 0]]), prev = new Map(), done = new Set(), pq = [[0, src]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]); const [d, u] = pq.shift();
      if (done.has(u)) continue; done.add(u);
      for (const [v, p, len] of adj.get(u) || []) { const nd = d + len; if (!dist.has(v) || nd < dist.get(v)) { dist.set(v, nd); prev.set(v, [u, p]); pq.push([nd, v]); } }
    }
    return {dist, prev};
  };
  const far = r => [...r.dist.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // いちばん長い道のりを探す（端から端まで）
  let r = dij(adj.keys().next().value); const A = far(r); r = dij(A); const Bn = far(r);
  const seq = []; let cur = Bn;
  while (cur !== A) { const [u, p] = r.prev.get(cur); seq.push([p, u]); cur = u; }
  seq.reverse();
  const pts = [], nodes = [];
  for (const [p, u] of seq) {
    let q = p._u === u ? p.pts : p.pts.slice().reverse();
    nodes.push([u, pts.length]);
    pts.push(...(pts.length ? q.slice(1) : q));
  }
  nodes.push([Bn, pts.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + km(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  let stops = nodes.filter(([n]) => n[0] === 's' && isOpen(S[+n.slice(1)], y)).map(([n, i]) => ({i: +n.slice(1), km: cum[i]}));
  stops = stops.filter((s, k) => k === 0 || s.i !== stops[k - 1].i);
  // 東京駅に近い端から出発する（逆向きも選べる）
  const T = [35.681, 139.767], dA = km(pts[0][0], pts[0][1], ...T), dB = km(pts[pts.length - 1][0], pts[pts.length - 1][1], ...T);
  let R = {pts, cum, stops, total: cum[cum.length - 1], cat: ps[0].cat};
  if ((dA > dB) !== !!rev) {
    const tot = R.total;
    R = {pts: pts.slice().reverse(), cum: cum.map(c => tot - c).reverse(), stops: stops.map(s => ({i: s.i, km: tot - s.km})).reverse(), total: tot, cat: R.cat};
  }
  return R;
}
function pointAt(R, d) {
  let lo = 0, hi = R.cum.length - 1;
  while (lo < hi - 1) { const m = (lo + hi) >> 1; if (R.cum[m] <= d) lo = m; else hi = m; }
  const seg = (R.cum[hi] - R.cum[lo]) || 1e-9, k = clamp((d - R.cum[lo]) / seg, 0, 1);
  return [[R.pts[lo][0] + (R.pts[hi][0] - R.pts[lo][0]) * k, R.pts[lo][1] + (R.pts[hi][1] - R.pts[lo][1]) * k], lo];
}
function rideOpen(li) {
  stop(); storyAuto(false); map.closePopup(); quiz.on = false; if (quiz.ring) { map.removeLayer(quiz.ring); quiz.ring = null; }
  showCard('ride'); $('rPick').style.display = 'block'; $('rMain').style.display = 'none';
  $('rYear').value = curYear(); if (li != null) $('rLine').value = LN[li];
}
$('rideBtn').onclick = () => rideOpen(null);
$('rCancel').onclick = () => { showCard('panel'); };
$('rGo').onclick = () => {
  const q = $('rLine').value.trim(); if (!q) return;
  const li = LN.indexOf(q) >= 0 ? LN.indexOf(q) : lineList.find(k => LN[k].includes(q));
  if (li == null || li < 0) { $('rLine').value = ''; $('rLine').placeholder = '見つかりませんでした'; return; }
  let y = clamp(+$('rYear').value || curYear(), Y0, Y1);
  if (!P.some(p => p.l === li && present(p, y))) {
    const ys = P.filter(p => p.l === li).map(p => p.s).filter(s => s >= y).sort((a, b) => a - b);
    const y2 = ys[0] || P.filter(p => p.l === li).map(p => p.s).sort((a, b) => a - b)[0];
    toast(`${esc(LN[li])}は${y}年にはまだありません。${y2}年に乗ります`, 4000); y = y2;
  }
  showTicket(li, y, false);
};
$('rLine').onkeydown = e => { if (e.key === 'Enter') $('rGo').onclick(); };
// 切符と改札
let tk = null;
const stName = s => s.n.replace(/駅(（.*）)?$/, '$1');
function showTicket(li, y, rev) {
  const R = buildRoute(li, y, rev);
  if (!R || R.total < 0.3 || R.stops.length < 2) { toast('この路線は短すぎて乗れませんでした', 3000); return; }
  tk = {li, y, rev, R};
  $('tkFrom').textContent = stName(S[R.stops[0].i]);
  $('tkTo').textContent = stName(S[R.stops[R.stops.length - 1].i]);
  $('tkLine').textContent = `${LN[li]}　${R.total.toFixed(1)}km・${R.stops.length}駅`;
  $('tkDate').textContent = `${era(y)}（${y}年）　当日限り有効`;
  const first1872 = y === 1872 && /東海道線/.test(LN[li]);
  $('tkFare').textContent = first1872 ? '下等 37銭5厘（上等 1円12銭5厘・中等 75銭）' : '　';
  $('tkNo').textContent = 'No.' + String(1 + rnd(9999)).padStart(4, '0');
  $('tkPunch').classList.remove('done');
  $('ticket').classList.add('show');
}
$('tkCancel').onclick = () => { $('ticket').classList.remove('show'); };
$('tkGo').onclick = () => {
  if ($('rSound').checked) ac();
  if (rsOn()) punch();
  $('tkPunch').classList.add('done');
  setTimeout(() => { $('ticket').classList.remove('show'); rideStart(tk.li, tk.y, tk.rev, tk.R); }, 550);
};

// 乗車中の音（すべてその場で合成）
function ac() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audio && audio.state === 'suspended') audio.resume();
  return audio;
}
const rsOn = () => $('rSound').checked && audio;
let brown = null;
function brownNoise() {
  if (brown) return brown;
  const n = audio.sampleRate * 2; brown = audio.createBuffer(1, n, audio.sampleRate);
  const d = brown.getChannelData(0); let last = 0;
  for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  return brown;
}
function env(g, t, peak, a1, hold, rel) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a1); g.gain.setValueAtTime(peak, t + a1 + hold); g.gain.linearRampToValueAtTime(0, t + a1 + hold + rel); }
function thump(t, vol) {
  const s = audio.createBufferSource(); s.buffer = brownNoise();
  const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
  const g = audio.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
  s.connect(f).connect(g).connect(audio.destination); s.start(t, Math.random()); s.stop(t + 0.12);
  const o = audio.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
  const og = audio.createGain(); og.gain.setValueAtTime(vol * .5, t); og.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
  o.connect(og).connect(audio.destination); o.start(t); o.stop(t + 0.1);
}
function punch() { const t = audio.currentTime; thump(t, .5); }
// レールの継ぎ目：ガタン（前の台車）ゴトン（次の車両の台車）
function joint(v) {
  if (!rsOn() || ride.R.cat === 'shin') return;
  const t = audio.currentTime + 0.01, ms = Math.max(1, v / 3.6);
  const ax = clamp(2.1 / ms, 0.05, 0.22), bg = clamp(5.5 / ms, 0.14, 0.6), vol = ride.R.cat === 'tram' ? .18 : .3;
  thump(t, vol); thump(t + ax, vol * .8); thump(t + bg, vol * .9); thump(t + bg + ax, vol * .7);
  ride.bump = 1;
}
function whistle(t, len) {  // 汽笛
  const g = audio.createGain(); env(g, t, .07, .08, len, .35);
  const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.1;
  f.connect(g).connect(audio.destination);
  for (const fr of [466, 587, 698]) { const o = audio.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fr * .95, t); o.frequency.linearRampToValueAtTime(fr, t + .15); o.connect(f); o.start(t); o.stop(t + len + .5); }
}
function bell(t, len) {  // 発車ベル
  const o = audio.createOscillator(); o.type = 'square'; o.frequency.value = 1250;
  const am = audio.createGain(); am.gain.value = .5;
  const lfo = audio.createOscillator(); lfo.frequency.value = 22; const lg = audio.createGain(); lg.gain.value = .5; lfo.connect(lg).connect(am.gain);
  const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2800;
  const g = audio.createGain(); env(g, t, .03, .02, len, .15);
  o.connect(am).connect(f).connect(g).connect(audio.destination); o.start(t); lfo.start(t); o.stop(t + len + .3); lfo.stop(t + len + .3);
}
function melody(t, notes) {  // 発車メロディ風（このアプリのための短い旋律）
  notes.forEach((fr, k) => {
    const tt = t + k * .17, o = audio.createOscillator(), o2 = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = fr; o2.type = 'sine'; o2.frequency.value = fr * 2;
    const g2 = audio.createGain(); g2.gain.value = .25;
    g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.06, tt + .02); g.gain.exponentialRampToValueAtTime(.001, tt + .5);
    o.connect(g); o2.connect(g2).connect(g); g.connect(audio.destination); o.start(tt); o2.start(tt); o.stop(tt + .55); o2.stop(tt + .55);
  });
}
function departSound(first) {
  if (!rsOn()) return;
  const t = audio.currentTime + .05, y = ride.y, c = ride.R.cat;
  if (c === 'tram') return bell(t, .25);
  if (c === 'shin') return melody(t, first ? [880, 1109, 1319, 1760] : [1109, 1319]);
  if (y < 1925) return whistle(t, first ? 1.1 : .6);
  if (y < 1989) return bell(t, first ? 2.2 : 1.2);
  return melody(t, first ? [659, 784, 988, 1319, 1175, 988, 1175] : [784, 988, 1319, 1175]);
}
function arriveChime() {
  if (!rsOn()) return;
  const t = audio.currentTime;
  [[988, 0], [784, .35]].forEach(([fr, d]) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = fr; g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.05, t + d + .02); g.gain.exponentialRampToValueAtTime(.001, t + d + .9); o.connect(g).connect(audio.destination); o.start(t + d); o.stop(t + d + 1); });
}
function squeal() {  // ブレーキのきしみ
  if (!rsOn() || ride.R.cat === 'shin') return;
  const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.frequency.setValueAtTime(2700, t); o.frequency.linearRampToValueAtTime(2150, t + 1.1);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.008, t + .2); g.gain.linearRampToValueAtTime(0, t + 1.2);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 1.25);
}
function rumbleStart() {
  if (!rsOn()) return;
  const s = audio.createBufferSource(); s.buffer = brownNoise(); s.loop = true;
  const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = ride.R.cat === 'shin' ? 400 : 180;
  const g = audio.createGain(); g.gain.value = 0;
  s.connect(f).connect(g).connect(audio.destination); s.start();
  ride.rumble = {s, g};
}
function rumbleStop() { if (ride.rumble) { try { ride.rumble.s.stop(); } catch (e) {} ride.rumble = null; } }

// 車内の文字案内
function led(text) {
  if (ride.ledText === text) return;
  ride.ledText = text;
  const el = $('ledText'); el.textContent = text; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
const clockStr = m => { const t = 9 * 60 + Math.round(m); return `${Math.floor(t / 60) % 24}:${String(t % 60).padStart(2, '0')}`; };

function rideStart(li, y, rev, R0route) {
  rideStop();
  const R = R0route || buildRoute(li, y, rev);
  if (!R || R.total < 0.3 || R.stops.length < 2) { toast('この路線は短すぎて乗れませんでした', 3000); return; }
  Object.assign(ride, {on: true, li, y, R, pos: 0, next: 0, dwell: 2.4, paused: false, rev, ti: 0, sim: 0, lastStop: 0, jointT: 0, bump: 0, squealed: false, ledText: '', top: eraTop(y, R.cat), departing: true});
  haisen.on = false; RIDING = true; focus = li; $('slider').value = y; draw(y, false); legend();
  showCard('ride'); $('rPick').style.display = 'none'; $('rMain').style.display = 'block';
  $('rTitle').textContent = '';
  $('ride').querySelector('.gl').textContent = `⠿ 🚂 ${LN[li]}（${y}年・${era(y)}）`;
  $('rPause').textContent = '❚❚';
  ride.trail = L.polyline([R.pts[0]], {renderer: R0, interactive: false, color: '#ff8f00', weight: 6, opacity: .8}).addTo(rideLayer);
  ride.mk = L.marker(R.pts[0], {icon: L.divIcon({className: 'train', html: trainIcon(y, R.cat), iconSize: [22, 22]}), interactive: false, zIndexOffset: 1000}).addTo(rideLayer);
  map.setView(R.pts[0], 14, {animate: false});
  ride.dest = stName(S[R.stops[R.stops.length - 1].i]);
  ride.bear = targetBearing(R, 0); if (map.setBearing) map.setBearing($('rView').value === 'north' ? 0 : ride.bear);
  if (R.stops[0].km < 0.05) { board(0); ride.next = 1; }
  led(`この列車は ${ride.dest}ゆきです　まもなく発車します`);
  rumbleStart(); departSound(true);
  ride.last = performance.now();
  $('rCamWrap').style.display = $('rView').value === '3d' ? '' : 'none';
  if ($('rView').value === '3d') enter3D(); else if (ride.is3d) exit3D();
  requestAnimationFrame(rideStep);
}
function rideStop() {
  ride.on = false; rumbleStop(); if (ride.is3d) exit3D();
  if (ride.mk) rideLayer.removeLayer(ride.mk); if (ride.trail) rideLayer.removeLayer(ride.trail);
  ride.mk = ride.trail = null;
  $('map').style.transform = '';
  if (map.setBearing) map.setBearing(0);
  const was = RIDING; RIDING = false; legend(); if (was) background(curYear());
}
const hm = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`; };
function board(arrived) {
  const R = ride.R, st = R.stops;
  const curI = arrived != null ? arrived : ride.next - 1;
  const nextI = arrived != null ? arrived + 1 : ride.next;
  const name = k => k >= 0 && k < st.length ? stName(S[st[k].i]) : '';
  const big = arrived != null ? name(arrived) : name(nextI);
  const lab = arrived != null ? (arrived === st.length - 1 ? '終点' : '') : (nextI < st.length ? (nextI === st.length - 1 ? 'つぎは 終点' : 'つぎは') : '');
  const s = arrived != null ? S[st[arrived].i] : nextI < st.length ? S[st[nextI].i] : null;
  $('rBoard').innerHTML = `<div class="bl">${esc(name(curI - (arrived != null ? 1 : 0)) || '　')}</div><div class="bc"><small>${lab || '　'}</small><b>${esc(big || '—')}</b><small>${s ? s.o + '年開業' : '　'}</small></div><div class="br">${esc(name(arrived != null ? arrived + 1 : nextI + 1) || '　')}</div>`;
  $('rBoard').style.borderTopColor = CATS[R.cat].color;
}
function arrive(k) {
  const R = ride.R, s = S[R.stops[k].i], last = k === R.stops.length - 1;
  board(k); ride.dwell = last ? 0 : 1.3; ride.lastStop = R.stops[k].km; ride.squealed = false;
  if (!last) ride.sim += R.cat === 'tram' || R.cat === 'sub' ? .4 : .6;  // 停車時間
  led(last ? `終点 ${stName(s)}です　ご乗車ありがとうございました` : `${stName(s)}です　${stName(s)}駅は${s.o}年（${era(s.o)}）開業`);
  arriveChime();
}
function meter(kmh) {
  const scale = Math.ceil(ride.top * 1.2 / 20) * 20, ang = -90 + 180 * clamp(kmh / scale, 0, 1);
  $('needle').setAttribute('transform', `rotate(${ang.toFixed(1)} 50 55)`);
  $('rSpd').textContent = `${Math.round(kmh)} km/h`;
  $('rClock').textContent = `時刻 ${clockStr(ride.sim)}（9:00発・当時の目安）`;
}
// 列車がパネルに隠れないよう、地図の見えている部分の真ん中に置く
// 進む向き（北=0度、時計回り）
function headingAt(R, d) {
  const a = pointAt(R, Math.max(0, d - .05))[0], b = pointAt(R, Math.min(R.total, d + .3))[0];
  return Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI;
}
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
// 地図は「向き」の分だけ時計回りに回るので、進む向きを上（前）・右（横の窓）にするには逆に回す
const targetBearing = (R, d) => $('rView').value === 'side' ? 90 - headingAt(R, d) : -headingAt(R, d);  // 「3D」が使えないときは「前を見る」と同じ
function followTrain(pt) {
  const W = map.getSize().x, H = map.getSize().y, r = $('ride').getBoundingClientRect();
  const bottomCard = (r.top + r.bottom) / 2 > H / 2;
  const top = bottomCard ? 0 : r.bottom, bot = bottomCard ? r.top : H;
  const k = $('rView').value === 'front' ? .72 : .5;  // 前を見るときは列車を下寄りに
  const cy = clamp(top + (bot - top) * k, 40, H - 40);
  const p = map.latLngToContainerPoint(pt);
  map.panBy([p.x - W / 2, p.y - cy], {animate: false});
}
function rideStep(now) {
  if (!ride.on) return;
  const R = ride.R, dt = Math.min(.1, (now - ride.last) / 1000); ride.last = now;
  let f = 0;
  if (!ride.paused) {
    if (ride.dwell > 0) {
      ride.dwell -= dt * ride.speed;
      if (ride.dwell <= 0) { board(); if (!ride.departing) departSound(false); ride.departing = false; const nx = R.stops[ride.next]; if (nx) led(`つぎは ${stName(S[nx.i])}です　この列車は ${ride.dest}ゆき`); }
    } else {
      // 加速と減速：駅を出てしばらくは加速、次の駅の手前で減速
      const nextKm = ride.next < R.stops.length ? R.stops[ride.next].km : R.total;
      const ds = ride.pos - ride.lastStop, dn = nextKm - ride.pos;
      const acc = R.cat === 'shin' ? 3 : R.cat === 'tram' ? .15 : .8;
      f = Math.min(clamp(Math.sqrt(Math.max(ds, 0) / acc), .1, 1), clamp(Math.sqrt(Math.max(dn, 0) / acc), .07, 1));
      // 3Dのときは実際の速さの8倍、地図のときは画面に合わせた速さ
      const move = ride.is3d ? dt * (ride.top * f / 3600) * 8 * ride.speed : dt * KM_PER_SEC * ride.speed * f * (R.cat === 'shin' ? 2.2 : 1);
      ride.pos += move;
      ride.sim += move / (ride.top * Math.max(f, .25)) * 60;
      if (dn < acc * .5 && !ride.squealed) { ride.squealed = true; squeal(); const nx = R.stops[ride.next]; if (nx) led(`まもなく ${stName(S[nx.i])}です`); }
      if (ride.next < R.stops.length && ride.pos >= R.stops[ride.next].km) { ride.pos = R.stops[ride.next].km; arrive(ride.next); ride.next++; f = 0; }
      // ガタンゴトン：当時の速さで25mのレールを通るごと
      const v = ride.top * f;
      ride.jointT -= dt;
      if (v > 8 && ride.jointT <= 0) { joint(v); ride.jointT = 25 / (v / 3.6); }
    }
  }
  if (ride.rumble) ride.rumble.g.gain.setTargetAtTime(f > 0 ? .03 + .1 * f : .012, audio.currentTime, .2);
  const [pt, idx] = pointAt(R, Math.min(ride.pos, R.total));
  while (ride.ti < idx) { ride.ti++; ride.trail.addLatLng(R.pts[ride.ti]); }
  const tl = ride.trail.getLatLngs(); if (tl.length > ride.ti + 1) tl.pop();
  ride.trail.addLatLng(pt);
  if (ride.is3d) camera3D(dt);
  else if (map.setBearing && $('rView').value !== 'north') {
    const tb = targetBearing(R, ride.pos);
    ride.bear += angDiff(tb, ride.bear) * Math.min(1, dt * 2.5);
    map.setBearing(ride.bear);
  }
  ride.mk.setLatLng(pt); if (!ride.is3d) followTrain(pt);
  // 揺れ
  if (opt.shake && !REDUCED && !ride.paused) {
    const tx = Math.sin(now / 430) * 1.4 * f + (Math.random() - .5) * 3 * ride.bump, ty = Math.sin(now / 270) * .8 * f + 1.6 * ride.bump;
    ride.bump *= .82; $(ride.is3d ? 'map3d' : 'map').style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)`;
  } else $(ride.is3d ? 'map3d' : 'map').style.transform = '';
  meter(ride.top * f);
  $('rInfo').textContent = `${ride.pos.toFixed(1)}km／${R.total.toFixed(1)}km　出発から約${hm(ride.sim)}（当時の目安）`;
  if (ride.pos >= R.total - 1e-6 && ride.dwell <= 0) {
    $('rInfo').innerHTML = `終点に着きました。${R.total.toFixed(1)}km・${R.stops.length}駅、当時の目安で約<b>${hm(ride.sim)}</b>`;
    ride.on = false; rumbleStop(); $('map').style.transform = ''; meter(0); $('rPause').textContent = '↻'; return;
  }
  requestAnimationFrame(rideStep);
}
$('rPause').onclick = () => {
  if (!ride.on) return rideStart(ride.li, ride.y, ride.rev);
  ride.paused = !ride.paused; $('rPause').textContent = ride.paused ? '▶' : '❚❚'; ride.last = performance.now();
  if (ride.rumble) ride.rumble.g.gain.value = ride.paused ? 0 : .012;
};
$('rSpeed').onchange = () => { ride.speed = +$('rSpeed').value; };
$('rRev').onclick = () => { if ($('rSound').checked) ac(); rideStart(ride.li, ride.y, !ride.rev); };
$('rView').onchange = () => {
  $('rCamWrap').style.display = $('rView').value === '3d' ? '' : 'none';
  if ($('rView').value === '3d') { if (ride.on && !ride.is3d) enter3D(); return; }
  if (ride.is3d) exit3D();
  if (!map.setBearing) return; if ($('rView').value === 'north') map.setBearing(0); else if (ride.R) { ride.bear = targetBearing(ride.R, ride.pos); map.setBearing(ride.bear); } };
$('rScene').onchange = () => { if (RIDING) background(ride.y); if (ride.is3d) set3DScene(ride.y); };
$('rSound').onchange = () => { if ($('rSound').checked) { ac(); if (ride.on && !ride.rumble) rumbleStart(); } else rumbleStop(); };
$('rQuit').onclick = () => { $('ride').querySelector('.gl').textContent = '⠿ 🚂 乗ってみる'; rideStop(); focus = null; showCard('panel'); map.setZoom(11, {animate: false}); draw(curYear(), false); };

// 地図の、パネルに隠れていない部分に収まるように表示する
function fitVisible(b, fly) {
  const c = ['panel', 'menu', 'quiz', 'story', 'cmp', 'ride', 'me', 'haisen'].map($).find(e => getComputedStyle(e).display !== 'none');
  const H = map.getSize().y, o = {paddingTopLeft: [20, 20], paddingBottomRight: [20, 20], duration: .8};
  if (c) { const r = c.getBoundingClientRect(); if ((r.top + r.bottom) / 2 > H / 2) o.paddingBottomRight[1] = H - r.top + 10; else o.paddingTopLeft[1] = r.bottom + 10; }
  if (fly) map.flyToBounds(b, o); else map.fitBounds(b, o);
}
// ---------- 👻 廃線探検 ----------
const haisen = {on: false, sel: null, list: []};
function haisenLines() {
  const m = new Map();
  for (const p of P) {
    if (!p.g) continue;
    const r = m.get(p.l) || {l: p.l, end: 0, len: 0, cat: p.cat};
    r.end = Math.max(r.end, p.e); r.len += plen(p.pts); m.set(p.l, r);
  }
  const out = [...m.values()].filter(r => r.len >= .8);
  for (const r of out) {
    r.start = Math.min(...P.filter(p => p.l === r.l).map(p => p.s));
    r.all = !P.some(p => p.l === r.l && present(p, Y1));
  }
  return out;
}
function haisenOpen() {
  stop(); map.closePopup(); storyAuto(false); focus = null;
  if (!haisen.list.length) haisen.list = haisenLines();
  showCard('haisen'); haisen.on = true; haisen.sel = null;
  $('hInfo').innerHTML = '一覧から路線を選ぶと、場所と年代を表示します';
  haisenList(); drawHaisen();
  map.flyTo([35.62, 139.62], 10, {duration: .8});
}
function haisenList() {
  const k = $('hSort').value, L2 = haisen.list.filter(r => !$('hAll').checked || r.all);
  L2.sort(k === 'len' ? (a, b) => b.len - a.len : k === 'name' ? (a, b) => LN[a.l].localeCompare(LN[b.l], 'ja') : (a, b) => b.end - a.end);
  $('hCount').textContent = `${L2.length}路線`;
  $('hList').innerHTML = L2.map(r => `<button data-l="${r.l}" class="${haisen.sel === r.l ? 'on' : ''}"><span><span class="sw" style="background:${CATS[r.cat].color}"></span> ${esc(LN[r.l])}</span><small>${r.start}〜${r.end}年・${r.len.toFixed(1)}km${r.all ? '・全線廃止' : ''}</small></button>`).join('');
  $('hList').querySelectorAll('button').forEach(b => { b.onclick = () => haisenSelect(+b.dataset.l); });
}
function haisenSelect(l) {
  haisen.sel = l;
  const r = haisen.list.find(x => x.l === l);
  $('hInfo').innerHTML = `<b>${esc(LN[l])}</b>：${r.start}年に開業、${r.end + 1}年に${r.all ? '全線' : '一部の区間が'}廃止（廃止区間は約${r.len.toFixed(1)}km）
    <div class="row"><button id="hRide">🚂 ${r.end}年の${esc(LN[l])}に乗る</button><button id="hStory">📖 ものがたり</button></div>`;
  $('hRide').onclick = () => { haisen.on = false; showTicket(l, r.end, false); };
  $('hStory').onclick = () => { haisen.on = false; storyStart(l); };
  haisenList(); drawHaisen();
  const pts = P.filter(p => p.l === l && p.g).flatMap(p => p.pts);
  if (pts.length) fitVisible(L.latLngBounds(pts).pad(.1), true);
}
function drawHaisen() {
  ++gen; layer.clearLayers(); fx.clearLayers(); lbl.clearLayers(); popPad();
  for (const p of P) if (present(p, Y1) && !(haisen.sel === p.l)) line(p, 'faint', layer, R0);
  for (const p of P) {
    if (!p.g) continue;
    const sel = haisen.sel === p.l, dim = haisen.sel != null && !sel;
    if (sel) L.polyline(p.pts, {renderer: R0, interactive: false, color: '#ffd54f', weight: 10, opacity: .7}).addTo(fx);
    L.polyline(p.pts, {renderer: R0, interactive: false, color: CATS[p.cat].color, weight: sel ? 4 : 2.5, opacity: dim ? .3 : .95, dashArray: sel ? null : '6 4'}).addTo(sel ? fx : layer);
  }
  if (haisen.sel != null) for (const s of S) if (s.c && s.ls.some(t => t[0] === haisen.sel)) dot(s.i, 'closed', fx, R0);
  background(Y1);
}
$('haisenBtn').onclick = haisenOpen;
$('hSort').onchange = $('hAll').onchange = haisenList;
$('hQuit').onclick = () => { haisen.on = false; showCard('panel'); draw(curYear(), false); };

// ---------- 🎥 3Dの前面展望（MapLibre を乗車中だけ読み込む） ----------
const ML_VER = '4.7.1';
let M3 = null, m3Loaded = false, mlLoading = null, signs = [], signKey = '';
function loadML() {
  if (window.maplibregl) return Promise.resolve();
  if (mlLoading) return mlLoading;
  mlLoading = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`;
    s.onload = () => res(); s.onerror = () => { mlLoading = null; rej(new Error('3D表示の部品を読み込めませんでした')); };
    document.head.appendChild(s);
  });
  return mlLoading;
}
function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
// 国土地理院の標高タイル（独自の形式）を、MapLibre が読める形式（terrarium）に変換する
let flatDem = null;
async function pngOf(canvas) { if (canvas.convertToBlob) return (await canvas.convertToBlob({type: 'image/png'})).arrayBuffer(); return new Promise(r => canvas.toBlob(b => b.arrayBuffer().then(r), 'image/png')); }
function newCanvas() { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(256, 256); const c = document.createElement('canvas'); c.width = c.height = 256; return c; }
async function flatTile() {
  if (flatDem) return flatDem.slice(0);
  const c = newCanvas(), x = c.getContext('2d'); x.fillStyle = 'rgb(128,0,0)'; x.fillRect(0, 0, 256, 256);  // 標高0m
  flatDem = await pngOf(c); return flatDem.slice(0);
}
function registerDem() {
  maplibregl.addProtocol('gsidem', async (params, ac) => {
    try {
      const r = await fetch(params.url.replace('gsidem://', 'https://'), {signal: ac.signal});
      if (!r.ok) return {data: await flatTile()};
      const bmp = await createImageBitmap(await r.blob());
      const c = newCanvas(), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const im = x.getImageData(0, 0, 256, 256), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] * 65536 + d[i + 1] * 256 + d[i + 2];
        const hgt = v < 8388608 ? v * .01 : v === 8388608 ? 0 : (v - 16777216) * .01, t = hgt + 32768;
        d[i] = Math.floor(t / 256); d[i + 1] = Math.floor(t) % 256; d[i + 2] = Math.floor((t % 1) * 256); d[i + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      return {data: await pngOf(c)};
    } catch (e) { if (e.name === 'AbortError') throw e; return {data: await flatTile()}; }
  });
}
function create3D(center) {
  registerDem();
  M3 = new maplibregl.Map({
    container: 'map3d', interactive: false, maxPitch: 85, attributionControl: {compact: true},
    center: [center[1], center[0]], zoom: 17, pitch: 78, bearing: 0, fadeDuration: 0,
    style: {
      version: 8,
      sources: {
        pale: {type: 'raster', tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>'},
        dem: {type: 'raster-dem', tiles: ['gsidem://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 14, encoding: 'terrarium'},
        others: {type: 'geojson', data: {type: 'FeatureCollection', features: []}},
        route: {type: 'geojson', data: {type: 'FeatureCollection', features: []}}
      },
      layers: [
        {id: 'pale', type: 'raster', source: 'pale'},
        {id: 'others', type: 'line', source: 'others', paint: {'line-color': ['get', 'c'], 'line-opacity': .7, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 18, 6]}},
        {id: 'route-casing', type: 'line', source: 'route', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 20]}},
        {id: 'route', type: 'line', source: 'route', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': ['get', 'c'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 18, 12]}}
      ],
      sky: {'sky-color': '#7fb8e6', 'horizon-color': '#e6eff7', 'fog-color': '#e6eff7', 'sky-horizon-blend': .6, 'horizon-fog-blend': .7, 'fog-ground-blend': .35, 'atmosphere-blend': .6}
    }
  });
  M3.on('load', () => { m3Loaded = true; });
  M3.on('error', e => { if (e && e.error && !/tile|Tile|fetch|404|Failed/.test(String(e.error.message))) console.warn('3D:', e.error.message); });
}
function set3DScene(y) {
  if (!M3 || !m3Loaded) return;
  if (M3.getLayer('photo')) M3.removeLayer('photo');
  if (M3.getSource('photo')) M3.removeSource('photo');
  const ph = $('rScene').value === 'auto' ? PHOTOS.find(p => y >= p[0] && y <= p[1]) : null;
  if (ph) {
    M3.addSource('photo', {type: 'raster', tiles: [`https://cyberjapandata.gsi.go.jp/xyz/${ph[2]}/{z}/{x}/{y}.${ph[4]}`], tileSize: 256, minzoom: ph[2] === 'seamlessphoto' ? 2 : 10, maxzoom: ph[2] === 'seamlessphoto' ? 18 : 17});
    M3.addLayer({id: 'photo', type: 'raster', source: 'photo'}, 'others');
  }
  // 1945年より前はセピア色の地図
  const old = y < 1945 && !ph, t = clamp((1970 - y) / 90, 0, 1);
  M3.setPaintProperty('pale', 'raster-saturation', old ? -.75 : -.1);
  M3.setPaintProperty('pale', 'raster-hue-rotate', old ? 25 * t : 0);
  M3.setPaintProperty('pale', 'raster-contrast', old ? -.1 : 0);
}
function set3DData() {
  if (!M3 || !m3Loaded) return;
  const R = ride.R, y = ride.y, others = [];
  for (const p of P) if (p.l !== ride.li && present(p, y) && opt.cats[p.cat]) others.push({type: 'Feature', properties: {c: CATS[p.cat].color}, geometry: {type: 'LineString', coordinates: p.pts.map(q => [q[1], q[0]])}});
  M3.getSource('others').setData({type: 'FeatureCollection', features: others});
  M3.getSource('route').setData({type: 'FeatureCollection', features: [{type: 'Feature', properties: {c: CATS[R.cat].color}, geometry: {type: 'LineString', coordinates: R.pts.map(q => [q[1], q[0]])}}]});
  set3DScene(y);
  signKey = ''; update3DSigns();
}
// 駅名標：いまの駅と、これから先の3駅だけを立てる
function update3DSigns() {
  const R = ride.R, from = Math.max(0, ride.next - 1), to = Math.min(R.stops.length, ride.next + 3), key = from + '-' + to;
  if (key === signKey) return;
  signKey = key; signs.forEach(m => m.remove()); signs = [];
  for (let k = from; k < to; k++) {
    const s = S[R.stops[k].i], el = document.createElement('div');
    el.className = 'sign3d'; el.style.borderTopColor = CATS[R.cat].color;
    el.innerHTML = `${esc(stName(s))}<small>${s.o}年開業</small>`;
    signs.push(new maplibregl.Marker({element: el, anchor: 'bottom'}).setLngLat([s.lon, s.lat]).addTo(M3));
  }
}
const CAM = {low: [82, 18.2], mid: [79, 17.4], high: [72, 16.3]};
function camera3D(dt) {
  if (!M3) return;
  const R = ride.R, [pitch, zoom0] = CAM[$('rCam').value] || CAM.mid, zoom = zoom0 - (R.cat === 'shin' ? .6 : 0);
  const card = $('ride').getBoundingClientRect(), H = M3.getContainer().clientHeight;
  const padB = (card.top + card.bottom) / 2 > H / 2 ? Math.max(0, H - card.top) : 0, padT = padB ? 0 : Math.max(0, card.bottom);
  const visH = Math.max(120, H - padB - padT), lat = pointAt(R, ride.pos)[0][0];
  const mpp = 40075016.7 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, zoom));
  const look = 1.5 * visH * mpp * Math.sin(pitch * Math.PI / 180) / 1000;  // カメラが列車の真上あたりに来るよう、見る点を前に置く
  const target = headingAt(R, ride.pos);
  ride.bear3 = ride.bear3 == null ? target : ride.bear3 + angDiff(target, ride.bear3) * Math.min(1, dt * 2);
  const c = pointAt(R, Math.min(R.total, ride.pos + look))[0];
  M3.jumpTo({center: [c[1], c[0]], bearing: ride.bear3, pitch, zoom, padding: {top: padT, bottom: padB, left: 0, right: 0}});
  update3DSigns();
}
async function enter3D() {
  if (!webglOK()) { toast('この端末では3D表示が使えないため、「前を見る」にしました', 4000); $('rView').value = 'front'; return false; }
  toast('🎥 3Dの景色を準備しています…', 2500);
  try { await loadML(); } catch (e) { toast(e.message + '。「前を見る」にしました', 4000); $('rView').value = 'front'; return false; }
  if (!ride.R) return false;
  if (!M3) create3D(ride.R.pts[0]);
  document.body.classList.add('is3d'); $('map3d').style.display = 'block'; M3.resize();
  ride.is3d = true; ride.bear3 = null;
  const go = () => { m3Loaded = true; setTerrain3D(); set3DData(); camera3D(1); };
  if (m3Loaded) go(); else M3.once('load', go);
  return true;
}
function exit3D() {
  ride.is3d = false; document.body.classList.remove('is3d'); $('map3d').style.display = 'none'; $('map3d').style.transform = '';
  signs.forEach(m => m.remove()); signs = []; signKey = '';
}
$('rCam').onchange = () => { if (ride.is3d) camera3D(1); };
// 地形の起伏（山あいの路線向け。トンネルの多い区間で見えにくいときは切れる）
function setTerrain3D() { if (M3 && m3Loaded) M3.setTerrain($('rTerrain').checked ? {source: 'dem', exaggeration: 1} : null); }
$('rTerrain').onchange = setTerrain3D;

// ---------- 使い方の案内 ----------
const GUIDE = [
  ['🚂 鉄道のひろがりへようこそ', '▶ を押すと、1872年の新橋開業から今まで、首都圏に鉄道が広がっていく様子を再生します。', '下のつまみを動かすと、好きな年へ移れます。'],
  ['≡ メニューに遊び方がまとまっています', '🚂 乗ってみる、⭐ 見どころ再生、クイズ、路線ものがたり、わたしの年表、2つの年を比べる、などがあります。', '色の分け方や背景の空中写真も、メニューで変えられます。'],
  ['地図にさわってみましょう', '駅をタップすると「駅カード」が出ます。地図を長押し（パソコンは右クリック）すると、その辺りの鉄道史が出ます。', 'このパネルは上の帯をドラッグして動かせ、▾ でたためます。']
];
function guide(k) {
  if (k >= GUIDE.length) { $('guide').classList.remove('show'); return; }
  const [t, ...ps] = GUIDE[k];
  $('gStep').innerHTML = `<h3>${t}</h3>` + ps.map(p => `<p>${p}</p>`).join('');
  $('gDots').textContent = `${k + 1}／${GUIDE.length}`;
  $('gNext').textContent = k === GUIDE.length - 1 ? 'はじめる' : '次へ';
  $('gNext').onclick = () => guide(k + 1);
  $('guide').classList.add('show');
}
$('gSkip').onclick = () => $('guide').classList.remove('show');
$('guideBtn').onclick = () => { showCard('panel'); guide(0); };

// ---------- キー操作（パソコン） ----------
document.addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea')) return;
  if (e.key === 'Escape') { $('guide').classList.remove('show'); $('ticket').classList.remove('show'); if (getComputedStyle($('menu')).display !== 'none') showCard('panel'); return; }
  if (getComputedStyle($('panel')).display === 'none') return;
  if (e.key === ' ') { e.preventDefault(); $('play').onclick(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); jump(curYear() + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)); }
  else if (e.key === 'm' || e.key === 'M') $('menuBtn').onclick();
});

// ---------- 🔗 この画面を共有 ----------
function shareURL() {
  const c = map.getCenter(), p = new URLSearchParams();
  p.set('y', ride.on || getComputedStyle($('ride')).display !== 'none' ? ride.y || curYear() : curYear());
  p.set('z', map.getZoom()); p.set('c', c.lat.toFixed(4) + ',' + c.lng.toFixed(4));
  if (focus != null) { p.set('l', LN[focus]); p.set('m', getComputedStyle($('ride')).display !== 'none' ? 'ride' : 'story'); }
  return location.origin + location.pathname + '#' + p.toString();
}
$('shareBtn').onclick = async () => {
  showCard('panel');
  const url = shareURL(), title = `鉄道のひろがり ${curYear()}年`;
  try { if (navigator.share) { await navigator.share({title, url}); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast(`🔗 リンクをコピーしました<br><small style="word-break:break-all">${esc(url)}</small>`, 6000); }
  catch (e) { toast(`このリンクをコピーしてください<br><small style="word-break:break-all;user-select:all">${esc(url)}</small>`); }
};
function openFromLink() {
  if (!location.hash) return false;
  const p = new URLSearchParams(location.hash.slice(1));
  const y = +p.get('y'), z = +p.get('z'), c = (p.get('c') || '').split(',').map(Number);
  if (!y && !p.get('l')) return false;
  if (c.length === 2 && !isNaN(c[0])) map.setView(c, z || 11, {animate: false});
  if (y) { $('slider').value = clamp(y, Y0, Y1); draw(curYear(), false); }
  const li = p.get('l') ? LN.indexOf(p.get('l')) : -1;
  if (li >= 0 && p.get('m') === 'story') storyStart(li);
  if (li >= 0 && p.get('m') === 'ride') { rideOpen(li); $('rYear').value = y || curYear(); }
  return true;
}

// ---------- 🎂 わたしの年表 ----------
function ageText(y) {
  const b = opt.birth; if (!b) return '';
  if (y >= b) return `・あなた${y - b}歳`;
  return b - y <= 30 ? `・生まれる${b - y}年前` : '';
}
$('meBtn').onclick = () => { stop(); map.closePopup(); showCard('me'); if (opt.birth) { $('birth').value = opt.birth; meShow(); } else $('birth').focus(); };
$('meQuit').onclick = () => showCard('panel');
$('meGo').onclick = () => {
  const b = +$('birth').value;
  if (!b || b < 1872 || b > Y1) { $('meRes').textContent = `${Y0}〜${Y1}の年を入れてください`; return; }
  opt.birth = b; savePref(); meShow(); draw(curYear(), false);
};
$('birth').onkeydown = e => { if (e.key === 'Enter') $('meGo').onclick(); };
$('meClear').onclick = () => { delete opt.birth; savePref(); $('birth').value = ''; $('meRes').innerHTML = ''; draw(curYear(), false); };
function meShow() {
  const b = opt.birth, now = S.filter(s => s.c == null);
  const same = S.filter(s => s.o === b);
  const older = now.filter(s => s.o < b).length, younger = now.filter(s => s.o > b).length;
  const c = map.getCenter();
  same.sort((x, y) => km(c.lat, c.lng, x.lat, x.lon) - km(c.lat, c.lng, y.lat, y.lon));
  const at20 = b + 20 <= Y1 ? S.filter(s => s.o === b + 20).length : null;
  const pct = Math.round(younger / Math.max(1, now.length) * 100);
  const btn = (y, t) => `<button data-y="${y}" class="meY">${t}</button>`;
  $('meRes').innerHTML = `
  <div>🎂 <b>${b}年（${era(b)}）</b>生まれ</div>
  <div>同い年の駅：<b>${same.length}駅</b>${same.length ? '（' + esc(same.slice(0, 10).map(s => s.n).join('・')) + (same.length > 10 ? ' など' : '') + '）' : ''}</div>
  <div>いまある駅のうち、あなたより年上の駅 <b>${older}</b>、年下の駅 <b>${younger}</b>（あなたの人生で生まれた駅が${pct}%）</div>
  <div>首都圏の駅数：生まれた年 <b>${counts[b] || 0}</b> → いま <b>${counts[Y1] || 0}</b></div>
  ${at20 != null ? `<div>20歳の年（${b + 20}年）に開業した駅：${at20}駅</div>` : ''}
  <div class="row">${btn(b, '生まれた年の地図')}${b + 20 <= Y1 ? btn(b + 20, '20歳の年') : ''}<button id="mePlay">生まれた年から再生 ▶</button></div>`;
  $('meRes').querySelectorAll('.meY').forEach(e => { e.onclick = () => { showCard('panel'); jump(+e.dataset.y); }; });
  $('mePlay').onclick = () => { showCard('panel'); $('slider').value = b - 1; $('play').onclick(); };
}

// ---------- 起動 ----------
async function start() {
  $('msg').style.display = 'block';
  $('msg').textContent = '線路データを読み込み中…';
  try {
    await load();
    prep();
    $('msg').style.display = 'none';
    draw(curYear(), false);
    placeCards(); const linked = openFromLink(); if (!linked) versionNotice(); else try { localStorage.setItem('eki_ver', APP_VER); } catch (e) {}
  } catch (e) {
    $('msg').innerHTML = '読み込みに失敗しました（' + esc(e.message) + '）。<button id="retry">もう一度</button>';
    $('retry').onclick = () => start();
  }
}
$('slider').max = Y1;
try { localStorage.removeItem('eki_data_v3'); localStorage.removeItem('railmap_kanto_v1'); } catch (e) {}
start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js', {scope: './'}).then(reg => {
    // 新しい版が届いたら知らせる
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => {
        // 開いた直後は、すでに新しい版を読み込んでいるので知らせない（開きっぱなしの間に届いたときだけ）
        if (w.state === 'installed' && navigator.serviceWorker.controller && Date.now() - T0 > 20000)
          toast('<b>🆕 新しい版が届きました</b><br><button onclick="location.reload()">読み込み直して新しい版にする</button>');
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
