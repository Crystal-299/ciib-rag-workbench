/* ciib_note/exp.js — 实验链路：实验记录（目的→方案→现象→偏离→复盘→下一步）+ 排障库
   数据新增在 db.exps / db.trouble，不改动任何已有模块的数据与字段
   ① 导师反馈 = 结构化待办闭环（可勾选完成、可设截止日、汇总进主页「今日待办」）
   ② 排障条目 ↔ 实验记录 双向关联（exp.trs / trouble.exps 同步维护） */
(function(){
'use strict';
const {esc, uid, db, save, formModal, addDays} = CIIB;
const iso = () => new Date().toISOString();
const S = (r, k) => String((r && r[k]) || '').trim();
const today = () => CIIB.today();

const STAGES = ['设计', '准备', '进行', '复盘', '完成'];
const EXP_FIELDS = [
  {key:'name', label:'实验名称 *', ph:'如 BiFC 验证 GeneA–GeneB 互作'},
  {key:'stage', label:'当前阶段', type:'select', options:STAGES, def:'设计'},
  {key:'purpose', label:'① 要验证什么（目的 / 假设）', type:'textarea', rows:2, full:true,
    ph:'如 假设 GeneA 与 GeneB 在核内互作；若互作应在核内出现 YFP 信号'},
  {key:'controls', label:'② 对照组怎么设', type:'textarea', rows:2, full:true,
    ph:'如 阴性：空载体共转；阳性：已知互作对；空白：未转化叶片'},
  {key:'rep', label:'重复次数 / 样本量', ph:'如 生物学重复 3 次 · 每重复 5 片叶'},
  {key:'protocol', label:'所用方案 / protocol', ph:'如 BiFC 载体构建 → 农杆菌注射烟草'},
  {key:'params', label:'关键参数', type:'textarea', rows:2, full:true, ph:'如 OD600=0.6、22 ℃ 培养 48 h、注射后 3 d 观察'},
  {key:'result', label:'③ 现象与结果', type:'textarea', rows:2, full:true, ph:'如 阳性对照有信号，实验组无信号'},
  {key:'dev', label:'④ 偏离（哪一步与方案不一致，异常值标原因不删）', type:'textarea', rows:2, full:true,
    ph:'如 注射时菌液 OD 实测 0.9（方案 0.6）；第 2 重复叶片有机械损伤，标记不计入统计'},
  {key:'review', label:'⑤ 复盘结论（失败 / 与预期不符的原因）', type:'textarea', rows:2, full:true,
    ph:'如 先查载体是否正确 → 测序确认；再查表达 → WB；最后查菌液浓度'},
  {key:'next', label:'下一步', type:'textarea', rows:2, full:true, ph:'如 重做注射，OD 调到 0.6，加阳性对照'},
  {key:'tags', label:'标签', ph:'如 BiFC, 互作, 烟草'}
];
const TR_FIELDS = [
  {key:'scope', label:'技术 / 方案 *', ph:'如 PCR / 酶切连接 / 农杆菌转化 / BiFC / GUS 染色'},
  {key:'symptom', label:'现象 *', ph:'如 无条带 / 全是杂带 / 转化后不长 / 无荧光信号'},
  {key:'cause', label:'可能原因（按概率从高到低）', type:'textarea', rows:3, full:true,
    ph:'1. 模板降解或量太少\n2. 引物失效 / 浓度算错\n3. 退火温度过高'},
  {key:'check', label:'先查什么（检查顺序）', type:'textarea', rows:2, full:true,
    ph:'先跑阳性对照 → 排除体系；再测模板浓度；最后梯度 PCR 试探退火温度'},
  {key:'evidence', label:'看什么证据（怎么确认）', type:'textarea', rows:2, full:true,
    ph:'Nanodrop 读 A260/280；阳性对照出带即体系没问题'},
  {key:'fix', label:'怎么改（已验证的解决办法）', type:'textarea', rows:2, full:true, ph:'重新提取模板，稀释到 50 ng/μL 后重跑'},
  {key:'tags', label:'标签', ph:'如 PCR, 无条带'}
];
/* 内置示例排障条目：不自动写入用户数据，需点按钮导入 */
const TR_SEED = [
  {scope:'PCR', symptom:'无条带（阳性对照也无带）', cause:'1. 体系漏加酶或 dNTP\n2. 聚合酶失活（反复冻融 / 未低温）\n3. 程序设错（退火温度写成延伸温度）', check:'先用已知能扩增的模板+引物跑阳性对照 → 有带说明体系没问题，问题在模板或引物', evidence:'阳性对照出带 = 体系与程序正常', fix:'重配体系（酶最后加、冰上操作）；聚合酶分装避免反复冻融', tags:'PCR, 无条带'},
  {scope:'PCR', symptom:'杂带多 / 拖尾', cause:'1. 退火温度偏低\n2. 模板量过多或含杂质\n3. 延伸时间过长', check:'先做退火温度梯度（55–65 ℃）→ 再稀释模板 10 倍重试', evidence:'梯度里温度升高条带变单一，即为退火温度问题', fix:'提高退火温度 2–3 ℃，模板稀释后重跑，必要时切胶回收', tags:'PCR, 杂带'},
  {scope:'酶切连接', symptom:'连接后转化率极低 / 全是空载', cause:'1. 载体去磷酸化不彻底（自连）\n2. 插入片段与载体摩尔比不当\n3. 酶切不完全', check:'先跑「载体自连」对照板 → 空载菌落多说明自连严重', evidence:'自连对照菌落数 ≈ 实验组 = 自连主导', fix:'载体双酶切后去磷酸化；片段:载体摩尔比 3:1–5:1；胶回收纯化片段', tags:'克隆, 连接'},
  {scope:'农杆菌转化 / 注射', symptom:'注射后无荧光（BiFC / GFP）', cause:'1. 菌液浓度过高导致叶片坏死\n2. 表达时间不够（<48 h）\n3. 载体构建有误（读框 / 反向插入）', check:'先注射阳性对照构建 → 阳性无信号说明注射或观察条件问题；阳性有信号说明是构建问题', evidence:'阳性对照有信号 = 注射与观察流程正常，问题在载体', fix:'OD600 调到 0.6（实测不要估），22–25 ℃ 培养 48–72 h 再观察；测序确认载体', tags:'BiFC, 转化, 无信号'},
  {scope:'GUS 染色', symptom:'背景整体变蓝 / 无特异信号', cause:'1. 染色时间过长\n2. 材料本身有内源 GUS 活性\n3. 固定不充分导致扩散', check:'先做未转化材料同条件染色对照 → 对照也蓝说明内源活性或染色条件问题', evidence:'阴性材料出现蓝色 = 内源活性或染色时间过长', fix:'缩短染色时间（先 2 h 观察）、加 20% 甲醇抑制内源活性、染色前充分固定与漂洗', tags:'GUS, 染色'}
];
/* 实验前检查清单模板 */
const CHECK_TPL = [
  '材料与试剂齐备（含对照组材料）',
  '试剂在效期内、已分装标记',
  '仪器已预约 / 校准',
  '方案版本与关键参数已确认',
  '记录表格已备好（含异常值栏：只标原因，不删数据）',
  '重复次数已确定（生物学重复 ≥3）',
  '生物安全与废液处理已安排'
];
/* 链路闭环检查：哪些环节还空着 */
function gaps(r){
  const g = [];
  if (!S(r, 'purpose')) g.push('缺目的/假设');
  if (!S(r, 'controls')) g.push('缺对照说明');
  if (S(r, 'dev') && !S(r, 'review')) g.push('有偏离未复盘');
  if (r.stage === '复盘' && !S(r, 'review')) g.push('复盘阶段未写结论');
  if (S(r, 'result') && !S(r, 'next')) g.push('有结果未写下一步');
  return g;
}
const stageCls = st => ({'设计':'todo', '准备':'todo', '进行':'doing', '复盘':'doing', '完成':'done'}[st] || 'todo');

/* ---- 导师 / 他人反馈：结构化待办（旧 feedback 文本自动迁移为一条待办） ---- */
function fbsOf(r){
  if (!Array.isArray(r.fbs)) {
    const old = S(r, 'feedback');
    r.fbs = old ? [{id: uid(), text: old, from: '', done: false, due: '', created: iso()}] : [];
  }
  return r.fbs;
}
const fbTodo = fb => !fb.done;
function fbModal(rec, done){
  const fbs = fbsOf(rec);
  const fbRow = f =>
      '<div class="fb-row' + (f.done ? ' done' : '') + '">' +
      '<label class="chk-row"><input type="checkbox" data-fb="' + f.id + '"' + (f.done ? ' checked' : '') + '><span>' + esc(f.text) + '</span></label>' +
      '<div class="fb-meta">' + (f.from ? '来自 ' + esc(f.from) + ' · ' : '') +
      '<input type="date" data-due="' + f.id + '" value="' + esc(f.due || '') + '" title="截止日">' +
      (f.done && f.doneAt ? '<small>已完成 ' + f.doneAt.slice(0, 10) + '</small>' : '') +
      '<button class="text-button danger" data-delfb="' + f.id + '">删除</button></div></div>';
  /* 已完成（已勾选）的反馈待办自动排到最后 */
  const fbList = () => CIIB.byDone('feedback', fbs).map(fbRow).join('') +
      (fbs.length ? '' : '<p class="muted">还没有反馈条目。</p>');
  CIIB.modal('反馈待办 · ' + rec.name,
    '<p class="muted" style="margin:0 0 10px">每条反馈就是一项待办：勾选=已处理并记录完成时间，可设截止日（到期会出现在主页「今日待办」）。<b>勾选后该条会自动排到最后。</b></p>' +
    '<div data-act="fblist">' + fbList() + '</div>' +
    '<div class="fb-new"><input data-act="fbtext" placeholder="新反馈，如：先测序确认载体再重做">' +
    '<input data-act="fbfrom" placeholder="来源（导师/师兄）" style="width:130px">' +
    '<button class="primary" type="button" data-act="fbadd">＋ 添加</button></div>' +
    '<div class="form-actions"><button class="ghost" type="button" data-act="all">全部标记完成</button><button class="primary" type="button" data-act="ok">完成</button></div>',
    (body, close) => {
      const sync = () => {
        body.querySelectorAll('input[data-fb]').forEach(i => {
          const f = fbs.find(x => x.id === i.dataset.fb); if (!f) return;
          const was = f.done; f.done = i.checked;
          if (f.done && !was) f.doneAt = iso();
          if (!f.done) f.doneAt = '';
        });
        body.querySelectorAll('input[data-due]').forEach(i => {
          const f = fbs.find(x => x.id === i.dataset.due); if (f) f.due = i.value;
        });
      };
      /* 勾选 / 取消后立刻重排：已完成的那条马上沉到列表最后（不必等点「完成」） */
      const listBox = body.querySelector('[data-act="fblist"]');
      body.addEventListener('change', e => {
        if (!e.target.matches('input[data-fb], input[data-due]')) return;
        sync(); rec.updated = iso(); save();
        if (e.target.matches('input[data-fb]')) listBox.innerHTML = fbList();
      });
      body.querySelector('[data-act="fbadd"]').onclick = () => {
        const t = body.querySelector('[data-act="fbtext"]').value.trim();
        if (!t) return;
        fbs.push({id: uid(), text: t, from: body.querySelector('[data-act="fbfrom"]').value.trim(), done: false, due: today(), created: iso()});
        rec.updated = iso(); save(); close(); if (done) done(); fbModal(rec, done);
      };
      body.querySelector('[data-act="all"]').onclick = () => {
        fbs.forEach(f => { if (!f.done) { f.done = true; f.doneAt = iso(); } });
        rec.updated = iso(); save(); close(); if (done) done(); fbModal(rec, done);
      };
      body.onclick = e => {
        const d = e.target.dataset.delfb;
        if (d) { const i = fbs.findIndex(x => x.id === d); if (i >= 0) fbs.splice(i, 1); rec.updated = iso(); save(); close(); fbModal(rec, done); }
      };
      body.querySelector('[data-act="ok"]').onclick = () => { sync(); rec.updated = iso(); save(); close(); if (done) done(); };
    });
}
/* ---- 排障库 ↔ 实验记录 双向关联 ---- */
function linkTr(rec, done){
  if (!Array.isArray(rec.trs)) rec.trs = [];
  if (!db.trouble.length) { alert('排障库还是空的，先到「排障库」页签新建或载入内置示例。'); return; }
  CIIB.modal('关联排障条目 · ' + rec.name,
    '<p class="muted" style="margin:0 0 10px">勾选与本实验相关的排障条目（关联后双向可见：排障卡片上也会显示这条实验）。</p>' +
    db.trouble.map(t =>
      '<label class="chk-row"><input type="checkbox" data-tr="' + t.id + '"' + (rec.trs.includes(t.id) ? ' checked' : '') + '>' +
      '<span><b>' + esc(t.symptom) + '</b><br><small class="muted">' + esc(t.scope || '—') + '</small></span></label>').join('') +
    '<div class="form-actions"><button class="ghost" type="button" data-act="c">取消</button><button class="primary" type="button" data-act="ok">保存关联</button></div>',
    (body, close) => {
      body.querySelector('[data-act="c"]').onclick = close;
      body.querySelector('[data-act="ok"]').onclick = () => {
        const sel = [];
        body.querySelectorAll('input[data-tr]').forEach(i => { if (i.checked) sel.push(i.dataset.tr); });
        /* 双向同步：先摘掉本实验的旧关联，再写入新的 */
        db.trouble.forEach(t => {
          if (!Array.isArray(t.exps)) t.exps = [];
          const had = t.exps.includes(rec.id), now = sel.includes(t.id);
          if (had && !now) t.exps = t.exps.filter(x => x !== rec.id);
          if (!had && now) t.exps.push(rec.id);
        });
        rec.trs = sel; rec.updated = iso(); save(); close(); if (done) done();
      };
    });
}
function linkExp(rec, done){
  if (!Array.isArray(rec.exps)) rec.exps = [];
  if (!db.exps.length) { alert('还没有实验记录，先在「实验链路」页签新建一条。'); return; }
  CIIB.modal('关联实验记录 · ' + rec.symptom,
    '<p class="muted" style="margin:0 0 10px">勾选遇到过这个现象的实验（关联后实验卡片上会显示这条排障条目）。</p>' +
    db.exps.map(x =>
      '<label class="chk-row"><input type="checkbox" data-ex="' + x.id + '"' + (rec.exps.includes(x.id) ? ' checked' : '') + '>' +
      '<span><b>' + esc(x.name) + '</b><br><small class="muted">' + esc(S(x, 'protocol') || '未填方案') + '</small></span></label>').join('') +
    '<div class="form-actions"><button class="ghost" type="button" data-act="c">取消</button><button class="primary" type="button" data-act="ok">保存关联</button></div>',
    (body, close) => {
      body.querySelector('[data-act="c"]').onclick = close;
      body.querySelector('[data-act="ok"]').onclick = () => {
        const sel = [];
        body.querySelectorAll('input[data-ex]').forEach(i => { if (i.checked) sel.push(i.dataset.ex); });
        db.exps.forEach(x => {
          if (!Array.isArray(x.trs)) x.trs = [];
          const had = x.trs.includes(rec.id), now = sel.includes(x.id);
          if (had && !now) x.trs = x.trs.filter(v => v !== rec.id);
          if (!had && now) x.trs.push(rec.id);
        });
        rec.exps = sel; rec.updated = iso(); save(); close(); if (done) done();
      };
    });
}
const trOf = id => db.trouble.find(t => t.id === id);
const expOf = id => db.exps.find(x => x.id === id);

function expTab(m, rerender){
  const list = m.querySelector('[data-act="list"]'), q = m.querySelector('[data-act="q"]');
  const draw = () => {
    const kw = q.value.trim().toLowerCase();
    /* 阶段为「完成」的实验自动沉到最后 */
    const vis = CIIB.byDone('exp', db.exps.filter(r => !kw || JSON.stringify(r).toLowerCase().includes(kw)));
    list.innerHTML = vis.map(r => {
      const g = gaps(r), ck = r.check || {};
      const done = CHECK_TPL.filter(t => ck[t]).length;
      const fbs = fbsOf(r), todo = fbs.filter(fbTodo), trs = (r.trs || []).map(trOf).filter(Boolean);
      return '<article class="card" data-id="' + r.id + '">' +
        '<div class="section-head"><h3>' + esc(r.name) + '</h3>' +
        '<span class="status ' + stageCls(r.stage) + '">' + esc(r.stage || '设计') + '</span></div>' +
        '<div class="kv">' +
        (S(r, 'purpose') ? '<span class="k">验证什么</span><span>' + esc(S(r, 'purpose')) + '</span>' : '') +
        (S(r, 'controls') ? '<span class="k">对照</span><span>' + esc(S(r, 'controls')) + '</span>' : '') +
        (S(r, 'rep') ? '<span class="k">重复</span><span>' + esc(S(r, 'rep')) + '</span>' : '') +
        (S(r, 'protocol') ? '<span class="k">方案</span><span>' + esc(S(r, 'protocol')) + '</span>' : '') +
        (S(r, 'params') ? '<span class="k">参数</span><span>' + esc(S(r, 'params')).replace(/\n/g, '<br>') + '</span>' : '') +
        (S(r, 'result') ? '<span class="k">现象</span><span>' + esc(S(r, 'result')) + '</span>' : '') +
        (S(r, 'dev') ? '<span class="k">偏离</span><span>' + esc(S(r, 'dev')) + '</span>' : '') +
        (S(r, 'review') ? '<span class="k">复盘</span><span>' + esc(S(r, 'review')) + '</span>' : '') +
        (S(r, 'next') ? '<span class="k">下一步</span><span>' + esc(S(r, 'next')) + '</span>' : '') +
        '</div>' +
        (fbs.length ? '<div class="fb-list">' +
          '<div class="fb-head">反馈待办 <b>' + (fbs.length - todo.length) + '/' + fbs.length + '</b> 已处理</div>' +
          todo.slice(0, 3).map(f => '<div class="fb-item">☐ ' + esc(f.text) + (f.due ? ' <small class="muted">（截止 ' + esc(f.due) + '）</small>' : '') + '</div>').join('') +
          (todo.length > 3 ? '<div class="fb-item muted">…还有 ' + (todo.length - 3) + ' 条</div>' : '') +
          '</div>' : '') +
        (trs.length ? '<div class="tags" style="margin-top:8px">' +
          trs.map(t => '<span class="tag link" data-act="gotr" data-id="' + t.id + '" title="点击查看排障条目">⚑ ' + esc(t.symptom) + '</span>').join('') + '</div>' : '') +
        '<div class="tags" style="margin-top:8px">' +
        '<span class="tag">检查清单 ' + done + '/' + CHECK_TPL.length + '</span>' +
        '<button class="text-button" data-act="fb">反馈待办' + (todo.length ? ' (' + todo.length + ')' : '') + '</button>' +
        '<button class="text-button" data-act="link">关联排障</button>' +
        g.map(x => '<span class="tag warn" data-gap="1">' + esc(x) + '</span>').join('') +
        '</div>' +
        '<div class="card-bottom"><small>更新于 ' + (r.updated ? r.updated.slice(0, 10) : '—') + '</small>' +
        '<span><button class="text-button" data-act="check">检查清单</button> ' +
        '<button class="text-button" data-act="edit">编辑</button> ' +
        '<button class="text-button danger" data-act="del">删除</button></span></div></article>';
    }).join('') || '<div class="empty"><span>◇</span><p>还没有实验记录。新建一条，把「要验证什么」写清楚开始。</p></div>';
    save();
  };
  q.oninput = draw;
  m.querySelector('[data-act="new"]').onclick = () => formModal('新建实验记录', EXP_FIELDS, {id: uid(), stage: '设计'},
    v => { Object.assign(v, {updated: iso(), check: {}, fbs: [], trs: []}); db.exps.unshift(v); save(); draw(); });
  list.onclick = e => {
    const card = e.target.closest('.card'); if (!card) return;
    const rec = db.exps.find(r => r.id === card.dataset.id); if (!rec) return;
    const act = e.target.dataset.act;
    if (act === 'edit') formModal('编辑实验记录', EXP_FIELDS, rec, v => { Object.assign(rec, v, {updated: iso()}); save(); draw(); });
    if (act === 'del') { if (confirm('删除实验记录「' + rec.name + '」？删除后无法恢复。')) { const i = db.exps.indexOf(rec); if (i >= 0) db.exps.splice(i, 1); save(); draw(); } }
    if (act === 'check') checkModal(rec, draw);
    if (act === 'fb') fbModal(rec, draw);
    if (act === 'link') linkTr(rec, draw);
    if (act === 'gotr') rerender(2, trOf(e.target.dataset.id));   /* 排障库是第 3 个子页 */
  };
  draw();
  return {focus(id){ const t = trOf(id); if (t) { q.value = t.symptom; draw(); } }};
}
function checkModal(rec, done){
  const ck = rec.check || (rec.check = {});
  CIIB.modal('实验前检查清单 · ' + rec.name,
    '<p class="muted" style="margin:0 0 10px">按实验前该确认的事项逐项打勾（状态保存在这条实验上）：</p>' +
    CHECK_TPL.map(t =>
      '<label class="chk-row"><input type="checkbox" data-t="' + esc(t) + '"' + (ck[t] ? ' checked' : '') + '><span>' + esc(t) + '</span></label>').join('') +
    '<div class="form-actions"><button class="ghost" type="button" data-act="reset">清空</button><button class="primary" type="button" data-act="ok">完成</button></div>',
    (body, close) => {
      body.querySelector('[data-act="reset"]').onclick = () => { body.querySelectorAll('input[type=checkbox]').forEach(i => i.checked = false); };
      body.querySelector('[data-act="ok"]').onclick = () => {
        body.querySelectorAll('input[data-t]').forEach(i => { ck[i.dataset.t] = i.checked; });
        rec.updated = iso(); save(); close(); if (done) done();
      };
    });
}
function troubleTab(m, goExp){
  CIIB.recordPage({mount: m, records: db.trouble, fields: TR_FIELDS, blank: {scope:'', symptom:''},
    title:'排障库', sub:'按「技术/方案 → 现象 → 可能原因 → 先查什么 → 看什么证据 → 怎么改」记录，失败几次就能积累出自己的故障库',
    extraHTML: '<div class="toolbar"><button data-act="seed">载入 5 条内置示例</button><button data-act="fromexp">从实验记录导入现象</button></div>',
    cardHTML: r => {
      const exs = (r.exps || []).map(expOf).filter(Boolean);
      return '<div class="section-head"><h3>' + esc(r.symptom) + '</h3><span class="tags"><span>' + esc(r.scope || '—') + '</span></span></div>' +
      '<div class="kv">' +
      (S(r, 'cause') ? '<span class="k">可能原因</span><span>' + esc(S(r, 'cause')).replace(/\n/g, '<br>') + '</span>' : '') +
      (S(r, 'check') ? '<span class="k">先查什么</span><span>' + esc(S(r, 'check')) + '</span>' : '') +
      (S(r, 'evidence') ? '<span class="k">看什么证据</span><span>' + esc(S(r, 'evidence')) + '</span>' : '') +
      (S(r, 'fix') ? '<span class="k">怎么改</span><span>' + esc(S(r, 'fix')) + '</span>' : '') +
      '</div>' +
      (exs.length ? '<div class="tags" style="margin-top:8px">' +
        exs.map(x => '<span class="tag link" data-act="goexp" data-id="' + x.id + '" title="点击查看实验记录">⚗ ' + esc(x.name) + '</span>').join('') + '</div>' : '') +
      '<div class="tags" style="margin-top:8px"><button class="text-button" data-act="link">关联实验</button></div>';
    },
    onSave: (v, old) => { Object.assign(v, {updated: iso(), id: old ? old.id : v.id}); if (old) Object.assign(old, v); else db.trouble.unshift(v); save(); },
    onDelete: r => {
      const i = db.trouble.indexOf(r); if (i >= 0) db.trouble.splice(i, 1);
      db.exps.forEach(x => { if (Array.isArray(x.trs)) x.trs = x.trs.filter(v => v !== r.id); });
      save();
    }
  });
  /* recordPage 内部的 list.onclick 只处理 edit/del，这里在冒泡阶段接管自定义按钮 */
  m.querySelector('[data-act="seed"]').onclick = () => {
    TR_SEED.forEach(t => db.trouble.unshift(Object.assign({id: uid(), updated: iso(), exps: []}, t)));
    save(); troubleTab(m, goExp);
  };
  m.querySelector('[data-act="fromexp"]').onclick = () => {
    const src = db.exps.filter(r => S(r, 'dev') || S(r, 'review'));
    if (!src.length) { alert('还没有实验记录写了「偏离」或「复盘」，先在实验链路里补全。'); return; }
    CIIB.modal('从实验记录导入现象',
      '<p class="muted" style="margin:0 0 10px">勾选要导入排障库的记录（现象取「偏离/复盘」，所属技术取「方案」）：</p>' +
      src.map(r => '<label class="chk-row"><input type="checkbox" data-id="' + r.id + '"><span><b>' + esc(r.name) + '</b><br><small class="muted">' + esc(S(r, 'protocol') || '未填方案') + ' — ' + esc((S(r, 'dev') || S(r, 'review')).slice(0, 60)) + '</small></span></label>').join('') +
      '<div class="form-actions"><button class="ghost" type="button" data-act="c">取消</button><button class="primary" type="button" data-act="ok">导入</button></div>',
      (body, close) => {
        body.querySelector('[data-act="c"]').onclick = close;
        body.querySelector('[data-act="ok"]').onclick = () => {
          let n = 0;
          body.querySelectorAll('input[data-id]:checked').forEach(i => {
            const r = db.exps.find(x => x.id === i.dataset.id); if (!r) return;
            const t = {id: uid(), updated: iso(), scope: S(r, 'protocol') || '未分类',
              symptom: (S(r, 'dev') || S(r, 'review')).slice(0, 80), cause: S(r, 'review'), check: '', evidence: '', fix: S(r, 'next'), tags: S(r, 'tags'), exps: [r.id]};
            db.trouble.unshift(t);
            if (!Array.isArray(r.trs)) r.trs = []; r.trs.push(t.id);
            n++;
          });
          save(); close(); troubleTab(m, goExp);
          if (n) alert('已导入 ' + n + ' 条，并自动与来源实验双向关联。建议补全「先查什么 / 看什么证据」。');
        };
      });
  };
  m.onclick = e => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const card = t.closest('.card'); if (!card) return;
    const rec = db.trouble.find(x => x.id === card.dataset.id); if (!rec) return;
    if (t.dataset.act === 'link') linkExp(rec, () => troubleTab(m, goExp));
    if (t.dataset.act === 'goexp') goExp(t.dataset.id);
  };
}

/* ---- 主页「今日待办」用：把实验侧该处理的事汇总出来 ----
   返回 [{id, text, sub, tag, done, kind:'fb'|'gap'|'check', expId, fbId, due}] */
CIIB.expAgenda = function(){
  const td = today(), out = [];
  db.exps.forEach(r => {
    fbsOf(r).filter(fbTodo).forEach(f => {
      if (f.due && f.due > td) return;
      out.push({id:'fb:' + r.id + ':' + f.id, text:f.text, sub:r.name + ' · 反馈待办', tag:'反馈',
        kind:'fb', expId:r.id, fbId:f.id, due:f.due || ''});
    });
    const g = gaps(r);
    if (g.length) out.push({id:'gap:' + r.id, text:'补完「' + r.name + '」的' + g[0],
      sub:'链路闭环 · 还剩 ' + g.length + ' 处待补', tag:'链路', kind:'gap', expId:r.id, due:''});
    if (r.stage === '准备') {
      const ck = r.check || {}, n = CHECK_TPL.filter(t => ck[t]).length;
      if (n < CHECK_TPL.length) out.push({id:'ck:' + r.id, text:'完成「' + r.name + '」的实验前检查清单',
        sub:'已勾 ' + n + '/' + CHECK_TPL.length + ' 项', tag:'准备', kind:'check', expId:r.id, due:''});
    }
  });
  return out;
};
/* 主页勾选某条反馈待办 */
CIIB.expToggleFb = function(expId, fbId){
  const r = db.exps.find(x => x.id === expId); if (!r) return;
  const f = fbsOf(r).find(x => x.id === fbId); if (!f) return;
  f.done = !f.done; f.doneAt = f.done ? iso() : '';
  r.updated = iso(); save();
};

CIIB.pages.exp = {
  title: '实验记录',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>实验记录 · 操作手册 / 链路 / 排障</h1>' +
      '<p>操作手册（Protocol）：试剂配制 + 分步操作（耗时 / 重点 / 注意事项批注）+ Tips，可导出 Word / PDF / 网页 / Markdown，重点自动高亮。实验链路按 目的/假设 → 对照 → 方案参数 → 现象 → 偏离 → 复盘 → 下一步 记录，反馈逐条变待办（可勾选闭环）；排障库与实验双向关联，按「现象→原因→先查什么→证据→怎么改」积累可检索的故障经验。</p></div></div>' +
      '<div class="tabs" data-act="tabs">' +
      ['操作手册', '实验链路', '排障库'].map((t, i) => '<button class="chip' + (i === 0 ? ' active' : '') + '" data-tab="' + i + '">' + t + '</button>').join('') + '</div>' +
      '<div data-act="pane"></div>';
    const tabs = m.querySelector('[data-act="tabs"]'), pane = m.querySelector('[data-act="pane"]');
    let cur = 0, api = null;
    tabs.onclick = e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      tabs.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      sub(+b.dataset.tab);
    };
    function sub(i, focus){
      cur = i;
      if (i === 0) {                      /* 操作手册（Protocol） */
        if (CIIB.protocolTab) CIIB.protocolTab(pane); else pane.innerHTML =
          '<div class="empty"><span>◇</span><p>操作手册模块未加载（ciib_note/protocol.js）</p></div>';
      } else if (i === 1) {               /* 实验链路 */
        pane.innerHTML = '<div class="page-head"><div><h2>实验链路</h2><p>阶段标签 + 闭环提示：哪个环节还空着会直接标出来。</p></div>' +
          '<button class="primary" data-act="new">＋ 新建实验</button></div>' +
          '<input class="search" placeholder="搜索目的、对照、方案、现象、复盘…" data-act="q">' +
          '<div class="card-grid" data-act="list"></div>';
        api = expTab(pane, (to, tr) => {
          tabs.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', +x.dataset.tab === to));
          sub(to, tr);
        });
      } else troubleTab(pane, id => {     /* 排障库 → 跳回实验链路并过滤出该实验 */
        tabs.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', +x.dataset.tab === 1));
        sub(1);
        const q = pane.querySelector('[data-act="q"]');
        const e = db.exps.find(x => x.id === id);
        if (q && e) { q.value = e.name; q.dispatchEvent(new Event('input')); }
      });
      if (focus && api && api.focus) api.focus(focus.id || focus);
    }
    sub(0);
  }
};
})();
