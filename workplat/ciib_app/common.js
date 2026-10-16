/* ciib_app/common.js — 公共工具（全局 CIIB 命名空间，支持 file:// 直接打开） */
(function(){
'use strict';
const CIIB = window.CIIB = { pages: {} };

CIIB.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
CIIB.uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
CIIB.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
CIIB.addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return CIIB.dateKey(d); };
CIIB.dateKey = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

/* ---------- 数据存储 ----------
   存储作用域（localStorage 键）分两种，目的是「数据按账号隔离」：
   · 未登录 / 离线单文件版打开 → ciib2:db（本机模式，行为与以前一致）
   · 已登录 → ciib2:db@<账号 id>（同一台电脑换账号不会串数据、也不会看到上一个人的记录）

   切换作用域由 ciib_app/cloud.js 在登录 / 退出时调用 CIIB.scope() 完成。
   db 对象在全站都是同一个引用（各模块直接持有），所以切换是「原地换内容」而不是换对象。 */
const BASE_KEY = 'ciib2:db';
const DEFAULTS = {
  plasmids: [],   // 载体图谱：{id,name,seq,topology,features:[{name,type,start,end,strand,color}]}
  builds: [],     // 载体构建
  pcrs: [],       // 片段扩增
  primers: [],    // 引物（module: 普通/CRISPR/RNAi）
  schemes: [],    // 遗传转化方案：{id,name,cultivar,traits,strain,od600,infection,selection,stages:[{name,start,days,color}],notes}
  events: [],     // 日历自定义事件：{id,name,start,days,color}
  lit: [],        // 文献：{id,title,authors,year,journal,doi,tags,brief,notes,related:[],no,prio}
  litGroups: [],  // 关联群组：{id,name,brief,notes,members:[]}
  litPos: {},     // 关系网节点位置：{文献id:{x,y}}（参考坐标系 REF_W×REF_H）
  kb: [],         // 知识库：{id,title,tags,content}
  exps: [],       // 实验链路：{id,name,stage,...,tags,check:{},fbs:[{id,text,from,done,due,doneAt}],trs:[排障id]}
  trouble: [],    // 排障库：{id,scope,symptom,cause,check,evidence,fix,tags,exps:[实验id]}
  // 操作手册：{id,name,cat,tags,reagents:[{name,body,note}],steps:[{stage,text,time,note,key}],tips:[{text}],refs:[字符串],created,updated}
  protocols: [],
  todos: [],      // 主页待办：{id,text,due,done,doneAt,created}
  ideas: [],      // 点子库：{id,title,tags,content,status('待验证'|'已验证'|'已归档'),created,notes:[{id,text,at}]}
  // 主页快捷入口（子页粒度："模块[:子页序号]"，如 plot:3=热图、exp:1=排障库；可在主页自定义）
  homeQuick: ['plot:0', 'plasmid', 'lit:0', 'kb:0']
};
function readDB(key){
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULTS), d);
  } catch(e){ console.warn('载入数据失败，使用空库', e); return structuredClone(DEFAULTS); }
}
let KEY = BASE_KEY;                        /* 当前作用域键 */
const db = CIIB.db = readDB(KEY);
CIIB.moduleKeys = Object.keys(DEFAULTS);   // 数据模块清单（云同步按模块分片上传）
/* 真正的「记录」模块：homeQuick 是界面配置、litPos 是节点坐标，都不算内容 */
CIIB.contentKeys = CIIB.moduleKeys.filter(k => k !== 'homeQuick' && k !== 'litPos');

CIIB.dbKeyOf = uid => BASE_KEY + (uid ? '@' + String(uid).replace(/[^\w.@+-]/g, '_') : '');
CIIB.scopeKey = () => KEY;
/* 切换数据作用域：把目标键的内容读进同一个 db 对象，全站立刻生效 */
CIIB.scope = function(key){
  KEY = key || BASE_KEY;
  const next = readDB(KEY);
  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, next);
  return db;
};
/* 只清空内存里的 db，不动任何存储键 —— 未登录（登录门禁）时用：
   既保证「什么都不显示」是真的什么都不显示，也不会把本机副本弄丢 */
CIIB.blank = function(){
  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, structuredClone(DEFAULTS));
  return db;
};
/* 当前作用域里有多少条真实记录（判断「有没有内容」，登录门禁与空态用） */
CIIB.recordCount = function(){
  return CIIB.contentKeys.reduce((n, k) => n + (Array.isArray(db[k]) ? db[k].length : 0), 0);
};
CIIB.save = function(){ try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){ alert('保存失败：' + e.message); } };

CIIB.download = function(value, name, type){
  const blob = new Blob([value], {type: type || 'application/json'});
  const fallback = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  /* 优先弹出「另存为」对话框让用户选择保存目录（Edge/Chrome 的文件系统访问 API）；
     用户取消则静默放弃，环境不支持时回退为直接下载 */
  if (window.showSaveFilePicker) {
    const ext = (name.match(/(\.[a-z0-9]+)$/i) || [''])[1].toLowerCase();
    const MIME = {'.json':'application/json', '.svg':'image/svg+xml', '.csv':'text/csv', '.txt':'text/plain', '.tsv':'text/tab-separated-values', '.png':'image/png', '.fasta':'text/plain'};
    const opts = {suggestedName: name};
    if (MIME[ext]) opts.types = [{description: ext.slice(1).toUpperCase() + ' 文件', accept: {[MIME[ext]]: [ext]}}];
    window.showSaveFilePicker(opts)
      .then(h => h.createWritable().then(ws => ws.write(blob).then(() => ws.close())))
      .catch(e => { if (e && e.name === 'AbortError') return; fallback(); });
  } else {
    fallback();
    CIIB.toast && CIIB.toast('当前浏览器不支持自选保存位置，已保存到默认下载目录');
  }
};
CIIB.toast = function(msg){
  const el = document.createElement('div');
  el.className = 'ciib-toast'; el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 2400);
};
CIIB.exportAll = function(){
  CIIB.download(JSON.stringify(db, null, 2), 'ciib-backup-' + CIIB.today() + '.json');
};
CIIB.readTextFile = function(file, cb){
  const r = new FileReader();
  r.onload = () => cb(r.result);
  r.readAsText(file);
};

/* ---------- 模态框 ---------- */
CIIB.modal = function(title, bodyHTML, onMount, wide){
  const shade = document.createElement('div');
  shade.className = 'modal-shade';
  shade.innerHTML = '<section class="modal" style="' + (wide ? 'width:min(920px,100%)' : '') + '" role="dialog" aria-modal="true">'
    + '<div class="modal-head"><h2>' + CIIB.esc(title) + '</h2><button class="x" aria-label="关闭">×</button></div>'
    + '<div class="modal-body"></div></section>';
  let cleanup = null;
  const close = () => {
    if (cleanup) { try { cleanup(); } catch(e){} cleanup = null; }
    shade.remove();
  };
  /* 双击圆点开详情时，第二下会落在刚弹出的遮罩上——若照常关闭，表现为「点了没反应」。
     故：双击的第二下（detail===2）与刚打开 400ms 内的点击都不关闭弹窗。 */
  const openedAt = Date.now();
  shade.addEventListener('mousedown', e => {
    if (e.target !== shade) return;
    if (e.detail === 2 || Date.now() - openedAt < 400) return;
    close();
  });
  shade.querySelector('.x').onclick = close;
  /* 先入 DOM 再跑 onMount：onMount 里才有真实的布局尺寸可量（如载体序列按容器宽度算每行碱基数）。
     onMount 可返回清理函数，关闭时执行（移除全局事件监听等）。 */
  document.body.appendChild(shade);
  const body = shade.querySelector('.modal-body');
  body.innerHTML = bodyHTML;
  if (onMount) cleanup = onMount(body, close);
  return close;
};

/* 表单模态框：fields=[{key,label,type:'text|date|textarea|select|color|number',options,ph,def,full,rows}] */
CIIB.formModal = function(title, fields, initial, onSave){
  const val = k => {
    const v = initial?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
    const f = fields.find(x => x.key === k);
    return f?.def ?? '';
  };
  const html = fields.map(f => {
    const v = val(f.key), full = f.full ? ' full' : '';
    if (f.type === 'textarea') return '<label class="field' + full + '"><span>' + CIIB.esc(f.label) + '</span><textarea rows="' + (f.rows || 3) + '" data-k="' + f.key + '" placeholder="' + CIIB.esc(f.ph || '') + '">' + CIIB.esc(v) + '</textarea></label>';
    if (f.type === 'select') return '<label class="field' + full + '"><span>' + CIIB.esc(f.label) + '</span><select data-k="' + f.key + '">' + f.options.map(o => '<option value="' + CIIB.esc(o) + '"' + (String(o) === String(v) ? ' selected' : '') + '>' + CIIB.esc(o) + '</option>').join('') + '</select></label>';
    /* datalist：下拉里选现成的，也可以直接自己输（保存的就是输入框里的真实值） */
    if (f.type === 'datalist') return '<label class="field' + full + '"><span>' + CIIB.esc(f.label) + '</span><input list="dl-' + f.key + '" data-k="' + f.key + '" value="' + CIIB.esc(v) + '" placeholder="' + CIIB.esc(f.ph || '可下拉选择，也可自行输入') + '"><datalist id="dl-' + f.key + '">' + (f.options || []).map(o => '<option value="' + CIIB.esc(o) + '">').join('') + '</datalist></label>';
    const t = f.type || 'text';
    return '<label class="field' + full + '"><span>' + CIIB.esc(f.label) + '</span><input type="' + t + '" data-k="' + f.key + '" value="' + CIIB.esc(v) + '" placeholder="' + CIIB.esc(f.ph || '') + '"></label>';
  }).join('');
  CIIB.modal(title, '<form class="form-grid">' + html +
    '<div class="form-actions"><button type="button" class="ghost" data-act="cancel">取消</button><button class="primary" type="submit">保存</button></div></form>',
    (body, close) => {
      const form = body.querySelector('form');
      form.onsubmit = e => {
        e.preventDefault();
        const out = Object.assign({}, initial);
        form.querySelectorAll('[data-k]').forEach(inp => { out[inp.dataset.k] = inp.value; });
        try { onSave(out); close(); } catch(err){ alert(err.message); }
      };
      body.querySelector('[data-act="cancel"]').onclick = close;
    });
};

/* ---------- 通用记录列表页 ---------- */
/* opts: {records, blank, fields, title, sub, cardHTML(rec), onSave, onDelete, extraHTML, mount, isDone} */
CIIB.recordPage = function(opts){
  const m = opts.mount;
  m.innerHTML = '<div class="page-head"><div><h1>' + CIIB.esc(opts.title) + '</h1><p>' + CIIB.esc(opts.sub) + '</p></div>'
    + '<button class="primary" data-act="new">＋ 新建记录</button></div>'
    + '<input class="search" placeholder="搜索名称、标签、备注…" data-act="q">'
    + (opts.extraHTML || '') + '<div class="card-grid" data-act="list"></div>';
  const list = m.querySelector('[data-act="list"]'), q = m.querySelector('[data-act="q"]');
  const draw = () => {
    const kw = q.value.trim().toLowerCase();
    let vis = opts.records.filter(r => !kw || JSON.stringify(r).toLowerCase().includes(kw));
    /* 带「完成态」的模块（如载体构建的「已完成」）自动把完成项沉到最后 */
    if (opts.isDone) vis = CIIB.sinkDone(vis, opts.isDone);
    list.innerHTML = vis.map(r => '<article class="card" data-id="' + r.id + '">' + opts.cardHTML(r) +
      '<div class="card-bottom"><small>更新于 ' + (r.updated ? r.updated.slice(0, 10) : '尚未保存') + '</small>'
      + '<span><button class="text-button" data-act="edit">编辑</button> <button class="text-button danger" data-act="del">删除</button></span></div></article>').join('')
      || '<div class="empty"><span>◇</span><p>还没有记录，点击右上角新建。</p></div>';
    CIIB.save();
  };
  q.oninput = draw;
  list.onclick = e => {
    const card = e.target.closest('.card'); if (!card) return;
    const rec = opts.records.find(r => r.id === card.dataset.id); if (!rec) return;
    const act = e.target.dataset.act;
    if (act === 'edit') CIIB.formModal('编辑记录', opts.fields, rec, v => { opts.onSave(v, rec); draw(); });
    if (act === 'del') { if (confirm('删除这条记录？删除后无法恢复（可先用工作台的备份导出）。')) { opts.onDelete(rec); draw(); } }
  };
  m.querySelector('[data-act="new"]').onclick = () => CIIB.formModal('新建记录', opts.fields, Object.assign({ id: CIIB.uid() }, opts.blank),
    v => { opts.onSave(v); draw(); });
  draw();
};

/* ---------- 其他工具 ---------- */
/* 完成 / 归档态统一沉底：稳定分区 —— 未完成的保持原相对顺序，已完成的整体挪到最后。
   任何列表（点子库的「已归档」、实验记录的「完成」阶段、分子实验的「已完成」……）
   只要勾上完成态，条目就自动落到最下面，不用手动排序。 */
CIIB.sinkDone = function(arr, isDone){
  const a = arr || [], open = [], done = [];
  a.forEach(x => (isDone(x) ? done : open).push(x));
  return open.concat(done);
};
/* 各模块的「完成 / 归档」判定集中在这里，新增模块只改这一处 */
CIIB.DONE = {
  idea:     r => (r.status || '未解决') === '已归档',
  exp:      r => r.stage === '完成',
  build:    r => r.status === '已完成',
  feedback: r => !!r.done,
  todo:     r => !!r.done
};
CIIB.byDone = (kind, arr) => CIIB.sinkDone(arr, CIIB.DONE[kind] || (() => false));

CIIB.parseTSV = text => text.trim().split(/\r?\n/).map(l => l.split(/\t|,|；|;/).map(s => s.trim())).filter(r => r.some(c => c !== ''));
CIIB.PALETTE = ['#167c69','#5984c6','#a775b7','#d88b4b','#cc6574','#729d51','#4f8ca8','#b58e3e','#8b6bb1','#c26a8a'];
CIIB.FEAT_TYPES = ['promoter','CDS','terminator','gene','rep_origin','polyA_signal','selector','misc_feature','T-DNA','primer_bind','ori','tag'];
})();
