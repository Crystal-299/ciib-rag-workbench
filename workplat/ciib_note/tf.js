/* ciib_note/tf.js — 遗传转化：转化方案记录 + iOS 风格多事件日历（方案时间自动同步到日历） */
(function(){
'use strict';
const {esc, uid, db, save, formModal, PALETTE, addDays} = CIIB;
const iso = () => new Date().toISOString();

const STAGE_DEFAULTS = ['预培养','侵染','共培养','筛选','继代','生根','驯化','移栽'];
const dDiff = (a, b) => (a && b ? Math.round((Date.parse(a) - Date.parse(b)) / 86400000) : 0);
function defaultStages(){
  const t = CIIB.today(), c = PALETTE.slice();
  return [
    {name:'预培养', start:t, days:3, color:c[0]},
    {name:'共培养', start:addDays(t, 3), days:3, color:c[1]},
    {name:'筛选', start:addDays(t, 6), days:14, color:c[3]}
  ];
}
/* 单个字段 → HTML。未填过时用 def 兜底（如 OD600=0.2、侵染时间=10 min），仍可随意改 */
function fieldHTML(f, rec){
  const raw = rec[f.key];
  const v = (raw === undefined || raw === null || raw === '') ? (f.def ?? '') : raw;
  if (f.type === 'textarea') return '<label class="field full"><span>' + esc(f.label) + '</span><textarea rows="' + f.rows + '" data-k="' + f.key + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea></label>';
  if (f.type === 'select') return '<label class="field"><span>' + esc(f.label) + '</span><select data-k="' + f.key + '">' + f.options.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></label>';
  /* datalist：下拉里选现成的，也可以直接敲自定义的（存的就是输入框里的真实值） */
  if (f.type === 'datalist') return '<label class="field"><span>' + esc(f.label) + '</span><input list="dl-' + f.key + '" data-k="' + f.key + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '可下拉选择，也可自行输入') + '"><datalist id="dl-' + f.key + '">' + (f.options || []).map(o => '<option value="' + esc(o) + '">').join('') + '</datalist></label>';
  return '<label class="field"><span>' + esc(f.label) + '</span><input data-k="' + f.key + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '"></label>';
}
const SCHEME_FIELDS = () => [
  {key:'name', label:'方案名称 *', ph:'如 Sample-p1300-GeneA 转化'},
  {key:'cultivar', label:'品种名', ph:'如 S65'},
  {key:'traits', label:'品种特征', type:'textarea', rows:2, ph:'如 早熟、感受性高、组培再生周期 6 周', full:true},
  /* 侵染条件与菌株、筛选剂同排：菌株 | OD600 | 侵染时间 | 筛选剂（中间两框窄，挤在原有两框之间） */
  {type:'row', cls:'inf4', items:[
    {key:'strain', type:'datalist', label:'农杆菌菌株', options:['EHA105','LBA4404','GV3101','AGL1','EH105','C58C1','MP90'], ph:'下拉选现成的，或自己输入'},
    {key:'od600', label:'OD600', def:'0.2', ph:'0.2'},
    {key:'infection', label:'侵染时间', def:'10 min', ph:'10 min'},
    {key:'selection', label:'筛选剂/抗性', ph:'如 Hyg 30 mg/L + Cef 200 mg/L'}
  ]},
  {key:'notes', label:'备注', type:'textarea', rows:2, full:true}
];

/* ---------- 转化方案列表 ---------- */
function schemeList(pane, rerender){
  function schemeForm(rec, isNew){
    const stages = (rec.stages || defaultStages()).map(s => ({...s}));
    const baseFields = SCHEME_FIELDS();
    CIIB.modal(isNew ? '新建转化方案' : '编辑转化方案',
      '<form class="form-grid">' +
      baseFields.map(f => f.type === 'row'
        ? '<div class="field-row ' + (f.cls || '') + '">' + f.items.map(x => fieldHTML(x, rec)).join('') + '</div>'
        : fieldHTML(f, rec)).join('') +
      '<div class="group full"><h4>转化阶段（各阶段可单独设颜色，保存后自动同步到日历） <button type="button" class="chip" data-act="addstage">＋ 添加阶段</button></h4>' +
      '<p class="muted" style="margin:-6px 0 8px">新阶段默认紧接上一阶段结束开始；修改某阶段的「开始日期」或「天数」后，<b>后面的阶段会自动顺延</b>（保存前仍可单独微调）。阶段名与已保存方案里的相同（如 预培养/共培养）时，<b>颜色自动保持一致</b>。</p>' +
      '<div class="row-list" data-act="stages"></div></div>' +
      '<div class="form-actions"><button type="button" data-act="cancel">取消</button><button class="primary" type="submit">保存方案</button></div></form>',
      (body, close) => {
        const box = body.querySelector('[data-act="stages"]');
        /* 已保存方案里的阶段名 → 颜色（同名阶段颜色保持一致），datalist 候选 = 已保存名 + 常用默认 */
        const savedStage = {};
        db.schemes.forEach(sc => (sc.stages || []).forEach(s => {
          const k = String(s.name || '').trim();
          if (k && !savedStage[k]) savedStage[k] = s.color;
        }));
        stages.forEach(s => { const k = String(s.name || '').trim(); if (k && !savedStage[k]) savedStage[k] = s.color; });
        const dlOpts = () => {
          const seen = new Set(), opts = [];
          const push = n => { if (n && !seen.has(n)) { seen.add(n); opts.push('<option value="' + esc(n) + '">'); } };
          Object.keys(savedStage).forEach(push); STAGE_DEFAULTS.forEach(push);
          return opts.join('');
        };
        const drawStages = () => {
          box.innerHTML = stages.map((s, i) =>
            '<div class="row-item" style="grid-template-columns:1.2fr 1.4fr .7fr 52px auto">' +
            '<input data-i="' + i + '" data-f="name" value="' + esc(s.name) + '" list="stagedl" placeholder="阶段名">' +
            '<input type="date" data-i="' + i + '" data-f="start" value="' + esc(s.start) + '">' +
            '<input type="number" min="1" data-i="' + i + '" data-f="days" value="' + esc(s.days) + '" title="持续天数">' +
            '<input type="color" data-i="' + i + '" data-f="color" value="' + esc(s.color) + '">' +
            '<button type="button" class="text-button danger" data-act="rm" data-i="' + i + '">✕</button></div>').join('') +
            '<datalist id="stagedl">' + dlOpts() + '</datalist>';
        };
        drawStages();
        // 阶段编辑：更新数据 + 后续阶段自动顺延（input 只改数据不打断输入，change 后重绘显示结果）
        const applyStageEdit = e => {
          const i = +e.target.dataset.i, f = e.target.dataset.f;
          if (f === undefined || !stages[i]) return;
          if (f === 'name') { stages[i].name = e.target.value; return; }
          if (f === 'color') { stages[i].color = e.target.value; return; }
          if (f === 'start') {
            const v = e.target.value; if (!v) return;
            const delta = dDiff(v, stages[i].start);
            stages[i].start = v;
            if (delta) for (let j = i + 1; j < stages.length; j++) stages[j].start = addDays(stages[j].start, delta);
          } else if (f === 'days') {
            const old = stages[i].days;
            stages[i].days = Math.max(1, +e.target.value || 1);
            const delta = stages[i].days - old;
            if (delta) for (let j = i + 1; j < stages.length; j++) stages[j].start = addDays(stages[j].start, delta);
          }
        };
        box.oninput = applyStageEdit;
        box.onchange = e => {
          applyStageEdit(e);
          /* 阶段名与已保存方案同名 → 颜色自动一致 */
          if (e.target.dataset.f === 'name') {
            const c = savedStage[String(e.target.value || '').trim()];
            if (c) stages[+e.target.dataset.i].color = c;
          }
          drawStages();
        };
        box.onclick = e => { if (e.target.dataset.act === 'rm') { stages.splice(+e.target.dataset.i, 1); drawStages(); } };
        body.querySelector('[data-act="addstage"]').onclick = () => {
          const last = stages[stages.length - 1];
          stages.push({name:'新阶段', start: last ? addDays(last.start, last.days) : CIIB.today(), days: 3, color: PALETTE[stages.length % PALETTE.length]});
          drawStages();
        };
        body.querySelector('[data-act="cancel"]').onclick = close;
        body.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const out = {...rec, id: rec.id || uid(), updated: iso(), stages: stages.filter(s => s.name && s.start)};
          body.querySelectorAll('[data-k]').forEach(inp => out[inp.dataset.k] = inp.value);
          if (!out.name || !out.name.trim()) { alert('请填写方案名称'); return; }
          if (isNew) db.schemes.unshift(out); else Object.assign(rec, out);
          save(); close(); draw();
        };
      }, true);
  }
  let q = '';
  /* 已展开的卡片 id（默认全部收起，避免阶段多的方案把卡片撑到无限长；仅本次会话记忆） */
  const expanded = new Set();
  const BRIEF_MAX = 6;   /* 收起时最多显示几个阶段徽标，其余折成「+N」 */
  function cardHTML(r, drag){
    const open = expanded.has(r.id);
    const stages = r.stages || [];
    const lastSt = stages[stages.length - 1];
    const span = stages.length > 1 ? esc(stages[0].start) + ' → ' + esc(addDays(lastSt.start, Math.max(1, +lastSt.days || 1) - 1)) : '';
    const kv = [
      r.strain ? '<span class="k">菌株</span><span>' + esc(r.strain) + '</span>' : '',
      r.od600 ? '<span class="k">OD600</span><span>' + esc(r.od600) + '</span>' : '',
      r.infection ? '<span class="k">侵染时间</span><span>' + esc(r.infection) + '</span>' : '',
      r.selection ? '<span class="k">筛选</span><span>' + esc(r.selection) + '</span>' : ''
    ].join('');
    /* 收起态徽标：把「连续同名」的阶段并成一个徽标（例：筛选×5 → 「筛选 ×5」）。
       同名但不相邻的（筛选 … 生根 … 筛选）不合并，仍各占一个，避免语义被误并。 */
    const groups = [];
    stages.forEach(s => {
      const g = groups[groups.length - 1];
      if (g && g.name === s.name) g.n++; else groups.push({name: s.name, color: s.color, n: 1});
    });
    const chipG = g => '<span class="sb"><i style="background:' + esc(g.color) + '"></i>' + esc(g.name) + (g.n > 1 ? ' ×' + g.n : '') + '</span>';
    const shown = groups.slice(0, BRIEF_MAX);
    const brief = shown.map(chipG).join('') + (groups.length > shown.length ? '<span class="sb more">+' + (groups.length - shown.length) + '</span>' : '');
    return '<article class="card sch-card' + (open ? ' open' : '') + '" data-id="' + esc(r.id) + '"' +
      (drag ? ' draggable="true"' : '') + '>' +
      '<div class="section-head sch-head" data-act="fold" title="' + (open ? '收起' : '展开') + '全部阶段与备注">' +
        '<h3>' + esc(r.name) + '</h3>' +
        '<span class="tags"><span>' + esc(r.cultivar || '品种未填') + '</span></span>' +
      '</div>' +
      (kv ? '<div class="kv">' + kv + '</div>' : '') +
      (r.traits ? '<p class="muted sch-line">品种特征：' + esc(r.traits) + '</p>' : '') +
      '<hr class="hr">' +
      '<div class="sch-lab muted">阶段（同步到日历）' + (stages.length ? '：共 ' + stages.length + ' 个' + (span ? ' · ' + span : '') : '：尚未添加') + '</div>' +
      (stages.length ? '<div class="stage-brief">' + brief + '</div>' : '') +
      '<div class="stage-full">' + stages.map(s => '<div class="kv"><span class="k"><span style="display:inline-block;width:10px;height:10px;border-radius:99px;background:' + esc(s.color) + '"></span> ' + esc(s.name) + '</span><span>' + esc(s.start) + ' 起 ' + s.days + ' 天（至 ' + addDays(s.start, s.days - 1) + '）</span></div>').join('') + '</div>' +
      (r.notes ? '<p class="muted sch-line">备注：' + esc(r.notes) + '</p>' : '') +
      '<div class="card-bottom"><small>更新于 ' + (r.updated ? r.updated.slice(0, 10) : '尚未保存') + '</small>' +
      '<span><button class="text-button sch-fold" data-act="fold">' + (open ? '收起 ▴' : '展开 ▾') + '</button> ' +
      '<button class="text-button" data-act="edit">编辑</button> <button class="text-button danger" data-act="del">删除</button></span></div></article>';
  }
  function draw(){
    const kw = q.trim().toLowerCase();
    const vis = db.schemes.filter(r => !kw || JSON.stringify(r).toLowerCase().includes(kw));
    /* 拖动排序只在「未搜索」时开启：过滤状态下卡片不是全集，拖出来的顺序没法回写 */
    const canDrag = !kw;
    pane.innerHTML = '<div class="page-head"><div><h1>转化方案</h1><p>记录每次转化的品种与各阶段时间（预培养/共培养/筛选等），保存后自动同步到「日历」；卡片默认收起，点标题或「展开」看全部阶段，按住卡片拖动可调整顺序</p></div>' +
      '<button class="primary" data-act="new">＋ 新建转化方案</button></div>' +
      '<input class="search" placeholder="搜索方案、品种、备注…" data-act="q" value="' + esc(q) + '">' +
      (kw ? '<p class="muted sort-hint">搜索过滤中暂不能拖动排序，清空搜索后可调整顺序。</p>' : '') +
      '<div class="card-grid sch-grid">' + (vis.map(r => cardHTML(r, canDrag)).join('') ||
        '<div class="empty"><span>❋</span><p>还没有转化方案，点击右上角新建。</p></div>') + '</div>';
    pane.querySelector('[data-act="q"]').oninput = e => { q = e.target.value; draw(); };
    pane.querySelector('[data-act="new"]').onclick = () => schemeForm({id: uid()}, true);
    const grid = pane.querySelector('.card-grid');
    grid.onclick = e => {
      const card = e.target.closest('.card'); if (!card) return;
      const rec = db.schemes.find(r => r.id === card.dataset.id); if (!rec) return;
      const hit = e.target.closest('[data-act]');
      const act = hit ? hit.dataset.act : '';
      if (act === 'fold') { if (expanded.has(rec.id)) expanded.delete(rec.id); else expanded.add(rec.id); draw(); return; }
      if (act === 'edit') schemeForm(rec, false);
      if (act === 'del') { if (confirm('删除转化方案「' + rec.name + '」？其日历事件会一并消失。')) { db.schemes = db.schemes.filter(x => x.id !== rec.id); expanded.delete(rec.id); save(); draw(); } }
    };
    /* ---- 拖动排序 ---- */
    if (!canDrag) return;
    let dragId = null;
    const commit = () => {
      /* 按松手时的 DOM 顺序回写 db.schemes；没进 DOM 的（理论上不会有）保持原先相对次序追加在后 */
      const order = [...grid.querySelectorAll('.card')].map(c => c.dataset.id);
      const byId = new Map(db.schemes.map(s => [s.id, s]));
      const next = order.map(id => byId.get(id)).filter(Boolean);
      db.schemes.forEach(s => { if (order.indexOf(s.id) < 0) next.push(s); });
      db.schemes = next;
      dragId = null;
      save(); draw();
    };
    grid.addEventListener('dragstart', e => {
      const card = e.target.closest('.card'); if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('dragging');
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {} }
    });
    grid.addEventListener('dragover', e => {
      if (!dragId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const over = e.target.closest('.card'); if (!over) return;
      const cur = grid.querySelector('.sch-card.dragging'); if (!cur || over === cur) return;
      const list = [...grid.querySelectorAll('.card')];
      const r = over.getBoundingClientRect();
      /* 有布局时按落点过半判定；无布局（测试环境）时退回「向下拖插后面、向上拖插前面」 */
      const after = r.height > 0 ? (e.clientY - r.top > r.height / 2) : (list.indexOf(cur) < list.indexOf(over));
      grid.insertBefore(cur, after ? over.nextSibling : over);
    });
    grid.addEventListener('drop', e => { if (dragId) { e.preventDefault(); commit(); } });
    grid.addEventListener('dragend', () => { if (dragId) { dragId = null; draw(); } });   /* 拖出网格外松手 → 还原 */
  }
  draw();
}

/* ---------- iOS 风格日历 ---------- */
let calYM = null; // {y, m(0-11)}
let calFilter = {hide: {}, q: ''};
/* 已展开的「周」（key = 年-月:周序）。默认全部收起，只记本次会话。
   与「转化方案」卡片的展开状态互不影响 —— 一个折叠泳道、一个折叠卡片正文。 */
const calExpand = new Set();
function derivedEvents(){
  const evts = [];
  db.schemes.forEach(sc => (sc.stages || []).forEach((s, i) => evts.push({
    id: sc.id + ':' + i, schemeId: sc.id, name: sc.name, stage: s.name, start: s.start, days: s.days, color: s.color})));
  db.events.forEach(e => evts.push({id: 'ev:' + e.id, name: e.name, stage: '', start: e.start, days: e.days, color: e.color}));
  return evts;
}
function calendarView(pane, rerender){
  const now = new Date();
  if (!calYM) calYM = {y: now.getFullYear(), m: now.getMonth()};
  function render(){
    const evts = derivedEvents().filter(e => !calFilter.hide[e.name] && (!calFilter.q || (e.name + ' ' + e.stage).toLowerCase().includes(calFilter.q.toLowerCase())));
    const {y, m} = calYM;
    const first = new Date(y, m, 1), startDow = first.getDay(), dim = new Date(y, m + 1, 0).getDate();
    // 整月按周分组（补齐首尾为 null），事件渲染为跨列连续条
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const tk = CIIB.today();
    const keyOf = d => y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const MAX_LANES = 4;
    let grid = '';
    weeks.forEach((wdays, wi) => {
      const wkKey = y + '-' + m + ':' + wi;
      const open = calExpand.has(wkKey);
      const wf = wdays.find(d => d !== null), wl = [...wdays].reverse().find(d => d !== null);
      const wStart = keyOf(wf), wEnd = keyOf(wl);
      // 计算每个事件在本周的连续区段
      const segs = evts.map(e => {
        const en = addDays(e.start, e.days - 1);
        const segStart = e.start > wStart ? e.start : wStart;
        const segEnd = en < wEnd ? en : wEnd;
        if (segStart > segEnd) return null;
        const cs = wdays.indexOf(+segStart.slice(8, 10)), ce = wdays.indexOf(+segEnd.slice(8, 10));
        if (cs < 0 || ce < 0) return null;
        return {...e, segStart, cs, ce};
      }).filter(Boolean).sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : (a.segStart < b.segStart ? -1 : 1));
      // 贪心分配泳道
      const laneEnd = [];
      segs.forEach(s => {
        let L = laneEnd.findIndex(le => le < s.segStart);
        if (L < 0) { L = laneEnd.length; laneEnd.push(s.segEnd); } else laneEnd[L] = s.segEnd;
        s.lane = L;
      });
      grid += '<div class="cal-week">';
      wdays.forEach(d => {
        if (d === null) { grid += '<div class="cal-wcell dim"></div>'; return; }
        const key = keyOf(d);
        grid += '<div class="cal-wcell' + (key === tk ? ' today' : '') + '"><span class="dnum">' + d + '</span></div>';
      });
      /* 单周泳道上限：收起时只画前 MAX_LANES 行，展开时全画；
         「还有 N 项 / 收起」按钮始终排在所有可见泳道的下一行。 */
      const laneCap = open ? Infinity : MAX_LANES;
      const maxLane = segs.length ? segs.reduce((mx, s) => Math.max(mx, s.lane), 0) : -1;
      const overflow = segs.filter(s => s.lane >= MAX_LANES).length;
      segs.forEach(s => {
        if (s.lane >= laneCap) return;
        const cont = s.cs > 0 && s.segStart !== s.start;
        grid += '<div class="cal-bar" style="grid-column:' + (s.cs + 1) + '/' + (s.ce + 2) + ';grid-row:' + (s.lane + 2) + ';background:' + esc(s.color) +
          '" title="' + esc(s.name + (s.stage ? ' · ' + s.stage : '') + '（' + s.start + ' 起 ' + s.days + ' 天）') + '">' +
          esc((cont ? '…' : '') + (s.stage ? s.stage + '｜' + s.name : s.name)) + '</div>';
      });
      if (overflow) {
        const shownMax = open ? maxLane : MAX_LANES - 1;
        grid += '<div class="cal-bar more can" data-act="calmore" data-wk="' + esc(wkKey) + '"' +
          ' style="grid-column:1/8;grid-row:' + (shownMax + 3) + '" title="' + (open ? '收起本行' : '展开本行全部 ' + segs.length + ' 项') + '">' +
          (open ? '收起本行 ▴' : '还有 ' + overflow + ' 项未显示 ▾') + '</div>';
      }
      grid += '</div>';
    });
    // 事件清单（按名称分组，供筛选）
    const byName = {};
    derivedEvents().forEach(e => { (byName[e.name] = byName[e.name] || []).push(e); });
    const names = Object.keys(byName).sort();
    pane.innerHTML =
      '<div class="page-head"><div><h1>遗传转化日历</h1><p>多事件同屏、按颜色与名称筛选；转化方案中的阶段时间保存后自动出现。</p></div>' +
      '<div class="toolbar" style="margin:0"><button data-act="addevt">＋ 自定义事件</button></div></div>' +
      '<div class="filter-bar"><input style="max-width:220px" placeholder="按事件/阶段名筛选…" data-act="q" value="' + esc(calFilter.q) + '">' +
      names.map(n => { const e0 = byName[n][0];
        return '<label><input type="checkbox"' + (calFilter.hide[n] ? '' : ' checked') + ' data-name="' + esc(n) + '"><span class="dot" style="background:' + esc(e0.color) + '"></span>' + esc(n) + '</label>'; }).join('') +
      '</div>' +
      '<div class="cal-head"><button data-act="prev">‹</button><h2>' + y + ' 年 ' + (m + 1) + ' 月</h2><button data-act="next">›</button>' +
      '<button data-act="today">今天</button></div>' +
      '<div class="cal-grid">' + ['日','一','二','三','四','五','六'].map(d => '<div class="dow">' + d + '</div>').join('') + grid + '</div>' +
      '<p class="muted" style="margin-top:10px">同一方案的连续阶段在日历上显示为一条贯通的色条（跨周自动折行，前缀 … 表示接续上周）；同周最多并排 4 行，超出折叠为「还有 N 项未显示」—— 点它可单独展开/收起这一周。</p>';
    pane.querySelector('[data-act="prev"]').onclick = () => { calYM.m--; if (calYM.m < 0) { calYM.m = 11; calYM.y--; } render(); };
    pane.querySelector('[data-act="next"]').onclick = () => { calYM.m++; if (calYM.m > 11) { calYM.m = 0; calYM.y++; } render(); };
    pane.querySelector('[data-act="today"]').onclick = () => { const t = new Date(); calYM = {y: t.getFullYear(), m: t.getMonth()}; render(); };
    pane.querySelector('[data-act="q"]').oninput = e => { calFilter.q = e.target.value; render(); pane.querySelector('[data-act="q"]').focus(); };
    /* 按周展开 / 收起：事件委托到整个网格，点「还有 N 项未显示」或「收起本行」触发 */
    pane.querySelector('.cal-grid').onclick = e => {
      const t = e.target.closest('[data-act="calmore"]'); if (!t) return;
      const k = t.dataset.wk;
      if (calExpand.has(k)) calExpand.delete(k); else calExpand.add(k);
      render();
    };
    pane.querySelector('[data-act="addevt"]').onclick = () => formModal('添加自定义事件', [
      {key:'name', label:'事件名称 *'}, {key:'start', label:'开始日期', type:'date', def: CIIB.today()},
      {key:'days', label:'持续天数', type:'number', def: 1},
      {key:'color', label:'颜色', type:'color', def: PALETTE[5]}], {id: uid()}, v => {
      db.events.push({...v, days: Math.max(1, +v.days || 1)}); save(); render();
    });
    pane.querySelectorAll('[data-name]').forEach(cb => cb.onchange = () => {
      if (!cb.checked) calFilter.hide[cb.dataset.name] = true; else delete calFilter.hide[cb.dataset.name];
      render();
    });
  }
  render();
}

/* ---------- 页面 ---------- */
let activeTab = 0; // 记住当前所在标签页，切走再切回不重置
CIIB.pages.tf = {
  title: '遗传转化',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>遗传转化</h1><p>转化方案记录 + 多事件日历（方案时间自动同步）</p></div></div>' +
      '<div class="tabs"><button class="chip" data-tab="0">转化方案</button><button class="chip" data-tab="1">日历</button></div>' +
      '<div data-act="pane"></div>';
    const pane = m.querySelector('[data-act="pane"]');
    const tabs = m.querySelectorAll('[data-tab]');
    const show = i => {
      activeTab = i;
      tabs.forEach(x => x.classList.toggle('active', +x.dataset.tab === i));
      i === 0 ? schemeList(pane, rerender) : calendarView(pane, rerender);
    };
    tabs.forEach(b => b.onclick = () => show(+b.dataset.tab));
    show(activeTab);
  }
};
})();
