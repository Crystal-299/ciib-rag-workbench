/* ciib-ro/ro.js — 科研总览（工作台内嵌页面）+ 与工作台之间的数据桥
   完整界面在 ciib-ro/ro.html。它自带 :root / body / button 等全局样式与自己的
   弹窗、抽屉、toast，直接并进主站会互相污染，所以用一个 iframe 做样式与事件隔离。

   数据分两层，职责明确：
   ① 科研总览自己的数据（项目 / 研究问题 / 节点 / 结论 / 假设 / 证据 / 内容清单）
      存在独立 key（ciib_ro_proto:v3），由本页维护。
   ② 工作台的记录（实验记录 / 文献 / 知识库 / 待办 / 分子实验 / 载体 / 转化）是
      **唯一事实来源**：本桥把它们的标题、完成态、更新时间整理成索引推进 iframe，
      供「来源选择」「全部内容」实时引用；iframe 只能读，改不了工作台记录。
      反过来，iframe 点「打开原记录」时回传 {模块, 记录 id}，这里切页并定位。

   入口：工作台左上角 ciib Logo（main.js 里 .brand/#brandBtn）。
   配色：本页没有自己的开关，跟随主工作台 —— 这里把主站当前配色用 postMessage
   推进 iframe（加载时一次 + 主站每次切换时一次）。

   单文件版：build-standalone.cjs 会注入 window.__RO_HTML__（整页 HTML 字符串），
   这里优先用 srcdoc 内联，避免离线打开时 iframe 取不到文件。 */
(function(){
'use strict';
let frame = null;

function themeNow(){
  return document.documentElement.classList.contains('theme-ink') ? 'ink' : 'mint';
}
function pushTheme(){
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({type:'ciib-ro-theme', theme: themeNow()}, '*');
  }
}
/* main.js 在配色切换后调用 */
CIIB.roTheme = pushTheme;

/* ==========================================================================
   一、记录索引：工作台 → 科研总览
   每个模块一项：{k:模块键, n:名称, note:说明, items:[{id,title,state,date,sub}]}
   state 只表达该模块自己的「完成态」（完成 / 进行中 / 待处理），没有完成态概念的
   模块留空（界面上显示 —），不另造一套状态。
   ========================================================================== */
const d10 = s => String(s || '').slice(0, 10);
const EXP_STATE   = st => st === '完成' ? '已完成' : (st === '执行' || st === '进行中' ? '进行中' : '待处理');
const BUILD_STATE = st => st === '已完成' ? '已完成' : (st === '构建中' ? '进行中' : '待处理');
const IDEA_STATE  = st => (st === '已验证' || st === '已归档') ? '已完成' : '待处理';
/* 转化方案：按各阶段日期落位 —— 全部没开始=待处理，进行中=进行中，全跑完=已完成 */
function schemeState(sc, today){
  const st = (sc.stages || []).filter(s => s && s.start);
  if (!st.length) return '待处理';
  const end = s => CIIB.addDays(s.start, Math.max(1, +s.days || 1) - 1);
  if (st.some(s => s.start <= today && today <= end(s))) return '进行中';
  return st.every(s => end(s) < today) ? '已完成' : '待处理';
}

CIIB.roIndex = function(){
  const d = CIIB.db, today = CIIB.today();
  const it = (id, title, state, date, sub) =>
    ({id, title: String(title || '未命名'), state: state || '', date: d10(date), sub: sub || ''});
  const items = (arr, mk) => (arr || []).map(mk);
  return [
    {k:'exp', n:'实验记录', items: []
      .concat(items(d.exps,     r => it(r.id, r.name || r.title, EXP_STATE(r.stage), r.updated, '实验链路')))
      .concat(items(d.trouble,  r => it(r.id, r.title || r.symptom, '', r.updated, '排障库')))
      .concat(items(d.protocols, r => it(r.id, r.name || r.title, '', r.updated, '操作手册')))},
    {k:'lit', n:'文献', items: items(d.lit, r => it(r.id, r.title, '', r.updated, '文献笔记'))},
    {k:'kb', n:'知识库', items: []
      .concat(items(d.kb,    r => it(r.id, r.title, '', r.updated, '拾贝')))
      .concat(items(d.ideas, r => it(r.id, r.title || r.text, IDEA_STATE(r.status), r.created, '点子库')))},
    {k:'plot', n:'科研绘图', note:'绘图是即席生成的图，不落库', items: []},
    {k:'todo', n:'Todo', items: items(d.todos, r => it(r.id, r.text, r.done ? '已完成' : '待处理', r.done ? r.doneAt : (r.due || r.created), '待办'))},
    {k:'mol', n:'分子实验', items: []
      .concat(items(d.builds,  r => it(r.id, r.name || r.vector, BUILD_STATE(r.status), r.updated, '载体构建')))
      .concat(items(d.pcrs,    r => it(r.id, r.name, '', r.updated, '片段扩增')))
      .concat(items(d.primers, r => it(r.id, r.name, '', r.updated, '引物设计')))},
    {k:'plasmid', n:'载体图谱', items: items(d.plasmids, r => it(r.id, r.name, '', r.updated, '载体'))},
    {k:'tf', n:'遗传转化', items: items(d.schemes, r => it(r.id, r.name, schemeState(r, today), r.updated, '转化方案'))},
    {k:'tools', n:'实用功能', note:'ID 转换与序列转换即用即走，不落库', items: []},
    {k:'', n:'其他', items: []}
  ];
};

function pushIndex(){
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({type:'ciib-ro-index', modules: CIIB.roIndex()}, '*');
  }
}

/* ==========================================================================
   二、打开原记录：科研总览 → 工作台
   先确认这条记录还在（不在就不跳，只提示），再切页并定位到卡片。
   能直接弹详情的模块（文献 / 知识库 / 点子库）优先弹详情。
   ========================================================================== */
const PAGE_OF = {todo:'home'};
const POOLS = {   /* 模块 → 该模块记录所在的 db 数组（判断记录是否还存在） */
  exp:     ['exps', 'trouble', 'protocols'],
  lit:     ['lit', 'litGroups'],
  kb:      ['kb', 'ideas'],
  todo:    ['todos'],
  mol:     ['builds', 'pcrs', 'primers'],
  plasmid: ['plasmids'],
  tf:      ['schemes', 'events'],
  plot:    [], tools: []
};
function findRec(mod, id){
  const keys = POOLS[mod] || [];
  for (const k of keys) {
    const r = (CIIB.db[k] || []).find(x => x.id === id);
    if (r) return r;
  }
  return null;
}
function titleOf(mod, rec){
  const m = CIIB.roIndex().find(x => x.k === mod);
  return m ? m.n : mod;
}
/* 在已渲染的页面里定位记录卡片；当前子页找不到就依次切各子页再找 */
function locate(id){
  const root = document.getElementById('view');
  if (!root) return null;
  const hit = () => root.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  let el = hit();
  if (el) return el;
  const tabs = Array.prototype.slice.call(root.querySelectorAll('.tabs [data-tab]'));
  for (const t of tabs) { t.click(); el = hit(); if (el) return el; }
  return null;
}
function flash(el){
  /* 先加高亮再滚动：jsdom 里没有布局引擎（scrollIntoView 可能不可用），
     高亮不能因为滚动失败而丢掉 */
  el.classList.add('ro-flash');
  setTimeout(() => el.classList.remove('ro-flash'), 1800);
  try { el.scrollIntoView({block:'center', behavior:'smooth'}); } catch(e){ /* 无布局，忽略 */ }
}
CIIB.roOpenRecord = function(mod, id){
  if (!mod || !id) return {ok:false, reason:'missing'};
  const rec = findRec(mod, id);
  if (!rec) return {ok:false, reason:'gone'};
  const key = PAGE_OF[mod] || mod;
  if (typeof CIIB.go === 'function') CIIB.go(key);
  else {
    const btn = document.querySelector('.nav-item[data-page="' + key + '"]');
    if (btn) btn.click();
  }
  /* 详情弹窗（有就用，最直接） */
  if (mod === 'lit' && CIIB.openLit) { CIIB.openLit(rec); return {ok:true, shown:'detail'}; }
  if (mod === 'kb') {
    const isIdea = (CIIB.db.ideas || []).some(x => x.id === id);
    if (isIdea && CIIB.openIdea) CIIB.openIdea(rec);
    else if (CIIB.openKb) CIIB.openKb(rec);
    return {ok:true, shown:'detail'};
  }
  /* 其余模块：定位卡片并高亮 */
  const el = locate(id);
  if (el) { flash(el); return {ok:true, shown:'card'}; }
  return {ok:true, shown:'page'};   /* 页面已切过去，只是没定位到卡片 */
};

/* ==========================================================================
   三、消息通道
   ========================================================================== */
window.addEventListener('message', function(e){
  const d = e && e.data;
  if (!d) return;
  if (d.type === 'ciib-ro-want-index') { pushIndex(); return; }
  if (d.type === 'ciib-ro-goto') {           /* 只切页、不定位（如「添加验证」去实验记录新建） */
    const key = PAGE_OF[d.mod] || d.mod;
    if (typeof CIIB.go === 'function') CIIB.go(key);
    return;
  }
  if (d.type === 'ciib-ro-open') {
    const r = CIIB.roOpenRecord(d.mod, d.id);
    if (!r.ok && CIIB.toast) {
      CIIB.toast(r.reason === 'gone'
        ? ('工作台里已经没有这条记录了（' + titleOf(d.mod) + '）')
        : '这条本地补录的内容在工作台里没有对应记录');
    }
    return;
  }
});

/* 工作台数据一变就把索引推给科研总览（iframe 在时才推） */
const rawSave = CIIB.save;
CIIB.save = function(){
  rawSave.apply(this, arguments);
  if (frame && document.body.contains(frame)) pushIndex();
};

/* ==========================================================================
   四、页面
   ========================================================================== */
CIIB.pages.ro = {
  title: '科研总览',
  render(m){
    /* ro.html 的版本键跟着工作台一起走，避免 iframe 拿到旧缓存 */
    const VER = '20261016e';
    m.innerHTML = '<div class="ro-frame-wrap"><iframe class="ro-frame" title="科研总览"></iframe></div>';
    const f = m.querySelector('.ro-frame');
    frame = f;
    f.addEventListener('load', () => { pushTheme(); pushIndex(); });   /* 加载完成后再推一次，确保不闪色 / 立刻可读数据 */
    if (typeof window.__RO_HTML__ === 'string' && window.__RO_HTML__) {
      f.setAttribute('srcdoc', window.__RO_HTML__);   /* 单文件版：整页内联 */
    } else {
      f.setAttribute('src', './ciib-ro/ro.html?v=' + VER);   /* 多文件版：正常引用 */
    }
  }
};
})();
