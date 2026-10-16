/* ciib_tools/tools.js — 实用功能：① 序列转换（FASTA → 反向互补/翻译，自动识别 DNA/蛋白，计数）
                          ② ID转换（内置 At↔Cr、NCBI LOC、*.mg 蛋白号、GO 注释数据库；
                             支持上传/粘贴表格，选关键列 → 输出所选列，或两张表按列对应，导出 CSV） */
(function(){
'use strict';
const {esc} = CIIB;

/* ======================= 通用：序列工具 ======================= */
function parseFasta(text){
  const recs = []; let cur = null;
  String(text || '').split(/\r?\n/).forEach(line => {
    const t = line.trim(); if (!t) return;
    if (t[0] === '>'){ if (cur) recs.push(cur); cur = {name: t.slice(1).trim() || '序列' + (recs.length + 1), seq: ''}; }
    else { if (!cur) cur = {name: '未命名', seq: ''}; cur.seq += t.replace(/\s/g, ''); }
  });
  if (cur) recs.push(cur);
  return recs;
}
/* DNA / 蛋白自动识别：全由碱基+IUPAC 歧义码组成、且歧义码占比低 → DNA（蛋白也常用 M/K/R/Y 等字母） */
function seqType(s){
  s = String(s || '').toUpperCase();
  if (!s) return '';
  if (!/^[A-Z*]+$/.test(s)) return '';
  if (/^[ACGTU]+$/.test(s)) return 'dna';
  const amb = s.replace(/[ACGTU]/g, '').replace(/\*/g, '');
  if (/^[ACGTURYSWKMBDHVN]+$/.test(s) && amb.length / s.length <= 0.15) return 'dna';
  return 'aa';
}
const COMP = {A:'T', T:'A', U:'A', G:'C', C:'G', R:'Y', Y:'R', S:'S', W:'W', K:'M', M:'K', B:'V', V:'B', D:'H', H:'D', N:'N'};
const CODE = (function(){
  const t = 'TTT F TTC F TTA L TTG L CTT L CTC L CTA L CTG L ATT I ATC I ATA I ATG M GTT V GTC V GTA V GTG V ' +
    'TCT S TCC S TCA S TCG S CCT P CCC P CCA P CCG P ACT T ACC T ACA T ACG T GCT A GCC A GCA A GCG A ' +
    'TAT Y TAC Y TAA * TAG * CAT H CAC H CAA Q CAG Q AAT N AAC N AAA K AAG K GAT D GAC D GAA E GAG E ' +
    'TGT C TGC C TGA * TGG W CGT R CGC R CGA R CGG R AGT S AGC S AGA R AGG R GGT G GGC G GGA G GGG G';
  const m = {};
  t.split(' ').forEach((c, i) => { if (i % 2 === 0) m[c] = t.split(' ')[i + 1]; });
  return m;
})();
function revcomp(s){
  return String(s || '').toUpperCase().split('').reverse().map(c => COMP[c] || 'N').join('');
}
function translate(s){
  s = String(s || '').toUpperCase().replace(/U/g, 'T');
  let out = '';
  for (let i = 0; i + 2 < s.length; i += 3){
    const aa = CODE[s.slice(i, i + 3)];
    out += aa || 'X';
  }
  return out;
}
const wrap60 = s => String(s || '').replace(/(.{60})/g, '$1\n');

/* ======================= 通用：表格解析 / CSV ======================= */
function detectDelim(lines){
  let best = '', bestN = 0;
  ['\t', ',', ';'].forEach(d => {
    const n = lines.reduce((s, l) => s + (l.split(d).length - 1), 0);
    if (n > bestN){ bestN = n; best = d; }
  });
  return best;
}
const cleanCell = s => String(s == null ? '' : s).replace(/\t/g, ' ').trim();
/* 解析为 {cols, rows}；单列纯 ID 粘贴（首行即 ID）自动视为无表头 */
function parseTable(text, name){
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return null;
  const d = detectDelim(lines.slice(0, 5));
  const split = d ? l => l.split(d) : l => [l.trim()];
  let rows = lines.map(split);
  let cols, data;
  if (!d && idType(rows[0][0])){ cols = ['ID']; data = rows.map(r => [cleanCell(r[0])]); }
  else { cols = rows[0].map((c, i) => cleanCell(c) || ('列' + (i + 1))); data = rows.slice(1).map(r => r.map(cleanCell)); }
  return {cols, rows: data, name: name || '', delim: d || ''};
}
const csvCell = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function buildCSV(header, rows){
  return '\ufeff' + [header].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ======================= ② 内置 ID 数据库（惰性解析） ======================= */
let _db = null;
function idDB(){
  if (_db) return _db;
  const D = window.CIIB_IDDATA || {};
  const at2 = new Map(), c2a = new Map(), c2loc = new Map(), loc2c = new Map(), c2mg = new Map(), mg2c = new Map(), go = new Map();
  String(D.atcr || '').split('\n').forEach(l => {
    const f = l.split('\t'); if (f.length < 4 || !f[0]) return;
    const genes = f[3] ? f[3].split(',') : [];
    at2.set(f[0].toUpperCase(), {name: f[1], desc: f[2], genes});
    genes.forEach(g => { if (!c2a.has(g)) c2a.set(g, {at: f[0], name: f[1], desc: f[2]}); });
  });
  String(D.carb || '').split('\n').forEach(l => {
    const f = l.split('\t'); if (f.length < 2 || !f[0]) return;
    c2loc.set(f[0], f[1]); if (!loc2c.has(f[1])) loc2c.set(f[1], f[0]);
  });
  String(D.mg || '').split('\n').forEach(l => {
    const f = l.split('\t'); if (f.length < 2 || !f[0]) return;
    c2mg.set(f[0], f[1]); if (!mg2c.has(f[1])) mg2c.set(f[1], f[0]);
  });
  String(D.go || '').split('\n').forEach(l => {
    const f = l.split('\t'); if (f.length < 3 || !f[0]) return;
    go.set(f[0], {term: f[1], onto: f[2]});
  });
  return _db = {at2, c2a, c2loc, loc2c, c2mg, mg2c, go};
}
const normID = s => String(s || '').trim().replace(/^gene-(?=LOC)/i, '');
function idType(s){
  s = String(s || '').trim();
  if (/^AT[1-5MC]G\d{5}$/i.test(s)) return 'at';
  if (/^Carub\.\d+s\d{4}$/i.test(s)) return 'carub';
  if (/^(gene-)?LOC\d+$/i.test(s)) return 'loc';
  if (/^CARUB_v\d+mg$/i.test(s)) return 'mg';
  if (/^GO:\d{7}$/i.test(s)) return 'go';
  return '';
}
/* 任一 ID → 统一字段：{carub, at, name, desc, loc, mg, goterm, goonto}（查不到的字段为空串） */
function convertOne(raw, forced){
  const id = normID(raw);
  const t = forced || idType(id);
  const out = {carub: '', at: '', name: '', desc: '', loc: '', mg: '', goterm: '', goonto: ''};
  if (!t || !id) return out;
  const d = idDB();
  if (t === 'go'){
    const g = d.go.get(id.toUpperCase());
    if (g){ out.goterm = g.term; out.goonto = g.onto; }
    return out;
  }
  let carub = '';
  if (t === 'carub') carub = id;
  else if (t === 'at'){
    out.at = id.toUpperCase();
    const r = d.at2.get(id.toUpperCase());
    if (r){ carub = r.genes[0] || ''; out.carub = r.genes.join(';'); }
  }
  else if (t === 'loc') carub = d.loc2c.get(id.toUpperCase()) || '';
  else if (t === 'mg') carub = d.mg2c.get(id) || '';
  out.carub = out.carub || carub;
  if (carub){
    const a = d.c2a.get(carub);
    if (a){ out.at = out.at || a.at; out.name = a.name; out.desc = a.desc; }
    out.loc = d.c2loc.get(carub) || '';
    out.mg = d.c2mg.get(carub) || '';
  }
  return out;
}

/* 输出字段定义：label 同时是导出 CSV 的列名 */
const FIELDS = [
  {k: 'carub',  label: 'Carub号'},
  {k: 'at',     label: 'At基因号'},
  {k: 'name',   label: '基因名'},
  {k: 'desc',   label: '功能描述'},
  {k: 'loc',    label: 'NCBI基因号(LOC)'},
  {k: 'mg',     label: '蛋白编号(*.mg)'},
  {k: 'goterm', label: 'GO术语'},
  {k: 'goonto', label: 'GO类别'}
];

/* ======================= ① 序列转换子页 ======================= */
function seqPane(pane){
  pane.innerHTML =
    '<div class="tool-split-seq">' +
    '<div class="card tool-card"><h3 style="margin-top:0">输入序列（FASTA，可多条；不带 &gt; 也行）</h3>' +
    '<textarea data-act="sin" rows="14" class="mono" placeholder="&gt;gene-1&#10;ATGGCTAAAGGT…&#10;&gt;protein-1&#10;MKTAG…"></textarea>' +
    '<p class="muted" style="margin:6px 0 0">自动识别每条序列是 DNA 还是蛋白；反向互补 / 翻译仅对 DNA 生效（蛋白序列不参与转换）。翻译按标准遗传密码、从第 1 位开始，终止子记作 *。输入后右侧即时更新。</p></div>' +
    '<div class="split-arrow" aria-hidden="true"><span>→</span><small>转换</small></div>' +
    '<div class="seq-outs">' +
    ['rc', 'aa'].map(k => ({
      rc:  {t: '反向互补序列', hint: '反向 + A↔T/U、G↔C，引物设计常用'},
      aa:  {t: '翻译的蛋白序列', hint: '标准遗传密码，第 1 位开始读码，* 为终止子'}
    }[k])).map((o, i) =>
      '<div class="card tool-out"><div class="out-head"><h4>' + o.t + '</h4><small class="muted">' + o.hint + '</small>' +
      '<button class="text-button" data-act="copy" data-box="' + i + '">复制</button></div>' +
      '<div class="out-body mono" data-act="o' + i + '"></div><div class="out-count muted" data-act="c' + i + '"></div>' +
      '<div class="out-save"><button class="ghost sm" data-act="save" data-box="' + i + '">⤓ 另存为…</button>' +
      '<small class="muted">FASTA（.fasta）· 每条序列一个文件</small></div></div>').join('') +
    '</div></div>';
  const inp = pane.querySelector('[data-act="sin"]');
  const boxes = [0, 1].map(i => pane.querySelector('[data-act="o' + i + '"]'));
  const counts = [0, 1].map(i => pane.querySelector('[data-act="c' + i + '"]'));
  let lastOuts = [[], []];
  function update(){
    const recs = parseFasta(inp.value);
    const outs = [[], []];
    recs.forEach(r => {
      const t = seqType(r.seq), s = r.seq.toUpperCase();
      if (t === 'dna'){
        outs[0].push({name: r.name + '_rc', seq: revcomp(s), type: 'dna'});
        outs[1].push({name: r.name + '_aa', seq: translate(s), type: 'aa'});
      } else if (t === 'aa'){
        outs[0].push({name: r.name, seq: '', skip: '蛋白序列不做反向互补'});
        outs[1].push({name: r.name, seq: '', skip: '已是蛋白序列，无需翻译'});
      } else {
        outs[0].push({skip: '未识别的序列'}); outs[1].push({skip: '未识别的序列'});
      }
    });
    outs.forEach((list, i) => {
      lastOuts[i] = list;
      boxes[i].innerHTML = list.length ? list.map(r => r.skip
        ? '<div class="rec"><div class="rec-h">&gt;' + esc(r.name || '') + '</div><p class="muted" style="margin:2px 0 0">' + r.skip + '</p></div>'
        : '<div class="rec"><div class="rec-h">&gt;' + esc(r.name) + '<small class="muted">' + r.seq.replace(/\*/g, '').length + (r.type === 'dna' ? ' bp' : ' aa') + '</small></div><pre>' + esc(wrap60(r.seq)) + '</pre></div>'
      ).join('') : '<p class="muted" style="margin:0">（等待输入）</p>';
      const bp = list.reduce((n, r) => n + (r.type === 'dna' ? r.seq.length : 0), 0);
      const aa = list.reduce((n, r) => n + (r.type === 'aa' ? r.seq.replace(/\*/g, '').length : 0), 0);
      counts[i].textContent = recs.length
        ? '共 ' + recs.length + ' 条 · ' + [bp ? bp + ' bp' : '', aa ? aa + ' aa' : ''].filter(Boolean).join(' · ')
        : '';
    });
  }
  inp.addEventListener('input', update);
  update();
  pane.addEventListener('click', e => {
    const b = e.target.closest('[data-act="copy"]'); if (!b) return;
    const box = boxes[+b.dataset.box];
    const txt = [...box.querySelectorAll('.rec')].map(r =>
      r.querySelector('.rec-h').textContent.replace(/\s*\d+ (bp|aa)$/, '') + '\n' + (r.querySelector('pre') ? r.querySelector('pre').textContent : '')).join('\n');
    copyText(txt);
  });
  /* 另存为：每条序列导出为单个 FASTA 文件（弹系统「另存为」对话框由用户选目录） */
  pane.addEventListener('click', e => {
    const b = e.target.closest('[data-act="save"]'); if (!b) return;
    const i = +b.dataset.box;
    const list = (lastOuts[i] || []).filter(r => !r.skip && r.seq);
    if (!list.length){ CIIB.toast('没有可保存的序列'); return; }
    list.forEach((r, k) => {
      const fasta = '>' + r.name + '\n' + wrap60(r.seq) + '\n';
      const safe = r.name.replace(/[\\/:*?"<>|\s]+/g, '_');
      const fn = () => CIIB.download(fasta, safe + '.fasta', 'text/plain');
      if (k === 0) fn();                       /* 第一条立刻存 */
      else setTimeout(fn, k * 250);            /* 后续错开，避开浏览器拦截连续下载 */
    });
    CIIB.toast('已保存 ' + list.length + ' 个 FASTA 文件');
  });
}
function copyText(txt){
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(() => fallbackCopy(txt));
  else fallbackCopy(txt);
}
function fallbackCopy(txt){
  const ta = document.createElement('textarea');
  ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
  ta.remove();
}

/* ======================= ② ID转换子页 ======================= */
const PREVIEW_MAX = 200;
function idPane(pane){
  pane.innerHTML =
    '<div class="tool-split"><div class="split-left">' +
    '<div class="card tool-card"><h3 style="margin-top:0">① 主数据 <small class="muted">（上传 txt / csv / tsv，或直接粘贴；首行为列名，自动识别分隔符）</small></h3>' +
    '<div class="tool-row"><input type="file" data-act="mfile" accept=".txt,.csv,.tsv,.gff,.gff3,.gtf,text/plain">' +
    '<button data-act="mparse">读取粘贴内容</button></div>' +
    '<textarea data-act="mpaste" rows="5" class="mono" placeholder="每行一个 ID：&#10;Carub.0001s0046&#10;AT1G01010&#10;…&#10;或整表粘贴（首行列名，Tab / 逗号 / 分号分隔）"></textarea>' +
    '<div data-act="minfo" class="muted" style="margin-top:6px"></div></div>' +
    '<div class="card tool-card" data-act="optcard" hidden><h3 style="margin-top:0">② 转换设置</h3>' +
    '<div class="tool-row"><label>关键列（要转换的 ID 所在列）：<select data-act="mkey"></select></label>' +
    '<label>ID类型：<select data-act="mtype"><option value="auto">自动识别</option><option value="at">At基因号</option><option value="carub">Carub号</option><option value="loc">NCBI LOC（含 gene-LOC）</option><option value="mg">蛋白编号(*.mg)</option><option value="go">GO编号</option></select></label>' +
    '<label class="chk"><input type="checkbox" data-act="keepall"> 保留主数据全部列</label></div>' +
    '<p style="margin:8px 0 4px"><b>内置库输出列</b>（勾选要追加的信息；At↔Cr 对照含基因名/描述，Carub 另可查 NCBI LOC 与 *.mg 蛋白号，GO 编号查术语/类别）：</p>' +
    '<div class="chk-grid">' + FIELDS.map(f =>
      '<label class="chk"><input type="checkbox" data-fld="' + f.k + '"' + (['at', 'name', 'desc', 'loc', 'mg'].includes(f.k) ? ' checked' : '') + '> ' + f.label + '</label>').join('') + '</div></div>' +
    '<div class="card tool-card" data-act="refcard"><h3 style="margin-top:0">③ 可选：自定义对照表 <small class="muted">（第二张表：选它的关键列与本表关键列对应，输出它的所选列——如 gff3/gtf、blast 结果、另一版本编号等）</small></h3>' +
    '<div class="tool-row"><input type="file" data-act="rfile" accept=".txt,.csv,.tsv,.gff,.gff3,.gtf,text/plain">' +
    '<button data-act="rparse">读取粘贴内容</button></div>' +
    '<textarea data-act="rpaste" rows="4" class="mono" placeholder="例如：&#10;Carub号&#10;注释&#10;Carub.0001s0046&#9;候选基因1"></textarea>' +
    '<div data-act="rinfo" class="muted" style="margin-top:6px"></div>' +
    '<div data-act="ropts" hidden style="margin-top:8px"><div class="tool-row"><label>本表关键列：<select data-act="rkey"></select></label></div>' +
    '<p style="margin:8px 0 4px"><b>输出本表的列：</b></p><div class="chk-grid" data-act="rcols"></div></div></div>' +
    '<div class="tool-actions"><button class="primary" data-act="go">开始转换</button>' +
    '<button data-act="csv" disabled>⤓ 导出 CSV</button><span class="muted" data-act="goinfo"></span></div>' +
    '</div><div class="split-right"><div data-act="rout"><div class="card"><p class="muted" style="margin:0">读取主数据并选择输出列后，结果表格会显示在这里（左侧做设置 → 右侧即时更新）。</p></div></div></div></div>';

  let main = null, ref = null, result = null;
  const $ = s => pane.querySelector(s), $$ = s => [...pane.querySelectorAll(s)];
  const minfo = $('[data-act="minfo"]'), rinfo = $('[data-act="rinfo"]');

  function fillCols(sel, cols, def){
    sel.innerHTML = cols.map((c, i) => '<option value="' + i + '"' + (i === def ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  }
  function afterMain(){
    if (!main) return;
    $('[data-act="optcard"]').hidden = false;
    fillCols($('[data-act="mkey"]'), main.cols, 0);
    minfo.innerHTML = '已读取 <b>' + main.rows.length + '</b> 行 × <b>' + main.cols.length + '</b> 列：' +
      main.cols.map(c => '<span class="col-chip">' + esc(c) + '</span>').join('');
    run();
  }
  function afterRef(){
    if (!ref) return;
    $('[data-act="ropts"]').hidden = false;
    fillCols($('[data-act="rkey"]'), ref.cols, 0);
    $('[data-act="rcols"]').innerHTML = ref.cols.map((c, i) =>
      '<label class="chk"><input type="checkbox" data-rcol="' + i + '"' + (i ? ' checked' : '') + '> ' + esc(c) + '</label>').join('');
    rinfo.innerHTML = '对照表已读取：<b>' + ref.rows.length + '</b> 行 × <b>' + ref.cols.length + '</b> 列';
    run();
  }
  function readFile(input, cb){
    const f = input.files && input.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => cb(String(rd.result || ''), f.name);
    rd.readAsText(f);
  }
  pane.addEventListener('change', e => {
    const t = e.target;
    if (t === $('[data-act="mfile"]')) readFile(t, (txt, name) => { main = parseTable(txt, name); afterMain(); });
    else if (t === $('[data-act="rfile"]')) readFile(t, (txt, name) => { ref = parseTable(txt, name); afterRef(); });
    else if (t.closest('[data-act="optcard"]') || t.closest('[data-act="ropts"]')) run();
  });
  pane.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'mparse'){ main = parseTable($('[data-act="mpaste"]').value, '粘贴内容'); afterMain(); }
    else if (act.dataset.act === 'rparse'){ ref = parseTable($('[data-act="rpaste"]').value, '对照表'); afterRef(); }
    else if (act.dataset.act === 'go') run();
    else if (act.dataset.act === 'csv' && result){
      CIIB.download(buildCSV(result.header, result.rows), 'ID转换-' + CIIB.today() + '.csv', 'text/csv');
    }
  });

  function run(){
    if (!main){ minfo.textContent = '请先读取主数据'; return; }
    const keyCol = +$('[data-act="mkey"]').value || 0;
    const typeSel = $('[data-act="mtype"]').value;
    const keepAll = $('[data-act="keepall"]').checked;
    const flds = FIELDS.filter(f => { const b = $('[data-fld="' + f.k + '"]'); return b && b.checked; });
    const useRef = ref && !$('[data-act="ropts"]').hidden;
    let refMap = null, refCols = [];
    if (useRef){
      refCols = ref.cols.map((c, i) => i).filter(i => { const b = $('[data-rcol="' + i + '"]'); return b && b.checked; });
      refMap = new Map();
      const rk = +$('[data-act="rkey"]').value || 0;
      ref.rows.forEach(r => { const k = String(r[rk] || '').trim(); if (k && !refMap.has(k)) refMap.set(k, r); });
    }
    const headMain = keepAll ? main.cols.slice() : [main.cols[keyCol]];
    const header = headMain.concat(flds.map(f => f.label), refCols.map(i => ref.cols[i]));
    const rows = main.rows.map(r => {
      const raw = String(r[keyCol] || '');
      const cv = convertOne(raw, typeSel === 'auto' ? '' : typeSel);
      const rr = useRef ? refMap.get(raw.trim()) : null;
      return (keepAll ? r.slice() : [raw]).concat(flds.map(f => cv[f.k]), refCols.map(i => rr ? (rr[i] || '') : ''));
    });
    result = {header, rows};
    $('[data-act="csv"]').disabled = false;
    $('[data-act="goinfo"]').textContent = '共 ' + rows.length + ' 行';
    const hit = rows.filter(r => r.slice(headMain.length).some(c => c)).length;
    const prev = rows.slice(0, PREVIEW_MAX);
    $('[data-act="rout"]').innerHTML =
      '<div class="card"><h3 style="margin-top:0">转换结果预览 <small class="muted">（仅显示前 ' + Math.min(PREVIEW_MAX, rows.length) + ' 行，导出 CSV 含全部 ' + rows.length + ' 行；命中 ' + hit + ' 行）</small></h3>' +
      '<div class="tbl-wrap"><table class="res-tbl"><thead><tr>' + header.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      prev.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div></div>';
  }
}

/* ======================= 模块注册 ======================= */
CIIB.pages.tools = {
  title: '实用功能',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>实用功能</h1><p>序列转换：FASTA 一键出反向互补 / 翻译蛋白，自动计数；ID转换：内置拟南芥 At ↔ 淡红荠 Cr、NCBI LOC、*.mg 蛋白号与 GO 注释数据库，任意列表按列映射，可导出 CSV。</p></div></div>' +
      '<div class="tabs" data-act="tabs">' +
      ['序列转换', 'ID转换'].map((t, i) => '<button class="chip' + (i === 0 ? ' active' : '') + '" data-tab="' + i + '">' + t + '</button>').join('') + '</div>' +
      '<div data-act="pane"></div>';
    const tabs = m.querySelector('[data-act="tabs"]'), pane = m.querySelector('[data-act="pane"]');
    tabs.onclick = e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      tabs.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      sub(+b.dataset.tab);
    };
    function sub(i){
      if (i === 0) seqPane(pane); else idPane(pane);
    }
    sub(0);
  }
};
/* 纯函数暴露给回归测试 */
CIIB.tools = {parseFasta, seqType, revcomp, translate, parseTable, idType, convertOne, buildCSV, idDB};
})();
