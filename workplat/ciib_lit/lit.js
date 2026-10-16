/* ciib_lit/lit.js — 文献：序号、星标优先级、简记+笔记、互相关联（横向）、关系网 Graph View */
(function(){
'use strict';
const {esc, uid, db, save} = CIIB;
const iso = () => new Date().toISOString();

const FIELDS = [
  {key:'title', label:'文献名称 *', full:true},
  {key:'authors', label:'作者', ph:'如 Waadt R, Schmidt LK…', full:true},
  {key:'year', label:'年份', type:'number'},
  {key:'journal', label:'期刊'},
  {key:'doi', label:'DOI / 链接', ph:'10.1111/tpj.… 或 https://…', full:true},
  {key:'tags', label:'标签（逗号分隔）', ph:'如 BiFC, 酵母, 信号转导', full:true},
  {key:'brief', label:'简记（卡片上展示的一句话）', ph:'一句话概括核心结论或用途', full:true},
  {key:'notes', label:'笔记（点开文献后查看全文）', type:'textarea', rows:5, ph:'结论、方法、可借鉴的点…', full:true}
];

/* 序号：一次性给老数据补号，新建文献取 max+1；删除后自动重排为 1..n（序号始终连续） */
function ensureNumbers(){
  let max = db.lit.reduce((m, r) => Math.max(m, r.no || 0), 0), changed = false;
  db.lit.forEach(r => { if (!r.no) { r.no = ++max; changed = true; } });
  if (changed) save();
}
/* 重排：按现有序号顺序压缩成 1、2、3…（删除文献后调用，避免序号留空档） */
function renumber(){
  db.lit.slice().sort((a, b) => (a.no || 0) - (b.no || 0)).forEach((r, i) => { r.no = i + 1; });
  save();
}
const nextNo = () => db.lit.reduce((m, r) => Math.max(m, r.no || 0), 0) + 1;
const starsHTML = (p, clickable) =>
  '<span class="stars"' + (clickable ? ' data-act="prio" title="点击调整优先级（0–3 星）"' : '') + '>' +
  '<span class="on">' + '★★★'.slice(0, p || 0) + '</span><span class="off">' + '★★★'.slice(0, 3 - (p || 0)) + '</span></span>';
const metaLine = r => esc((r.authors || '') + (r.year ? ' · ' + r.year : '') + (r.journal ? ' · ' + r.journal : ''));
const tagsOf = r => String(r.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
/* 圆点配色：0 星=青绿（无优先级），1→3 星由浅黄渐变到深橙 */
const NODE_FILL = ['#167c69', '#f0cf72', '#e8a13a', '#cf5c2a'];
const nodeFill = p => NODE_FILL[Math.max(0, Math.min(3, p || 0))];
const linksOf = r => (r.related || []).map(id => db.lit.find(x => x.id === id)).filter(Boolean);

/* ---------- 详情（点卡片 / 点圆点 / 双击圆点打开） ---------- */
/* 双击会连发 click + dblclick，若该篇详情已开着就不再叠一层（以 DOM 为准，避免状态残留） */
function openLit(rec, afterClose){
  if (!rec) return;
  if (document.querySelector('.modal[data-lit="' + rec.id + '"]')) return;
  litDetail(rec, afterClose);
}
function litDetail(rec, afterClose){
  const links = linksOf(rec);
  const doi = rec.doi || '';
  CIIB.modal((rec.no ? rec.no + '. ' : '') + rec.title,
    '<div class="lit-detail">' +
    '<p class="muted" style="margin:0 0 8px">' + metaLine(rec) + '</p>' +
    '<div class="rel-row" style="margin-bottom:6px">' + starsHTML(rec.prio || 0, false) +
    tagsOf(rec).map(t => '<span class="rel-chip" style="cursor:default">' + esc(t) + '</span>').join('') + '</div>' +
    (doi ? '<div class="lit-links">🔗 ' + (/^https?:/.test(doi) ? '<a href="' + esc(doi) + '" target="_blank" rel="noopener">' + esc(doi) + '</a>' : esc(doi)) + '</div>' : '') +
    (rec.brief ? '<h4 style="margin:14px 0 4px;font-size:13px">简记</h4><p class="lit-brief" style="margin:0">' + esc(rec.brief) + '</p>' : '') +
    (rec.notes ? '<h4 style="margin:14px 0 4px;font-size:13px">笔记</h4><p style="margin:0;white-space:pre-wrap">' + esc(rec.notes) + '</p>' : '') +
    (links.length ? '<h4 style="margin:14px 0 6px;font-size:13px">关联文献（' + links.length + '）</h4>' +
      '<div class="rel-row">' + links.map(l =>
        '<span class="rel-chip" data-open="' + l.id + '" title="点开查看">⇄ ' + esc((l.no ? l.no + '. ' : '') + l.title.slice(0, 24)) + '</span>').join('') + '</div>' : '') +
    '<div class="form-actions" style="margin-top:16px"><button type="button" data-act="edit2">✎ 编辑</button><button class="primary" type="button" data-act="closed">关闭</button></div></div>',
    (body, close) => {
      body.querySelector('[data-act="edit2"]').onclick = () => { close(); litForm(rec, false, afterClose); };
      body.querySelector('[data-act="closed"]').onclick = close;
      body.querySelectorAll('[data-open]').forEach(ch => ch.onclick = () => {
        const o = db.lit.find(x => x.id === ch.dataset.open);
        if (o) openLit(o, afterClose);
      });
    }, true);
  const all = document.querySelectorAll('.modal');
  if (all.length) all[all.length - 1].setAttribute('data-lit', rec.id);
}

/* ---------- 新建 / 编辑 ---------- */
function litForm(rec, isNew, after){
  const others = db.lit.filter(x => x.id !== rec.id);
  CIIB.modal(isNew ? '新建文献' : '编辑文献',
    '<form class="form-grid">' +
    FIELDS.map(f => { const v = rec[f.key] ?? '';
      if (f.type === 'textarea') return '<label class="field full"><span>' + esc(f.label) + '</span><textarea rows="' + f.rows + '" data-k="' + f.key + '">' + esc(v) + '</textarea></label>';
      if (f.type === 'number') return '<label class="field"><span>' + esc(f.label) + '</span><input type="number" data-k="' + f.key + '" value="' + esc(v) + '"></label>';
      return '<label class="field' + (f.full ? ' full' : '') + '"><span>' + esc(f.label) + '</span><input data-k="' + f.key + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '"></label>';
    }).join('') +
    '<div class="group full"><h4>优先级（1–3 星，卡片上可点击快速调整）</h4>' +
    '<div class="rel-row">' + [1, 2, 3].map(n =>
      '<label style="display:inline-flex;gap:5px;align-items:center;font-size:12.5px"><input type="radio" name="prio" value="' + n + '"' + ((rec.prio || 0) === n ? ' checked' : '') + '>' + '★'.repeat(n) + '</label>').join('') +
    '<label style="display:inline-flex;gap:5px;align-items:center;font-size:12.5px"><input type="radio" name="prio" value="0"' + (!rec.prio ? ' checked' : '') + '>无</label></div></div>' +
    '<div class="group full"><h4>关联文献（相互关联标记，保存后双向生效）</h4>' +
    (others.length ?
      '<input class="search" data-act="relq" placeholder="🔍 搜索文献名称或标签，筛选候选…" style="margin:0 0 6px;max-width:100%">' +
      '<p class="muted" style="margin:0 0 6px;font-size:11.5px">候选默认只展示最近编辑的前 5 篇；已勾选的文献始终显示。</p>' +
      '<div data-act="rellist" style="display:flex;flex-wrap:wrap;gap:8px"></div>'
      : '<p class="muted">暂无其他文献可关联。</p>') + '</div>' +
    '<div class="form-actions"><button type="button" data-act="cancel">取消</button><button class="primary" type="submit">保存</button></div></form>',
    (body, close) => {
      body.querySelector('[data-act="cancel"]').onclick = close;
      /* 关联候选：搜索名称/标签 + 最近编辑前 5 篇；已勾选的始终显示（sel 为选中状态源） */
      const relq = body.querySelector('[data-act="relq"]');
      const rellist = body.querySelector('[data-act="rellist"]');
      const sel = new Set(rec.related || []);
      if (rellist) {
        const relDraw = () => {
          const kw = (relq.value || '').trim().toLowerCase();
          const hit = o => !kw || String(o.title || '').toLowerCase().includes(kw) ||
            tagsOf(o).some(t => t.toLowerCase().includes(kw));
          const chip = o => '<label style="display:inline-flex;gap:5px;align-items:center;font-size:12.5px">' +
            '<input type="checkbox" data-rel="' + o.id + '"' + (sel.has(o.id) ? ' checked' : '') + '>' +
            esc((o.no ? o.no + '. ' : '') + o.title.slice(0, 30)) + '</label>';
          const checked = others.filter(o => sel.has(o.id));
          const cands = others.filter(o => !sel.has(o.id) && hit(o))
            .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')) || (b.no || 0) - (a.no || 0))
            .slice(0, 5);
          rellist.innerHTML = checked.map(chip).join('') + cands.map(chip).join('') ||
            '<p class="muted" style="margin:0">没有匹配的文献。</p>';
          rellist.querySelectorAll('[data-rel]').forEach(c => c.onchange = () => {
            if (c.checked) sel.add(c.dataset.rel); else sel.delete(c.dataset.rel);
            relDraw();
          });
        };
        relq.oninput = relDraw;
        relDraw();
      }
      body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const out = {...rec, id: rec.id || uid(), no: rec.no || nextNo(), updated: iso(), related: rec.related || []};
        body.querySelectorAll('[data-k]').forEach(i => out[i.dataset.k] = i.value);
        const pr = body.querySelector('input[name="prio"]:checked');
        out.prio = pr ? +pr.value : 0;
        if (!out.title || !out.title.trim()) { alert('请填写文献名称'); return; }
        if (rellist) body.querySelectorAll('[data-rel]').forEach(c => { if (c.checked) sel.add(c.dataset.rel); else sel.delete(c.dataset.rel); });
        const finalIds = others.filter(o => sel.has(o.id)).map(o => o.id);
        finalIds.forEach(id => {
          if (!(out.related || []).includes(id)) { const o = db.lit.find(x => x.id === id); o.related = o.related || []; o.related.push(out.id); }
        });
        (rec.related || []).forEach(id => {
          if (!sel.has(id)) { const o = db.lit.find(x => x.id === id); if (o) o.related = (o.related || []).filter(x => x !== out.id); }
        });
        out.related = finalIds;
        if (isNew) db.lit.unshift(out); else Object.assign(rec, out);
        save(); close(); (after || (() => {}))();
      };
    }, true);
}

/* ---------- 关系网：连通分量 + 力导向布局 ---------- */
function buildGraph(){
  const adj = new Map(db.lit.map(r => [r.id, (r.related || []).filter(id => db.lit.some(x => x.id === id))]));
  const seen = new Set(), comps = [];
  db.lit.forEach(r => {
    if (seen.has(r.id)) return;
    const comp = [], stack = [r.id];
    seen.add(r.id);
    while (stack.length) {
      const id = stack.pop(); comp.push(id);
      (adj.get(id) || []).forEach(x => { if (!seen.has(x)) { seen.add(x); stack.push(x); } });
    }
    comps.push(comp);
  });
  return {adj, clusters: comps.filter(c => c.length >= 2).sort((a, b) => b.length - a.length), lone: comps.filter(c => c.length === 1).length};
}
/* 参考坐标系：所有节点位置都存这里（与渲染尺寸解耦），拖动后持久化到 db.litPos */
const REF_W = 240, REF_H = 150;
const clampRef = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
function posOf(id){ const p = (db.litPos || {})[id]; return p ? {x: +p.x, y: +p.y} : null; }
function posSet(id, p){ if (!db.litPos) db.litPos = {}; db.litPos[id] = {x: +p.x.toFixed(2), y: +p.y.toFixed(2)}; }
function posClear(ids){ if (!db.litPos) return; ids.forEach(id => { delete db.litPos[id]; }); save(); }

function forceLayout(ids, adj){
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const P = ids.map((id, i) => {          // 已拖动过的节点固定在其保存位置，其余参与布局
    const p = posOf(id);
    if (p) return {x: clampRef(p.x, 6, REF_W - 6), y: clampRef(p.y, 6, REF_H - 6), fixed: true};
    const a = i / Math.max(1, n) * Math.PI * 2;
    return {x: REF_W / 2 + Math.cos(a) * 52, y: REF_H / 2 + Math.sin(a) * 38, fixed: false};
  });
  const edges = [];
  ids.forEach(id => (adj.get(id) || []).forEach(id2 => {
    const j = idx.get(id2);
    if (j !== undefined && j > idx.get(id)) edges.push([idx.get(id), j]);
  }));
  const REP = 7000, SPRING = .04, REST = 44;
  const move = (i, dx, dy) => { if (!P[i].fixed) { P[i].x += dx; P[i].y += dy; } };
  for (let t = 0; t < 260; t++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = dx * dx + dy * dy;
      if (d2 < 1e-6) { dx = .7; dy = .31; d2 = dx * dx + dy * dy; }
      const f = REP / d2, d = Math.sqrt(d2);
      dx = dx / d * f; dy = dy / d * f;
      move(i, dx, dy); move(j, -dx, -dy);
    }
    edges.forEach(([i, j]) => {
      let dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const f = (d - REST) * SPRING;
      dx = dx / d * f; dy = dy / d * f;
      move(i, dx, dy); move(j, -dx, -dy);
    });
    for (let i = 0; i < n; i++) if (!P[i].fixed) { P[i].x = clampRef(P[i].x, 14, REF_W - 14); P[i].y = clampRef(P[i].y, 14, REF_H - 14); }
  }
  return {P, edges};
}
function compSVG(ids, adj, W, H, opts){
  if (!db.litPos) db.litPos = {};
  const {P, edges} = forceLayout(ids, adj);
  const kx = W / REF_W, ky = H / REF_H;
  const pt = i => ({x: (P[i].x * kx).toFixed(1), y: (P[i].y * ky).toFixed(1)});
  let s = '';
  edges.forEach(([i, j]) => { const a = pt(i), b = pt(j);
    s += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
      '" stroke="#9db8b0" stroke-width="1.5" opacity=".8" data-a="' + esc(ids[i]) + '" data-b="' + esc(ids[j]) + '"/>'; });
  ids.forEach((id, i) => {
    const rec = db.lit.find(x => x.id === id) || {title: id}, p = pt(i);
    const rr = 5 + Math.min(7, (adj.get(id) || []).length * 1.6);
    let inner = '<circle cx="0" cy="0" r="' + rr.toFixed(1) + '" fill="' + nodeFill(rec.prio) +
      '" stroke="rgba(40,60,55,.18)" stroke-width="1"/>';
    if (opts.labels) inner += '<text x="0" y="' + (-rr - 6).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#31403b">' +
      esc((rec.no ? rec.no + '. ' : '') + String(rec.title).slice(0, 14) + (String(rec.title).length > 14 ? '…' : '')) + '</text>';
    s += '<g data-node="' + esc(id) + '" transform="translate(' + p.x + ',' + p.y + ')"' +
      (opts.clickable ? ' class="gnode"' : '') + '><title>' + esc(rec.title) +
      ((rec.prio || 0) > 0 ? '（' + '★'.repeat(rec.prio) + '）' : '') +
      (opts.clickable ? '（可拖动；双击打开详情）' : '') + '</title>' +
      inner + '</g>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:' + H + 'px;display:block;touch-action:none;user-select:none"><g class="zoomg">' + s + '</g></svg>';
}
const vbOf = svg => { const v = (svg.getAttribute('viewBox') || '0 0 ' + REF_W + ' ' + REF_H).split(/\s+/).map(Number); return {W: v[2] || REF_W, H: v[3] || REF_H}; };
/* 滚轮缩放：以鼠标位置为锚点，1–8 倍；缩回 1 倍时复位平移；放大后按住空白处拖动平移 */
function bindGraphZoom(svg){
  if (!svg || !svg.addEventListener || svg.__zoomBound) return;
  const g = svg.querySelector('.zoomg');
  if (!g) return;
  svg.__zoomBound = true;
  const {W, H} = vbOf(svg);
  const st = svg.__zoom = {k: 1, tx: 0, ty: 0};
  const clampPan = () => {          // 平移范围限制在内容仍与视口相交
    const mx = (st.k - 1) * W, my = (st.k - 1) * H;
    st.tx = Math.max(-mx, Math.min(mx, st.tx));
    st.ty = Math.max(-my, Math.min(my, st.ty));
  };
  const apply = () => {
    g.setAttribute('transform', 'translate(' + st.tx.toFixed(2) + ',' + st.ty.toFixed(2) + ') scale(' + st.k.toFixed(3) + ')');
    svg.style.cursor = st.k > 1 ? 'grab' : '';
  };
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const f = ev.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nk = Math.min(8, Math.max(1, st.k * f));
    if (nk === st.k) return;
    const p = svgPoint(svg, ev, W, H);
    const r = nk / st.k;
    st.tx = p.x - (p.x - st.tx) * r;
    st.ty = p.y - (p.y - st.ty) * r;
    st.k = nk;
    if (st.k === 1) { st.tx = 0; st.ty = 0; }
    clampPan();
    apply();
  }, {passive: false});
  /* 平移：仅 k>1 时，按住非节点的空白区域拖动 */
  let pan = null, panMoved = false, suppressClick = false;
  const onPanMove = ev => {
    if (!pan) return;
    const p = svgPoint(svg, ev, W, H);
    st.tx = pan.tx + (p.x - pan.px);
    st.ty = pan.ty + (p.y - pan.py);
    clampPan();
    if (Math.abs(ev.clientX - pan.cx) + Math.abs(ev.clientY - pan.cy) > 3) panMoved = true;
    if (panMoved && ev.cancelable) ev.preventDefault();
    apply();
  };
  const onPanUp = () => {
    if (!pan) return;
    pan = null;
    off();
    svg.classList.remove('panning');
    svg.style.cursor = st.k > 1 ? 'grab' : '';
    if (panMoved) suppressClick = true;   // 平移后吞掉紧随的 click，避免小卡片误触「放大整群」
    panMoved = false;
  };
  const off = () => {
    document.removeEventListener('pointermove', onPanMove);
    document.removeEventListener('pointerup', onPanUp);
    document.removeEventListener('pointercancel', onPanUp);
  };
  svg.addEventListener('pointerdown', ev => {
    if (st.k <= 1 || pan) return;
    const t = ev.target;
    if (t && t.closest && t.closest('[data-node]')) return;   // 节点上的按下交给节点拖动
    const p = svgPoint(svg, ev, W, H);
    pan = {px: p.x, py: p.y, tx: st.tx, ty: st.ty, cx: ev.clientX, cy: ev.clientY};
    panMoved = false;
    svg.classList.add('panning');
    svg.style.cursor = 'grabbing';
    document.addEventListener('pointermove', onPanMove);
    document.addEventListener('pointerup', onPanUp);
    document.addEventListener('pointercancel', onPanUp);
  });
  svg.addEventListener('click', ev => {
    if (suppressClick) { suppressClick = false; ev.stopPropagation(); ev.preventDefault(); }
  }, true);
}
/* 拖动：pointer 事件；位移 <4px 视为点击（保留点开详情），拖后 suppress 掉 click */
function svgPoint(svg, ev, W, H){
  try {
    if (typeof svg.getScreenCTM === 'function' && typeof svg.createSVGPoint === 'function') {
      const ctm = svg.getScreenCTM();
      if (ctm) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
        const q = p.matrixTransform(ctm.inverse()); return {x: q.x, y: q.y}; }
    }
  } catch(e){}
  const r = (typeof svg.getBoundingClientRect === 'function' && svg.getBoundingClientRect()) || {left: 0, top: 0, width: W, height: H};
  const s = Math.min((r.width || W) / W, (r.height || H) / H) || 1;
  const ox = ((r.width || W) - W * s) / 2, oy = ((r.height || H) - H * s) / 2;
  return {x: (ev.clientX - (r.left || 0) - ox) / s, y: (ev.clientY - (r.top || 0) - oy) / s};
}
function bindGraphDrag(svg, onDrop, onOpen){
  if (!svg || !svg.addEventListener) return;
  const {W, H} = vbOf(svg);
  const kx = W / REF_W, ky = H / REF_H;
  if (svg.__dragBound) return;
  svg.__dragBound = true;
  let cur = null, suppressClick = false;
  const svgXY = ev => svgPoint(svg, ev, W, H);
  /* 缩放后指针坐标要除回 zoom 变换，节点才能精确跟手 */
  const toLocal = p => { const z = svg.__zoom || {k: 1, tx: 0, ty: 0}; return {x: (p.x - z.tx) / z.k, y: (p.y - z.ty) / z.k}; };
  const setPos = (id, rx, ry) => {                 // rx/ry：参考坐标系
    const g = svg.querySelector('[data-node="' + id + '"]');
    if (g) g.setAttribute('transform', 'translate(' + (rx * kx).toFixed(1) + ',' + (ry * ky).toFixed(1) + ')');
    Array.prototype.forEach.call(svg.querySelectorAll('line[data-a]'), ln => {
      const isA = ln.getAttribute('data-a') === id, isB = ln.getAttribute('data-b') === id;
      if (!isA && !isB) return;
      const other = svg.querySelector('[data-node="' + (isA ? ln.getAttribute('data-b') : ln.getAttribute('data-a')) + '"]');
      if (!other) return;
      const tr = /translate\(([-\d.]+),([-\d.]+)\)/.exec(other.getAttribute('transform') || '');
      if (!tr) return;
      if (isA) { ln.setAttribute('x1', (rx * kx).toFixed(1)); ln.setAttribute('y1', (ry * ky).toFixed(1));
        ln.setAttribute('x2', tr[1]); ln.setAttribute('y2', tr[2]); }
      else { ln.setAttribute('x2', (rx * kx).toFixed(1)); ln.setAttribute('y2', (ry * ky).toFixed(1));
        ln.setAttribute('x1', tr[1]); ln.setAttribute('y1', tr[2]); }
    });
  };
  /* 注意（真实浏览器踩坑）：
     ① pointerdown 里绝不能 preventDefault —— Chrome/Edge 会据此不再派发兼容鼠标事件
        （mousedown/click/dblclick），表现就是「点了圆点没反应」；jsdom 不模拟该行为，测试发现不了。
     ② 不用 setPointerCapture —— 它会把 click 的目标重定向到 svg，导致外层委托以为点的是空白。
     改为在 document 上临时挂 move/up，拖出画布也能继续跟手。 */
  const onMove = ev => {
    if (!cur) return;
    const p = toLocal(svgXY(ev));
    cur.x = clampRef(p.x / kx, 8, REF_W - 8);
    cur.y = clampRef(p.y / ky, 8, REF_H - 8);
    if (Math.abs(p.x - cur.sx) + Math.abs(p.y - cur.sy) > 4) cur.moved = true;
    setPos(cur.id, cur.x, cur.y);
    if (ev.cancelable) ev.preventDefault();   // 只拦拖动过程，不动 click
  };
  const onUp = () => {
    if (!cur) return;
    const c = cur; cur = null;
    off();
    svg.classList.remove('dragging');
    if (c.moved) {                            // 拖动：记住位置，并吞掉紧随的 click
      posSet(c.id, {x: c.x, y: c.y}); save(); suppressClick = true; if (onDrop) onDrop(c.id);
    } else if (onOpen) {                      // 没移动 = 单击/双击：直接开详情（不依赖 click 事件）
      suppressClick = true;                   // 吞掉 click，避免卡片再弹出「放大」
      onOpen(c.id);
    }
  };
  const off = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  };
  svg.addEventListener('pointerdown', ev => {
    const t = ev.target;
    const g = t && t.closest ? t.closest('[data-node]') : null;
    if (!g) return;
    const p = toLocal(svgXY(ev));
    cur = {id: g.getAttribute('data-node'), sx: p.x, sy: p.y, x: p.x / kx, y: p.y / ky, moved: false};
    svg.classList.add('dragging');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
  // 拖动结束后紧随的 click 不应打开详情
  svg.addEventListener('click', ev => {
    if (suppressClick) { suppressClick = false; ev.stopPropagation(); ev.preventDefault(); }
  }, true);
  // 双击圆点 → 打开文献详情（单击也行；openLit 会去重，不会连开两层）
  svg.addEventListener('dblclick', ev => {
    const t = ev.target, g = t && t.closest ? t.closest('[data-node]') : null;
    if (!g) return;
    ev.preventDefault();
    if (onOpen) onOpen(g.getAttribute('data-node'));
  });
}
/* ---------- 群组持久化：按成员集合匹配，重命名/简记/笔记跟随群组 ---------- */
const gkey = ids => ids.slice().sort().join('|');
function syncGroups(clusters){
  if (!db.litGroups) db.litGroups = [];
  const map = new Map(db.litGroups.map(g => [gkey(g.members), g]));
  const taken = new Set();
  clusters.forEach(ids => {
    const k = gkey(ids);
    if (map.has(k)) { taken.add(k); return; }
    db.litGroups.push({id: uid(), name: '群组 ' + (db.litGroups.length + 1), brief: '', notes: '', members: ids.slice().sort()});
    taken.add(k);
  });
  db.litGroups = db.litGroups.filter(g => {
    if (taken.has(gkey(g.members))) return true;
    const custom = (g.name && !/^群组 \d+$/.test(g.name)) || g.brief || g.notes;
    if (!custom) return false; // 纯自动生成的失效群组直接清理
    let best = null, bestOv = 0;   // 有改名/备注的群组：重绑定到重叠最大的新簇
    clusters.forEach(ids => {
      const k = gkey(ids);
      if (taken.has(k)) return;
      const ov = ids.filter(id => g.members.includes(id)).length;
      if (ov > bestOv) { bestOv = ov; best = ids; }
    });
    if (best) { g.members = best.slice().sort(); taken.add(gkey(best)); return true; }
    return false;
  });
  save();
}
function groupForm(g, after){
  CIIB.modal('编辑群组',
    '<form class="form-grid">' +
    '<label class="field full"><span>群组名称 *</span><input data-k="name" value="' + esc(g.name) + '" placeholder="如 BiFC 方法簇"></label>' +
    '<label class="field full"><span>简记（群组卡片上展示的一句话）</span><input data-k="brief" value="' + esc(g.brief || '') + '" placeholder="这一簇文献的共同主题"></label>' +
    '<label class="field full"><span>笔记</span><textarea rows="4" data-k="notes">' + esc(g.notes || '') + '</textarea></label>' +
    '<p class="muted" style="margin:0">成员（' + g.members.length + ' 篇）由关联关系自动维护：' +
    g.members.map(id => { const r = db.lit.find(x => x.id === id); return r ? esc((r.no ? r.no + '. ' : '') + r.title.slice(0, 18)) : ''; }).filter(Boolean).join('、') + '</p>' +
    '<div class="form-actions"><button type="button" data-act="cancel">取消</button><button class="primary" type="submit">保存</button></div></form>',
    (body, close) => {
      body.querySelector('[data-act="cancel"]').onclick = close;
      body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        body.querySelectorAll('[data-k]').forEach(i => g[i.dataset.k] = i.value);
        if (!g.name || !g.name.trim()) g.name = '未命名群组';
        save(); close(); (after || (() => {}))();
      };
    }, true);
}
function clusterModal(g, adj, afterClose){
  let layer = 0;   // 展示层级：0=全部，n=按关联跳数展开 n 层
  const members = g.members;
  const degIn = id => (adj.get(id) || []).filter(x => members.includes(x)).length;
  /* 以群组内关联最多的文献为中心，按关联跳数（BFS）展开到第 n 层 */
  const subFor = n => {
    if (!n) return members.slice();
    const root = members.slice().sort((a, b) => degIn(b) - degIn(a))[0];
    const seen = new Set([root]);
    let frontier = [root];
    for (let d = 0; d < n && frontier.length; d++) {
      const next = [];
      frontier.forEach(id => (adj.get(id) || []).forEach(x => {
        if (members.includes(x) && !seen.has(x)) { seen.add(x); next.push(x); }
      }));
      frontier = next;
    }
    return members.filter(id => seen.has(id));
  };
  CIIB.modal(g.name + ' · ' + g.members.length + ' 篇',
    '<div class="lit-detail">' +
    (g.brief ? '<h4 style="margin:0 0 4px;font-size:13px">简记</h4><p class="lit-brief" style="margin:0">' + esc(g.brief) + '</p>' : '') +
    (g.notes ? '<h4 style="margin:12px 0 4px;font-size:13px">笔记</h4><p style="margin:0;white-space:pre-wrap">' + esc(g.notes) + '</p>' : '') +
    '<h4 style="margin:12px 0 6px;font-size:13px">成员（' + g.members.length + ' 篇）</h4>' +
    '<div class="rel-row">' + g.members.map(id => { const r = db.lit.find(x => x.id === id); return r ?
      '<span class="rel-chip" data-open="' + r.id + '" title="点开查看">' + esc((r.no ? r.no + '. ' : '') + r.title.slice(0, 22)) + '</span>' : ''; }).filter(Boolean).join('') + '</div>' +
    '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 4px">' +
    '<h4 style="margin:0;font-size:13px">图谱（圆点可拖动，滚轮缩放，单击/双击圆点查看文献详情）</h4>' +
    '<label style="display:inline-flex;gap:5px;align-items:center;font-size:12px;margin-left:auto">展示层级' +
    '<select data-act="layers" style="font-size:12px;padding:2px 6px;border:1px solid var(--line);border-radius:6px">' +
    '<option value="0">全部关联</option><option value="1">1 层（直接关联）</option>' +
    '<option value="2">2 层</option><option value="3">3 层</option></select></label></div>' +
    '<div data-act="biggraph"></div>' +
    '<p class="muted" style="margin:4px 0 0;font-size:11.5px">层级以本群关联最多的文献为中心、按关联跳数展开；滚轮在图上缩放（1–8 倍）。</p>' +
    '<div class="form-actions" style="margin-top:12px"><button type="button" data-act="resetlayout">⟲ 重置布局</button>' +
    '<button type="button" data-act="gname2">✎ 重命名 / 简记 / 笔记</button><button class="primary" type="button" data-act="closed">关闭</button></div></div>',
    (body, close) => {
      body.querySelector('[data-act="closed"]').onclick = close;
      body.querySelector('[data-act="gname2"]').onclick = () => groupForm(g, afterClose);
      const wrap = body.querySelector('[data-act="biggraph"]');
      const drawGraph = () => {
        const sub = subFor(layer);
        wrap.innerHTML = sub.length >= 2 ? compSVG(sub, adj, 620, 340, {clickable: true, labels: true}) :
          '<p class="muted" style="margin:20px 0;text-align:center">该层级下没有可展示的互相关联。</p>';
        const svg = wrap.querySelector('svg');
        if (svg) {
          bindGraphDrag(svg, null, id => { const rec = db.lit.find(x => x.id === id); if (rec) openLit(rec, afterClose); });
          bindGraphZoom(svg);
        }
      };
      drawGraph();
      body.querySelector('[data-act="layers"]').onchange = e => { layer = +e.target.value; drawGraph(); };
      body.querySelector('[data-act="resetlayout"]').onclick = () => { posClear(g.members); drawGraph(); };
      /* 兜底：jsdom 等只派发 click 的环境也能点圆点开详情（真机由 bindGraphDrag 的 onOpen 处理） */
      wrap.onclick = e => {
        const t = e.target, g2 = t && t.closest ? t.closest('[data-node]') : null;
        const id = g2 ? g2.getAttribute('data-node') : (t.getAttribute ? t.getAttribute('data-node') : null);
        if (!id) return;
        const rec = db.lit.find(x => x.id === id);
        if (rec) openLit(rec, afterClose);
      };
      body.querySelectorAll('[data-open]').forEach(ch => ch.onclick = () => {
        const o = db.lit.find(x => x.id === ch.dataset.open);
        if (o) litDetail(o, afterClose);
      });
    }, true);
}

/* ---------- 子页：笔记（原列表视图） ---------- */
function notesTab(pane, rerender){
  let q = '', tag = '';
  /* 排序：no = 创建序号（新建时分配、删除后自动重排，即创建时间顺序） */
  const sortSel = pane.querySelector('[data-act="sort"]');
  sortSel.value = litSort;
  sortSel.onchange = e => { litSort = e.target.value; draw(); };
  const SORTS = {
    no:  (a, b) => (a.no || 0) - (b.no || 0),
    new: (a, b) => (b.no || 0) - (a.no || 0),
    old: (a, b) => (a.no || 0) - (b.no || 0),
    phi: (a, b) => ((b.prio || 0) - (a.prio || 0)) || ((b.no || 0) - (a.no || 0)),
    plo: (a, b) => ((a.prio || 0) - (b.prio || 0)) || ((a.no || 0) - (b.no || 0))
  };
  function draw(){
    const tags = [...new Set(db.lit.flatMap(r => tagsOf(r)))].sort();
    const tagbar = pane.querySelector('[data-act="tagbar"]');
    tagbar.innerHTML = tags.map(t => '<label><input type="radio" name="tagf"' + (t === tag ? ' checked' : '') + ' data-tag="' + esc(t) + '"><span class="dot" style="background:#167c69"></span>' + esc(t) + '</label>').join('')
      + (tag ? '<button class="chip" data-act="cleartag">清除筛选 ✕</button>' : '');
    tagbar.querySelectorAll('[data-tag]').forEach(rb => rb.onchange = () => { tag = rb.dataset.tag; draw(); });
    const ct = tagbar.querySelector('[data-act="cleartag"]');
    if (ct) ct.onclick = () => { tag = ''; draw(); };
    const kw = q.toLowerCase();
    const vis = db.lit.filter(r => (!tag || tagsOf(r).includes(tag)) && (!kw || JSON.stringify(r).toLowerCase().includes(kw)))
      .slice().sort(SORTS[litSort] || SORTS.no);
    const list = pane.querySelector('[data-act="list"]');
    list.innerHTML = vis.map(r => {
      const links = linksOf(r);
      const doi = r.doi || '';
      return '<article class="card lit-card" data-id="' + r.id + '"><div class="section-head"><h3>' + (r.no ? r.no + '. ' : '') + esc(r.title) + '</h3>' +
        '<span>' + starsHTML(r.prio || 0, true) + ' <button class="text-button" data-act="edit">编辑</button> <button class="text-button danger" data-act="del">删除</button></span></div>' +
        '<p class="muted" style="margin:0">' + metaLine(r) + '</p>' +
        (tagsOf(r).length ? '<div class="tags">' + tagsOf(r).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') +
        (doi ? '<div class="lit-links">🔗 ' + (/^https?:/.test(doi) ? '<a href="' + esc(doi) + '" target="_blank" rel="noopener">' + esc(doi.slice(0, 60)) + '</a>' : esc(doi)) + '</div>' : '') +
        (links.length ? '<div class="lit-links rel-row"><span>⇄ 关联：</span>' + links.map(l =>
          '<span class="rel-chip" data-open="' + l.id + '" title="点开查看">⇄ ' + esc((l.no ? l.no + '. ' : '') + l.title.slice(0, 24)) + '</span>').join('') + '</div>' : '') +
        (r.brief ? '<p class="lit-brief">' + esc(r.brief) + '</p>' : '') +
        '</article>';
    }).join('') || '<div class="empty"><span>❧</span><p>还没有文献记录。</p></div>';
  }
  pane.querySelector('[data-act="q"]').oninput = e => { q = e.target.value; draw(); };
  pane.querySelector('[data-act="list"]').onclick = e => {
    const card = e.target.closest('.card'); if (!card) return;
    const rec = db.lit.find(r => r.id === card.dataset.id); if (!rec) return;
    // 星标/按钮可能点击在子元素上，用 closest 找到带 data-act 的目标
    const actEl = e.target.closest('[data-act]');
    const act = actEl ? actEl.dataset.act : undefined;
    if (act === 'edit') { litForm(rec, false, () => { notesTab(pane, rerender); }); return; }
    if (act === 'prio') { rec.prio = ((rec.prio || 0) + 1) % 4; save(); draw(); return; }
    if (act === 'del') {
      if (confirm('删除文献「' + rec.title + '」？')) {
        (rec.related || []).forEach(id => { const o = db.lit.find(x => x.id === id); if (o) o.related = (o.related || []).filter(x => x !== rec.id); });
        db.lit = db.lit.filter(x => x.id !== rec.id); posClear([rec.id]); renumber(); draw();
      }
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) { const o = db.lit.find(x => x.id === open.dataset.open); if (o) litDetail(o, () => { notesTab(pane, rerender); }); return; }
    litDetail(rec, () => { notesTab(pane, rerender); });
  };
  draw();
}

/* ---------- 子页：关系网 ---------- */
function graphTab(pane, rerender){
  ensureNumbers();
  const {adj, clusters, lone} = buildGraph();
  syncGroups(clusters);
  const groupOf = ids => db.litGroups.find(g => gkey(g.members) === gkey(ids)) || {name: '未命名群组', brief: '', notes: '', members: ids.slice().sort()};
  pane.innerHTML =
    '<div class="page-head" style="margin-bottom:10px"><div><h1>关系网</h1><p>全部互相关联的文献按连通性自动聚成小群；圆点可直接拖动排布（位置会自动记住），点 ✎ 重命名群组、写简记与笔记，点击卡片放大查看细节。</p>' +
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--mut);margin-top:6px">' +
    '<span>圆点颜色 = 优先级：</span>' +
    [['#167c69', '无星'], ['#f0cf72', '★'], ['#e8a13a', '★★'], ['#cf5c2a', '★★★']].map(c =>
      '<span style="display:inline-flex;gap:4px;align-items:center"><i style="width:9px;height:9px;border-radius:50%;display:inline-block;background:' +
      c[0] + '"></i>' + c[1] + '</span>').join('') + '</div></div></div>' +
    (clusters.length ? '<div class="card-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">' +
      clusters.map((ids, i) => {
        const g = groupOf(ids);
        return '<article class="card graph-card" data-ci="' + i + '"><div class="section-head"><h3>' + esc(g.name) + ' · ' + ids.length + ' 篇</h3>' +
          '<span><button class="text-button" data-act="greset" title="重置该群组布局">⟲</button>' +
          '<button class="text-button" data-act="gname" title="重命名 / 简记 / 笔记">✎</button></span></div>' +
          (g.brief ? '<p class="lit-brief">' + esc(g.brief) + '</p>' : '') +
          compSVG(ids, adj, 280, 170, {clickable: true, labels: false}) +
          '<p class="muted" style="margin:4px 0 0;font-size:11.5px">圆点可拖动，滚轮缩放，放大后按住空白可平移；单击 / 双击圆点看详情，点击空白放大整群</p></article>';
      }).join('') + '</div>'
      : '<div class="empty"><span>◉</span><p>还没有互相关联的文献。在「笔记」里编辑文献、勾选「关联文献」后，这里会自动聚成小群。</p></div>') +
    (lone ? '<p class="muted" style="margin-top:10px">另有 ' + lone + ' 篇文献暂未参与任何关联，未在图中显示。</p>' : '');
  pane.querySelectorAll('.graph-card svg').forEach(svg => {
    bindGraphDrag(svg, null, id => { const rec = db.lit.find(x => x.id === id); if (rec) openLit(rec, () => graphTab(pane, rerender)); });
    bindGraphZoom(svg);
  });
  pane.querySelectorAll('.graph-card').forEach(card => card.onclick = e => {
    const ids = clusters[+card.dataset.ci];
    if (!ids) return;
    const g = db.litGroups.find(x => gkey(x.members) === gkey(ids)) || groupOf(ids);
    const actEl = e.target.closest ? e.target.closest('[data-act]') : null;
    const act = actEl ? actEl.dataset.act : null;
    if (act === 'gname') { groupForm(g, () => graphTab(pane, rerender)); return; }
    if (act === 'greset') { posClear(ids); graphTab(pane, rerender); return; }
    const node = e.target.closest ? e.target.closest('[data-node]') : null;
    const nid = node ? node.getAttribute('data-node') : (e.target.getAttribute ? e.target.getAttribute('data-node') : null);
    if (nid) { const rec = db.lit.find(x => x.id === nid); if (rec) { openLit(rec, () => { graphTab(pane, rerender); }); return; } }
    clusterModal(g, adj, () => { graphTab(pane, rerender); });
  });
}

/* ---------- 页面（子模块：笔记 / 关系网） ---------- */
let litTab = 0, litSort = 'no';
CIIB.pages.lit = {
  title: '文献',
  render(m, rerender){
    ensureNumbers();
    m.innerHTML = '<div class="page-head"><div><h1>文献</h1><p>序号、星标优先级、简记 + 笔记；互相关联可在「关系网」里看图谱。</p></div>' +
      '<button class="primary" data-act="new">＋ 新建文献</button></div>' +
      '<div class="tabs"><button class="chip" data-tab="0">笔记</button><button class="chip" data-tab="1">关系网</button></div>' +
      '<div data-act="pane"></div>';
    const pane = m.querySelector('[data-act="pane"]');
    const tabs = m.querySelectorAll('[data-tab]');
    const show = i => {
      litTab = i;
      tabs.forEach(x => x.classList.toggle('active', +x.dataset.tab === i));
      if (i === 0) {
        pane.innerHTML = '<div class="filter-bar" data-act="tagbar"></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<input class="search" placeholder="搜索标题、作者、标签、简记、笔记…" data-act="q" style="flex:1 1 260px">' +
          '<label style="display:inline-flex;gap:6px;align-items:center;font-size:12.5px;color:#5a6b80;white-space:nowrap">排序' +
          '<select data-act="sort" style="height:34px;padding:0 6px">' +
          '<option value="no">按编号（默认）</option>' +
          '<option value="new">创建时间 · 新→旧</option>' +
          '<option value="old">创建时间 · 旧→新</option>' +
          '<option value="phi">优先级 · 高→低</option>' +
          '<option value="plo">优先级 · 低→高</option>' +
          '</select></label></div>' +
          '<div class="card-grid" data-act="list" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))"></div>';
        notesTab(pane, rerender);
      } else graphTab(pane, rerender);
    };
    tabs.forEach(b => b.onclick = () => show(+b.dataset.tab));
    // 顶部「新建文献」按钮在关系网视图下切回笔记视图打开表单
    m.querySelector('[data-act="new"]').onclick = () => { show(0); litForm({id: uid(), related: []}, true, () => { show(0); }); };
    show(litTab);
  }
};
/* 暴露给主页联合检索：点结果直接打开文献详情（openLit 自带去重） */
CIIB.openLit = openLit;
})();
