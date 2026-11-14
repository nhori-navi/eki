# 国土数値情報（鉄道時系列）から首都圏の線路・駅データ（rails.json）を作る
import json, re, sys, math, collections
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

D = sys.argv[1]; OUT = sys.argv[2]
B = (138.6, 34.85, 140.95, 36.3)
KX = math.cos(math.radians(35.7)) * 111320; KY = 110574
xy = lambda c: (c[0] * KX, c[1] * KY)
ll = lambda p: (p[1] / KY, p[0] / KX)
inb = lambda c: B[0] <= c[0] <= B[2] and B[1] <= c[1] <= B[3]

def yr(v):
    try:
        v = int(v)
        return None if v in (999, 9999) or v < 1800 else v
    except Exception:
        return None

def cat(p):
    t, co, nm = p['N05_001'], p['N05_003'] or '', p['N05_002'] or ''
    y4 = yr(p['N05_004']) or 0
    if t == '1': return 'shin'
    if t == '2': return 'jr'
    if co in ('帝都高速度交通営団', '東京地下鉄'): return 'sub'
    if co in ('東京都', '横浜市') and ('号線' in nm or (nm in ('浅草線', '三田線', '新宿線', '大江戸線') and y4 >= 1960)): return 'sub'
    if '懸垂' in nm: return 'pvt'
    if t == '3': return 'tram'
    if nm in ('世田谷線', '玉川線', '砧線') or nm == '小田原市内線': return 'tram'
    return 'pvt'

skip = lambda p: bool(re.search(r'系統$|無軌条', p['N05_002'] or ''))
LF = [f for f in json.load(open(D + 'N05-25_RailroadSection2.geojson', encoding='utf-8'))['features']
      if any(inb(c) for c in f['geometry']['coordinates']) and not skip(f['properties'])]
SF = [f for f in json.load(open(D + 'N05-25_Station2.geojson', encoding='utf-8'))['features']
      if inb(f['geometry']['coordinates']) and not skip(f['properties'])]

# ---- 路線（関係ID）ごとの名前 ----
rinfo = collections.defaultdict(list)  # code -> [(b, name, company, cat)]
for f in LF:
    p = f['properties']
    rinfo[p['N05_006'][5:]].append((yr(p['N05_005b']) or 0, p['N05_002'], p['N05_003'], cat(p), yr(p['N05_004']) or 0))
names_cnt = collections.Counter()
latest = {}
for code, v in rinfo.items():
    v.sort(); latest[code] = v[-1]; names_cnt[v[-1][1]] += 1
def short(co):
    co = re.sub(r'（旧国鉄）|株式会社', '', co or '')
    return {'東日本旅客鉄道': 'JR東日本', '東海旅客鉄道': 'JR東海', '帝都高速度交通営団': '営団', '東京地下鉄': '東京メトロ', '東京都': '都営', '横浜市': '横浜市営', '日本国有鉄道': '国鉄'}.get(co, co)
def label(code):
    _, nm, co, c, _ = latest[code]
    if names_cnt[nm] > 1 or re.fullmatch(r'\d+号線|本線|鉄道線|鋼索線|ケーブルカー', nm):
        return f'{short(co)} {nm}'
    return nm
codes = sorted(rinfo)
LINES = [label(c) for c in codes]
LIDX = {c: i for i, c in enumerate(codes)}

# ---- 駅（駅ID単位） ----
st = {}
for f in SF:
    p = f['properties']; sid = p['N05_006']
    o = yr(p['N05_004']); b = yr(p['N05_005b']); e = p['N05_005e']
    if o is None: o = b if b and b != 1950 else None
    if o is None: continue
    e = None if str(e) == '9999' else yr(e)
    r = st.get(sid)
    c = f['geometry']['coordinates']
    if not r:
        st[sid] = r = {'id': sid, 'name': p['N05_011'], 'xy': xy(c), 'code': sid[5:10], 'o': o, 'e': e, 'cur': e is None, 'b': b or 0, 'cat': cat(p)}
    else:
        r['o'] = min(r['o'], o)
        if e is None: r['cur'] = True
        elif r['e'] is None or e > r['e']: r['e'] = e
        if (b or 0) > r['b']: r['xy'] = xy(c); r['b'] = b or 0   # 新しい位置を使う
TK = next(c for c in codes if latest[c][1] == '東海道線' and '東日本' in latest[c][2])
for r in st.values():
    if r['name'] == '東京' and r['code'] == TK[:5]: r['o'] = max(r['o'], 1914)
# 初代新橋駅（1872〜1914年、のちの汐留駅）を追加
st['X_SHIMBASHI0'] = {'id': 'X_SHIMBASHI0', 'name': '新橋駅（初代）', 'xy': xy((139.7616, 35.6650)), 'code': TK[:5], 'o': 1872, 'e': 1914, 'cur': False, 'b': 0, 'cat': 'jr'}
by_code = collections.defaultdict(list)
for r in st.values():
    if not r['id'].startswith('X_'): by_code[r['code']].append(r)

# ---- 線路を駅で区切る ----
pieces = []
def node_key(pt):
    return 'n%d_%d' % (round(pt[0] / 15), round(pt[1] / 15))
for f in LF:
    p = f['properties']; code = p['N05_006'][5:]
    b = yr(p['N05_005b']); e = p['N05_005e']; e = None if str(e) == '9999' else yr(e)
    y4 = yr(p['N05_004']) or b or 1950
    line = LineString([xy(c) for c in f['geometry']['coordinates']])
    if line.length < 1: continue
    cuts = []
    for s in by_code.get(code[:5], []):
        se = None if s['cur'] else s['e']
        if s['o'] > (e or 9999) or (se is not None and b and se < b): continue
        pt = Point(s['xy'])
        if line.distance(pt) < 60: cuts.append((line.project(pt), s['id']))
    cuts.sort()
    stops = [(0.0, None)] + [c for c in cuts if 1 < c[0] < line.length - 1] + [(line.length, None)]
    # 端に駅がある場合は端点を駅として扱う
    ends = [c for c in cuts if c[0] <= 1 or c[0] >= line.length - 1]
    for c in ends:
        if c[0] <= 1: stops[0] = (0.0, c[1])
        else: stops[-1] = (line.length, c[1])
    for (d0, a), (d1, z) in zip(stops, stops[1:]):
        if d1 - d0 < 1: continue
        seg = line if (d0 == 0 and d1 == line.length) else substring(line, d0, d1) if False else None
        from shapely.ops import substring
        seg = substring(line, d0, d1)
        A = a or node_key(seg.coords[0]); Z = z or node_key(seg.coords[-1])
        pieces.append({'code': code, 'b': b, 'e': e, 'y4': y4, 'cat': cat(p), 'g': seg, 'A': A, 'Z': Z})
print('pieces', len(pieces), file=sys.stderr)

# ---- 区間ごとの開業年（取り除くと分かれる両側の、それぞれ一番古い駅の開業年の遅い方） ----
groups = collections.defaultdict(list)
for i, pc in enumerate(pieces): groups[(pc['code'], pc['b'], pc['e'])].append(i)
for key, idx in groups.items():
    adj = collections.defaultdict(list)
    for i in idx:
        adj[pieces[i]['A']].append(i); adj[pieces[i]['Z']].append(i)
    syear = lambda n: st[n]['o'] if n in st else None
    for i in idx:
        A, Z = pieces[i]['A'], pieces[i]['Z']
        seen = {A}; q = [A]
        while q:
            n = q.pop()
            for j in adj[n]:
                if j == i: continue
                for m in (pieces[j]['A'], pieces[j]['Z']):
                    if m not in seen: seen.add(m); q.append(m)
        if Z in seen:  # 輪になっている
            ys = [y for y in (syear(A), syear(Z)) if y]
            py = max(ys) if ys else pieces[i]['y4']
        else:
            other = set(n for j in idx for n in (pieces[j]['A'], pieces[j]['Z'])) - seen
            ya = [syear(n) for n in seen if syear(n)]; yz = [syear(n) for n in other if syear(n)]
            mins = [min(v) for v in (ya, yz) if v]
            py = max(mins) if mins else pieces[i]['y4']
        ends = [y for y in (syear(A), syear(Z)) if y]
        if len(ends) == 1: py = max(py, ends[0])  # 片側が駅でない端のときは、駅の開業年より前にしない
        py = max(py, pieces[i]['y4'])
        b = pieces[i]['b']
        if b and b > 1950: start = max(py, b)
        elif b == 1950: start = min(py, 1950)
        else: start = py
        pieces[i]['s'] = start

# ---- 手直し：新橋〜横浜（1872年）の区間 ----
nm = lambda n: st[n]['name'] if n in st else None
early = {'品川', '田町', '浜松町'}
for pc in pieces:
    if pc['code'] == TK and nm(pc['A']) in early and nm(pc['Z']) in early: pc['s'] = min(pc['s'], 1872)
hm = next(r for r in st.values() if r['name'] == '浜松町' and r['code'] == TK[:5])
pieces.append({'code': TK, 'b': None, 'e': 1914, 'y4': 1872, 'cat': 'jr', 's': 1872, 'A': hm['id'], 'Z': 'X_SHIMBASHI0',
               'g': LineString([hm['xy'], xy((139.7600, 35.6610)), xy((139.7616, 35.6650))])})
geoms = None
# ---- 本当の開業か（直前の年に近くに線路がない）、本当の廃止か（直後の年に近くに線路がない） ----
geoms = [pc['g'] for pc in pieces]
tree = STRtree(geoms)
def covered(pc, year):
    mid = pc['g'].interpolate(0.5, normalized=True)
    for j in tree.query(mid.buffer(25)):
        q = pieces[j]
        if q is pc: continue
        if q['s'] <= year and (q['e'] is None or year <= q['e']) and q['g'].distance(mid) < 25: return True
    return False
for pc in pieces:
    pc['o'] = 0 if covered(pc, pc['s'] - 1) else 1
    pc['gh'] = 1 if (pc['e'] is not None and not covered(pc, pc['e'] + 1)) else 0

# ---- 駅を名前と距離でまとめる（乗換駅は1つに） ----
recs = sorted(st.values(), key=lambda r: r['o'])
clusters = []
by_name = collections.defaultdict(list)
for r in recs:
    hit = None
    for ci in by_name[r['name']]:
        cx, cy = clusters[ci]['xy']
        if math.hypot(cx - r['xy'][0], cy - r['xy'][1]) < 450: hit = ci; break
    if hit is None:
        hit = len(clusters); by_name[r['name']].append(hit)
        clusters.append({'name': r['name'], 'xy': r['xy'], 'cats': [], 'lines': [], 'o': r['o'], 'c': None, 'cur': False, 'ids': []})
    c = clusters[hit]
    c['ids'].append(r['id']); c['o'] = min(c['o'], r['o'])
    if r['cat'] not in c['cats']: c['cats'].append(r['cat'])
    c['lines'].append([LIDX.get(r['code'] + '', LIDX.get(next((k for k in codes if k.startswith(r['code'])), ''), -1)), r['o']])
    if r['cur']: c['cur'] = True
    elif c['c'] is None or r['e'] + 1 > c['c']: c['c'] = r['e'] + 1
cl_of = {sid: i for i, c in enumerate(clusters) for sid in c['ids']}

# ---- 書き出し ----
ORDER = ['shin', 'sub', 'tram', 'jr', 'pvt']
def enc(seg):
    s = seg.simplify(4)
    out = []; px = py = 0
    for x, y in s.coords:
        la, lo = ll((x, y)); a, b = round(la * 1e5), round(lo * 1e5)
        out += [a - px, b - py]; px, py = a, b
    return out
P = []
for pc in pieces:
    lidx = LIDX.get(pc['code'], -1)
    P.append([ORDER.index(pc['cat']), pc['s'], pc['e'] or 0, pc['o'] | (pc['gh'] << 1), lidx,
              cl_of.get(pc['A'], -1), cl_of.get(pc['Z'], -1), enc(pc['g'])])
S = []
for c in clusters:
    la, lo = ll(c['xy'])
    first = {}
    for l, o in c['lines']:
        if l >= 0 and (l not in first or o < first[l]): first[l] = o
    lines = sorted(first.items(), key=lambda t: t[1])
    S.append([c['name'] if '駅' in c['name'] else c['name'] + '駅', round(la, 5), round(lo, 5), ''.join(str(ORDER.index(k)) for k in c['cats']), c['o'], 0 if c['cur'] else (c['c'] or 0), [list(t) for t in lines]])
json.dump({'v': 1, 'src': '国土数値情報（鉄道時系列）N05-25', 'L': LINES, 'S': S, 'P': P}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('stations', len(S), 'pieces', len(P), file=sys.stderr)
