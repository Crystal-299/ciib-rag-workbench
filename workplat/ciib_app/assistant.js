/* ciib_app/assistant.js — 右下角常驻问答浮窗
   ---------------------------------------------------------------------------
   一句话原理：**把工作台里你自己的记录，变成能被提问的语料**。

   语料 = 当前工作台里的记录，也就是「你账号下的数据」（云同步把这台电脑的副本
   和账号对齐，见 ciib_app/cloud.js）。**没有单独的语料库要维护**：你在页面上新增 /
   修改 / 删除记录，这里跟着变（CIIB.save 后自动重建索引）。

   三段流水线，各管一件事：
     ① 语料  把 ciib2:db 里的记录展平成文档块（每块都带「模块 + 记录 id」的回引）
     ② 检索  **在本机**用 BM25 打分，取最相关的 6 块（中文按 2-gram + 单字，英文按词）
     ③ 生成  把命中的片段交给云端模型流式作答，答案里带【1】【2】这样的引用，
              记录里没有的内容另起一行标成「补充（通用知识）」—— 你自己的数据和通用知识不混在一起

   为什么检索放在本地（而不是把整库交给模型）？
   · 语料本来就在浏览器里（登录后是账号数据的本机副本），整库上传既慢又多余；
   · 片段化只发 top-k，token 花得少、延迟低，而且**只有命中的那几段**离开本机；
   · 语料是几百条结构化记录，字面命中率高，关键词检索足够 —— 等语料上万条再谈向量。

   降级路径（明确提示，不假装成功）：
   · 未登录 / 没网络 / 单文件版离线打开 → 跳过第 ③ 段，直接把命中的记录列出来。
   · 科研绘图、实用功能不落库，因此不进语料；它们是「操作知识」而不是「你的数据」。
   --------------------------------------------------------------------------- */
(function(){
'use strict';
if (!window.CIIB) return;

/* ==========================================================================
   一、语料：把 db 展平成文档块
   --------------------------------------------------------------------------
   排除项：
   · 科研绘图 / 实用功能 —— 不落库，没有可引用的记录；
   · litPos（关系网节点坐标）/ homeQuick（快捷入口配置）—— 是界面状态，不是内容；
   · 载体序列 seq、各种 id、颜色值 —— 占 token 又没有检索价值。
   ========================================================================== */
const SKIP_KEY = /^(id|.*Id|.*_id|seq|color|col|x|y|w|h|check|pos|positions|litPos|homeQuick)$/;
/* 存的是「别的记录的 id」的字段：进语料前换成对方标题 —— 模型看 id 没有意义 */
const REF_KEY = /^(related|members|trs|exps|from|evidenceIds|litIds|expIds)$/;
/* 这些字段的值可以直接当「这一条的名字」用（顺序即优先级：先取到的当名字，
   其余字段进括号 —— 步骤的 stage 要排在 text 前面，否则「裂解」会被丢掉） */
const TITLE_KEYS = ['name', 'title', 'symptom', 'stage', 'text', 'vector', 'vectorName'];
/* 字段名 → 中文标签（没列到的字段就用原名，模型照样看得懂） */
const FIELD_CN = {
  name:'名称', title:'标题', text:'内容', content:'内容', notes:'备注', note:'备注', brief:'简介', desc:'描述',
  stage:'阶段', status:'状态', state:'状态', tags:'标签', symptom:'症状', cause:'原因', fix:'处理', evidence:'依据',
  scope:'范围', cat:'类别', category:'类别', steps:'步骤', tips:'提示', refs:'参考', reagents:'试剂', body:'配方',
  strain:'菌株', cultivar:'品种', od600:'OD600', infection:'侵染时间', selection:'筛选', traits:'目标性状',
  stages:'阶段', start:'开始', days:'天数', due:'截止', done:'已完成', doneAt:'完成于', created:'创建于', updated:'更新于',
  authors:'作者', year:'年份', journal:'期刊', doi:'DOI', prio:'优先级', no:'编号', related:'关联', members:'成员',
  topology:'拓扑', features:'元件', module:'类别', vector:'载体', primer:'引物', fbs:'反馈', trs:'排障',
  time:'耗时', key:'要点', from:'来源', at:'时间'
};
function cn(k){ return FIELD_CN[k] || k; }
function isScalar(v){ return typeof v === 'string' ? !!v.trim() : (typeof v === 'number' && isFinite(v)); }
/* 深度优先收集标量，按字段名归组：{名称:['x'], 阶段:['执行']} —— 同字段的多值用「；」串起来。
   两种特殊处理，都是为了让语料更像人话：
   · 数组里的对象压成一行「名字（字段：值；字段：值）」——否则一个试剂会散成好几行；
   · 指向其它记录的 id 换成目标标题 —— 「关联文献：TOE-type…」比「关联：l1」有用得多。 */
function digest(rec, refMap){
  const map = new Map();
  const put = (k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  /* 值 → 文本：指向其它记录的 id 换成目标标题，「关联文献：TOE-type…」比「关联：l1」有用得多 */
  const fmt = (k, v) => {
    const s = String(v).trim();
    return (refMap && REF_KEY.test(k) && refMap.has(s)) ? refMap.get(s) : s;
  };
  const oneLine = obj => {
    let headKey = '', head = '';
    for (const k of TITLE_KEYS){ if (isScalar(obj[k])){ headKey = k; head = String(obj[k]).trim(); break; } }
    const rest = [];
    Object.keys(obj).forEach(k => {
      if (SKIP_KEY.test(k) || k === headKey) return;
      const v = obj[k];
      if (isScalar(v)) rest.push(cn(k) + '：' + fmt(k, v));
      else if (Array.isArray(v)){
        const s = v.filter(isScalar).map(x => fmt(k, x)).join('；');
        if (s) rest.push(cn(k) + '：' + s);
      }
    });
    return head + (rest.length ? '（' + rest.join('；') + '）' : '');
  };
  (function walk(v, key, depth){
    if (v === null || v === undefined || depth > 4) return;
    if (typeof v === 'boolean') return;                       /* 勾选态：语义弱，带 bool 只会产生噪音 */
    if (isScalar(v)){ put(cn(key), fmt(key, v)); return; }
    if (Array.isArray(v)){
      const plain = [], objs = [];
      v.forEach(x => (x && typeof x === 'object' && !Array.isArray(x)) ? objs.push(x) : (isScalar(x) && plain.push(x)));
      if (plain.length) put(cn(key), plain.map(x => fmt(key, x)).join('；'));
      objs.forEach(o => put(cn(key), oneLine(o)));
      return;
    }
    if (typeof v === 'object') Object.keys(v).forEach(k => { if (!SKIP_KEY.test(k)) walk(v[k], k, depth + 1); });
  })(rec, '', 0);
  return Array.from(map).map(([k, arr]) => (k ? k + '：' : '') + arr.filter(Boolean).join('；')).filter(Boolean).join('\n');
}
function titleOf(rec){
  return String(rec.name || rec.title || rec.text || rec.symptom || rec.vector || rec.vectorName || '（未命名）').slice(0, 120);
}
function dateOf(rec){
  const d = rec.updated || rec.created || rec.doneAt || rec.start || rec.year || '';
  return String(d).slice(0, 10);
}
function tagsOf(rec){
  const t = rec.tags;
  return Array.isArray(t) ? t.join(' ') : (t ? String(t) : '');
}

/* db 集合 → 归属模块（mod 必须是 ro.js 里 roOpenRecord 认识的键，引用才能跳过去） */
const GROUPS = [
  { key:'plasmids',  mod:'plasmid', label:'载体图谱' },
  { key:'builds',    mod:'mol',     label:'载体构建' },
  { key:'pcrs',      mod:'mol',     label:'片段扩增' },
  { key:'primers',   mod:'mol',     label:'引物' },
  { key:'schemes',   mod:'tf',      label:'转化方案' },
  { key:'events',    mod:'tf',      label:'日历事件' },
  { key:'exps',      mod:'exp',     label:'实验链路' },
  { key:'trouble',   mod:'exp',     label:'排障库' },
  { key:'protocols', mod:'exp',     label:'操作手册' },
  { key:'lit',       mod:'lit',     label:'文献' },
  { key:'litGroups', mod:'lit',     label:'文献群组' },
  { key:'kb',        mod:'kb',      label:'知识库' },
  { key:'ideas',     mod:'kb',      label:'点子库' },
  { key:'todos',     mod:'todo',    label:'待办' }
];
const MAX_BODY = 1800;    /* 单块正文上限：一条记录不该把整段上下文吃掉 */

function buildCorpus(db){
  const docs = [];
  /* 先建立 id → 标题 的映射，供「关联 / 成员 / 排障」这类引用字段换成人话 */
  const refMap = new Map();
  GROUPS.forEach(g => {
    const arr = db && db[g.key];
    if (Array.isArray(arr)) arr.forEach(r => { if (r && r.id) refMap.set(r.id, titleOf(r)); });
  });
  GROUPS.forEach(g => {
    const arr = db && db[g.key];
    if (!Array.isArray(arr)) return;
    arr.forEach(rec => {
      if (!rec || typeof rec !== 'object') return;
      const title = titleOf(rec), date = dateOf(rec), tags = tagsOf(rec);
      const body = digest(rec, refMap).slice(0, MAX_BODY);
      const head = '【' + g.label + '】' + title + (date ? '（' + date + '）' : '');
      docs.push({
        key: g.key + ':' + rec.id, mod: g.mod, id: rec.id,
        label: g.label, title, date, tags,
        text: head + '\n' + body
      });
    });
  });
  return docs;
}
/* 数据概览：永远放在提问前面的一小段，让「我有几条文献」这类元问题也答得上 */
function overview(db){
  const parts = [];
  GROUPS.forEach(g => {
    const n = (db && Array.isArray(db[g.key])) ? db[g.key].length : 0;
    if (n) parts.push(g.label + ' ' + n + ' 条');
  });
  return parts.join(' · ') || '（本机还没有任何记录）';
}

/* ==========================================================================
   二、检索：BM25（中文 2-gram + 单字；英文/数字按词）
   ========================================================================== */
const K1 = 1.2, B = 0.75, TITLE_BOOST = 1.8;
/* 单字权重压低：2-gram 已经能表达词，单字只用来兜底（如只问了「酶」一个字） */
function tokenize(s){
  const out = [], low = String(s == null ? '' : s).toLowerCase();
  (low.match(/[a-z0-9][a-z0-9._+-]*/g) || []).forEach(w => { if (w.length > 1 || /\d/.test(w)) out.push({t: '#' + w, w: 1}); });
  (low.match(/[\u4e00-\u9fff]+/g) || []).forEach(run => {
    for (let i = 0; i < run.length; i++){
      if (i + 1 < run.length) out.push({t: run.slice(i, i + 2), w: 1});
      out.push({t: run[i], w: 0.35});
    }
  });
  return out;
}
function tally(tokens){
  const m = new Map();
  tokens.forEach(x => m.set(x.t, (m.get(x.t) || 0) + x.w));
  return m;
}
function buildIndex(docs){
  const body = [], head = [], df = new Map();
  let total = 0;
  docs.forEach((d, i) => {
    const bt = tally(tokenize(d.text));
    const ht = tally(tokenize(d.label + ' ' + d.title + ' ' + d.tags));
    body[i] = bt; head[i] = ht;
    const dl = Array.from(bt.values()).reduce((a, b) => a + b, 0);
    docs[i].len = dl; total += dl;
    new Set(Array.from(bt.keys()).concat(Array.from(ht.keys()))).forEach(t => df.set(t, (df.get(t) || 0) + 1));
  });
  return { body, head, df, avgdl: docs.length ? total / docs.length : 1, n: docs.length };
}
function search(q, docs, idx, k){
  if (!docs.length) return [];
  const N = idx.n, avgdl = idx.avgdl || 1, seen = new Map();
  const toks = tokenize(q);
  /* 单字只是兜底：查询里只要出现了关键词（2-gram / 英文 / 数字），就不再放单字进来 ——
     否则「量子计算机」会被「计」「算」这类单字拉出一串无关记录 */
  const strong = toks.some(x => x.t.length > 1);
  toks.forEach(x => {
    if (strong && x.t.length === 1) return;
    seen.set(x.t, Math.max(seen.get(x.t) || 0, x.w));
  });
  const hits = [];
  docs.forEach((d, i) => {
    let s = 0;
    seen.forEach((qw, t) => {
      const f = idx.df.get(t) || 0;
      if (!f) return;
      const idf = Math.log(1 + (N - f + 0.5) / (f + 0.5));
      const norm = 1 - B + B * (d.len / avgdl);
      const fb = idx.body[i].get(t) || 0;
      if (fb) s += qw * idf * (fb * (K1 + 1)) / (fb + K1 * norm);
      const fh = idx.head[i].get(t) || 0;
      if (fh) s += qw * idf * TITLE_BOOST * (fh * (K1 + 1)) / (fh + K1);
    });
    if (s > 0) hits.push({doc: d, score: s});
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, k || 6);
}

/* ==========================================================================
   三、生成：把片段交给云端模型
   --------------------------------------------------------------------------
   SDK 的 chat.completions 只支持 stream:true，返回的是异步迭代器，逐块吐出
   OpenAI 风格的 chunk（choices[0].delta.content）。
   ========================================================================== */
const MODELS = ['glm-5.3-flash', 'deepseek-v4.1-flash', 'hy3'];   /* 依次回退 */
const SYSTEM = [
  '你是 ciib 科研工作台的问答助手，回答用户关于他/她自己科研数据的问题。',
  '',
  '【回答规则】',
  '1. 先看「记录片段」：里面有的，就基于它回答，并在句末用【1】【2】标出依据的片段编号（可多引，如【1】【3】）。',
  '2. 片段里没有、但你确知的内容，可以用通用生物学 / 生物信息学知识补充；补充部分必须另起一行并以「补充（通用知识）：」开头，绝不与用户自己的记录混在一起。',
  '3. 记录里没有相关信息的，先用一句话说明「记录里没有」，然后照样用通用知识作答（标「补充（通用知识）：」），不要只回一句「没有」就结束。不要编造用户自己的实验数据、参数、结果、日期。',
  '4. 中文作答，先给结论；多条内容用短列表，不要写成大段。',
  '5. 不要复述整段原始记录，提炼要点即可。'
].join('\n');

function buildMessages(question, hits, db){
  const ctx = hits.map((h, i) => '[' + (i + 1) + '] ' + h.doc.text).join('\n\n');
  return [
    {role: 'system', content: SYSTEM},
    {role: 'user', content: '【数据概览】\n' + overview(db) +
      (ctx ? '\n\n【记录片段】\n' + ctx : '\n\n【记录片段】\n（没有检索到相关记录）') +
      '\n\n【问题】\n' + question}
  ];
}
/* 从答案里挑出【n】引用，返回用到的编号（去重、升序） */
function extractCites(text){
  const out = [];
  String(text || '').replace(/【(\d+)】/g, (m, n) => { const i = +n; if (!out.includes(i)) out.push(i); return m; });
  return out.sort((a, b) => a - b);
}
/* 把答案按【n】切成可点击的片段：html 由调用方拼装，这里只出结构 */
function splitCites(text){
  const segs = [], re = /【(\d+)】/g;
  let last = 0, m;
  const s = String(text || '');
  while ((m = re.exec(s))){
    if (m.index > last) segs.push({t: 'text', v: s.slice(last, m.index)});
    segs.push({t: 'cite', v: +m[1]});
    last = m.index + m[0].length;
  }
  if (last < s.length) segs.push({t: 'text', v: s.slice(last)});
  return segs;
}

/* ==========================================================================
   四、界面：右下角常驻浮窗
   ========================================================================== */
const S = CIIB.ask = {
  docs: [], idx: null, busy: false, log: [], last: [], ready: false,
  build(){ this.docs = buildCorpus(CIIB.db); this.idx = buildIndex(this.docs); this.ready = true; return this.docs.length; }
};
let panel = null, fab = null, logEl = null, inputEl = null, noteEl = null, citesEl = null;

function esc(s){ return CIIB.esc(s); }
function line(s){ return esc(String(s)).replace(/\n/g, '<br>'); }

/* 助手当前的可用档位：'full'（可生成）/ 'search'（只检索，原因是 why） */
function capability(){
  if (!window.WorkBuddyCloud) return {mode: 'search', why: '当前环境没有联网能力（单文件版 / 离线打开），只能在本机检索'};
  const c = CIIB.cloud;
  if (!c || !c.ready) return {mode: 'search', why: '云服务尚未就绪（请刷新后重试）'};
  if (!c.user) return {mode: 'search', why: '未登录账号（数据按账号存放）—— 登录后可以由 AI 读片段作答', needLogin: true};
  return {mode: 'full', why: ''};
}

function renderCites(cites, box){
  if (!box) return;
  if (!cites || !cites.length){ box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '<div class="ask-cites-head">本条回答用到的记录</div>' +
    cites.map(i => {
      const h = S.last[i - 1];
      if (!h) return '';
      return '<button type="button" class="ask-chip" data-ask-open="' + esc(h.doc.mod) + '" data-ask-id="' + esc(h.doc.id) + '">' +
        '<b>' + i + '</b><span class="lbl">' + esc(h.doc.label) + '</span>' + esc(h.doc.title) + '</button>';
    }).join('');
}
/* 有引用标记就渲染成可点的小上标，没有就是普通文本 */
function bodyHTML(text){
  return splitCites(text).map(sg => sg.t === 'cite'
    ? '<button type="button" class="ask-ref" data-ask-ref="' + sg.v + '">' + sg.v + '</button>'
    : line(sg.v)).join('');
}
function push(role, text, extra){
  const item = {role, text, extra: extra || ''};
  S.log.push(item);
  if (!logEl) return item;
  const el = document.createElement('div');
  el.className = 'ask-msg ' + role;
  el.innerHTML = role === 'user'
    ? '<div class="bubble">' + line(text) + '</div>'
    : '<div class="bubble">' + bodyHTML(text) + '</div>' + (extra || '');
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
  return el;
}
function updateNote(){
  const cap = capability();
  if (!noteEl) return;
  const n = S.docs.length;
  const acct = (CIIB.cloud && CIIB.cloud.user) || '';
  noteEl.textContent = (acct ? '账号 ' + acct : '本机') + ' · ' + n + ' 条记录可检索 · ' +
    (cap.mode === 'full' ? 'AI 作答已开启' : '仅本地检索');
  noteEl.title = cap.why || '';
  noteEl.className = 'ask-note' + (cap.mode === 'full' ? ' on' : '');
}

async function ask(question){
  const q = String(question || '').trim();
  if (!q || S.busy) return;
  S.busy = true;
  push('user', q);
  inputEl.value = '';
  setSend(true);

  if (!S.ready) S.build();                                   /* 首次提问时再建索引：打开站点不花这份时间 */
  const hits = search(q, S.docs, S.idx, 6);
  S.last = hits;
  renderCites(hits.map((h, i) => i + 1), citesEl);

  const cap = capability();
  const fallback = () => {
    if (!hits.length){
      /* 没命中就别丢一句「没有」了事：说清是环境限制还是真没有，并指出怎样才答得上 */
      if (cap.needLogin)
        push('bot', '还没登录，我只能在本机检索，而本机没有匹配到记录。登录后我可以用你账号里的数据作答 —— 记录里没有的，用通用知识补上。');
      else if (S.docs.length)
        push('bot', '本机 ' + S.docs.length + ' 条记录里没匹配到，换个关键词再问一次。');
      else
        push('bot', '当前环境没有联网能力（单文件版 / 离线打开），本机也没有记录 —— 只做了检索，没能作答。');
      return;
    }
    push('bot', (cap.mode === 'search' ? '（' + cap.why + '）\n' : ''),
      '<div class="ask-hits">' + hits.map((h, i) =>
        '<button type="button" class="ask-chip" data-ask-open="' + esc(h.doc.mod) + '" data-ask-id="' + esc(h.doc.id) + '">' +
        '<b>' + (i + 1) + '</b><span class="lbl">' + esc(h.doc.label) + '</span>' + esc(h.doc.title) + '</button>').join('') + '</div>');
  };
  if (cap.mode !== 'full'){ fallback(); S.busy = false; setSend(false); return; }

  const hold = push('bot', '正在读你的记录…');
  try {
    const client = await CIIB.cloud.ready(4000);
    if (!client || !client.llm) throw new Error('云服务未就绪');
    const messages = buildMessages(q, hits, CIIB.db);
    let text = '', used = '';
    for (const model of MODELS){
      try {
        text = '';
        const stream = client.llm.chat.completions.create({model, messages, stream: true});
        for await (const chunk of stream){
          const d = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
          const s = d && (d.content || '');
          if (s){ text += s; hold.querySelector('.bubble').innerHTML = bodyHTML(text); logEl.scrollTop = logEl.scrollHeight; }
        }
        if (!text) throw new Error('模型没有返回内容');
        used = model;
        break;
      } catch(e){
        if (model === MODELS[MODELS.length - 1]){
          if (!text) throw e;
        }
      }
    }
    if (!text) throw new Error('所有模型都没能作答');
    hold.querySelector('.bubble').innerHTML = bodyHTML(text);
    const cited = extractCites(text);
    hold.insertAdjacentHTML('beforeend', used && used !== MODELS[0] ? '<div class="ask-foot">由 ' + esc(used) + ' 作答</div>' : '');
    renderCites(cited.length ? cited : hits.map((h, i) => i + 1), citesEl);
  } catch(e){
    hold.remove();
    const why = '（AI 作答失败：' + ((e && e.message) || e) + '）';
    if (!hits.length){
      push('bot', why + '本机也没检索到相关记录。');
    } else {
      push('bot', why + '下面是本机检索到的相关记录：');
      fallback();
    }
  }
  S.busy = false;
  setSend(false);
}
function setSend(on){
  const b = panel && panel.querySelector('[data-ask-send]');
  if (b){ b.disabled = on; b.textContent = on ? '…' : '问'; }
}

/* 打开原记录：复用科研总览那套「切页 → 定位 → 高亮」 */
function openRecord(mod, id){
  if (typeof CIIB.roOpenRecord === 'function'){
    const r = CIIB.roOpenRecord(mod, id);
    if (r && r.ok) { closePanel(); return; }
    if (r && r.reason === 'gone'){ CIIB.toast('这条记录在工作台里已经不在了'); return; }
  }
  CIIB.toast('暂时跳不过去，请到对应模块里查看');
}

function buildPanel(){
  panel = document.createElement('section');
  panel.className = 'ask-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<header class="ask-head">' +
      '<div><h2>问答</h2><div class="ask-note" id="askNote"></div></div>' +
      '<button type="button" class="ask-x" data-ask-close aria-label="收起">×</button>' +
    '</header>' +
    '<div class="ask-log" data-ask-log></div>' +
    '<div class="ask-cites" data-ask-cites hidden></div>' +
    '<form class="ask-input" data-ask-form>' +
      '<textarea rows="1" placeholder="说出你的问题或关键词" data-ask-q></textarea>' +
      '<button type="submit" class="primary" data-ask-send>问</button>' +
    '</form>';
  document.body.appendChild(panel);
  logEl = panel.querySelector('[data-ask-log]');
  inputEl = panel.querySelector('[data-ask-q]');
  noteEl = panel.querySelector('#askNote');
  citesEl = panel.querySelector('[data-ask-cites]');

  panel.querySelector('[data-ask-close]').onclick = closePanel;
  panel.querySelector('[data-ask-form]').onsubmit = e => { e.preventDefault(); ask(inputEl.value); };
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); ask(inputEl.value); }
  });
  panel.addEventListener('click', e => {
    const c = e.target.closest('[data-ask-open]');
    if (c){ openRecord(c.dataset.askOpen, c.dataset.askId); return; }
    const r = e.target.closest('[data-ask-ref]');
    if (r){
      const i = +r.dataset.askRef, h = S.last[i - 1];
      if (h) openRecord(h.doc.mod, h.doc.id);
    }
  });
  updateNote();
  if (!S.log.length){
    push('bot', '请说出你的问题或关键词 —— 我在你的记录里检索，不够的用通用知识补上。');
  }
}
function openPanel(){
  if (!panel) buildPanel();
  S.build();
  panel.hidden = false;
  fab.classList.add('open');
  updateNote();
  inputEl.focus();
}
function closePanel(){
  if (panel) panel.hidden = true;
  if (fab) fab.classList.remove('open');
}
S.open = openPanel;
S.close = closePanel;
S.ask = ask;                       /* 供测试与外部调用 */
S.hits = q => search(q, S.docs, S.idx, 6);
S.capability = capability;
S._internals = {buildCorpus, tokenize, buildIndex, search, digest, overview, buildMessages, extractCites, splitCites};

S.mount = function(){
  if (fab || !document.body) return;
  fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ask-fab';
  fab.title = '问一问你的记录（本机检索 + AI 作答）';
  fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.2-.6L3.5 21l1.5-4.5A8 8 0 0 1 3 11.5C3 7 7 3.4 12 3.4s9 3.6 9 8.1Z"/></svg><span>问</span>';
  fab.onclick = () => (panel && !panel.hidden ? closePanel() : openPanel());
  document.body.appendChild(fab);
  /* 数据一变（新增/修改记录）就重建索引，下次提问用的是最新语料 */
  const rawSave = CIIB.save;
  CIIB.save = function(){ const r = rawSave.apply(this, arguments); S.build(); updateNote(); return r; };
};
S.updateNote = updateNote;
})();
