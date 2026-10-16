/* ciib_app/main.js — 工作台外壳：侧边导航、工作台总览、数据备份 */
(function(){
'use strict';
const {esc, db, save} = CIIB;

/* 配色主题：薄荷（默认）/ 靛蓝（html.theme-ink），渲染前先应用避免闪色 */
if (localStorage.getItem('ciib2:theme') === 'ink') document.documentElement.classList.add('theme-ink');

/* 侧边导航。科研总览（key:'ro'）不在此列 —— 它的入口是左上角的 ciib Logo，
   点 Logo 进入科研总览，点侧栏任意一项回到对应模块。 */
const NAV = [
  {key:'home',  title:'工作台', icon:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'},
  {key:'plot',  title:'科研绘图', icon:'<path d="M7 3c0 6 10 12 10 18M17 3C17 9 7 15 7 21M8.2 6h7.6M8.2 18h7.6"/>'},
  {key:'mol',   title:'分子实验', icon:'<path d="M9 3v6l-5 9a2 2 0 0 0 1.8 3h12.4A2 2 0 0 0 20 18l-5-9V3M8 3h8"/>'},
  {key:'exp',   title:'实验记录', icon:'<path d="M8 3h8a2 2 0 0 1 2 2v16l-6-3-6 3V5a2 2 0 0 1 2-2zM9 8h6M9 12h6"/>'},
  {key:'plasmid', title:'载体图谱', icon:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 7 4M12 20a8 8 0 0 1-7-4"/>'},
  {key:'tf',    title:'遗传转化', icon:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'},
  {key:'tools', title:'实用功能', icon:'<path d="M10 3v6L4.6 18a2 2 0 0 0 1.8 3h11.2a2 2 0 0 0 1.8-3L14 9V3M8.5 3h7M7.5 15h9"/>'},
  {key:'lit',   title:'文献', icon:'<path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4zM20 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6z"/>'},
  {key:'kb',    title:'知识库', icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>'},
  {key:'foot',  title:'足迹', icon:'<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>'}
];

function shell(){
  const subsOf = key => (MOD[key] && MOD[key].subs) || [];
  document.getElementById('app').innerHTML =
    '<div class="app"><aside class="sidebar">' +
    /* 左上角 Logo = 科研总览入口（点击进入；已在科研总览时再点则回上一个页面） */
    '<button class="brand" id="brandBtn" type="button" title="科研总览（点击 Logo 进入）"><img src="./logo.png" alt="ciib logo"><span class="brand-word"><b>ciib</b><small>BIOPLOT STUDIO</small></span></button>' +
    '<nav aria-label="主导航">' + NAV.map(n => {
      const subs = subsOf(n.key);
      return '<div class="nav-block">' +
      '<button class="nav-item" data-page="' + n.key + '" title="' + n.title + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + n.icon + '</svg><span>' + n.title + '</span>' +
      (subs.length ? '<svg class="nav-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' : '') + '</button>' +
      (subs.length ? '<div class="nav-sub" data-subof="' + n.key + '">' + subs.map((s, i) =>
        '<button data-navsub="' + n.key + ':' + i + '">' + esc(s) + '</button>').join('') + '</div>' : '') +
      '</div>';
    }).join('') + '</nav>' +
    '<div class="side-actions">' +
    '<button class="side-btn" id="themeBtn" title="切换全局配色"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path class="half" d="M12 3a9 9 0 0 1 0 18Z"/></svg><span id="themeLab"></span></button>' +
    '<button class="side-btn" id="foldBtn" title="收起 / 展开边栏"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg><span id="foldLab"></span></button>' +
    '</div>' +
    '<div class="sidebar-foot"><button class="side-btn" id="saveBtn" title="导出全部数据备份（可选择保存位置）"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4z"/><path d="M15 3v5H7V3"/><path d="M7 21v-7h10v7"/></svg><span>导出备份</span></button></div></aside>' +
    '<main class="main" id="view" tabindex="-1"></main>' +
    '<button class="cloud-fab" id="cloudFab" type="button"></button>' +
    /* 科研总览模式（.app.ro-mode）：侧栏整体收起，最左边只留一个唤起箭头；
       主 Logo 浮到内容区左上角 —— 也就是科研总览页原本放 Logo 的那个位置。 */
    '<button class="sb-rail" id="sbRail" type="button" title="展开 / 收起边栏" aria-label="展开边栏"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>' +
    '<button class="ro-floatbrand" id="roBrand" type="button" title="返回工作台"><img src="./logo.png" alt="ciib logo"><span class="brand-word"><b>ciib</b><small>BIOPLOT STUDIO</small></span></button>' +
    '</div>';
  const view = document.getElementById('view');
  const appEl = document.querySelector('.app');
  const brandBtn = document.getElementById('brandBtn');
  const railBtn = document.getElementById('sbRail');
  const roBrandBtn = document.getElementById('roBrand');
  let prevKey = 'home';          /* 进科研总览之前的页面，点 Logo 返回时回到这里 */
  let railWasMin = false;        /* 唤起边栏前它是否处于 56px 折叠态（收起 / 离开科研总览时还原） */
  function go(key){
    localStorage.setItem('ciib2:page', key);
    if (key !== 'ro') prevKey = key;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === key));
    /* Logo 高亮：科研总览不是侧栏项，用 Logo 的激活态表示「当前在这里」 */
    if (brandBtn) brandBtn.classList.toggle('active', key === 'ro');
    /* 科研总览模式：侧栏整体收起 + 左边缘唤起箭头；离开时复位 */
    appEl.classList.toggle('ro-mode', key === 'ro');
    if (key !== 'ro') {
      appEl.classList.remove('sb-open');
      if (railWasMin) { sb.classList.add('collapsed'); railWasMin = false; foldUI(); }
    }
    /* 手风琴：展开当前模块的子菜单，收起其余 */
    document.querySelectorAll('.nav-sub').forEach(el => el.classList.toggle('open', el.dataset.subof === key));
    if (key === 'home') home(view, go);
    else if (key === 'foot') foot(view, go);
    else {
      const pg = CIIB.pages[key];
      if (!pg) { view.innerHTML = '<div class="empty"><span>◇</span><p>页面缺失</p></div>'; return; }
      const m = document.createElement('div');
      view.innerHTML = ''; view.appendChild(m);
      pg.render(m, () => go(key));
      /* 主页小分类 chip 跳转子页签：渲染后触发对应 tab 按钮 */
      if (CIIB.pendingSub && CIIB.pendingSub.key === key) {
        const b = m.querySelector('.tabs [data-tab="' + CIIB.pendingSub.sub + '"]');
        if (b) b.click();
        CIIB.pendingSub = null;
      }
    }
    view.scrollTop = 0;
  }
  /* 导航：委托绑定（点击 caret 只展开/收起子菜单，不跳转；点子项直跳对应子页签） */
  const navEl = document.querySelector('.sidebar nav');
  navEl.onclick = e => {
    if (e.target.closest('.nav-caret')) {
      const sub = e.target.closest('.nav-block').querySelector('.nav-sub');
      if (sub) sub.classList.toggle('open');
      return;
    }
    const item = e.target.closest('.nav-item');
    if (item) go(item.dataset.page);
  };
  /* 点左上角 Logo → 进科研总览；已在科研总览则回到进来之前的页面（开关式） */
  const toggleRo = () => go(localStorage.getItem('ciib2:page') === 'ro' ? prevKey : 'ro');
  brandBtn.onclick = toggleRo;
  roBrandBtn.onclick = toggleRo;
  /* 左边缘箭头：唤起 / 收起边栏（科研总览模式下侧栏默认是收起的）
     若之前把边栏折成了 56px 窄条，唤起时先临时展开成完整边栏，收起后再还原折叠状态 ——
     否则「点一下唤起」只会看到一条同样窄的边栏，像没反应。 */
  railBtn.onclick = () => {
    const open = appEl.classList.toggle('sb-open');
    if (open) {
      railWasMin = sb.classList.contains('collapsed');
      if (railWasMin) { sb.classList.remove('collapsed'); foldUI(); }
    } else if (railWasMin) {
      sb.classList.add('collapsed'); foldUI();
      railWasMin = false;
    }
  };
  document.querySelectorAll('[data-navsub]').forEach(b => b.onclick = () => {
    const parts = b.dataset.navsub.split(':');
    CIIB.pendingSub = {key: parts[0], sub: +parts[1]};
    go(parts[0]);
    document.querySelectorAll('[data-navsub]').forEach(x => x.classList.toggle('active', x === b));
  });
  /* ---- 配色切换（薄荷 ⇄ 靛蓝，记忆在 localStorage）---- */
  const rootEl = document.documentElement, sb = document.querySelector('.sidebar');
  const themeBtn = document.getElementById('themeBtn'), themeLab = document.getElementById('themeLab');
  function themeUI(){
    themeLab.textContent = rootEl.classList.contains('theme-ink') ? '靛蓝配色' : '薄荷配色';
  }
  themeBtn.onclick = () => {
    const ink = rootEl.classList.toggle('theme-ink');
    localStorage.setItem('ciib2:theme', ink ? 'ink' : 'mint');
    themeUI();
    if (CIIB.roTheme) CIIB.roTheme();   /* 通知内嵌的科研总览跟随配色 */
  };
  themeUI();
  /* ---- 边栏折叠 / 展开（记忆在 localStorage）---- */
  const foldBtn = document.getElementById('foldBtn'), foldLab = document.getElementById('foldLab');
  function foldUI(){
    const min = sb.classList.contains('collapsed');
    foldLab.textContent = min ? '展开边栏' : '收起边栏';
  }
  foldBtn.onclick = () => {
    const min = sb.classList.toggle('collapsed');
    localStorage.setItem('ciib2:sbmin', min ? '1' : '0');
    foldUI();
  };
  if (localStorage.getItem('ciib2:sbmin') === '1') sb.classList.add('collapsed');
  foldUI();
  /* ---- 侧栏底部：直接导出备份（与工作台「导出全部数据备份」同一逻辑）---- */
  document.getElementById('saveBtn').onclick = () => CIIB.exportAll();
  /* ---- 右上角云同步入口（注册/登录 → 登录后变已同步/未同步），点击弹出云同步面板 ---- */
  if (CIIB.cloud && CIIB.cloud.setFab) CIIB.cloud.setFab(document.getElementById('cloudFab'));
  /* 右下角问答助手（ciib_app/assistant.js）：常驻浮窗，问的是工作台里的记录 */
  if (CIIB.ask && CIIB.ask.mount) CIIB.ask.mount();
  /* 科研总览（ciib-ro/ro.js）点「打开原记录」时要切页，这里把 go 暴露出去 */
  CIIB.go = go;

  /* ---- 登录门禁：在已发布网址上没登录就不展示任何记录 ----
     数据按账号隔离存放（本机副本也是），所以未登录时既看不到、也不该看到别人的记录。
     登录 / 退出由 ciib_app/cloud.js 决定，这里只负责「照它说的渲染」。 */
  let gated = false;
  function gateView(){
    view.innerHTML =
      '<div class="gate">' +
      '<img class="gate-logo" src="./logo.png" alt="ciib logo">' +
      '<h1>ciib · 我的科研工作台</h1>' +
      '<p>数据按账号存放：登录后自动把云端记录同步到这台电脑，多台电脑登录同一账号即同一份。' +
      '<b>未登录时本机不显示任何记录</b>。</p>' +
      '<div data-act="cloud"></div>' +
      '<p class="gate-foot">还没有账号？在上面选「注册」，邮箱或手机号都可以。<br>' +
      '<button type="button" class="text-button" data-act="localmode">暂时不登录，以本机模式打开（数据只存在这台电脑）</button></p>' +
      '</div>';
    if (CIIB.cloud && CIIB.cloud.render) CIIB.cloud.render(view.querySelector('[data-act="cloud"]'));
    const lm = view.querySelector('[data-act="localmode"]');
    if (lm) lm.onclick = () => CIIB.cloud.useLocalMode(true);
  }
  function applyCloud(){
    const g = !!(CIIB.cloud && CIIB.cloud.gated && CIIB.cloud.gated());
    document.body.classList.toggle('gate', g);
    /* 云同步可能刚把记录换了一批（登录 / 拉到别的电脑的改动），问答助手的语料跟着重建 */
    if (!g && CIIB.ask && CIIB.ask.build) CIIB.ask.build();
    if (g){
      if (!gated){ gated = true; gateView(); }          /* 只在「刚进入未登录」时重建，避免打断正在填的登录表单 */
    } else if (gated){
      gated = false;
      go(localStorage.getItem('ciib2:page') || 'home');
    }
  }
  if (CIIB.cloud && CIIB.cloud.onChange) CIIB.cloud.onChange(applyCloud);
  else applyCloud();
  if (!gated) go(localStorage.getItem('ciib2:page') || 'home');
}

/* ---- 足迹：时间轴（参考 drygiel/nwxLbN——双竖线 + 光晕圆点，静态；
     左线：文献/知识库/点子；右线：实验/转化/载体/待办；同模块多条合并为数量） ---- */
function foot(view, go){
  const d10 = s => String(s || '').slice(0, 10);
  const fmt = day => day.replace(/^20/, '').replace(/-/g, '.');
  /* 来源定义：side(左/右线) | 数据库 key | 名称 | 时间字段取值 | 标题取值 */
  const SRC = [
    ['L', 'lit',      '文献',     r => r.updated,            r => r.title || r.name || '未命名'],
    ['L', 'kb',       '知识库',   r => r.updated,            r => r.title || ''],
    ['L', 'ideas',    '点子库',   r => r.created,            r => r.title || r.text || ''],
    ['R', 'exps',     '实验记录', r => r.updated,            r => r.name || '未命名'],
    ['R', 'trouble',  '排障库',   r => r.updated,            r => r.title || r.name || ''],
    ['R', 'schemes',  '遗传转化', r => r.updated,            r => r.name || ''],
    ['R', 'plasmids', '载体图谱', r => r.updated,            r => r.name || ''],
    ['R', 'builds',   '载体构建', r => r.updated,            r => r.name || r.vector || ''],
    ['R', 'pcrs',     '片段扩增', r => r.updated,            r => r.name || ''],
    ['R', 'primers',  '引物设计', r => r.updated,            r => r.name || '']
  ];
  /* day → side → 行列表（同模块合并：多条只记数量） */
  const daysMap = {};
  SRC.forEach(([side, key, label, tOf, titleOf]) => (db[key] || []).forEach(r => {
    const day = d10(tOf(r));
    if (!day) return;
    const m = (daysMap[day] = daysMap[day] || {L: {}, R: {}});
    const src = m[side][key] = m[side][key] || {label, titles: []};
    src.titles.push(titleOf(r));
  }));
  /* 待办：同天完成的合并为一行纯文本（如「完成种苗、继代」） */
  const doneByDay = {};
  (db.todos || []).forEach(t => { if (t.done && t.doneAt) (doneByDay[d10(t.doneAt)] = doneByDay[d10(t.doneAt)] || []).push(t.text); });
  Object.keys(doneByDay).forEach(day => {
    const m = (daysMap[day] = daysMap[day] || {L: {}, R: {}});
    m.R.todos = {label: '待办', titles: [doneByDay[day].join('、')]};
  });

  const cell = (row, day) => {
    const merged = row.titles.length > 1 && row.label !== '待办';
    return '<span class="tl-date">' + fmt(day) + '</span><span class="tl-title' + (merged ? ' tl-merge" data-act="tlext' : '') + '">' +
      (merged
        ? esc(row.label + ' · ' + row.titles.length) + '<i class="tl-caret">▸</i>'
        : esc(row.label + ' · ' + row.titles[0])) +
      '</span>' +
      (merged ? '<span class="tl-sub" hidden>' + row.titles.map(t => '<span class="tl-sub-item" title="' + esc(t) + '">' + esc(t) + '</span>').join('') + '</span>' : '');
  };
  const days = Object.keys(daysMap).sort().reverse().slice(0, 60);
  view.innerHTML = '<div class="page-head"><div><h1>足迹</h1><p>按天回看你在工作台留下的痕迹——左线：文献、知识库与点子；右线：实验记录、转化、载体与完成的待办。同一模块的多条记录会合并为数量。仅收录带时间戳的条目。</p></div></div>' +
    '<div class="tl-wrap" data-act="tlwrap"><span class="tl-line a"></span><span class="tl-line b"></span>' +
    (days.length ? days.map(day => {
      const m = daysMap[day];
      const L = Object.values(m.L), R = Object.values(m.R);
      const n = Math.max(L.length, R.length);
      let rows = '';
      for (let i = 0; i < n; i++) {
        rows += '<div class="tl-row">' +
        '<div class="tl-cell L">' + (L[i] ? cell(L[i], day) : '') + '</div>' +
        '<div class="tl-gutter">' + (L[i] ? '<span class="tl-dot a"></span>' : '') + (R[i] ? '<span class="tl-dot b"></span>' : '') + '</div>' +
        '<div class="tl-cell R">' + (R[i] ? cell(R[i], day) : '') + '</div>' +
        '</div>';
      }
      return rows;
    }).join('') : '<div class="empty"><span>◌</span><p>还没有可回溯的记录——新建或修改条目后会按天出现在这里。</p></div>') +
    '</div>';
  /* 合并条目点击展开 / 收起（监听器挂在每次重建的 tl-wrap 上，避免 view 常驻节点叠加） */
  const wrap = view.querySelector('[data-act="tlwrap"]');
  if (wrap) wrap.addEventListener('click', e => {
    const t = e.target.closest('[data-act="tlext"]');
    if (!t) return;
    const sub = t.nextElementSibling;
    if (!sub || !sub.classList.contains('tl-sub')) return;
    const open = sub.hasAttribute('hidden');
    if (open) sub.removeAttribute('hidden'); else sub.setAttribute('hidden', '');
    t.classList.toggle('open', open);
  });
}

/* ---- 工作台总览 ---- */
/* 模块元信息：配色图标（主色 + 浅底）、描述；快捷入口=主，模块总览=次 */
const HOME_MODULES = ['plot', 'plasmid', 'mol', 'exp', 'tf', 'lit', 'kb', 'tools'];
const MOD = {
  plot:    {color:'#167c69', bg:'#e3f1ee', desc:'基因/蛋白结构、基因排布、热图、气泡、柱状图',
            subs:['基因结构', '蛋白结构', '基因排布', '热图', '气泡', '柱状']},
  plasmid: {color:'#5984c6', bg:'#e8eef8', desc:'SnapGene .dna 导入、环状图谱、特征与酶切位点'},
  mol:     {color:'#a775b7', bg:'#f1ebf7', desc:'载体构建 / 片段扩增 / 引物设计与预留模块',
            subs:['载体构建', '片段扩增', '引物设计', 'CRISPR（预留）', 'RNAi（预留）']},
  exp:     {color:'#4f8ca8', bg:'#e6f0f6', desc:'操作手册（Protocol）+ 实验链路（目的→现象→复盘）+ 可检索的排障库',
            subs:['操作手册', '实验链路', '排障库']},
  tf:      {color:'#d88b4b', bg:'#faeee3', desc:'转化方案 + iOS 风格多事件日历',
            subs:['转化方案', '日历']},
  lit:     {color:'#cc6574', bg:'#faeaec', desc:'序号 / 星标 / 简记笔记 / 互相关联 / 关系网',
            subs:['文献笔记', '关系网']},
  kb:      {color:'#729d51', bg:'#eef4e6', desc:'个人知识检索与录入 + 头脑风暴点子库',
            subs:['拾贝', '点子库']},
  tools:   {color:'#5a67c9', bg:'#e9ebfa', desc:'序列转换（反向/互补/翻译）+ ID转换（内置 At/Cr/GO 数据库）',
            subs:['序列转换', 'ID转换']}
};
const navOf = key => NAV.find(n => n.key === key);
const icoHTML = (key, cls) => '<span class="' + (cls || 'stat-ico') + '" style="background:' + MOD[key].bg + ';color:' + MOD[key].color + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + navOf(key).icon + '</svg></span>';
const countOf = key => key === 'tools' ? '' : key === 'mol' ? db.builds.length + db.pcrs.length + db.primers.length
  : key === 'tf' ? db.schemes.length + db.events.length
  : key === 'exp' ? db.exps.length + db.trouble.length + (db.protocols || []).length : (db[key] || []).length;
/* 快捷入口的最小粒度是「子页面」：基因结构 / 热图 / 排障库 / 关系网 …；
   value 形如 "plot:3"（模块:子页序号）；没有子页的模块（如载体图谱）整模块一项。
   旧数据里的纯模块 key 自动折算成第一个子页。 */
const QUICK_OPTS = [];
HOME_MODULES.forEach(k => {
  const subs = MOD[k] && MOD[k].subs || [];
  if (!subs.length) QUICK_OPTS.push({v: k, k, i: -1, label: navOf(k).title, group: navOf(k).title});
  else subs.forEach((s, i) => QUICK_OPTS.push({v: k + ':' + i, k, i, label: s, group: navOf(k).title}));
});
const normQuick = v => {
  const s = String(v || ''), ci = s.indexOf(':');
  if (ci >= 0) return s;
  return (MOD[s] && (MOD[s].subs || []).length) ? s + ':0' : s;
};
const quickKeys = () => {
  const q = Array.isArray(db.homeQuick) ? db.homeQuick : [];
  return q.map(normQuick).filter(v => QUICK_OPTS.some(o => o.v === v));
};
const quickOf = v => QUICK_OPTS.find(o => o.v === v) || null;
/* 卡片内的小分类 chip：点击直接跳到模块的对应子页签 */
const subChips = k => (MOD[k].subs || [])
  .map((s, i) => '<button class="sub-chip" data-subgo="' + k + ':' + i + '">' + esc(s) + '</button>').join('');

/* ---- 今日待办：自定义待办 + 实验侧自动提醒（反馈/链路闭环/检查清单）+ 转化日程 ---- */
function tfAgenda(){
  const td = CIIB.today(), out = [];
  const inRange = (s, d) => s && d && td >= s && td <= CIIB.addDays(s, d - 1);
  const dayNo = s => Math.round((new Date(td + 'T12:00:00') - new Date(s + 'T12:00:00')) / 86400000) + 1;
  (db.schemes || []).forEach(sc => (sc.stages || []).forEach(s => {
    if (!inRange(s.start, s.days)) return;
    out.push({id:'tf:' + sc.id + ':' + s.name, kind:'tf', tag:'转化',
      text:(sc.name || '转化方案') + '：' + s.name + ' 第 ' + dayNo(s.start) + '/' + s.days + ' 天',
      sub:td === s.start ? '今天开始 · ' + (sc.cultivar || '') : '进行中 · ' + (sc.cultivar || '')});
  }));
  (db.events || []).forEach(e => {
    if (!inRange(e.start, e.days || 1)) return;
    out.push({id:'ev:' + e.id, kind:'tf', tag:'日程', text:e.name, sub:td === e.start ? '今天开始' : '进行中'});
  });
  return out;
}
function home(view, go){
  const stat = key =>
    '<div class="dash-card" data-go="' + key + '"><div class="top">' + icoHTML(key) +
    '<span class="num">' + countOf(key) + '</span></div><h3>' + navOf(key).title + '</h3><p>' + MOD[key].desc + '</p>' +
    (MOD[key].subs ? '<div class="sub-chips">' + subChips(key) + '</div>' : '') + '</div>';
  /* 快捷入口卡：有子分类的模块直接以第一个子分类为标题（如「基因结构」），点击直达对应子页签 */
  const quick = quickKeys();
  view.innerHTML =
    '<div class="page-head"><div><div class="title-row"><h1>ciib · 我的科研工作台</h1>' +
    '<span class="bak-wrap"><button data-act="bak">导入 / 导出 ▾</button>' +
    '<div class="bak-menu" data-act="bakmenu" hidden>' +
    '<button data-act="export">⤒ 导出全部数据备份</button>' +
    '<button data-act="import">⤓ 导入备份</button></div></span>' +
    '<input type="file" accept=".json" data-act="file" style="display:none"></div>' +
    '<p>科研绘图｜分子实验｜遗传转化｜文献｜知识库 —— 数据按账号存放并云同步，多台电脑登录同一账号即同一份。</p></div></div>' +
    /* ① 第一重点：今日待办横幅（全宽） */
    '<section class="today-card" data-act="today">' +
    '<div class="today-top"><h2 class="home-h2"><svg class="t-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>今日待办</h2>' +
    '<small class="muted" data-act="tdate"></small></div>' +
    '<div class="today-body">' +
    '<div class="today-main"><div data-act="talert"></div><div class="todo-add"><input data-act="tadd" placeholder="添加一条待办（回车即可），如：测序结果比对">' +
    '<input type="date" data-act="tdue"><button class="primary" data-act="tbtn">＋ 添加</button></div>' +
    '<div class="todo-list" data-act="tlist"></div>' +
    '<div class="todo-foot muted" data-act="tfoot"></div></div>' +
    '<div class="today-side"><div class="today-count" data-act="tcount"></div><p class="muted">自动汇总：反馈待办、链路缺口、检查清单与转化日程。</p></div>' +
    '</div></section>' +
    /* ② 快捷入口（左） + 检索（右） */
    '<div class="home-grid">' +
    '<div>' +
    '<div class="section-head" style="margin:22px 0 10px"><h2 class="home-h2">快捷入口</h2><button class="text-button" data-act="customize">✎ 自定义</button></div>' +
    '<div class="quick-grid" data-act="quick">' +
    (quick.length ? quick.map(v => {
      const o = quickOf(v);
      return '<div class="quick-card" ' + (o.i >= 0 ? 'data-subgo="' + o.k + ':' + o.i + '"' : 'data-go="' + o.k + '"') + '>' + icoHTML(o.k, 'qico') +
      '<div style="flex:1;min-width:0"><h3>' + esc(o.label) + '</h3><p>' + esc(o.group) + ' · ' + MOD[o.k].desc + '</p></div>' +
      '<span class="arrow" aria-hidden="true">→</span></div>';
    }).join('')
      : '<p class="muted" style="margin:0">还没有快捷入口，点击右上角「✎ 自定义」选择要快捷打开的子页面。</p>') +
    '</div>' +
    '</div>' +
    '<aside class="hero"><div class="cap">RESEARCH · 一站检索</div>' +
    '<h2>文献 &amp; 知识库联合搜索</h2>' +
    '<p>同时检索文献、拾贝笔记与点子库的标题、标签、正文与想法，点击结果直接打开详情。</p>' +
    '<input class="hero-q" placeholder="例如：BiFC、农杆菌、转化…" data-act="hq">' +
    '<div class="hero-res" data-act="hres"><p class="hero-empty">输入关键词开始检索。</p></div>' +
    '<div class="hero-foot">● 全程本地检索，不上传任何数据</div></aside>' +
    '</div>' +
    /* ③ 模块总览（全宽收尾） */
    '<div class="section-head" style="margin:22px 0 0"><h2 class="home-h2">模块总览</h2></div>' +
    '<div class="dash" data-act="dash">' + HOME_MODULES.map(stat).join('') + '</div>' +
    '<div class="card" style="margin-top:18px;max-width:1100px"><h3 style="margin-top:0">使用提示</h3>' +
    '<ul style="margin:0;padding-left:18px;font-size:13px;color:#3c4d48">' +
    '<li>载体图谱：可导入 <code>ciib_note/protocol</code> 中的 pCAMBIA1300/1301/1302 与 Super-pCAMBIA1300-GFP 文件；序列上点选/拖选后可像 SnapGene 一样复制顶部链 5′→3′、底部链 3′→5′、反向互补与翻译产物；「导出 PDF」经打印对话框选「另存为 PDF」即得可编辑矢量 PDF（另有 SVG 导出）。</li>' +
    '<li>载体构建的接头/同源序列字段参考了 BiFC、1301-GUS、pGreenII-0800-LUC 三个 protocol 的写法。</li>' +
    '<li>遗传转化：方案里各阶段设好起止时间和颜色，保存后自动出现在「日历」。</li>' +
    '<li>换电脑或清浏览器缓存前，务必先「导出全部数据备份」。</li>' +
    '<li>多台电脑共用一份数据：在主页「云同步」里登录同一个账号，改动会自动上传，另一台电脑登录即可看到。</li></ul></div>';

  /* ---- 云同步面板（ciib_app/cloud.js） ---- */
  if (CIIB.cloud && CIIB.cloud.render) CIIB.cloud.render(view.querySelector('[data-act="cloud"]'));

  /* ---- 今日待办 ---- */
  const tadd = view.querySelector('[data-act="tadd"]'), tdue = view.querySelector('[data-act="tdue"]'),
        tlist = view.querySelector('[data-act="tlist"]'), tfoot = view.querySelector('[data-act="tfoot"]');
  tdue.value = CIIB.today();
  view.querySelector('[data-act="tdate"]').textContent = CIIB.today() + ' · ' + '周' + '日一二三四五六'[new Date().getDay()];
  const addTodo = () => {
    const t = tadd.value.trim(); if (!t) return;
    (db.todos = db.todos || []).push({id: CIIB.uid(), text: t, due: tdue.value || CIIB.today(), done: false, created: new Date().toISOString()});
    tadd.value = ''; save(); todoDraw();
  };
  view.querySelector('[data-act="tbtn"]').onclick = addTodo;
  tadd.onkeydown = e => { if (e.key === 'Enter') addTodo(); };
  function todoDraw(){
    const td = CIIB.today();
    const all = db.todos || [];
    const overdue = t => !t.done && t.due && t.due < td;
    /* 逾期天数（按日期字符串算，不受时区影响） */
    const lateDays = t => { if (!overdue(t)) return 0; const a = Date.parse(t.due + 'T00:00:00Z'), b = Date.parse(td + 'T00:00:00Z'); return Math.max(1, Math.round((b - a) / 86400000)); };
    const bySoon = (a, b) => overdue(a) !== overdue(b) ? (overdue(a) ? -1 : 1) : ((a.due || '') < (b.due || '') ? -1 : 1);
    const todayList = all.filter(t => !t.done && (!t.due || t.due <= td)).sort(bySoon);
    const futureList = all.filter(t => !t.done && t.due && t.due > td).sort((a, b) => a.due < b.due ? -1 : 1);
    const doneToday = all.filter(t => t.done && String(t.doneAt || '').slice(0, 10) === td);
    const auto = (CIIB.expAgenda ? CIIB.expAgenda() : []).concat(tfAgenda());
    const lateN = todayList.filter(overdue).length;
    const row = t => {
      const d = lateDays(t);
      return '<label class="todo-row' + (d ? ' overdue' : '') + '"><input type="checkbox" data-todo="' + t.id + '">' +
        '<span class="t-txt">' + esc(t.text) + '</span>' +
        (t.due ? '<small class="t-due' + (d ? ' late' : '') + '">' + (d ? '逾期 ' + d + ' 天 · ' : '') + esc(t.due) + '</small>' : '') +
        '<button class="text-button danger" data-del="' + t.id + '" title="删除">×</button></label>';
    };
    const arow = t =>
      '<div class="todo-row auto" data-ref="' + (t.kind === 'tf' ? 'tf' : 'exp') + ':' + esc(t.expId || '') + '">' +
      (t.kind === 'fb' ? '<input type="checkbox" data-fb="' + esc(t.expId) + ':' + esc(t.fbId) + '">' : '<span class="t-dot"></span>') +
      '<span class="tag">' + esc(t.tag) + '</span><span class="t-txt">' + esc(t.text) + '</span>' +
      (t.sub ? '<small class="t-due">' + esc(t.sub) + '</small>' : '') + '<span class="arrow">→</span></div>';
    /* 顶部逾期告警条（有逾期时显示，勾选完成后自动消失） */
    view.querySelector('[data-act="talert"]').innerHTML = lateN
      ? '<div class="todo-alert">⚠ 有 <b>' + lateN + '</b> 项逾期待办（已保留在「今日」并标红），处理或删除后消失。</div>' : '';
    tlist.innerHTML =
      ((todayList.length || auto.length) ? '<div class="todo-seg"><div class="todo-group">今日' + (todayList.length ? ' · ' + todayList.length : '') + '</div><div class="todo-items">' +
        todayList.map(row).join('') + auto.map(arow).join('') + '</div></div>' : '') +
      (!todayList.length && !auto.length && !futureList.length ? '<p class="hero-empty">今天没有待办 ✓</p>' : '') +
      (futureList.length ? '<div class="todo-seg"><div class="todo-group">未来 · ' + futureList.length + ' <small>到期自动进入「今日」</small></div><div class="todo-items">' +
        futureList.map(row).join('') + '</div></div>' : '') +
      (doneToday.length ? '<div class="todo-seg done-seg"><div class="todo-done">今天已完成 ' + doneToday.length + ' 项</div><div class="todo-items">' +
        doneToday.slice(0, 4).map(t => '<label class="todo-row done"><input type="checkbox" data-todo="' + t.id + '" checked>' +
          '<span class="t-txt">' + esc(t.text) + '</span></label>').join('') + '</div></div>' : '');
    tfoot.textContent = '未来待办到期后会自动进入「今日」；逾期的条目不会消失，会保留在「今日」并高亮提醒。点「→」跳到对应模块处理，反馈类待办可直接勾选闭环。';
    const tc = view.querySelector('[data-act="tcount"]');
    if (tc) tc.innerHTML = '<b>' + (todayList.length + auto.length) + '</b><span>项待处理</span>' +
      (lateN ? '<em class="late">逾期 ' + lateN + '</em>' : '') +
      (futureList.length ? '<em class="future">未来 ' + futureList.length + '</em>' : '') +
      (doneToday.length ? '<em>已完成 ' + doneToday.length + '</em>' : '<em class="zero">暂无完成</em>');
  }
  tlist.onclick = e => {
    const cb = e.target.closest('[data-todo]'), fb = e.target.closest('[data-fb]'),
          del = e.target.closest('[data-del]'), ref = e.target.closest('[data-ref]');
    if (del) { db.todos = (db.todos || []).filter(t => t.id !== del.dataset.del); save(); todoDraw(); return; }
    if (cb) {
      const t = (db.todos || []).find(x => x.id === cb.dataset.todo); if (!t) return;
      t.done = cb.checked; t.doneAt = t.done ? new Date().toISOString() : '';
      save(); todoDraw(); return;
    }
    if (fb) {
      const [expId, fbId] = fb.dataset.fb.split(':');
      if (CIIB.expToggleFb) CIIB.expToggleFb(expId, fbId);
      save(); todoDraw(); return;
    }
    if (ref) go((ref.dataset.ref.split(':')[0]) || 'exp');
  };
  todoDraw();

  /* 快捷入口 / 模块总览点击跳转；小分类 chip 直接跳到对应子页签 */
  const jump = e => {
    const s = e.target.closest('[data-subgo]');
    if (s) {
      const i = s.dataset.subgo.indexOf(':');
      CIIB.pendingSub = {key: s.dataset.subgo.slice(0, i), sub: +s.dataset.subgo.slice(i + 1)};
      go(CIIB.pendingSub.key);
      return;
    }
    const c = e.target.closest('[data-go]');
    if (c) go(c.dataset.go);
  };
  view.querySelector('[data-act="quick"]').onclick = jump;
  view.querySelector('[data-act="dash"]').onclick = jump;

  /* 快捷入口自定义（可勾选、可更改，持久化到 db.homeQuick） */
  view.querySelector('[data-act="customize"]').onclick = () => {
    const cur = quickKeys();
    CIIB.modal('自定义快捷入口',
      '<p class="muted" style="margin:0 0 12px">按模块分组勾选要快捷打开的子页面（如基因结构、热图、排障库、关系网），保存后立即生效：</p>' +
      HOME_MODULES.map(k =>
        '<div class="qopt-group"><div class="qopt-title">' + icoHTML(k) + '<b>' + navOf(k).title + '</b></div>' +
        '<div class="qopt-list">' + QUICK_OPTS.filter(o => o.k === k).map(o =>
          '<label><input type="checkbox" data-qk="' + o.v + '"' + (cur.indexOf(o.v) >= 0 ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>'
        ).join('') + '</div></div>').join('') +
      '<div class="form-actions"><button class="ghost" type="button" data-act="qc">取消</button><button class="primary" type="button" data-act="qs">保存</button></div>',
      (body, close) => {
        body.querySelector('[data-act="qc"]').onclick = close;
        body.querySelector('[data-act="qs"]').onclick = () => {
          db.homeQuick = QUICK_OPTS.filter(o => body.querySelector('[data-qk="' + o.v + '"]').checked).map(o => o.v);
          save(); close(); home(view, go);
        };
      });
  };

  /* 右侧检索：同时搜文献 + 知识库（拾贝笔记与点子库，含想法内容），点结果跳转模块并打开详情 */
  const hq = view.querySelector('[data-act="hq"]'), hres = view.querySelector('[data-act="hres"]');
  const has = (rec, kw) => [rec.title, rec.authors, rec.tags, rec.brief, rec.notes, rec.content]
    .some(f => String(f || '').toLowerCase().includes(kw));
  const snippet = r => {
    const notes = Array.isArray(r.notes) ? r.notes.map(n => typeof n === 'string' ? n : n && n.text).filter(Boolean).join('；') : r.notes;
    return esc(String(r.brief || r.content || notes || r.tags || (r.authors || '')).slice(0, 64));
  };
  const item = (kind, r, color) =>
    '<button type="button" class="hres" data-kind="' + kind + '" data-id="' + r.id + '">' +
    '<span class="hres-top"><span class="src" style="background:' + color + '">' + (kind === 'lit' ? '文献' : kind === 'kb' ? '知识库' : '点子库') + '</span>' +
    '<h4>' + esc(r.title || '（无标题）') + '</h4></span><p>' + snippet(r) + '</p></button>';
  const heroDraw = () => {
    const kw = hq.value.trim().toLowerCase();
    if (!kw) { hres.innerHTML = '<p class="hero-empty">输入关键词开始检索。</p>'; return; }
    const lits = db.lit.filter(r => has(r, kw)).slice(0, 6);
    const kbs = db.kb.filter(r => has(r, kw)).slice(0, 6);
    const ideas = (db.ideas || []).filter(r => has(r, kw) ||
      (r.notes || []).some(n => String(n.text || '').toLowerCase().includes(kw))).slice(0, 6);
    if (!lits.length && !kbs.length && !ideas.length) { hres.innerHTML = '<p class="hero-empty">没有匹配的文献或知识条目。</p>'; return; }
    hres.innerHTML =
      (lits.length ? '<div class="hgroup">文献 · ' + lits.length + '</div>' + lits.map(r => item('lit', r, '#faeaec')).join('') : '') +
      (kbs.length ? '<div class="hgroup">知识库 · ' + kbs.length + '</div>' + kbs.map(r => item('kb', r, 'rgba(255,255,255,.16)')).join('') : '') +
      (ideas.length ? '<div class="hgroup">点子库 · ' + ideas.length + '</div>' + ideas.map(r => item('idea', r, 'rgba(255,255,255,.16)')).join('') : '');
  };
  hq.oninput = heroDraw;
  hres.onclick = e => {
    const b = e.target.closest('.hres'); if (!b) return;
    const kind = b.dataset.kind;
    const pool = kind === 'lit' ? db.lit : kind === 'kb' ? db.kb : (db.ideas || []);
    const rec = pool.find(x => x.id === b.dataset.id);
    if (!rec) return;
    go(kind === 'idea' ? 'kb' : kind);
    if (kind === 'lit') CIIB.openLit(rec);
    else if (kind === 'kb') CIIB.openKb(rec);
    else CIIB.openIdea(rec);
  };

  /* ---- 导入 / 导出：合并为一个下拉菜单 ---- */
  if (view._bakClose) document.removeEventListener('click', view._bakClose);
  const bakBtn = view.querySelector('[data-act="bak"]'), bakMenu = view.querySelector('[data-act="bakmenu"]');
  bakBtn.onclick = e => { e.stopPropagation(); bakMenu.hidden = !bakMenu.hidden; };
  view._bakClose = e => {
    if (!bakMenu.hidden && !e.target.closest('[data-act="bak"]') && !e.target.closest('[data-act="bakmenu"]')) bakMenu.hidden = true;
  };
  document.addEventListener('click', view._bakClose);
  view.querySelector('[data-act="export"]').onclick = () => { bakMenu.hidden = true; CIIB.exportAll(); };
  view.querySelector('[data-act="import"]').onclick = () => { bakMenu.hidden = true; view.querySelector('[data-act="file"]').click(); };
  view.querySelector('[data-act="file"]').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    CIIB.readTextFile(f, text => {
      try {
        const d = JSON.parse(text);
        if (!confirm('导入备份将覆盖当前全部数据，确定继续？')) return;
        Object.keys(db).forEach(k => delete db[k]);
        Object.assign(db, d);
        save(); alert('导入完成'); home(view, go);
      } catch(err) { alert('备份文件解析失败：' + err.message); }
    });
    e.target.value = '';
  };
}

shell();
})();
