/* ciib_app/cloud.js — 云同步（WorkBuddy Cloud Service）
   账号登录 + 多机数据同步：每个数据模块（载体 / 文献 / 待办 …）在云端是一行 JSONB，
   按 owner_id 隔离（RLS），登录后自动拉取、改动后自动推送。

   数据作用域（2026-10-16 起）：
   · 本机副本按账号分键存放（ciib2:db@<账号id>），换账号不会串数据；
   · 在已发布域名上「没登录 → 什么记录都不显示」（登录门禁，见 S.gated()），
     登录后自动把该账号的云端记录同步下来；退出登录立即清空本机视图，账号副本留着下次用。
   · 离线单文件版 / 本地 file:// 打开时云不可能可用，退回本机模式，不设门禁。

   注意：Auth 只在应用已发布的 HTTPS 域名下可用 —— 用 file:// 双击打开或本地预览时，
   本模块进入 unsupported 状态并明确提示，不做任何伪造成功的降级。 */
(function(){
'use strict';
if (!window.CIIB) return;

/* publicConfig（由 workbuddy_cloud_service 开通后返回，可安全出现在前端源码） */
const CFG = window.CIIB_CLOUD_CONFIG || {endpoint: '', publishableKey: '', host: ''};
const HOST = CFG.host || '';
const TABLE = 'ciib_records';
const MODULES = CIIB.moduleKeys || Object.keys(CIIB.db);
const K_STAMP = 'ciib2:cloudStamp';       /* 每个账号一份：'ciib2:cloudStamp@<账号id>' */
const K_LAST = 'ciib2:cloudLast';
const K_LOCALMODE = 'ciib2:localMode';    /* 用户主动选择「暂不登录，仅本机」 */

const lsRead = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const esc = s => CIIB.esc(s);

const UA = navigator.userAgent || '';
const DEVICE = (/Edg\//.test(UA) ? 'Edge' : /Chrome\//.test(UA) ? 'Chrome' : /Firefox\//.test(UA) ? 'Firefox' : '浏览器') +
  ' · ' + (navigator.platform || '');

const S = CIIB.cloud = {
  state: 'idle',        // idle|unsupported|sdk-missing|signed-out|busy|ok|error
  user: null,           // 展示名（邮箱 / 打星手机号）
  uid: '',              // 账号唯一 id（本机副本按它分键）
  message: '',
  dirty: {},            // 待推送的模块
  conflict: 0,          // 本次会话遇到的冲突数
  busy: false
};
let cloud = null, hosts = [];
let stampKey = K_STAMP, stamp = lsRead(K_STAMP, {});
/* 门禁与作用域状态 */
let localMode = (() => { try { return sessionStorage.getItem(K_LOCALMODE) === '1'; } catch (e) { return false; } })();
let claimPending = false;           /* 本次拉取是否处于「首次认领本机数据」阶段 */
let snap = null, timer = null;      /* 保存钩子用（提前声明：作用域切换会重置它） */
const readers = [];                 /* 登录态 / 作用域变化 → 通知外层重新渲染 */
function notify(){ readers.forEach(fn => { try { fn(); } catch (e) { console.warn('云同步通知失败', e); } }); }

/* ---------- 工具 ---------- */
function paint(el){
  if (!el || !el.isConnected) return;
  /* 重绘前把已经填好的输入留住 —— 否则点「发送验证码」后邮箱被清空，得重新输一遍 */
  const keep = {};
  el.querySelectorAll('[data-cloud-f]').forEach(i => { if (i.value) keep[i.dataset.cloudF] = i.value; });
  const badge = {ok: '<span class="sync-badge on">已同步</span>', busy: '<span class="sync-badge">同步中…</span>',
    signed_out: '<span class="sync-badge">未登录</span>', error: '<span class="sync-badge off">异常</span>',
    unsupported: '<span class="sync-badge off">仅线上可用</span>', sdk_missing: '<span class="sync-badge off">需要联网</span>'};
  const st = S.state === 'signed-out' ? 'signed_out' : S.state === 'sdk-missing' ? 'sdk_missing' : S.state;
  const head = '<div class="sync-head"><div class="sync-title">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6.5" rx="7.5" ry="3"/><path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/></svg>' +
    '<h2 class="home-h2" style="margin:0">云同步</h2>' + (badge[st] || '') + '</div>' +
    '<small class="muted">' + (S.state === 'unsupported'
      ? '云同步需要在应用网址上登录（本地双击打开的 HTML 无法使用）'
      : S.user ? '已登录 ' + esc(S.user) + ' · 数据在云端按账号隔离，多台电脑登录同一账号即同一份'
      : '邮箱或手机号注册都行 —— 登录后自动同步你账号里的记录；未登录时本机不显示任何记录') + '</small></div>';

  let body = '';
  if (S.state === 'idle'){
    /* 还没问出登录状态（首次加载会有一小会儿）：先别摆出登录表单，免得刚打开就让人以为没登录 */
    body = '<p class="sync-msg">正在检查登录状态…</p>';
  } else if (S.state === 'unsupported'){
    body = '<p class="sync-msg">当前是用本地文件打开的，云登录要求来源域名匹配，因此不可用。数据仍保存在本机浏览器里；要跨电脑同步，请在浏览器里打开应用网址再登录。</p>';
  } else if (S.state === 'sdk-missing'){
    body = '<p class="sync-msg warn">云服务组件未能加载（通常是网络不通），刷新页面可重试。期间数据仍保存在本机。</p>';
  } else if (S.user){
    const last = lsRead(K_LAST, '');
    body = '<p class="sync-msg' + (/失败|异常/.test(S.message) ? ' warn' : '') + '">' +
      esc(S.message || (last ? '上次同步：' + last : '登录后会自动拉取云端数据')) + '</p>' +
      (S.conflict ? '<p class="sync-msg warn">有 ' + S.conflict + ' 个模块在两台电脑上都改过，本机版本已自动备份，可通过顶部「导出全部数据备份」导出留档。</p>' : '') +
      '<div class="toolbar" style="margin:10px 0 0">' +
      '<button class="primary" data-cloud="sync">↻ 立即同步</button>' +
      '<button data-cloud="export">导出本机备份</button>' +
      '<button class="text-button danger" data-cloud="out">退出登录</button></div>';
  } else {
    const m = S.mode || 'pw';
    const tab = (k, t) => '<button class="cloud-tab' + (m === k ? ' on' : '') + '" data-cloud-mode="' + k + '">' + t + '</button>';
    const need = (!S.otp || {});
    body = '<div class="cloud-tabs">' + tab('pw', '密码登录') + tab('otp', '验证码登录') + tab('up', '注册') + tab('rs', '找回密码') + '</div>' +
      '<div class="cloud-form">' +
      '<input type="text" inputmode="email" data-cloud-f="email" placeholder="邮箱或手机号（国内手机号直接输 11 位）" autocomplete="username">' +
      (m === 'otp'
        ? '<input data-cloud-f="code" placeholder="邮箱收到的验证码">' +
          '<div class="toolbar" style="margin:0"><button class="primary" data-cloud="otp-send">发送验证码</button>' +
          '<button class="primary" data-cloud="otp-verify">登录</button></div>'
        : '') +
      (m === 'up'
        ? '<input data-cloud-f="code" placeholder="邮箱收到的验证码">' +
          '<input type="password" data-cloud-f="pwd" placeholder="设置密码（≥6 位）" autocomplete="new-password">' +
          '<div class="toolbar" style="margin:0"><button data-cloud="up-send">发送验证码</button>' +
          '<button class="primary" data-cloud="up-submit">注册并登录</button></div>'
        : '') +
      (m === 'rs'
        ? '<input data-cloud-f="code" placeholder="收到的验证码">' +
          '<input type="password" data-cloud-f="pwd" placeholder="新密码（≥6 位）" autocomplete="new-password">' +
          '<div class="toolbar" style="margin:0"><button data-cloud="rs-send">发送验证码</button>' +
          '<button class="primary" data-cloud="rs-submit">设置新密码</button></div>' +
          '<p class="muted" style="margin:6px 0 0">找回密码仅支持邮箱账号；手机号请用「验证码登录」。</p>'
        : '') +
      (m === 'pw' ? '<input type="password" data-cloud-f="pwd" placeholder="密码" autocomplete="current-password">' +
        '<div class="toolbar" style="margin:0"><button class="primary" data-cloud="pw-login">登录</button></div>' : '') +
      '</div>' +
      (S.message ? '<p class="sync-msg' + (S.state === 'error' ? ' warn' : '') + '">' + esc(S.message) + '</p>' : '');
    void need;
  }
  el.innerHTML = '<div class="card sync-card">' + head + body + '</div>';
  el.querySelectorAll('[data-cloud-f]').forEach(i => { if (!i.value && keep[i.dataset.cloudF]) i.value = keep[i.dataset.cloudF]; });
  el.querySelectorAll('[data-cloud-mode]').forEach(b => { b.onclick = () => { S.mode = b.dataset.cloudMode; S.message = ''; hosts.forEach(paint); }; });
  el.querySelectorAll('[data-cloud]').forEach(b => { b.onclick = () => act(b.dataset.cloud, el); });
}
const paintAll = () => { hosts.forEach(paint); updateFab(); notify(); };

function val(el, f){ const i = el.querySelector('[data-cloud-f="' + f + '"]'); return i ? String(i.value || '').trim() : ''; }
function setState(s, msg){ S.state = s; if (msg != null) S.message = msg; paintAll(); }

/* ---------- 客户端 ---------- */
function client(){
  if (cloud) return cloud;
  if (!window.WorkBuddyCloud) return null;
  cloud = window.WorkBuddyCloud.createWorkBuddyCloud({endpoint: CFG.endpoint, publishableKey: CFG.publishableKey});
  return cloud;
}
async function waitSDK(ms){
  const t = Date.now() + (ms || 3000);
  while (!window.WorkBuddyCloud && Date.now() < t) await new Promise(r => setTimeout(r, 100));
  return !!window.WorkBuddyCloud;
}

/* ---------- 同步内核 ---------- */
/* 同步时间戳按账号分键：换账号时不会拿上一个账号的基准去比，避免误判「本机更新」而把
   上一个账号的数据推给新账号。 */
function loadStamp(uid){
  stampKey = uid ? K_STAMP + '@' + String(uid).replace(/[^\w.@+-]/g, '_') : K_STAMP;
  stamp = lsRead(stampKey, {});
}
function saveStamp(){ lsWrite(stampKey, stamp); }

/* ---------- 数据作用域：本机副本按账号分键 ---------- */
/* 某份原始 JSON 里有没有真实记录（用于判断「未登录前是否留下过数据」） */
function hasRecords(raw){
  try {
    const d = JSON.parse(raw || '{}');
    return CIIB.contentKeys.some(k => Array.isArray(d[k]) && d[k].length);
  } catch (e){ return false; }
}
/* 登录后接管本机数据：切到该账号的副本；首次登录时把「未登录期间留在本机的数据」认领过来 */
function enterScope(uid){
  const key = CIIB.dbKeyOf(uid);
  let claimed = null;
  if (uid && CIIB.scopeKey() !== key){
    const base = CIIB.dbKeyOf('');
    const legacy = (() => { try { return localStorage.getItem(base); } catch (e) { return null; } })();
    if (!localStorage.getItem(key) && legacy && hasRecords(legacy)){
      /* 先整份复制进账号键，再留一份只读快照，最后从本机键移走 ——
         移走是为了下一个人在这台电脑上登录时读不到别人的数据。 */
      try { localStorage.setItem(key + '~登录前快照', legacy); } catch (e) {}
      try { localStorage.setItem(key, legacy); localStorage.removeItem(base); } catch (e) {}
      claimed = true;
    }
    CIIB.scope(key);
  }
  loadStamp(uid);
  S.dirty = {}; snap = null;                   /* 换了作用域，脏标记与保存基准都要重置 */
  claimPending = !!claimed;                    /* 首次认领：拉取时按「谁新听谁的」逐模块定夺 */
  return claimed ? CIIB.recordCount() : 0;     /* 认领过来的记录数（提示用） */
}
/* 退出登录：本机视图立刻清空（账号副本仍留在 ciib2:db@<账号id>，下次登录原样回来） */
function exitScope(){
  const wasAccount = CIIB.scopeKey() !== CIIB.dbKeyOf('');
  loadStamp(null);
  CIIB.scope(CIIB.dbKeyOf(''));
  if (wasAccount){ try { localStorage.setItem(CIIB.dbKeyOf(''), '{}'); } catch (e) {} }
  S.dirty = {}; snap = null;
}

/* ---------- 登录门禁 ----------
   在已发布域名上：没登录就不展示任何记录（数据按账号隔离，登录后才拉取该账号的记录）。
   离线单文件版 / file:// 打开时云本来就不可用，退回本机模式，不设门禁。 */
S.gated = function(){
  if (!HOST || !CFG.endpoint || !CFG.publishableKey) return false;
  if (location.hostname !== HOST) return false;
  if (localMode) return false;
  if (S.state === 'unsupported' || S.state === 'sdk-missing') return false;
  return !S.user;
};
S.stateText = () => S.state;
S.localMode = () => localMode;
S.useLocalMode = function(on){
  localMode = !!on;
  try { on ? sessionStorage.setItem(K_LOCALMODE, '1') : sessionStorage.removeItem(K_LOCALMODE); } catch (e) {}
  if (on) exitScope();                         /* 以本机模式打开 → 用本机键（不含任何账号数据） */
  paintAll();
};
/* 外层（main.js）订阅：登录态或作用域一变就重新渲染 */
S.onChange = function(fn){ if (typeof fn === 'function'){ readers.push(fn); try { fn(); } catch (e) {} } };

function jsonOf(m){ try { return JSON.stringify(CIIB.db[m] ?? null); } catch (e) { return 'null'; } }

/* 本机某个模块里最新的记录时间（首次认领时用来判断「本机更新」还是「云端更新」） */
function localStamp(m){
  const arr = CIIB.db[m];
  if (!Array.isArray(arr)) return 0;
  let best = 0;
  arr.forEach(r => {
    if (!r || typeof r !== 'object') return;
    ['updated', 'created', 'doneAt', 'at'].forEach(k => { const t = Date.parse(r[k]); if (t > best) best = t; });
  });
  return best;
}

async function pullAll(){
  const c = client(); if (!c) throw new Error('云服务未就绪');
  const {data, error} = await c.database.from(TABLE).select('module,payload,updated_at');
  if (error) throw error;
  const rows = data || [];
  const claiming = claimPending; claimPending = false;
  let changed = 0, kept = [];
  rows.forEach(r => {
    const remote = JSON.stringify(r.payload ?? null), local = jsonOf(r.module);
    if (remote === local){ stamp[r.module] = r.updated_at; return; }
    /* 首次把「未登录期间的本机数据」归入账号：谁新听谁的。
       本机该模块有更晚的记录 → 认下云端这一版为「已见过」，让下面的分支把本机版本推上去。 */
    if (claiming){
      const lt = localStamp(r.module);
      if (lt && lt > Date.parse(r.updated_at) + 60000){ stamp[r.module] = r.updated_at; S.dirty[r.module] = true; kept.push(r.module); return; }
    }
    const remoteNewer = !stamp[r.module] || Date.parse(r.updated_at) > Date.parse(stamp[r.module]) + 1000;
    if (S.dirty[r.module] && remoteNewer){          /* 两端都改过 → 冲突，本机版本留档后取云端 */
      backup(r.module); changed++;
      CIIB.db[r.module] = r.payload; delete S.dirty[r.module]; stamp[r.module] = r.updated_at; S.conflict++;
    } else if (remoteNewer){                         /* 云端更新：覆盖本机 */
      CIIB.db[r.module] = r.payload; changed++; stamp[r.module] = r.updated_at;
    } else {                                         /* 本机更新但还没推上去：标脏待推 */
      S.dirty[r.module] = true;
    }
  });
  S.claimKept = kept;
  /* 云端还没有的模块（本机首次上传）：标脏，稍后补建 */
  const has = rows.map(r => r.module);
  MODULES.forEach(m => {
    if (has.indexOf(m) < 0 && CIIB.db[m] !== undefined && jsonOf(m) !== JSON.stringify([]) && jsonOf(m) !== '{}')
      S.dirty[m] = true;
  });
  saveStamp();
  /* 拉下来的内容必须落盘：否则下次打开时本机还是旧的，会被误判成「本机更新」再推回云端，把云端覆盖掉。
     这里直接调用最底层的保存（不走 CIIB.save 的钩子，避免刚拉下来又立刻标脏回推）。 */
  try { prevSave(); } catch (e) { console.warn('同步结果落盘失败', e); }
  return changed;
}

async function pushDirty(){
  const mods = Object.keys(S.dirty).filter(m => S.dirty[m]);
  if (!mods.length) return 0;
  const c = client(); if (!c) throw new Error('云服务未就绪');
  const first = mods.slice();
  const {data: rows, error} = await c.database.from(TABLE).select('id,module').in('module', first);
  if (error) throw error;
  const map = {}; (rows || []).forEach(r => { map[r.module] = r.id; });
  let n = 0, err = null;
  for (const m of first){
    if (S.dirty[m] !== true) continue;
    const payload = CIIB.db[m];
    const res = map[m] != null
      ? await c.database.from(TABLE).update({payload, device: DEVICE}).eq('id', map[m]).select('id,updated_at')
      : await c.database.from(TABLE).insert({module: m, payload, device: DEVICE}).select('id,updated_at');
    if (res.error){ err = res.error; S.dirty[m] = true; break; }
    const row = (res.data || [])[0];
    if (!row){ err = new Error('写入被拒绝（可能不是本账号的数据）'); S.dirty[m] = true; break; }
    stamp[m] = row.updated_at; delete S.dirty[m]; n++;
  }
  saveStamp();
  if (err) throw err;
  return n;
}

function backup(m){
  try {
    localStorage.setItem('ciib2:conflict:' + Date.now(), JSON.stringify({module: m, at: new Date().toISOString(), payload: CIIB.db[m]}));
  } catch (e) {}
}

/* 完整同步：先拉（避免本机旧数据覆盖云端）再推 */
async function fullSync(){
  if (S.busy || !S.user) return;
  S.busy = true; setState('busy', '正在同步…');
  try {
    const got = await pullAll();
    const sent = await pushDirty();
    lsWrite(K_LAST, new Date().toLocaleString('zh-CN', {hour12: false}));
    S.state = 'ok';
    S.message = (got || sent) ? '已同步：下载 ' + got + ' 个模块，上传 ' + sent + ' 个模块' : '已是最新，无需同步';
  } catch (e){
    S.state = 'error';
    S.message = '同步失败：' + (e && (e.message || e.error_description) || e) + '（改动已留在本机，稍后自动重试）';
  }
  S.busy = false; paintAll();
}

/* ---------- 保存钩子：找出变更模块，防抖推送 ---------- */
function afterSave(){
  const cur = {}; const changed = [];
  MODULES.forEach(m => { const s = jsonOf(m); cur[m] = s; if (snap && snap[m] !== s) changed.push(m); });
  const firstRun = !snap; snap = cur;
  if (firstRun || !S.user || S.state === 'unsupported') return;
  changed.forEach(m => { S.dirty[m] = true; });
  if (!changed.length) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!S.user || S.busy) return;
    S.busy = true; setState('busy', '正在上传…');
    try { const n = await pushDirty(); lsWrite(K_LAST, new Date().toLocaleString('zh-CN', {hour12: false}));
      S.state = 'ok'; S.message = '已上传 ' + n + ' 个模块到云端'; }
    catch (e){ S.state = 'error'; S.message = '上传失败：' + (e && e.message || e) + '（改动已留在本机）'; }
    S.busy = false; paintAll();
  }, 2000);
}
const prevSave = CIIB.save;
CIIB.save = function(){ prevSave.apply(null, arguments); try { afterSave(); } catch (e) { console.warn('云同步记录失败', e); } };

/* ---------- 登录动作 ---------- */
/* 账号标识：邮箱 / 中国大陆手机号都收，产成 SDK 要的参数（email 与 phone 互斥） */
function ident(v){
  const s = String(v == null ? '' : v).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return {kind: 'email', email: s, label: '邮箱'};
  const d = s.replace(/\D/g, '').replace(/^(0086|86)/, '');
  if (/^1\d{10}$/.test(d)) return {kind: 'phone', phone: d, label: '短信'};
  return null;
}
const asArg = id => id.kind === 'email' ? {email: id.email} : {phone: id.phone};

async function act(a, el){
  const c = client(); if (!c){ setState('sdk-missing'); return; }
  const pwd = val(el, 'pwd'), code = val(el, 'code');
  const id = ident(val(el, 'email'));
  const busy = (m) => { S.busy = true; setState('busy', m); };
  const done = (m, st) => { S.busy = false; S.state = st || 'signed-out'; S.message = m; paintAll(); };
  try {
    if (a === 'pw-login'){
      if (!id) return done('请填写邮箱或手机号');
      if (!pwd) return done('请填写密码');
      busy('登录中…');
      const {error} = await c.auth.signInWithPassword(Object.assign({password: pwd}, asArg(id)));
      if (error) return done(errText(error, '登录'));
      await afterLogin();
    } else if (a === 'otp-send'){
      if (!id) return done('请填写邮箱或手机号');
      busy('发送验证码…');
      const r = await c.auth.signInWithOtp(asArg(id));
      if (r.error) return done(errText(r.error, '发送验证码'));
      S.otp = r.data; S.hint = 'otp';
      return done('验证码已发到' + (id.kind === 'email' ? '邮箱' : '手机') + '，请在下方填写后点「登录」');
    } else if (a === 'otp-verify'){
      if (!S.otp) return done('请先点「发送验证码」');
      if (!code) return done('请填写收到的验证码');
      busy('验证中…');
      const r = await S.otp.verify({token: code});
      if (r.error) return done(errText(r.error, '验证'));
      S.otp = null; await afterLogin();
    } else if (a === 'up-send'){
      if (!id) return done('请填写邮箱或手机号');
      busy('发送验证码…');
      const r = await c.auth.sendOtp(asArg(id));
      if (r.error) return done(errText(r.error, '发送验证码'));
      S.upChallenge = Object.assign({kind: id.kind}, asArg(id), r.data);
      return done('验证码已发到' + (id.kind === 'email' ? '邮箱' : '手机') + '，填写验证码与密码后点「注册并登录」');
    } else if (a === 'up-submit'){
      if (!S.upChallenge) return done('请先点「发送验证码」');
      if (!pwd || pwd.length < 6) return done('密码至少 6 位');
      if (!code) return done('请填写收到的验证码');
      busy('注册中…');
      const ch = S.upChallenge;
      const r = await c.auth.verifyOtp(Object.assign({verificationId: ch.verificationId, token: code,
        isExistingUser: ch.isExistingUser}, asArg(ch), ch.isExistingUser ? {} : {password: pwd}));
      if (r.error) return done(errText(r.error, '注册'));
      if (ch.isExistingUser) { S.upChallenge = null; S.mode = 'pw'; return done('该账号已注册，请改用「密码登录」'); }
      S.upChallenge = null; await afterLogin();
    } else if (a === 'rs-send'){
      if (!id || id.kind !== 'email') return done('找回密码仅支持邮箱账号；手机号请用「验证码登录」');
      busy('发送验证码…');
      const r = await c.auth.resetPasswordForEmail(id.email);
      if (r.error) return done(errText(r.error, '发送验证码'));
      S.rs = r.data; return done('验证码已发送，填写验证码与新密码后点「设置新密码」');
    } else if (a === 'rs-submit'){
      if (!S.rs) return done('请先点「发送验证码」');
      if (!pwd || pwd.length < 6) return done('新密码至少 6 位');
      busy('重置中…');
      const r = await S.rs.updateUser({nonce: code, password: pwd});
      if (r.error) return done(errText(r.error, '重置密码'));
      S.rs = null; S.mode = 'pw'; await afterLogin();
    } else if (a === 'sync'){
      await fullSync();
    } else if (a === 'out'){
      try { await fullSync(); } catch (e) {}      /* 尽力先把本机改动推上去，再离开 */
      await c.auth.signOut();
      S.user = null; S.uid = '';
      exitScope();                                 /* 本机视图立刻清空，账号副本留着下次用 */
      done('已退出登录 —— 本机不再显示任何记录；数据仍在你账号的云端，重新登录即可回来');
    } else if (a === 'export'){
      if (CIIB.exportAll) CIIB.exportAll(); else if (CIIB.toast) CIIB.toast('请在页面左上角「导出备份」操作');
    }
  } catch (e){ done('操作失败：' + (e && e.message || e), 'error'); }
}
function errText(e, who){ return who + '失败：' + (e && (e.message || e.error_description) || e); }

/* 展示名：邮箱直显，手机号打星，都没有就退回内部 id */
function who(u){
  const d = (u && u.data) || {};
  if (d.email) return d.email;
  const p = d.phone || d.phone_number;
  if (p){ const s = String(p).replace(/\D/g, ''); return s.length >= 7 ? s.slice(0, 3) + '****' + s.slice(-4) : p; }
  return d.id || '已登录';
}
async function currentUser(){
  try { const r = await client().auth.getUser(); return (r && r.data) || {}; } catch (e){ return {}; }
}
/* 认到登录用户后：切作用域（按账号分键存本机副本）→ 拉云端 → 渲染交给外层通知 */
async function adoptUser(){
  const u = await currentUser();
  S.user = who({data: u});
  S.uid = u.id || u.email || u.phone || '';
  const claimed = enterScope(S.uid);
  if (S.user) try { localStorage.setItem('ciib2:cloudMail', String(S.user)); } catch (e) {}
  S.mode = null;
  /* 登录动作一开始把 S.busy 立起来了（「登录中…」），必须先放开 —— 否则 fullSync 会
     被自己的 busy 挡回去，表现为「登录成功但什么都没同步」。 */
  S.busy = false;
  setState('busy', '登录成功，正在同步…');
  await fullSync();
  if (claimed){
    const kept = (S.claimKept || []);
    S.message = (S.message || '') + '；已把这台电脑上登录前的 ' + claimed + ' 条记录归入本账号' +
      (kept.length ? ('（其中 ' + kept.length + ' 个模块的本机版本较新，已上传）') : '');
  }
  paintAll();
}
function afterLogin(){ return adoptUser(); }
/* 明确退出 / 无会话：回到「什么都不显示」的状态 */
function signedOut(msg){
  S.user = null; S.uid = '';
  exitScope();
  if (S.gated()) CIIB.blank();       /* 未登录：内存里也不留任何记录（本机副本仍在存储里） */
  setState('signed-out', msg == null ? '' : msg);
}

/* ---------- 启动 ---------- */
async function boot(){
  if (!HOST || !CFG.endpoint || !CFG.publishableKey){ setState('unsupported'); return; }
  if (location.hostname !== HOST){ setState('unsupported'); return; }
  if (!await waitSDK(4000)){ setState('sdk-missing'); return; }
  try { client(); } catch (e){ setState('error', '云服务初始化失败：' + e.message); return; }
  cloud.auth.onAuthStateChange((ev, sess) => {
    if (ev === 'SIGNED_OUT' || !sess){ signedOut('已退出登录'); return; }
    if (ev === 'SIGNED_IN' && !S.user){ adoptUser().catch(e => { signedOut('登录状态读取失败：' + (e && e.message || e)); }); }
  });
  const {data, error} = await cloud.auth.getSession();
  if (error || !data){ signedOut(''); return; }
  await adoptUser();
  /* 每隔一段时间打探云端是否有其他电脑的新改动 */
  setInterval(() => { if (S.user && !document.hidden && navigator.onLine !== false) fullSync().catch(() => {}); }, 45000);
  window.addEventListener('online', () => { if (S.user) fullSync().catch(() => {}); });
}

S.render = function(el){
  if (el){ hosts = hosts.filter(h => h !== el && h.isConnected); if (hosts.indexOf(el) < 0) hosts.push(el); }
  paint(el);
};
S.sync = fullSync;
S.signOut = async () => { if (cloud) await cloud.auth.signOut(); signedOut('已退出登录'); };

/* ---------- 右上角入口 + 弹窗 ---------- */
/* fab：常驻右上角的小按钮。未登录显示「注册/登录」，登录后显示同步状态 */
let fab = null;
function updateFab(){
  if (!fab || !fab.isConnected) return;
  const txt = S.user
    ? (S.state === 'busy' ? '同步中…' : S.state === 'error' ? '未同步' : '已同步')
    : '注册/登录';
  fab.textContent = txt;
  fab.className = 'cloud-fab' + (S.user ? (S.state === 'busy' ? ' busy' : S.state === 'error' ? ' off' : ' on') : '');
  fab.title = S.user ? '云同步 · ' + txt + '（点击打开同步面板）'
                     : '注册 / 登录账号，多台电脑共用同一份数据';
}
let shade = null;
function openModal(){
  if (shade || !document.body) return;
  shade = document.createElement('div');
  shade.className = 'modal-shade cloud-shade';
  shade.innerHTML = '<div class="modal cloud-modal"><div class="modal-head"><h2>云同步</h2>' +
    '<button type="button" data-cloud-x aria-label="关闭">×</button></div><div class="cloud-body"></div></div>';
  document.body.appendChild(shade);
  updateFab();
  S.render(shade.querySelector('.cloud-body'));
  shade.querySelector('[data-cloud-x]').onclick = closeModal;
  /* 遮罩关闭防误触：只响应点在遮罩本身、且非双击第二下、且不在刚打开的 250ms 内 */
  const born = Date.now();
  shade.addEventListener('click', e => {
    if (e.target !== shade || e.detail > 1 || Date.now() - born < 250) return;
    closeModal();
  });
}
function closeModal(){ if (shade){ const s = shade; shade = null; s.remove(); updateFab(); } }
S.setFab = function(el){
  fab = el;
  if (el){ el.onclick = () => (shade ? closeModal() : openModal()); updateFab(); }
};
S.openModal = openModal;
S.closeModal = closeModal;
/* 给其它模块（问答助手）复用同一个 SDK 客户端与登录态：
   同一个 publishableKey + endpoint，登录 token 由 SDK 自己持有，不必重复登录 */
S.client = client;
S.ready = async ms => (await waitSDK(ms || 4000)) ? client() : null;

/* 直接启动：本模块只在 render 时才碰 DOM，不依赖 DOMContentLoaded
   （放在 head 或流式解析中加载也不会错过任何事件） */
boot().catch(e => { console.warn('云同步启动失败', e); setState('error', '云同步启动失败：' + (e && e.message || e)); });
})();
