import re,sys
root=sys.argv[1]   # site root
def rd(p): return open(p,encoding='utf-8',newline='').read()
def wr(p,s): open(p,'w',encoding='utf-8',newline='').write(s)
# index.html
p=root+'/index.html'; s=rd(p); nl='\r\n' if '\r\n' in s else '\n'
if 'id="fp-btn"' not in s:
    anchor='          <button id="legend-btn" onclick="toggleLegend()" title="Map legend">'
    assert s.count(anchor)==1
    block=nl.join([
'          <!-- First-person view toggle (js/navfp.js): top-angled view by default; this camera button',
'               switches to walking the Pathways with a joystick, and back. -->',
'          <button id="fp-btn" title="First-person view" aria-label="First-person view">',
'            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
'              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>',
'              <circle cx="12" cy="13" r="4"/>',
'            </svg>',
'          </button>',
'          <div id="fp-hint" class="fp-hint fp-hint-hidden">Joystick to walk · drag to look around</div>',
'          <div id="fp-joy" class="fp-joy"><div id="fp-joy-nub" class="fp-joy-nub"></div></div>',
'',''])
    s=s.replace(anchor,block+anchor)
tag='<script defer src="js/navfp.js"></script>'
if tag not in s:
    a='<script defer src="js/main.js"></script>'
    assert s.count(a)==1
    s=s.replace(a,a+nl+tag)
wr(p,s)
# style.css
p=root+'/style.css'; c=rd(p)
if '#fp-btn' not in c:
    snip=open(sys.argv[2],encoding='utf-8').read()
    if '\r\n' in c: snip=snip.replace('\n','\r\n')
    if not c.endswith('\n'): c+=('\r\n' if '\r\n' in c else '\n')
    c+=snip
    wr(p,c)
# service worker
p=root+'/service-worker.js'; w=rd(p); n2='\r\n' if '\r\n' in w else '\n'
if 'navfp' not in w:
    a="  './js/main.js',"+n2
    assert w.count(a)==1
    w=w.replace(a,a+"  './js/navfp.js',"+n2)
m=re.search(r"prmsu-digitwin-v(\d+)\.(\d+)",w)
w=w.replace(m.group(0),f"prmsu-digitwin-v{m.group(1)}.{int(m.group(2))+1}",1)
wr(p,w); print(re.search(r"CACHE_NAME = '[^']+'",w).group(0))
