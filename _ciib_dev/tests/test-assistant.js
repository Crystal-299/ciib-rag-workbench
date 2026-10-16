/* CIIB 问答助手回归测试（jsdom）
   运行：NODE_PATH=<node_modules> node tests/test-assistant.js
   覆盖：语料构建与排除项 → tokenizer → BM25 排序 → prompt 组装 → 引用解析
        → 能力档位（未登录/无 SDK 降级）→ 浮窗交互 → 流式作答 → 模型回退 → 索引热更新 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..', 'workplat');
const ENTRY = path.join(ROOT, 'ciib · 植物生信可视化工作台.html');
const SRC = [
  'ciib_app/common.js', 'ciib_app/cloud.js',
  'ciib_note/plasmid.js', 'ciib_note/mol.js', 'ciib_note/protocol.js', 'ciib_note/exp.js', 'ciib_note/tf.js',
  'ciib_plot/plot.js', 'ciib_lit/lit.js', 'ciib_kb/kb.js',
  'ciib_tools/tools.js',
  'ciib-ro/ro.js', 'ciib_app/assistant.js', 'ciib_app/main.js'
];

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const section = t => console.log('\n' + t);

const html = fs.readFileSync(ENTRY, 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.structuredClone = w.structuredClone || (o => JSON.parse(JSON.stringify(o)));
w.crypto = w.crypto || require('crypto').webcrypto;
const ctxStub = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (...a) => undefined), set: (t, p, v) => (t[p] = v, true) });
w.HTMLCanvasElement.prototype.getContext = function () { return ctxStub; };

const NOW = new Date().toISOString();
const SEQ = 'ATGCTAGCTAGCTAGCATCGA';
const SEED = {
  plasmids: [{ id: 'pl1', name: 'p1300-ProGeneA::GUS', seq: SEQ, topology: 'circular', updated: NOW,
    features: [{ name: '35S', type: 'promoter', start: 1, end: 8, strand: 1, color: '#4c72b0' }] }],
  builds: [{ id: 'b1', name: 'p1300-ProGeneA::GUS', module: '普通', status: '构建中', note: '待酶切', updated: NOW }],
  pcrs: [{ id: 'pc1', name: 'GeneA-CDS 片段', template: 'gDNA', updated: NOW }],
  primers: [{ id: 'pr1', name: 'GeneA-F', module: '普通', updated: NOW }],
  schemes: [{ id: 's1', name: '示例植物转化方案', cultivar: '示例植物', strain: 'EHA105', od600: 0.2, infection: '10 min',
    selection: 'Hyg 25 mg/L', stages: [{ name: '预培养', start: '2026-10-01', days: 3 }], notes: '侵染后共培养两天', updated: NOW }],
  events: [{ id: 'e1', name: '组会', start: '2026-10-16', days: 1 }],
  lit: [{ id: 'l1', title: 'TOE-type genes cause a dominant double-flower phenotype', brief: '花发育', tags: ['花发育'], notes: '笔记', updated: NOW }],
  litGroups: [{ id: 'g1', name: '花发育群', brief: '一组花发育文献', members: ['l1'] }],
  kb: [{ id: 'k1', title: 'BiFC 原理', tags: ['互作'], content: 'split 荧光互补', updated: NOW }],
  exps: [{ id: 'x1', name: 'BiFC 验证 GeneA–GeneB', stage: '执行', tags: ['互作'], check: { step2: true },
    fbs: [{ id: 'f1', text: '先测序确认载体', from: 'x1', done: false }], updated: NOW }],
  trouble: [{ id: 't1', name: 'qPCR 无扩增', scope: '实验', symptom: '上筛选后小芽全部死亡', cause: '潮霉素浓度偏高',
    fix: '降到 15 mg/L 再试', tags: ['转化'], updated: NOW }],
  protocols: [{ id: 'pt1', name: 'CTAB 法提 DNA', cat: '分子', tags: ['DNA'],
    reagents: [{ name: 'CTAB 缓冲液', body: '2% CTAB' }], steps: [{ stage: '裂解', text: '65℃ 水浴 30 min', key: true }], tips: ['样品别超过 100 mg'] }],
  todos: [{ id: 'td1', text: '测序结果比对', due: '2026-10-20', done: false, created: NOW }],
  ideas: [{ id: 'i1', title: '原基起始身份问题', tags: ['发育'], content: '是不是 WUS 的边界问题', status: '未验证', created: NOW }],
  litPos: { l1: { x: 10, y: 20 } },
  homeQuick: ['plot', 'lit']
};
w.localStorage.setItem('ciib2:db', JSON.stringify(SEED));
SRC.forEach(f => w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const doc = w.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));

(async function main(){
  const ask = w.CIIB.ask;
  if (!ask){ console.log('✗ 助手模块没有加载（CIIB.ask 不存在）'); process.exit(1); }
  const I = ask._internals;

  /* ---------- A. 语料 ---------- */
  section('[A] 语料构建：把 db 展平成带回引的文档块');
  const n = ask.build();
  const docs = ask.docs;
  const total = ['plasmids','builds','pcrs','primers','schemes','events','lit','litGroups','kb','exps','trouble','protocols','todos','ideas']
    .reduce((a, k) => a + SEED[k].length, 0);
  ok('文档块数量 = 各集合记录数之和', n === total, n + ' vs ' + total);
  ok('每块都带模块 + 记录 id（引用能跳回原记录）',
    docs.every(d => !!d.mod && !!d.id && !!d.label), JSON.stringify(docs.filter(d => !d.id)[0] || {}));
  ok('覆盖 14 个落库模块的 14 类标签',
    new Set(docs.map(d => d.label)).size === 14, new Set(docs.map(d => d.label)).size);
  ok('载体图谱：排除序列碱基（只留名称 / 拓扑 / 元件）',
    !docs.some(d => d.text.includes(SEQ)) &&
    (docs.find(d => d.id === 'pl1') || {}).text.includes('circular'));
  ok('引物 / 载体构建 / 片段扩增都归到「分子实验」模块键 mol',
    docs.filter(d => ['b1','pc1','pr1'].includes(d.id)).every(d => d.mod === 'mol'));
  ok('实验链路 / 排障库 / 操作手册都归 exp，但标签各自区分',
    ['x1','t1','pt1'].every(id => (docs.find(d => d.id === id) || {}).mod === 'exp') &&
    ['实验链路','排障库','操作手册'].every(l => docs.some(d => d.label === l)));
  ok('知识库拾贝与点子库都归 kb', ['k1','i1'].every(id => (docs.find(d => d.id === id) || {}).mod === 'kb'));
  ok('转化方案与日历事件都归 tf（科研总览里遗传转化页含日历）',
    ['s1','e1'].every(id => (docs.find(d => d.id === id) || {}).mod === 'tf'));
  ok('文献群组归 lit（能跳到文献页）', (docs.find(d => d.id === 'g1') || {}).mod === 'lit');
  ok('待办归 todo', (docs.find(d => d.id === 'td1') || {}).mod === 'todo');
  ok('litPos / homeQuick 这类界面状态不产生文档块', !docs.some(d => d.id === 'litPos' || d.id === 'homeQuick'));
  ok('科研绘图 / 实用功能不进语料（不落库）',
    !docs.some(d => /科研绘图|实用功能/.test(d.label)));
  ok('正文里不出现裸 id', !docs.some(d => /：x1\b|：f1\b|：pl1\b/.test(d.text)));
  ok('勾选态 bool 不进正文（避免一堆 false 噪音）',
    !docs.some(d => /：false|：true/.test(d.text)));
  ok('字段名换成中文标签，模型看得懂',
    (docs.find(d => d.id === 'x1') || {}).text.includes('阶段：执行') &&
    (docs.find(d => d.id === 's1') || {}).text.includes('菌株：EHA105'));
  ok('数组里的对象压成一行（试剂 / 步骤不糊成多行）',
    (docs.find(d => d.id === 'pt1') || {}).text.includes('试剂：CTAB 缓冲液（配方：2% CTAB）') &&
    (docs.find(d => d.id === 'pt1') || {}).text.includes('步骤：裂解（'),
    (docs.find(d => d.id === 'pt1') || {}).text);
  ok('指向别的记录的 id 换成了对方标题（文献群组成员 / 关联文献）',
    (docs.find(d => d.id === 'g1') || {}).text.includes('成员：TOE-type genes cause a dominant double-flower phenotype'),
    (docs.find(d => d.id === 'g1') || {}).text);
  ok('实验反馈里的来源 id 也换成了实验名',
    (docs.find(d => d.id === 'x1') || {}).text.includes('来源：BiFC 验证 GeneA–GeneB'),
    (docs.find(d => d.id === 'x1') || {}).text);
  ok('数据概览列各模块条数', /实验链路 1 条/.test(I.overview(w.CIIB.db)) && /排障库 1 条/.test(I.overview(w.CIIB.db)), I.overview(w.CIIB.db));

  /* ---------- B. 分词 ---------- */
  section('[B] tokenizer：中文 2-gram + 单字，英文 / 数字按词');
  const tk = ts => I.tokenize(ts).map(x => x.t);
  ok('中文切成 2-gram', tk('示例植物').includes('示例') && tk('示例植物').includes('植物'));
  ok('同时保留单字（兜底只问一个字的情况）', tk('示例植物').includes('示'));
  ok('单字权重低于 2-gram', I.tokenize('暖')[0].w < I.tokenize('暖地')[0].w);
  ok('英文按词并统一小写', tk('BiFC').includes('#bifc'));
  ok('数字保留（OD600 / 0.2 这类参数能查）', tk('0.2').includes('#0.2') && tk('OD600').includes('#od600'));
  ok('标点与空格不产生 token', tk('，，  。').length === 0);

  /* ---------- C. 检索 ---------- */
  section('[C] BM25 检索：本地打分，取 top-k');
  const h1 = ask.hits('qPCR 无扩增');
  ok('排障库那条排第一', h1.length && h1[0].doc.id === 't1', JSON.stringify(h1.map(h => h.doc.id)));
  ok('分数降序', h1.every((h, i) => i === 0 || h1[i - 1].score >= h.score));
  const h2 = ask.hits('示例植物 转化 菌株');
  ok('问转化方案 → 命中转化方案', h2.length && h2[0].doc.id === 's1', JSON.stringify(h2.map(h => h.doc.id)));
  const h3 = ask.hits('EHA105');
  ok('问到菌株编号 → 仍能命中（正文命中）', h3.some(h => h.doc.id === 's1'));
  ok('标题命中权重高于正文（同名短语查标题那条更靠前）',
    ask.hits('BiFC 原理')[0].doc.id === 'k1', JSON.stringify(ask.hits('BiFC 原理').map(h => h.doc.id)));
  ok('完全无关的查询不给结果', ask.hits('量子计算机 星际迷航').length === 0);
  ok('top-k 最多 6 条', ask.hits('a e i o u 1 2 3 实验').length <= 6);
  const longQ = ask.hits('上筛选后小芽全部死亡');
  ok('症状描述能命中排障库', longQ.length && longQ[0].doc.id === 't1');

  /* ---------- D. prompt 组装 ---------- */
  section('[D] prompt：概览 + 编号片段 + 问题');
  const msgs = I.buildMessages('转化用了什么菌株', h2, w.CIIB.db);
  ok('两条消息：system + user', msgs.length === 2 && msgs[0].role === 'system' && msgs[1].role === 'user');
  ok('system 里写明「补充（通用知识）」要分开标注', /补充（通用知识）/.test(msgs[0].content));
  ok('system 里禁止编造', /不要编造/.test(msgs[0].content));
  ok('system 要求用【n】标引用', /【1】【2】/.test(msgs[0].content));
  ok('system 要求「记录里没有就上通用知识，别只回一句没有」', /不要只回一句/.test(msgs[0].content));
  ok('user 里带数据概览', /【数据概览】/.test(msgs[1].content));
  ok('user 里片段带编号与标题', /\[1\] 【转化方案】示例植物转化方案/.test(msgs[1].content), msgs[1].content.slice(0, 160));
  ok('user 里带问题', /【问题】\n转化用了什么菌株/.test(msgs[1].content));
  const empty = I.buildMessages('无关问题', [], w.CIIB.db);
  ok('没有命中时明确写「没有检索到相关记录」', /没有检索到相关记录/.test(empty[1].content));

  /* ---------- E. 引用解析 ---------- */
  section('[E] 引用解析：答案里的【n】变成可点标记');
  ok('extractCites 去重升序', JSON.stringify(I.extractCites('依据【2】和【1】，另见【2】')) === '[1,2]');
  ok('没有引用时返回空', I.extractCites('普通回答').length === 0);
  const segs = I.splitCites('先【1】后【3】');
  ok('splitCites 交替切出 text / cite',
    segs.length === 4 && segs[0].t === 'text' && segs[1].t === 'cite' && segs[1].v === 1 && segs[3].v === 3,
    JSON.stringify(segs));

  /* ---------- F. 能力档位 ---------- */
  section('[F] 能力档位：登录才生成，否则只检索');
  ok('没有 SDK/网络 → 只检索，并说明原因',
    ask.capability().mode === 'search' && /联网|离线/.test(ask.capability().why), ask.capability().why);
  w.WorkBuddyCloud = {};                                   /* 模拟线上环境：SDK 已加载 */
  const realReady = w.CIIB.cloud.ready;
  w.CIIB.cloud.ready = async () => ({llm: {chat: {completions: {create: () => (async function*(){})()}}}});
  w.CIIB.cloud.user = null;
  ok('有 SDK 但未登录 → 只检索，并提示登录',
    ask.capability().mode === 'search' && ask.capability().needLogin === true, JSON.stringify(ask.capability()));
  w.CIIB.cloud.user = 'a@b.c';
  ok('已登录 → 开启 AI 作答', ask.capability().mode === 'full');

  /* ---------- G. 浮窗交互 ---------- */
  section('[G] 右下角浮窗：挂载 / 展开 / 提问 / 引用跳转');
  ask.mount();
  const fab = $('.ask-fab');
  ok('右下角出现常驻按钮', !!fab && /问/.test(fab.textContent));
  const css = fs.readFileSync(path.join(ROOT, 'ciib_app/style.css'), 'utf8');
  ok('按钮固定在右下角，不与右上角云同步按钮抢位',
    /\.ask-fab\{[^}]*right:22px[^}]*bottom:22px/.test(css) && /\.cloud-fab\{[^}]*top:14px[^}]*right:18px/.test(css));
  ok('科研总览全屏时浮窗让位（与 cloud-fab 同一处理）', /\.app\.ro-mode \.ask-fab/.test(css));
  fab.click();
  const panel = $('.ask-panel');
  ok('点开后出现问答面板', !!panel && !panel.hidden);
  ok('面板里说明记录条数、数据归属与作答状态',
    /账号 a@b\.c · \d+ 条记录可检索/.test($('#askNote').textContent) && /AI 作答已开启/.test($('#askNote').textContent),
    $('#askNote').textContent);
  ok('首屏只留一句话：说出问题/关键词 + 不够的用通用知识补',
    /请说出你的问题或关键词/.test($('.ask-log').textContent) && /通用知识/.test($('.ask-log').textContent),
    $('.ask-log').textContent);
  ok('首屏不再罗列模块名，也不自称「面向 ciib 的问答助手」',
    !/实验链路|排障库|操作手册|点子库|载体图谱/.test($('.ask-log').textContent) &&
    !/面向 ciib 的问答助手/.test(panel.textContent));
  ok('输入框提示也跟着收敛', /说出你的问题或关键词/.test($('[data-ask-q]').placeholder), $('[data-ask-q]').placeholder);
  /* 「×」关不掉的老问题：.ask-panel 是 display:flex，会盖掉 [hidden] 默认的 display:none */
  ok('浮窗关闭靠 hidden，CSS 里显式补了 .ask-panel[hidden]{display:none}',
    /\.ask-panel\[hidden\]\{display:none\}/.test(css));
  ok('靛蓝主题下「问」按钮改成白底（可读性）',
    /html\.theme-ink \.ask-fab\{[^}]*background:#fff/.test(css), '未匹配到 theme-ink 覆盖');
  /* 靛蓝模式 --bg 就是页面底色，浮窗沿用它会跟网页糊在一起 */
  ok('靛蓝主题下对话区不再用页面底色（改用浅蓝底）',
    /html\.theme-ink \.ask-log\{background:#eaf1fa\}/.test(css));
  ok('靛蓝主题下输入框是白底 + 加深描边（看得出输入区）',
    /html\.theme-ink \.ask-input textarea\{background:#fff;border-color:#8fa9cc\}/.test(css));
  ok('靛蓝主题下浮窗描边/阴影加重，轮廓不糊在页面上',
    /html\.theme-ink \.ask-panel\{border-color:#8fa9cc/.test(css));

  /* 引用跳转：把 roOpenRecord 换成探针 */
  const opened = [];
  w.CIIB.roOpenRecord = (mod, id) => { opened.push([mod, id]); return {ok: true, shown: 'card'}; };

  /* 未登录提问 → 只检索 */
  w.CIIB.cloud.user = null;
  $('[data-ask-q]').value = 'qPCR 无扩增';
  $('[data-ask-form]').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  await new Promise(r => setTimeout(r, 30));
  ok('提问后日志里出现我的问题', /qPCR 无扩增/.test($('.ask-log').textContent));
  ok('未登录时明确说明只做了检索', /未登录账号|只能在本机检索/.test($('.ask-log').textContent), $('.ask-log').textContent.slice(-160));
  const chips = $$('.ask-hits .ask-chip');
  ok('命中记录列成可点卡片', chips.length >= 1 && /qPCR 无扩增/.test(chips[0].textContent), chips[0] && chips[0].textContent);
  chips[0].click();
  ok('点卡片跳到工作台原记录（模块 + id）',
    opened.length === 1 && opened[0][0] === 'exp' && opened[0][1] === 't1', JSON.stringify(opened));
  ok('跳转后面板自动收起', $('.ask-panel').hidden === true);
  $('.ask-fab').click();

  /* 未登录 + 一条都没命中：不能只丢一句「没有」，要指出「登录后才有通用知识」 */
  $('[data-ask-q]').value = 'zzz 本机绝对不存在的关键词 qqq';
  $('[data-ask-form]').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  await new Promise(r => setTimeout(r, 30));
  ok('没命中且未登录时，说明「登录后可用记录 + 通用知识作答」',
    /没登录/.test($('.ask-log').textContent) && /登录后/.test($('.ask-log').textContent),
    $('.ask-log').textContent.slice(-140));

  /* 已登录提问 → 流式作答 + 引用高亮 */
  w.CIIB.cloud.user = 'a@b.c';
  let sent = null, round = 0;
  const fakeStream = (chunks) => (async function*(){ for (const c of chunks) yield {choices: [{delta: {content: c}}]}; })();
  w.CIIB.cloud.ready = async () => ({llm: {chat: {completions: {create: opts => {
    round++; sent = opts;
    if (round === 1) throw new Error('模型不可用');           /* 第一档模型失败 → 触发回退 */
    return fakeStream(['你的记录里有一条排障【1】，处理办法是降低浓度。', '\n补充（通用知识）：潮霉素筛选浓度过高会抑制再生。']);
  }}}}});
  $('[data-ask-q]').value = '上筛选后小芽死了怎么办';
  $('[data-ask-form]').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  await new Promise(r => setTimeout(r, 60));
  ok('登录后向模型发出请求', !!sent && Array.isArray(sent.messages) && sent.messages.length === 2);
  ok('用流式（SDK 只支持 stream:true）', sent && sent.stream === true);
  ok('答案里出现模型返回的内容', /降低浓度/.test($('.ask-log').textContent));
  ok('通用知识部分照原样保留标注', /补充（通用知识）/.test($('.ask-log').textContent));
  const refs = $$('.ask-ref');
  ok('答案里的【1】渲染成可点引用', refs.length === 1 && refs[0].textContent === '1');
  const citeChips = $$('.ask-cites .ask-chip');
  ok('底部列出本条用到的记录', citeChips.length === 1 && /qPCR 无扩增/.test(citeChips[0].textContent));
  refs[0].click();
  ok('点引用同样能跳到原记录',
    opened.length === 2 && opened[1][0] === 'exp' && opened[1][1] === 't1', JSON.stringify(opened));
  ok('第一档模型失败后自动回退到第二档', round === 2 && sent.model === 'deepseek-v4.1-flash', 'round=' + round + ' model=' + (sent && sent.model));
  $('.ask-fab').click();

  /* 一条都没命中也要走 AI：把「没有检索到相关记录」如实交给模型，让它用通用知识答 */
  sent = null; round = 0;
  $('[data-ask-q]').value = 'zzz 记录里绝对没有的词 qqq';
  $('[data-ask-form]').dispatchEvent(new w.Event('submit', {bubbles: true, cancelable: true}));
  await new Promise(r => setTimeout(r, 60));
  ok('登录后 0 命中不短路，照样把问题交给模型（用通用知识作答）',
    !!sent && /没有检索到相关记录/.test(JSON.stringify(sent.messages)), sent ? '已发送' : '0 命中被短路了');

  /* ---------- H. 索引热更新 ---------- */
  section('[H] 数据一变就重建索引');
  const before = ask.docs.length;
  w.CIIB.db.kb.push({id: 'k9', title: '新增的拾贝', tags: ['新'], content: '刚记的一条', updated: NOW});
  w.CIIB.save();
  ok('新增记录后语料跟着变多', ask.docs.length === before + 1, before + ' → ' + ask.docs.length);
  ok('新记录马上能被检索到', ask.hits('新增的拾贝').some(h => h.doc.id === 'k9'));

  /* ---------- I. 只读与边界 ---------- */
  section('[I] 只读与边界');
  ok('助手不写工作台数据（只有 save 被包装，没有写 db 的路径）',
    Object.keys(w.CIIB.db).length === Object.keys(SEED).length);
  ok('空库也能构建语料（不抛错）',
    I.buildCorpus({}).length === 0 && I.overview({}) === '（本机还没有任何记录）');
  ok('空库检索返回空数组', I.search('任何问题', [], I.buildIndex([]), 6).length === 0);
  const longRec = {id: 'L1', name: '超长记录', notes: 'X'.repeat(5000)};
  const longDoc = I.buildCorpus({kb: [longRec]})[0];
  ok('单条超长正文被截断（不让一条记录吃掉上下文）', longDoc.text.length <= 1900, longDoc.text.length);
  w.CIIB.cloud.ready = realReady;

  console.log('\n助手测试结果: ' + pass + ' 通过, ' + fail + ' 失败');
  w.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('运行出错：', e); process.exit(1); });
