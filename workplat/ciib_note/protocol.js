/* ciib_note/protocol.js — 实验记录 · 操作手册（Protocol）
   一张卡 = 一份操作手册：试剂配制 + 分步操作（耗时 / 重点 / 注意事项批注）+ Tips。
   导出 Word / PDF / HTML / Markdown 时，标了「重点」的步骤与批注会自动高亮。 */
(function(){
'use strict';
if (!window.CIIB) return;
const db = CIIB.db;
const save = () => CIIB.save();
const iso = () => new Date().toISOString();
const esc = CIIB.esc;

/* ---------- 耗时：把 "2 h"、"15 min"、"overnight" 折算成分钟 ---------- */
function mins(t){
  const s = String(t || '');
  let m = 0;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|小时)/i); if (h) m += parseFloat(h[1]) * 60;
  const mi = s.match(/(\d+(?:\.\d+)?)\s*(?:min|分钟)/i); if (mi) m += parseFloat(mi[1]);
  if (/overnight|过夜/i.test(s)) m += 8 * 60;
  return Math.round(m);
}
const fmtMin = m => !m ? '—'
  : (m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min');
const totalMin = r => (r.steps || []).reduce((s, x) => s + mins(x.time), 0);
const keyCount = r => (r.steps || []).filter(s => s.key).length + (r.tips || []).length;

/* ---------- 导出用的排版（Word / PDF / HTML 共用） ---------- */
const DOC_CSS =
  '@page{size:A4;margin:2cm}' +
  'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;font-size:11pt;line-height:1.7;color:#1f2b28}' +
  'h1{font-size:18pt;margin:0 0 4pt;border-bottom:2px solid #167c69;padding-bottom:6pt}' +
  'h2{font-size:13pt;margin:18pt 0 6pt;color:#167c69;border-left:4px solid #167c69;padding-left:8pt}' +
  '.meta{color:#6b7c77;font-size:9.5pt;margin:0 0 14pt}' +
  '.reagent{border:1px solid #cfd9d5;border-radius:6px;padding:8pt 10pt;margin-bottom:8pt}' +
  '.reagent b{display:block;margin-bottom:4pt}' +
  '.reagent pre{font-family:Consolas,"Microsoft YaHei",monospace;font-size:9.5pt;margin:0;white-space:pre-wrap}' +
  '.reagent .note{color:#8a5a12;font-size:9.5pt;margin-top:4pt}' +
  'ol.steps{margin:0;padding-left:18pt}' +
  'ol.steps li{margin-bottom:8pt}' +
  '.stage{display:inline-block;background:#e3f1ee;color:#167c69;border-radius:4px;font-size:9pt;padding:1pt 6pt;margin-right:6pt}' +
  '.time{display:inline-block;color:#4f8ca8;font-size:9pt;margin-left:6pt}' +
  '.key{background:#fff4c9;border-left:4px solid #e0a52a;padding:6pt 8pt;display:block;border-radius:4px}' +
  '.keyflag{color:#a5761a;font-weight:700;font-size:9pt;margin-right:4pt}' +
  '.note{display:block;margin-top:3pt;padding:4pt 8pt;border-left:3px solid #d97a5c;background:#fdf1ec;color:#8c3f28;font-size:9.5pt}' +
  '.tips{border:1px solid #e0cf9a;background:#fffaf0;border-radius:6px;padding:8pt 10pt}' +
  '.tips div{margin-bottom:4pt}' +
  '.foot{margin-top:18pt;border-top:1px solid #dfe6e3;padding-top:6pt;color:#8b9793;font-size:9pt}';

function docHTML(rec, opt){
  const o = opt || {};
  const body =
    '<h1>' + esc(rec.name || '未命名操作手册') + '</h1>' +
    '<p class="meta">' + [rec.cat, rec.tags].filter(Boolean).map(esc).join(' · ') +
      (rec.cat || rec.tags ? ' · ' : '') + '共 ' + (rec.steps || []).length + ' 步 · 预计 ' + fmtMin(totalMin(rec)) +
      ' · 重点 ' + keyCount(rec) + ' 处' + ((rec.refs || []).length ? ' · 文献 ' + (rec.refs || []).length + ' 条' : '') +
      ' · 更新于 ' + String(rec.updated || '').slice(0, 10) + '</p>' +
    ((rec.reagents || []).length
      ? '<h2>试剂配制</h2>' + rec.reagents.map(r =>
          '<div class="reagent"><b>' + esc(r.name || '（未命名）') + '</b>' +
          (r.body ? '<pre>' + esc(r.body) + '</pre>' : '') +
          (r.note ? '<div class="note">⚠ ' + esc(r.note) + '</div>' : '') + '</div>').join('')
      : '') +
    ((rec.steps || []).length
      ? '<h2>操作步骤</h2><ol class="steps">' + rec.steps.map(s =>
          '<li' + (s.key ? ' class="key"' : '') + '>' +
          (s.stage ? '<span class="stage">' + esc(s.stage) + '</span>' : '') +
          (s.key ? '<span class="keyflag">★ 重点</span>' : '') +
          esc(s.text) +
          (s.time ? '<span class="time">⏱ ' + esc(s.time) + '</span>' : '') +
          (s.note ? '<span class="note">⚠ ' + esc(s.note) + '</span>' : '') +
          '</li>').join('') + '</ol>'
      : '') +
    ((rec.tips || []).length
      ? '<h2>注意事项 / Tips</h2><div class="tips">' + rec.tips.map(t =>
          '<div>★ ' + esc(t.text || '') + '</div>').join('') + '</div>'
      : '') +
    ((rec.refs || []).length
      ? '<h2>参考文献</h2><ol class="refs">' + rec.refs.map(r =>
          '<li>' + esc(r) + '</li>').join('') + '</ol>'
      : '') +
    '<p class="foot">由 ciib 植物生信工作台导出 · ' + new Date().toLocaleString('zh-CN', {hour12: false}) + '</p>';
  if (o.bare) return body;
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(rec.name || '操作手册') +
    '</title><style>' + DOC_CSS + '</style></head><body>' + body + '</body></html>';
}

function mdText(rec){
  const L = [];
  L.push('# ' + (rec.name || '未命名操作手册'));
  if (rec.cat || rec.tags) L.push('> ' + [rec.cat, rec.tags].filter(Boolean).join(' · '));
  L.push('> 共 ' + (rec.steps || []).length + ' 步 · 预计 ' + fmtMin(totalMin(rec)) + ' · 重点 ' + keyCount(rec) + ' 处');
  L.push('');
  if ((rec.reagents || []).length){
    L.push('## 试剂配制');
    rec.reagents.forEach(r => {
      L.push('**' + (r.name || '（未命名）') + '**');
      if (r.body) L.push('```', r.body, '```');
      if (r.note) L.push('> ⚠ ' + r.note);
    });
    L.push('');
  }
  if ((rec.steps || []).length){
    L.push('## 操作步骤');
    rec.steps.forEach((s, i) => {
      const bits = [];
      if (s.stage) bits.push('[' + s.stage + ']');
      if (s.key) bits.push('**★ 重点**');
      L.push((i + 1) + '. ' + bits.join(' ') + (bits.length ? ' ' : '') + (s.text || ''));
      if (s.time) L.push('   - ⏱ ' + s.time);
      if (s.note) L.push('   - ⚠ ' + s.note);
    });
    L.push('');
  }
  if ((rec.tips || []).length){
    L.push('## 注意事项 / Tips');
    rec.tips.forEach(t => L.push('- ★ ' + (t.text || '')));
  }
  if ((rec.refs || []).length){
    L.push('## 参考文献');
    rec.refs.forEach(r => L.push('- ' + r));
  }
  return L.join('\n');
}

/* 打印 / 另存 PDF：开新窗口，样式内联，重点与批注同样高亮 */
function exportPDF(rec){
  const w = window.open('', '_blank');
  if (!w){ CIIB.toast('浏览器拦下了新窗口，请允许弹出窗口后重试'); return; }
  const html = docHTML(rec).replace('</body>',
    '<div class="no-print" style="position:fixed;left:0;right:0;top:0;background:#fff8e1;border-bottom:1px solid #e0cf9a;' +
    'padding:8px 14px;font:13px/1.6 system-ui;z-index:9">💡 在打印对话框里选「另存为 PDF」，重点步骤与批注的高亮会保留。' +
    '<button onclick="window.print()" style="margin-left:10px">打印 / 另存为 PDF</button></div></body>');
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
}
const fileName = rec => (rec.name || '操作手册').replace(/[\\/:*?"<>|]/g, '_');

function exportMenu(rec){
  CIIB.modal('导出「' + (rec.name || '操作手册') + '」',
    '<p class="muted" style="margin:0 0 12px">重点步骤（★）与注意事项（⚠）在所有格式里都会自动高亮/加框。</p>' +
    '<div class="proto-export">' +
    '<button class="primary" data-x="doc">📄 导出 Word（.doc）</button>' +
    '<button data-x="pdf">🖨 导出 PDF（打印另存）</button>' +
    '<button data-x="html">🌐 导出网页（.html）</button>' +
    '<button data-x="md">📝 导出 Markdown（.md）</button>' +
    '<button data-x="copy">⧉ 复制为纯文本</button></div>' +
    '<p class="muted" style="margin:12px 0 0;font-size:12px">Word / 网页是带样式的完整排版；Markdown 便于贴进笔记软件；纯文本适合发微信。</p>',
    (body, close) => {
      body.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => {
        const k = b.dataset.x;
        if (k === 'doc') CIIB.download(docHTML(rec), fileName(rec) + '.doc', 'application/msword');
        if (k === 'pdf') exportPDF(rec);
        if (k === 'html') CIIB.download(docHTML(rec), fileName(rec) + '.html', 'text/html');
        if (k === 'md') CIIB.download(mdText(rec), fileName(rec) + '.md', 'text/markdown');
        if (k === 'copy'){
          const t = mdText(rec);
          if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => CIIB.toast('已复制'));
          else CIIB.download(t, fileName(rec) + '.txt', 'text/plain');
        }
        if (k !== 'pdf') CIIB.toast('已导出');
        close();
      }; });
    });
}

/* ---------- 编辑器 ---------- */
const rowReagent = (r, i) =>
  '<div class="proto-row" data-row="rg" data-i="' + i + '">' +
  '<div class="proto-row-head"><input data-f="name" placeholder="试剂名称，如 2× CTAB 溶液" value="' + esc(r.name || '') + '">' +
  '<button type="button" class="text-button danger" data-del="rg">删除</button></div>' +
  '<textarea data-f="body" rows="3" placeholder="配方（每行一条：成分 + 用量）">' + esc(r.body || '') + '</textarea>' +
  '<input data-f="note" placeholder="备注：灭菌 / 分装 / 保存条件 / 有效期" value="' + esc(r.note || '') + '"></div>';

const rowStep = (s, i) =>
  '<div class="proto-row' + (s.key ? ' is-key' : '') + '" data-row="st" data-i="' + i + '">' +
  '<div class="proto-row-head"><span class="proto-no">' + (i + 1) + '</span>' +
  '<input data-f="stage" placeholder="阶段（可选，如 样品处理）" value="' + esc(s.stage || '') + '">' +
  '<input data-f="time" placeholder="耗时（如 65℃ 2 h / 15 min / 过夜）" value="' + esc(s.time || '') + '">' +
  '<label class="proto-key-chk"><input type="checkbox" data-f="key"' + (s.key ? ' checked' : '') + '>重点</label>' +
  '<button type="button" class="text-button danger" data-del="st">删除</button></div>' +
  '<textarea data-f="text" rows="2" placeholder="这一步怎么做（温度、转速、体积…）">' + esc(s.text || '') + '</textarea>' +
  '<textarea data-f="note" rows="1" placeholder="这一步的注意事项批注（可选）">' + esc(s.note || '') + '</textarea></div>';

const rowTip = (t, i) =>
  '<div class="proto-row proto-tip" data-row="tp" data-i="' + i + '"><div class="proto-row-head">' +
  '<span class="proto-no">★</span><textarea data-f="text" rows="1" placeholder="一条注意事项 / Tips">' + esc(t.text || '') + '</textarea>' +
  '<button type="button" class="text-button danger" data-del="tp">删除</button></div></div>';

function protoForm(rec, onDone){
  const data = rec ? JSON.parse(JSON.stringify(rec))
    : {id: CIIB.uid(), name: '', cat: '', tags: '', reagents: [], steps: [{stage:'', text:'', time:'', note:'', key:false}], tips: [], refs: [], created: iso()};
  const paint = (body, close) => {
    body.innerHTML =
      '<div class="proto-form">' +
      '<div class="proto-basic">' +
      '<label class="field"><span>手册名称</span><input data-h="name" value="' + esc(data.name) + '" placeholder="如 CTAB 法提取基因组 DNA"></label>' +
      '<label class="field"><span>分类</span><input data-h="cat" value="' + esc(data.cat) + '" placeholder="如 核酸提取 / 组织学 / 转化"></label>' +
      '<label class="field"><span>标签</span><input data-h="tags" value="' + esc(data.tags) + '" placeholder="逗号分隔，如 DNA,CTAB,叶片"></label>' +
      '</div>' +
      '<div class="proto-sec"><div class="proto-sec-head"><h3>试剂配制</h3><button type="button" data-add="rg">＋ 加试剂</button></div>' +
      '<div data-wrap="rg">' + (data.reagents || []).map(rowReagent).join('') + '</div></div>' +
      '<div class="proto-sec"><div class="proto-sec-head"><h3>操作步骤</h3><button type="button" data-add="st">＋ 加步骤</button>' +
      '<span class="muted">勾选「重点」的步骤在导出时会自动高亮</span></div>' +
      '<div data-wrap="st">' + (data.steps || []).map(rowStep).join('') + '</div></div>' +
      '<div class="proto-sec"><div class="proto-sec-head"><h3>注意事项 / Tips</h3><button type="button" data-add="tp">＋ 加一条</button></div>' +
      '<div data-wrap="tp">' + (data.tips || []).map(rowTip).join('') + '</div></div>' +
      '<div class="proto-sec"><div class="proto-sec-head"><h3>参考文献（可选）</h3><span class="muted">每条一行，导出时列在末尾</span></div>' +
      '<textarea data-h="refs" rows="3" placeholder="如：Smith et al. 2020 Nat Plants 1:1-10&#10;Lee 2019 Plant Cell 2:20-30">' + esc((data.refs || []).join('\n')) + '</textarea></div>' +
      '<div class="form-actions"><button type="button" class="ghost" data-act="cancel">取消</button>' +
      '<button type="button" class="primary" data-act="save">保存</button></div></div>';
    /* 收集：以 DOM 为准（含勾选框状态） */
    const collect = () => {
      body.querySelectorAll('[data-h]').forEach(i => { data[i.dataset.h] = i.value; });
      data.refs = String(data.refs || '').split('\n').map(s => s.trim()).filter(Boolean);
      data.reagents = [...body.querySelectorAll('[data-wrap="rg"] .proto-row')].map(r => ({
        name: r.querySelector('[data-f="name"]').value,
        body: r.querySelector('[data-f="body"]').value,
        note: r.querySelector('[data-f="note"]').value
      }));
      data.steps = [...body.querySelectorAll('[data-wrap="st"] .proto-row')].map(r => ({
        stage: r.querySelector('[data-f="stage"]').value,
        text: r.querySelector('[data-f="text"]').value,
        time: r.querySelector('[data-f="time"]').value,
        note: r.querySelector('[data-f="note"]').value,
        key: r.querySelector('[data-f="key"]').checked
      }));
      data.tips = [...body.querySelectorAll('[data-wrap="tp"] .proto-row')].map(r => ({
        text: r.querySelector('[data-f="text"]').value
      }));
    };
    const repaint = () => { collect(); paint(body, close); };
    body.querySelectorAll('[data-add]').forEach(b => { b.onclick = () => {
      collect();
      const k = b.dataset.add;
      if (k === 'rg') data.reagents.push({name:'', body:'', note:''});
      if (k === 'st') data.steps.push({stage:'', text:'', time:'', note:'', key:false});
      if (k === 'tp') data.tips.push({text:''});
      paint(body, close);
      const wrap = body.querySelector('[data-wrap="' + k + '"]');
      const last = wrap && wrap.lastElementChild;
      if (last) { const f = last.querySelector('input,textarea'); if (f) f.focus(); }
    }; });
    body.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => {
      collect();
      const k = b.dataset.del, rows = [...body.querySelectorAll('[data-wrap="' + k + '"] .proto-row')];
      const i = rows.indexOf(b.closest('.proto-row'));
      if (i >= 0) data[{rg:'reagents', st:'steps', tp:'tips'}[k]].splice(i, 1);
      paint(body, close);
    }; });
    body.querySelectorAll('[data-f="key"]').forEach(c => { c.onchange = () => {
      c.closest('.proto-row').classList.toggle('is-key', c.checked);
    }; });
    body.querySelector('[data-act="cancel"]').onclick = close;
    body.querySelector('[data-act="save"]').onclick = () => {
      collect();
      if (!data.name.trim()){ CIIB.toast('请先填写手册名称'); return; }
      data.updated = iso();
      onDone(data); close();
    };
  };
  CIIB.modal(rec ? '编辑操作手册' : '新建操作手册', '', (body, close) => paint(body, close), true);
}

/* ---------- 详情预览（就是导出时看到的样子） ---------- */
function protoDetail(rec){
  CIIB.modal(rec.name || '操作手册',
    '<div class="proto-view">' + docHTML(rec, {bare: true}) + '</div>' +
    '<div class="form-actions"><button type="button" class="ghost" data-x="close">关闭</button>' +
    '<button type="button" data-x="edit">编辑</button>' +
    '<button type="button" class="primary" data-x="exp">导出…</button></div>',
    (body, close) => {
      body.querySelector('[data-x="close"]').onclick = close;
      body.querySelector('[data-x="edit"]').onclick = () => { close(); protoForm(rec, () => CIIB.toast('已保存')); };
      body.querySelector('[data-x="exp"]').onclick = () => { close(); exportMenu(rec); };
    }, true);
}

/* ---------- 粘贴文本快速建卡（把 Word / 笔记里的 protocol 文本粘进来） ----------
   识别四类段落：试剂配制 / 操作步骤 / 注意事项 / 参考文献。
   标题行（首行短标题）自动作为手册名；行首序号、项目符号自动忽略；
   耗时（2 h / 15 min / 过夜 / overnight）自动抽进「耗时」并从步骤正文里去掉。 */
function parsePasted(text){
  const reagents = [], steps = [], tips = [], refs = [];
  let mode = 'step', rg = null, name = '';
  const trim = s => s.replace(/^[-•·●▪‣]\s*/, '').replace(/^\d+[.、)]\s*/, '').trim();
  const isStepH = s => /^(实验步骤|操作步骤|步骤|流程|procedure|protocol|methods?)\s*[:：]?$/i.test(s);
  const isRgH   = s => /^(试剂|配制|溶液|试剂配制|溶液配制|配方|reagents?|solutions?|buffers?|recipe)\s*[:：]?$/i.test(s);
  const isTipH  = s => /^(注意事项|提示|批注|注[:：]|tips?|notes?|note)\s*[:：]?/i.test(s);
  const isRefH  = s => /^(参考文?献|原文出处|出处|references?|reference|refs?)\s*[:：]?$/i.test(s);
  const isRgName= s => /溶液|Buffer|buffer|酶$|试剂|粉$|液$|medium|kit|solution/i.test(s);
  const timeRe  = /\d+\s*(?:h|hr|hrs|小时|min|分钟|s|sec|秒)|overnight|过夜/i;
  const stripTime = s => { const m = s.match(timeRe); return m ? s.replace(m[0], '').replace(/\s{2,}/g, ' ').trim() : s; };
  String(text || '').split(/\r?\n/).map(trim).filter(Boolean).forEach((s, idx) => {
    if (isStepH(s)){ mode = 'step'; rg = null; return; }
    if (isRgH(s)){ mode = 'rg'; rg = null; return; }
    if (isTipH(s)){ mode = 'tip'; const t = s.replace(/^(注意事项|提示|批注|注[:：]|tips?|notes?|note)\s*[:：]?\s*/i, ''); if (t) tips.push({text: t}); return; }
    if (isRefH(s)){ mode = 'ref'; const r = s.replace(/^(参考文?献|原文出处|出处|References?|Reference|Refs?)\s*[:：]?\s*/, ''); if (r) refs.push(r); return; }
    /* 首行短标题（不含试剂/步骤/批注等关键词、不含耗时）→ 当作手册名 */
    if (idx === 0 && !name && s.length <= 24 && !/试剂|溶液|配制|步骤|流程|注|tips?|buffer/i.test(s) && !timeRe.test(s)){ name = s; return; }
    /* 在步骤段里突然出现「短试剂名」→ 切到试剂段（兼容没有显式小标题的文档） */
    if (mode === 'step' && /试剂|配制|溶液|Buffer|buffer/i.test(s) && s.length <= 24){ mode = 'rg'; rg = {name: s, body: '', note: ''}; reagents.push(rg); return; }
    if (mode === 'rg'){
      if (isRgName(s) || (rg && rg.body && s.length <= 14 && !/[:：]/.test(s) && !/\d\s*(?:g|mg|ml|μl|l)\b/i.test(s))){
        rg = {name: s, body: '', note: ''}; reagents.push(rg);
      } else if (rg){ rg.body += (rg.body ? '\n' : '') + s; }
      else { rg = {name: s, body: '', note: ''}; reagents.push(rg); }
      return;
    }
    if (mode === 'ref'){ refs.push(s); return; }
    if (mode === 'tip'){ tips.push({text: s}); return; }
    const time = (s.match(timeRe) || [''])[0];
    steps.push({stage: '', text: stripTime(s), time: time || '', note: '', key: false});
  });
  return {name, reagents, steps, tips, refs};
}
function importForm(onDone){
  CIIB.modal('粘贴文本导入',
    '<p class="muted" style="margin:0 0 10px">把 Word / 笔记里的 protocol 整段粘进来，自动拆成「试剂 / 步骤 / 注意事项 / 参考文献」；耗时（2 h、15 min、过夜）抽进「耗时」。<b>解析后可逐条改，也可直接保存。</b></p>' +
    '<textarea data-act="txt" rows="12" placeholder="例如：&#10;2x CTAB溶液&#10;CATB：2.0 g&#10;NaCl：8.18 g&#10;实验步骤&#10;取新鲜叶片于2.0 ml离心管中…"></textarea>' +
    '<div class="import-summary" data-act="sum" style="display:none"></div>' +
    '<div class="form-actions"><button type="button" class="ghost" data-act="cancel">取消</button>' +
    '<button type="button" data-act="go">解析</button>' +
    '<button type="button" data-act="edit" style="display:none">打开编辑器补全</button>' +
    '<button type="button" class="primary" data-act="save" style="display:none">直接保存</button></div>',
    (body, close) => {
      const ta = body.querySelector('[data-act="txt"]');
      const sum = body.querySelector('[data-act="sum"]');
      const editBtn = body.querySelector('[data-act="edit"]');
      const saveBtn = body.querySelector('[data-act="save"]');
      let parsed = null;
      body.querySelector('[data-act="cancel"]').onclick = close;
      body.querySelector('[data-act="go"]').onclick = () => {
        const t = ta.value.trim();
        if (!t){ CIIB.toast('请先粘贴内容'); return; }
        parsed = parsePasted(t);
        sum.style.display = '';
        sum.innerHTML = '<b>已识别：</b> 试剂 ' + parsed.reagents.length + ' 项 · 步骤 ' + parsed.steps.length +
          ' 步 · 注意事项 ' + parsed.tips.length + ' 条' + (parsed.refs.length ? ' · 参考文献 ' + parsed.refs.length + ' 条' : '') +
          (parsed.name ? ' · 名称「' + esc(parsed.name) + '」' : '') +
          '<div class="muted" style="margin-top:4px">点「打开编辑器补全」可补名称 / 标重点 / 加参考文献；或「直接保存」一键入库。</div>';
        editBtn.style.display = '';
        saveBtn.style.display = '';
      };
      editBtn.onclick = () => {
        if (!parsed) return;
        close();
        protoForm({
          id: CIIB.uid(), name: parsed.name || '', cat: '', tags: '',
          reagents: parsed.reagents, steps: parsed.steps.length ? parsed.steps : [{stage:'', text:'', time:'', note:'', key:false}],
          tips: parsed.tips, refs: parsed.refs, created: iso(), updated: iso()
        }, d => onDone(d));
      };
      saveBtn.onclick = () => {
        if (!parsed) return;
        const d = {id: CIIB.uid(), name: parsed.name || '未命名操作手册', cat: '', tags: '',
          reagents: parsed.reagents, steps: parsed.steps, tips: parsed.tips, refs: parsed.refs, created: iso(), updated: iso()};
        close(); onDone(d);
      };
    }, true);
}

/* 供测试与复用：拿导出内容的纯函数 */
CIIB.protocolExport = {html: docHTML, md: mdText, parse: parsePasted};

/* ---------- 子页 ---------- */
CIIB.protocolTab = function(pane){
  const list = () => (db.protocols = db.protocols || []);
  pane.innerHTML = '<div class="page-head"><div><h2>操作手册（Protocol）</h2>' +
    '<p>一份手册 = 试剂配制 + 分步操作（耗时 / 重点 / 注意事项批注）+ Tips；可导出 Word / PDF / 网页 / Markdown，重点步骤自动高亮。</p></div>' +
    '<div class="toolbar" style="margin:0"><button class="primary" data-act="new">＋ 新建手册</button>' +
    '<button data-act="imp">⇤ 粘贴文本导入</button></div></div>' +
    '<input class="search" placeholder="搜索手册名、试剂、步骤、批注…" data-act="q">' +
    '<div class="card-grid" data-act="list"></div>';
  const box = pane.querySelector('[data-act="list"]'), q = pane.querySelector('[data-act="q"]');
  const draw = () => {
    const kw = q.value.trim().toLowerCase();
    const vis = list().filter(r => !kw || JSON.stringify(r).toLowerCase().includes(kw));
    box.innerHTML = vis.map(r =>
      '<article class="card proto-card" data-id="' + r.id + '">' +
      '<div class="section-head"><h3>' + esc(r.name) + '</h3>' +
      (r.cat ? '<span class="tag">' + esc(r.cat) + '</span>' : '') + '</div>' +
      '<div class="proto-meta muted">' + (r.steps || []).length + ' 步 · 试剂 ' + (r.reagents || []).length +
      ' 项 · 重点 ' + keyCount(r) + ' 处 · 预计 ' + fmtMin(totalMin(r)) +
      ((r.refs || []).length ? ' · 文献 ' + (r.refs || []).length + ' 条' : '') +
      (r.tags ? ' · ' + esc(r.tags) : '') + '</div>' +
      ((r.steps || []).filter(s => s.key).length
        ? '<ul class="proto-keys">' + r.steps.filter(s => s.key).slice(0, 3).map(s =>
            '<li>★ ' + esc(String(s.text || '').slice(0, 46)) + (String(s.text || '').length > 46 ? '…' : '') + '</li>').join('') + '</ul>'
        : '') +
      '<div class="card-bottom"><small>更新于 ' + String(r.updated || '').slice(0, 10) + '</small><span>' +
      '<button class="text-button" data-act="view">查看</button> ' +
      '<button class="text-button" data-act="edit">编辑</button> ' +
      '<button class="text-button" data-act="exp">导出</button> ' +
      '<button class="text-button danger" data-act="del">删除</button></span></div></article>').join('')
      || '<div class="empty"><span>◇</span><p>还没有操作手册，点「＋ 新建手册」或「粘贴文本导入」把现有 protocol 收进来。</p></div>';
  };
  q.oninput = draw;
  box.onclick = e => {
    const card = e.target.closest('.proto-card'); if (!card) return;
    const rec = list().find(r => r.id === card.dataset.id); if (!rec) return;
    const act = e.target.dataset.act;
    if (act === 'view') return protoDetail(rec);
    if (act === 'exp') return exportMenu(rec);
    if (act === 'edit') return protoForm(rec, v => { Object.assign(rec, v); save(); draw(); CIIB.toast('已保存'); });
    if (act === 'del'){
      if (confirm('删除「' + rec.name + '」？删除后无法恢复。')) {
        db.protocols = list().filter(r => r.id !== rec.id); save(); draw();
      }
    }
  };
  pane.querySelector('[data-act="new"]').onclick = () => protoForm(null, v => {
    list().unshift(v); save(); draw();
  });
  pane.querySelector('[data-act="imp"]').onclick = () => importForm(v => {
    list().unshift(v); save(); draw(); CIIB.toast('已导入，记得补名称和重点');
  });
  draw();
};
})();
