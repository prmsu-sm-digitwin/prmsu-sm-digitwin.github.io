#!/usr/bin/env python3
"""Dev check for data/campus.json (not part of the app, not cached).

Run after editing waypoints:   python3 tools/check_routes.py
It tries every route between the routable places (and from the Main Gate) and reports
  1. places that cannot be reached,
  2. routes that run past a point and double back (a U-turn spike), which happens when a
     waypoint sits ON a road but is joined to it only by a short side branch. Fix: make the road
     run through that waypoint (road A-B with waypoint S on it becomes A-S and S-B).
"""
import json, math, heapq, itertools, sys, os
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'data', 'campus.json')
d = json.load(open(path, encoding='utf-8'))
w = {x['id']: x for x in d['waypoints']}
adj = {k: set() for k in w}
for k, x in w.items():
    for n in x.get('neighbors', []):
        if n in w: adj[k].add(n); adj[n].add(k)
P = lambda i: (w[i]['position']['x'], w[i]['position']['z'])
def route(s, t):
    dist = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        dd, u = heapq.heappop(pq)
        if u == t: break
        if dd > dist[u]: continue
        for v in adj[u]:
            nd = dd + math.dist(P(u), P(v))
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    if t not in dist: return None
    p = [t]
    while p[-1] != s: p.append(prev[p[-1]])
    return p[::-1]
def spikes(p):
    out = []
    for i in range(1, len(p) - 1):
        a, b, c = P(p[i-1]), P(p[i]), P(p[i+1])
        v1 = (b[0]-a[0], b[1]-a[1]); v2 = (c[0]-b[0], c[1]-b[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if l1 < 2 or l2 < 2: continue
        if (v1[0]*v2[0] + v1[1]*v2[1]) / (l1*l2) < -0.9: out.append((p[i-1], p[i], p[i+1]))
    return out
linked = {'main_gate'}; st = ['main_gate']
while st:
    u = st.pop()
    for v in adj[u]:
        if v not in linked: linked.add(v); st.append(v)
blds = [b for b in d['buildings'] if b.get('entryWaypoint') in w]
unreachable = [b['id'] for b in blds if b['entryWaypoint'] not in linked]
print('waypoints', len(w), 'paths', sum(len(a) for a in adj.values()) // 2)
print('places that cannot be reached from the Main Gate:', unreachable or 'none')
routable = [b for b in blds if b['entryWaypoint'] in linked]
found = {}
pairs = list(itertools.permutations(routable, 2)) + [({'entryWaypoint': 'main_gate', 'id': 'main_gate'}, b) for b in routable]
for a, b in pairs:
    p = route(a['entryWaypoint'], b['entryWaypoint'])
    if not p: continue
    for sp in spikes(p): found.setdefault(sp, []).append((a['id'], b['id']))
print('routes checked:', len(pairs), '| double-back spots:', len(found))
for sp, rs in sorted(found.items(), key=lambda x: -len(x[1])):
    print('  ', ' -> '.join(sp), '| e.g.', rs[0][0], 'to', rs[0][1], '| seen in', len(rs), 'routes')
