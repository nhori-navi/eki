'use strict';
// 鉄道のひろがり — 新橋開業から現在まで、首都圏の鉄道の広がりを地図で見る
const Y0 = 1872, Y1 = new Date().getFullYear();
const KEY = 'eki_data_v3', PREF = 'eki_pref_v1';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 事業者の種類と色
const CATS = {
  shin: {name: '新幹線', color: '#d84315'},
  jr: {name: 'JR・国鉄', color: '#2e8b57'},
  pvt: {name: '私鉄', color: '#2f6db5'},
  sub: {name: '地下鉄', color: '#8e44ad'},
  tram: {name: '路面電車', color: '#a0522d'}
};
const ORDER = ['shin', 'sub', 'tram', 'jr', 'pvt'];

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
const map = L.map('map', {preferCanvas: true, zoomControl: false}).setView([35.62, 139.62], 10);
L.control.zoom({position: 'topright'}).addTo(map);
const pale = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>｜駅データ：<a href="https://www.wikidata.org/" target="_blank">Wikidata</a>'
}).addTo(map);
let photo = null, photoId = '';
const R0 = L.canvas({padding: 0.3});
const layer = L.layerGroup().addTo(map), fx = L.layerGroup().addTo(map), lbl = L.layerGroup().addTo(map);
map.createPane('cmpL'); map.createPane('cmpR');
map.getPane('cmpL').style.zIndex = 450; map.getPane('cmpR').style.zIndex = 450;
const RL = L.canvas({pane: 'cmpL'}), RR = L.canvas({pane: 'cmpR'});
const gL = L.layerGroup().addTo(map), gR = L.layerGroup().addTo(map);

let S = {}, EI = new Map(), counts = {}, lineList = [], gen = 0, lastNew = 0, focus = null;
const curYear = () => +$('slider').value;

// ---------- データ取得（Wikidata） ----------
const BOX = `SERVICE wikibase:box { ?s wdt:P625 ?c .
  bd:serviceParam wikibase:cornerSouthWest "Point(138.6 34.85)"^^geo:wktLiteral ;
                  wikibase:cornerNorthEast "Point(140.95 36.3)"^^geo:wktLiteral . }`;
const Q1 = `SELECT ?s ?sLabel ?c ?open ?close
 (GROUP_CONCAT(DISTINCT STR(?adj); separator=" ") AS ?adjs)
 (GROUP_CONCAT(DISTINCT ?lineL; separator="・") AS ?lines) WHERE {
 ${BOX}
 ?s wdt:P1619 ?open .
 { ?s wdt:P31/wdt:P279* wd:Q55488 } UNION { ?s wdt:P31/wdt:P279* wd:Q2175765 }
 OPTIONAL { ?s wdt:P3999 ?close }
 OPTIONAL { ?s wdt:P197 ?adj }
 OPTIONAL { ?s wdt:P81 ?line . ?line rdfs:label ?lineL . FILTER(LANG(?lineL) = "ja") }
 ?s rdfs:label ?sLabel . FILTER(LANG(?sLabel) = "ja")
} GROUP BY ?s ?sLabel ?c ?open ?close`;
const Q2 = `SELECT ?s (GROUP_CONCAT(DISTINCT STR(?t); separator=" ") AS ?ts)
 (GROUP_CONCAT(DISTINCT ?opL; separator="・") AS ?ops) WHERE {
 ${BOX}
 ?s wdt:P1619 ?open .
 { ?s wdt:P31/wdt:P279* wd:Q55488 } UNION { ?s wdt:P31/wdt:P279* wd:Q2175765 }
 OPTIONAL { ?s wdt:P31 ?t }
 OPTIONAL { ?s wdt:P137 ?op . ?op rdfs:label ?opL . FILTER(LANG(?opL) = "ja") }
} GROUP BY ?s`;

async function sparql(q) {
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), {headers: {Accept: 'application/sparql-results+json'}});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).results.bindings;
}

const JR_RE = /旅客鉄道|ＪＲ|JR|日本国有鉄道|国鉄|鉄道省|鉄道院/;
const JR_LINES = /本線|山手線|京浜東北線|横須賀線|総武|常磐線|武蔵野線|南武線|横浜線|青梅線|五日市線|八高線|相模線|京葉線|埼京線|川越線|鶴見線|根岸線|内房線|外房線|成田線|鹿島線|東金線|久留里線|日光線|両毛線|水戸線|烏山線|吾妻線|上越線|御殿場線|伊東線|身延線/;
function classify(l, t, p) {
  const k = [];
  if (/新幹線/.test(l)) k.push('shin');
  if (/Q928830\b/.test(t) || /地下鉄|東京メトロ|帝都高速度交通営団/.test(p) || /メトロ|地下鉄|浅草線|三田線|大江戸線|都営新宿線/.test(l)) k.push('sub');
  if (/Q2175765\b/.test(t) || /荒川線|都電|世田谷線|路面|軌道線/.test(l)) k.push('tram');
  if (JR_RE.test(p) || (!p && JR_LINES.test(l))) k.push('jr');
  if (!k.length || (p && !/旅客鉄道|ＪＲ|JR|日本国有鉄道|国鉄|鉄道省|鉄道院|地下鉄|東京メトロ|帝都高速度交通営団|交通局/.test(p))) k.push('pvt');
  return [...new Set(k)];
}

async function load(useCache) {
  try { localStorage.removeItem('railmap_kanto_v1'); } catch (e) {}
  if (useCache) { try { const c = localStorage.getItem(KEY); if (c) return JSON.parse(c); } catch (e) {} }
  const [b1, b2] = await Promise.all([sparql(Q1), sparql(Q2).catch(() => [])]);
  const out = {}, ex = {};
  for (const b of b1) {
    const id = b.s.value.split('/').pop();
    const m = b.c.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    const op = parseInt(b.open.value.slice(0, 4), 10);
    const od = b.open.value.slice(0, 10);
    let cl = b.close ? parseInt(b.close.value.slice(0, 4), 10) : null;
    if (!m || isNaN(op)) continue;
    if (isNaN(cl)) cl = null;
    const adj = (b.adjs ? b.adjs.value : '').split(' ').filter(Boolean).map(u => u.split('/').pop());
    const o = out[id];
    if (!o) out[id] = {n: b.sLabel.value, lat: +m[2], lon: +m[1], o: op, od, c: cl, a: adj, l: b.lines ? b.lines.value : ''};
    else { if (op < o.o) { o.o = op; o.od = od; } if (cl && (!o.c || cl > o.c)) o.c = cl; }
  }
  for (const b of b2) ex[b.s.value.split('/').pop()] = {t: b.ts ? b.ts.value : '', p: b.ops ? b.ops.value : ''};
  for (const id in out) { const e = ex[id] || {t: '', p: ''}; out[id].k = classify(out[id].l, e.t, e.p); out[id].op = e.p; }
  try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) {}
  return out;
}

// ---------- 下ごしらえ ----------
const isOpen = (s, y) => s.o <= y && (s.c == null || s.c > y);
const closedBy = (s, y) => s.c != null && s.c <= y;
const lines = s => s.l ? s.l.split('・') : [];
const onLine = s => !focus || lines(s).includes(focus);
const stOn = s => s.k.some(c => opt.cats[c]);

function reach(id, y) { // まだ開業していない駅を飛ばして、その年に開いている隣の駅を探す
  const res = [], seen = new Set([id]), q = S[id].a.map(x => [x, 0]);
  while (q.length) {
    const [x, d] = q.shift();
    if (seen.has(x)) continue; seen.add(x);
    if (isOpen(S[x], y)) res.push(x);
    else if (d < 8 && S[x].o > y) for (const z of S[x].a) if (!seen.has(z)) q.push([z, d + 1]);
  }
  return res;
}
function edgeCat(p, q) {
  const a = S[p].k, b = S[q].k;
  for (const c of ORDER) if (a.includes(c) && b.includes(c)) return c;
  for (const c of ORDER) if (a.includes(c) || b.includes(c)) return c;
  return 'pvt';
}
function prep() {
  for (const id in S) { S[id].a = S[id].a.filter(x => S[x] && x !== id); if (!S[id].k) S[id].k = ['pvt']; }
  for (const id in S) for (const x of S[id].a) if (!S[x].a.includes(id)) S[x].a.push(id);
  EI = new Map(); counts = {};
  for (let y = Y0; y <= Y1; y++) {
    let n = 0; const seen = new Set();
    for (const id in S) {
      if (!isOpen(S[id], y)) continue;
      n++;
      for (const t of reach(id, y)) {
        const k = id < t ? id + '|' + t : t + '|' + id;
        if (seen.has(k)) continue; seen.add(k);
        let r = EI.get(k);
        if (!r) { r = {p: id < t ? id : t, q: id < t ? t : id, iv: []}; r.cat = edgeCat(r.p, r.q); EI.set(k, r); }
        const last = r.iv[r.iv.length - 1];
        if (last && last[1] === y - 1) last[1] = y; else r.iv.push([y, y]);
      }
    }
    counts[y] = n;
  }
  const names = [...new Set(Object.values(S).map(s => s.n))].sort();
  $('names').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  const lc = {};
  for (const s of Object.values(S)) for (const l of lines(s)) lc[l] = (lc[l] || 0) + 1;
  lineList = Object.keys(lc).filter(l => lc[l] >= 3).sort((a, b) => lc[b] - lc[a]);
  $('lineNames').innerHTML = lineList.map(n => `<option value="${esc(n)}">`).join('');
}
const present = (r, y) => r.iv.some(v => v[0] <= y && y <= v[1]);
const isNewEdge = (r, y) => present(r, y) && !present(r, y - 1);
const ghostAt = (r, y) => !present(r, y) && r.iv[0][0] <= y && (closedBy(S[r.p], y) || closedBy(S[r.q], y));

function era(y) {
  const f = (name, n) => name + (n === 1 ? '元' : n) + '年';
  if (y >= 2019) return f('令和', y - 2018);
  if (y >= 1989) return f('平成', y - 1988);
  if (y >= 1926) return f('昭和', y - 1925);
  if (y >= 1912) return f('大正', y - 1911);
  return f('明治', y - 1867);
}
function fmtDate(od) {
  const [y, m, d] = od.split('-').map(Number);
  return (m === 1 && d === 1) || !m ? `${y}年` : `${y}年${m}月${d}日`;
}
const trainIcon = y => y < 1925 ? '🚂' : y < 1964 ? '🚃' : '🚄';
const ll = id => [S[id].lat, S[id].lon];

// ---------- 描きかた ----------
function line(r, style, G, R) {
  const col = CATS[r.cat].color, ph = opt.bg === 'photo', pts = [ll(r.p), ll(r.q)];
  const base = {renderer: R, interactive: false};
  if (style === 'new') {
    L.polyline(pts, {...base, color: '#ffd54f', weight: 9, opacity: .65}).addTo(G);
    return L.polyline(pts, {...base, color: col, weight: 3.5, opacity: 1}).addTo(G);
  }
  const st = {
    full: {color: col, weight: 2.5, opacity: ph ? .95 : .85},
    base: {color: col, weight: 2, opacity: ph ? .75 : .38},
    faint: {color: '#8a8a8a', weight: 1.5, opacity: .3},
    ghost: {color: '#7a6a55', weight: 1.6, opacity: ph ? .9 : .6, dashArray: '4 5'}
  }[style];
  return L.polyline(pts, {...base, ...st}).addTo(G);
}
function dot(id, style, G, R) {
  const s = S[id], col = CATS[s.k[0]].color;
  const st = {
    normal: {radius: 3, weight: 1.2, color: col, fillColor: '#fff', fillOpacity: 1},
    faint: {radius: 2, weight: 1, color: '#999', fillColor: '#ddd', fillOpacity: .5, opacity: .5},
    closed: {radius: 3, weight: 1, color: '#999', fillColor: '#ccc', fillOpacity: .6, opacity: .7},
    new: {radius: 6, weight: 2, color: '#c62828', fillColor: '#ffd54f', fillOpacity: 1}
  }[style];
  const m = L.circleMarker(ll(id), {renderer: R, ...st}).addTo(G);
  if (!quiz.on && style !== 'faint') m.bindPopup(() => card(id), {maxWidth: 270});
  return m;
}
function labels(y) {
  lbl.clearLayers();
  if (map.getZoom() < 14 || cmp.on) return;
  const b = map.getBounds(); let n = 0;
  for (const id in S) {
    const s = S[id];
    if (!isOpen(s, y) || !stOn(s) || !onLine(s) || !b.contains(ll(id))) continue;
    if (++n > 250) break;
    L.marker(ll(id), {icon: L.divIcon({className: 'lbl', html: `<span style="left:7px;top:-8px">${esc(s.n)}</span>`, iconSize: [0, 0]}), interactive: false}).addTo(lbl);
  }
}

function draw(y, animate) {
  if (cmp.on) return drawCompare();
  const g = ++gen;
  layer.clearLayers(); fx.clearLayers();
  const z = map.getZoom(), newEdges = [], newSt = [];
  for (const r of EI.values()) {
    if (!opt.cats[r.cat]) continue;
    const fo = !focus || (onLine(S[r.p]) && onLine(S[r.q]));
    if (present(r, y)) {
      if (isNewEdge(r, y) && fo) newEdges.push(r);
      else line(r, !fo ? 'faint' : opt.emph ? 'base' : 'full', layer, R0);
    } else if (opt.ghost && ghostAt(r, y)) line(r, 'ghost', layer, R0);
  }
  let shown = 0;
  for (const id in S) {
    const s = S[id];
    if (!stOn(s)) continue;
    const open = isOpen(s, y), fo = onLine(s);
    if (open) shown++;
    if (open && s.o === y && fo) newSt.push(id);
    else if (open) { if (focus ? true : z >= 11) dot(id, fo ? 'normal' : 'faint', layer, R0); }
    else if (s.c === y && z >= 11 && fo) dot(id, 'closed', layer, R0);
  }
  newSt.sort((a, b) => S[a].od < S[b].od ? -1 : S[a].od > S[b].od ? 1 : 0);
  lastNew = newSt.length;
  if (animate) animateYear(y, newSt, newEdges, g);
  else { newEdges.forEach(r => line(r, 'new', fx, R0)); newSt.forEach(id => dot(id, 'new', fx, R0)); }
  labels(y);
  $('year').textContent = y;
  $('era').textContent = era(y);
  $('cnt').textContent = '駅数 ' + shown;
  $('news').textContent = newSt.length ? 'この年の開業：' + newSt.slice(0, 15).map(id => S[id].n).join('、') + (newSt.length > 15 ? ` ほか${newSt.length - 15}駅` : '') : '';
  background(y); spark(y);
  if (opt.gogai && !quiz.on && EV[y]) gogai(y);
  else if (!animate) $('gogai').classList.remove('show');
  if (animate && opt.follow && newSt.length && !quiz.on) {
    const c = L.latLngBounds(newSt.map(ll)).getCenter();
    if (!map.getBounds().pad(-0.15).contains(c)) map.panTo(c, {duration: 0.6});
  }
}

// 同じ年の駅を、開業日の順に一つずつポンポンと出す
const popStep = n => { const s = clamp(+$('speed').value / 4, 30, 220); return n > 30 ? s * 30 / n : s; };
const delay = y => +$('speed').value * (EV[y] && opt.gogai ? 4 : 1) + Math.min(lastNew, 30) * clamp(+$('speed').value / 4, 30, 220) + 200;
function animateYear(y, newSt, newEdges, g) {
  const step = popStep(newSt.length), t = {};
  newSt.forEach((id, i) => { t[id] = i * step; });
  newSt.forEach((id, i) => setTimeout(() => {
    if (g !== gen) return;
    popDot(id, g);
    if (i < 40) beep([PENTA[i % PENTA.length]], 0.12, 0.035);
  }, t[id]));
  if (EV[y] && opt.gogai) beep([523, 659], 0.7, 0.1);
  const dur = Math.min(650, step * 4 + 250);
  let trains = 0;
  for (const r of newEdges) {
    const tp = t[r.p] || 0, tq = t[r.q] || 0, [from, to] = tp <= tq ? [r.p, r.q] : [r.q, r.p];
    const icon = trains++ < 6 ? trainIcon(y) : null;
    setTimeout(() => { if (g === gen) growLine(r, from, to, dur, icon, g); }, Math.max(tp, tq));
  }
}
function popDot(id, g) {
  const m = dot(id, 'new', fx, R0); m.setRadius(0);
  const t0 = performance.now();
  (function step(now) {
    if (g !== gen) return;
    const k = (now - t0) / 300;
    m.setRadius(k < .5 ? 18 * k : k < 1 ? 9 - 6 * (k - .5) : 6);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function growLine(r, from, to, dur, icon, g) {
  const A = L.latLng(ll(from)), B = L.latLng(ll(to));
  const halo = L.polyline([A, A], {renderer: R0, interactive: false, color: '#ffd54f', weight: 9, opacity: .65}).addTo(fx);
  const ln = L.polyline([A, A], {renderer: R0, interactive: false, color: CATS[r.cat].color, weight: 3.5}).addTo(fx);
  const mk = icon ? L.marker(A, {icon: L.divIcon({className: 'train', html: icon, iconSize: [20, 20]}), interactive: false}).addTo(fx) : null;
  const t0 = performance.now();
  (function step(now) {
    if (g !== gen) return;
    const k = Math.min(1, (now - t0) / dur), P = L.latLng(A.lat + (B.lat - A.lat) * k, A.lng + (B.lng - A.lng) * k);
    halo.setLatLngs([A, P]); ln.setLatLngs([A, P]); if (mk) mk.setLatLng(P);
    if (k < 1) requestAnimationFrame(step); else if (mk) fx.removeLayer(mk);
  })(t0);
}

// ---------- 背景（時代の色合い・空中写真） ----------
function background(y) {
  const t = clamp((1970 - y) / 90, 0, 1), c = pale.getContainer();
  if (c) c.style.filter = `sepia(${t}) saturate(${1 - .3 * t}) brightness(${1 - .06 * t})`;
  let note = '';
  const P = opt.bg === 'photo' ? PHOTOS.find(p => y >= p[0] && y <= p[1]) : null;
  if (P) {
    if (photoId !== P[2]) {
      if (photo) map.removeLayer(photo);
      photo = L.tileLayer(`https://cyberjapandata.gsi.go.jp/xyz/${P[2]}/{z}/{x}/{y}.jpg`, {
        maxZoom: 18, maxNativeZoom: P[2] === 'seamlessphoto' ? 18 : 17, minZoom: P[2] === 'seamlessphoto' ? 0 : 10
      }).addTo(map);
      photoId = P[2];
    }
    note = '空中写真：' + P[3] + (map.getZoom() < 10 && P[2] !== 'seamlessphoto' ? '（拡大すると表示）' : '');
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
  if (!EV[y]) return;
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
function card(id) {
  const s = S[id];
  const same = Object.values(S).filter(x => x !== s && x.o === s.o)
    .sort((a, b) => ((a.lat - s.lat) ** 2 + (a.lon - s.lon) ** 2) - ((b.lat - s.lat) ** 2 + (b.lon - s.lon) ** 2));
  const nb = reach(id, s.o).map(x => S[x].n);
  const ls = lines(s);
  return `<div class="cardS"><div class="cn">${esc(s.n)}</div><div class="cl">${esc(ls.join('・'))}${s.op ? '<br>' + esc(s.op) : ''}</div>
  <div>開業：<b>${fmtDate(s.od)}</b>（${era(s.o)}）</div>
  <div>${s.c ? `${s.c}年に廃止` : `今年で <b>${Y1 - s.o}歳</b>`}</div>
  ${nb.length ? `<div>開業時につながった駅：${esc(nb.join('・'))}</div>` : ''}
  <div>同じ年に開業：${same.length}駅${same.length ? '（' + esc(same.slice(0, 4).map(x => x.n).join('・')) + (same.length > 4 ? ' など' : '') + '）' : ''}</div>
  <div class="row" style="margin-top:6px"><button data-act="year" data-id="${id}">開業した年へ</button>
  ${ls.slice(0, 2).map(l => `<button data-act="story" data-line="${esc(l)}">📖 ${esc(l)}</button>`).join('')}</div></div>`;
}
map.on('popupopen', e => {
  e.popup.getElement().querySelectorAll('button[data-act]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.act === 'year') goStation(b.dataset.id, false);
      else { map.closePopup(); if (cmp.on) cmpEnd(); storyStart(b.dataset.line); }
    };
  });
});
function goStation(id, fly) {
  const s = S[id];
  stop(); $('slider').value = s.o; draw(s.o, false);
  if (fly) map.flyTo(ll(id), 13, {duration: 1.2});
  setTimeout(() => L.popup({maxWidth: 270}).setLatLng(ll(id)).setContent(card(id)).openOn(map), fly ? 1300 : 50);
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
  const all = Object.keys(S);
  let hit = all.filter(id => S[id].n === q || S[id].n === q + '駅');
  if (!hit.length) hit = all.filter(id => S[id].n.includes(q));
  if (!hit.length) { $('news').textContent = '「' + q + '」は見つかりませんでした'; return; }
  hit.sort((a, b) => S[a].o - S[b].o);
  goStation(hit[0], true);
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
  if (!Object.keys(S).length) return;
  stop(); map.closePopup(); Object.assign(quiz, {on: true, n: 0, score: 0});
  showCard('quiz'); qNext();
}
function qNext() {
  if (quiz.n >= TOTAL) return qEnd();
  quiz.n++; quiz.phase = 'ask';
  const pool = Object.keys(S).filter(id => S[id].c == null && stOn(S[id]));
  quiz.t = pool[Math.floor(Math.random() * pool.length)];
  const s = S[quiz.t];
  $('slider').value = Y1; draw(Y1, false);
  $('qHead').textContent = `第${quiz.n}問／全${TOTAL}問　この駅、何年生まれ？`;
  $('qScore').textContent = quiz.score + '点';
  $('qName').textContent = s.n; $('qLine').textContent = s.l;
  $('qSlider').value = 1930; qShowYear();
  $('qAsk').style.display = 'block'; $('qRes').innerHTML = ''; $('qNext').style.display = 'none';
  if (quiz.ring) map.removeLayer(quiz.ring);
  quiz.ring = L.marker(ll(quiz.t), {icon: L.divIcon({className: '', html: '<div class="pulse"></div>', iconSize: [30, 30]}), interactive: false}).addTo(map);
  map.flyTo(ll(quiz.t), 12, {duration: 1});
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
$('sGo').onclick = () => storyStart($('sLine').value.trim());
$('sLine').onkeydown = e => { if (e.key === 'Enter') $('sGo').onclick(); };
function storyStart(name) {
  if (!name) return;
  let ln = lineList.find(l => l === name) || lineList.find(l => l.includes(name)) || name;
  const ids = Object.keys(S).filter(id => lines(S[id]).includes(ln));
  if (ids.length < 2) { showCard('story'); $('sPick').style.display = 'block'; $('sMain').style.display = 'none'; $('sLine').value = name; $('sLine').placeholder = '見つかりませんでした'; return; }
  stop(); focus = ln;
  story.ids = ids;
  story.steps = [...new Set(ids.flatMap(id => S[id].c ? [S[id].o, S[id].c] : [S[id].o]))].filter(y => y >= Y0 && y <= Y1).sort((a, b) => a - b);
  showCard('story'); $('sPick').style.display = 'none'; $('sMain').style.display = 'block';
  $('sTitle').textContent = '📖 ' + ln;
  map.fitBounds(L.latLngBounds(ids.map(ll)).pad(0.15));
  setTimeout(() => storyGo(0, true), 700);
}
function storyGo(i, animate) {
  story.i = clamp(i, 0, story.steps.length - 1);
  const y = story.steps[story.i];
  $('slider').value = y; draw(y, animate);
  const op = story.ids.filter(id => S[id].o === y).sort((a, b) => S[a].od < S[b].od ? -1 : 1);
  const cl = story.ids.filter(id => S[id].c === y);
  let txt = `<b>${y}年（${era(y)}）</b>`;
  if (EV[y]) txt += `<br><span style="color:#6b5a44">${esc(EV[y])}</span>`;
  if (op.length) txt += `<br>${esc(op.map(id => S[id].n).join('・'))} が開業`;
  if (cl.length) txt += `<br>${esc(cl.map(id => S[id].n).join('・'))} が廃止`;
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
  for (const r of EI.values()) {
    if (!opt.cats[r.cat]) continue;
    if (present(r, y)) line(r, 'full', G, R);
    else if (opt.ghost && ghostAt(r, y)) line(r, 'ghost', G, R);
  }
  if (map.getZoom() >= 11) for (const id in S) if (isOpen(S[id], y) && stOn(S[id])) dot(id, 'normal', G, R);
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
async function start(useCache) {
  stop(); $('msg').style.display = 'block';
  $('msg').textContent = '駅データを読み込み中…（初回は数十秒かかることがあります）';
  try {
    S = await load(useCache);
    $('msg').textContent = '下ごしらえ中…';
    await new Promise(r => setTimeout(r, 30));
    prep();
    $('msg').style.display = 'none';
    draw(curYear(), false);
  } catch (e) {
    $('msg').innerHTML = '読み込みに失敗しました（' + esc(e.message) + '）。<button id="retry">もう一度</button>';
    $('retry').onclick = () => start(false);
  }
}
$('slider').max = Y1;
$('reload').onclick = () => start(false);
start(true);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js', {scope: './'}).catch(() => {});
