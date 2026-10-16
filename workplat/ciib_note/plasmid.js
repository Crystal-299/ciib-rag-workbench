/* ciib_note/plasmid.js — 分子实验 · 载体图谱
   SnapGene .dna 导入 / 环状图谱 / 特征编辑 / 序列查看编辑
   + SnapGene 式序列选择复制（顶部链 5'→3'、底部链 3'→5'、反向互补、翻译）
   + 导出可编辑矢量 PDF（打印→另存为 PDF，图谱为矢量、文字为文本）与 SVG */
(function(){
'use strict';
const {esc, uid, db, save, modal, formModal, PALETTE} = CIIB;

/* ================= SnapGene .dna 解析 ================= */
const BASE = {1:'A',2:'C',3:'G',4:'T'};
function seqFromBytes(arr){ let s=''; for (let i=0;i<arr.length;i++) s += BASE[arr[i]] || 'N'; return s; }
function xmlChildren(x, tag){ return x ? Array.from(x.getElementsByTagName(tag)) : []; }
function xmlText(node, tag){ const c = node.getElementsByTagName(tag)[0]; return c ? c.textContent : ''; }

function parseSnapGene(buf){
  const dv = new DataView(buf); const dec = new TextDecoder('utf-8');
  let i = 0; const out = {seq:'', topology:'circular', features:[], primers:[], name:''};
  while (i + 5 <= dv.byteLength) {
    const t = dv.getUint8(i); const ln = dv.getUint32(i + 1, false);
    if (i + 5 + ln > dv.byteLength) break;
    const data = new Uint8Array(buf, i + 5, ln);
    if (t === 0) {                       // DNA
      out.topology = (data[0] & 1) ? 'circular' : 'linear';
      out.seq = dec.decode(data.subarray(1)).toUpperCase().replace(/[^A-Z]/g, '');
    } else if (t === 10) {               // Features (XML, SnapGene ≥ 15)
      try {
        const xml = new DOMParser().parseFromString(dec.decode(data), 'text/xml');
        xmlChildren(xml, 'Feature').forEach(f => {
          (xmlChildren(f, 'Segment').length ? xmlChildren(f, 'Segment') : [null]).forEach(seg => {
            const rng = seg ? (seg.getAttribute('range') || '') : '';
            const mm = rng.match(/(\d+)\s*-\s*(\d+)/); if (!mm) return;
            const dir = f.getAttribute('directionality');
            out.features.push({name: f.getAttribute('name') || f.getAttribute('label') || 'feature',
              type: f.getAttribute('type') || 'misc_feature',
              start: +mm[1], end: +mm[2],
              strand: dir === '2' ? -1 : 1,
              color: (seg && seg.getAttribute('color')) || ''});
          });
        });
      } catch(e){}
    } else if (t === 6 && ln > 0 && data[0] === 0x3C) {  // Notes XML（新版）
      try {
        const xml = new DOMParser().parseFromString(dec.decode(data), 'text/xml');
        out.name = xmlText(xml, 'CustomMapLabel') || xmlText(xml, 'AccessionNumber') || out.name;
      } catch(e){}
    } else if (t === 5) {                // Primers（新版 XML）
      if (data[0] === 0x3C) {
        try {
          const xml = new DOMParser().parseFromString(dec.decode(data), 'text/xml');
          xmlChildren(xml, 'Primer').forEach(p => out.primers.push({name: xmlText(p, 'Name') || p.getAttribute('name') || '', seq: xmlText(p, 'Sequence')}));
        } catch(e){}
      } else {                           // 旧版二进制引物
        let j = 0;
        while (j + 3 <= data.length) {
          const st = data[j], sl = (data[j+1] << 8) | data[j+2]; const seg = data.subarray(j + 3, j + 3 + sl); j += 3 + sl;
          if (st !== 3) continue;
          let k = 0, name = '', seq = '';
          while (k + 3 <= seg.length) {
            const tg = seg[k], gl = (seg[k+1] << 8) | seg[k+2]; const gv = seg.subarray(k + 3, k + 3 + gl); k += 3 + gl;
            if (tg === 2) name = dec.decode(gv);
            else if (tg === 5) seq = seqFromBytes(gv.subarray(1));
          }
          if (name) out.primers.push({name, seq});
        }
      }
    } else if (t === 6) {                // 旧版二进制特征
      let j = 0;
      while (j + 3 <= data.length) {
        const strand = data[j], sl = (data[j+1] << 8) | data[j+2]; const seg = data.subarray(j + 3, j + 3 + sl); j += 3 + sl;
        let k = 0, type = '', name = '', label = '', start = 0, end = 0;
        while (k + 3 <= seg.length) {
          const tg = seg[k], gl = (seg[k+1] << 8) | seg[k+2]; const gv = seg.subarray(k + 3, k + 3 + gl); k += 3 + gl;
          if (tg === 0) type = dec.decode(gv);
          else if (tg === 2) name = dec.decode(gv);
          else if (tg === 4) label = dec.decode(gv);
          else if (tg === 132 && gl >= 8) { start = (gv[0] << 24 | gv[1] << 16 | gv[2] << 8 | gv[3]) >>> 0; end = (gv[gl-4] << 24 | gv[gl-3] << 16 | gv[gl-2] << 8 | gv[gl-1]) >>> 0; }
        }
        if (start || end) out.features.push({name: name || label || 'feature', type: type || 'misc_feature', start, end, strand: strand === 2 ? -1 : 1, color: ''});
      }
    }
    i += 5 + ln;
  }
  return out;
}
function parseFasta(text){
  const lines = text.trim().split(/\r?\n/); let name = '', seq = '';
  lines.forEach(l => { if (l.startsWith('>')) name = name || l.slice(1).trim(); else seq += l.replace(/\s/g, ''); });
  return {name, seq: seq.toUpperCase()};
}

/* ================= 序列工具 ================= */
const ENZYMES = {EcoRI:'GAATTC', BamHI:'GGATCC', KpnI:'GGTACC', HindIII:'AAGCTT', XhoI:'CTCGAG', SalI:'GTCGAC',
  XbaI:'TCTAGA', PstI:'CTGCAG', SmaI:'CCCGGG', NcoI:'CCATGG', NdeI:'CATATG', SacI:'GAGCTC', SpeI:'ACTAGT',
  EcoRV:'GATATC', ClaI:'ATCGAT', BglII:'AGATCT', NheI:'GCTAGC', AgeI:'ACCGGT', MluI:'ACGCGT', StuI:'AGGCCT',
  AflII:'CTTAAG', NsiI:'ATGCAT', SbfI:'CCTGCAGG', AscI:'GGCGCGCC', PacI:'TTAATTAA', PmeI:'GTTTAAAC', SwaI:'ATTTAAAT', NotI:'GCGGCCGC'};
function findSites(seq){
  const res = []; const s2 = seq + seq.slice(0, 30);
  for (const [name, site] of Object.entries(ENZYMES)) {
    let idx = s2.indexOf(site), count = 0;
    while (idx !== -1 && count < 12 && idx < seq.length) { res.push({name, pos: idx + 1, site}); idx = s2.indexOf(site, idx + 1); count++; }
  }
  return res.sort((a, b) => a.pos - b.pos);
}
const comp = s => s.replace(/[ACGTacgt]/g, c => ({A:'T',C:'G',G:'C',T:'A',a:'t',c:'g',g:'c',t:'a'})[c]);
const revcomp = s => comp(s).split('').reverse().join('');
const CODON = (function(){
  const b = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
  const o1 = 'TCAG'; const t = {};
  let i = 0;
  for (const a of o1) for (const c of o1) for (const g of o1) t[a + c + g] = b[i++];
  return t;
})();
function translate(seq){
  let out = '';
  for (let i = 0; i + 3 <= seq.length; i += 3) out += CODON[seq.slice(i, i + 3).toUpperCase()] || 'X';
  return out;
}
/* 复制到剪贴板（file:// 环境：优先 Clipboard API，回落 execCommand；同时记录 CIIB._lastCopy 供校验） */
function copyText(text, label){
  CIIB._lastCopy = text;
  const done = () => toast('已复制' + (label || '') + '（' + text.length + ' 字符）');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done){
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) done(); else prompt('请手动复制（Ctrl+C）：', text);
  } catch(e) { prompt('请手动复制（Ctrl+C）：', text); }
}
let toastTimer = null;
function toast(msg){
  let t = document.querySelector('.ciib-toast');
  if (!t) { t = document.createElement('div'); t.className = 'ciib-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}
const featColor = f => f.color && f.color !== '#ffffff' ? f.color : PALETTE[(f.start + f.type.length) % PALETTE.length];
const featuresCovering = (p, pos) => p.features.filter(f => pos >= f.start && pos <= f.end);

/* ================= 环状图谱 SVG ================= */
function circularSVG(p, opts){
  opts = opts || {};
  const L = p.seq.length; if (!L) return '<p class="muted">暂无序列</p>';
  const C = 250, R = 190, SIZE = 520;
  const ang = pos => ((pos - 1) % L) / L * Math.PI * 2 - Math.PI / 2;
  const pt = (pos, r) => [C + r * Math.cos(ang(pos)), C + r * Math.sin(ang(pos))];
  let svg = '<svg viewBox="0 0 ' + SIZE + ' ' + SIZE + '" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">';
  if (opts.bg) svg += '<rect x="0" y="0" width="' + SIZE + '" height="' + SIZE + '" fill="#ffffff"/>';
  svg += '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="#8a9a95" stroke-width="5"/>';
  // 选中区域扇形高亮
  if (opts.selA && opts.selB) {
    const span = opts.selB - opts.selA + 1;
    const a0 = ang(opts.selA), a1 = a0 + span / L * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(opts.selA, R - 5), [x1, y1] = pt(opts.selA + span, R - 5);
    svg += '<path d="M' + C + ' ' + C + ' L' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A' + (R - 5) + ' ' + (R - 5) + ' 0 ' + large + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Z" fill="#4f8ca8" opacity="0.25"/>';
  }
  // 刻度
  const step = L > 20000 ? 5000 : L > 8000 ? 1000 : 500;
  for (let pos = 1; pos <= L; pos += step) {
    const [x1, y1] = pt(pos, R - 4), [x2, y2] = pt(pos, R + 4);
    svg += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#8a9a95" stroke-width="1.2"/>';
    if (pos === 1 || pos % (step * 2) === 0) { const [tx, ty] = pt(pos, R + 17); svg += '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-size="10" text-anchor="middle" fill="#6b7f7a">' + pos + '</text>'; }
  }
  // 特征弧（data-fi 用于与右侧序列特征条 / 特征列表双向联动）
  p.features.forEach((f, fi) => {
    const color = featColor(f);
    const span = ((f.end - f.start + L) % L || L);
    const a0 = ang(f.start), a1 = a0 + span / L * Math.PI * 2;
    const rOut = R + 13, rIn = R + 3;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0o, y0o] = pt(f.start, rOut), [x1o, y1o] = pt(f.start + span, rOut);
    const [x1i, y1i] = pt(f.start + span, rIn), [x0i, y0i] = pt(f.start, rIn);
    svg += '<path class="farc" data-fi="' + fi + '" d="M' + x0o.toFixed(1) + ' ' + y0o.toFixed(1) + ' A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + x1o.toFixed(1) + ' ' + y1o.toFixed(1) +
      ' L' + x1i.toFixed(1) + ' ' + y1i.toFixed(1) + ' A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + x0i.toFixed(1) + ' ' + y0i.toFixed(1) + ' Z" fill="' + color +
      '" stroke="none" opacity=".88"><title>' + esc(f.name) + ' ' + f.start + '..' + f.end + '</title></path>';
    const mid = a0 + (a1 - a0) / 2; const lr = R + 27;
    const [lx, ly] = [C + lr * Math.cos(mid), C + lr * Math.sin(mid)];
    const anchor = Math.cos(mid) > .25 ? 'start' : Math.cos(mid) < -.25 ? 'end' : 'middle';
    if (span / L > .012) svg += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="10.5" text-anchor="' + anchor + '" fill="#1c2b28" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(f.name.slice(0, 22)) + '</text>';
  });
  svg += '<text x="' + C + '" y="' + (C - 12) + '" text-anchor="middle" font-size="15" font-weight="600" fill="#1c2b28">' + esc(p.name || '未命名载体') + '</text>';
  svg += '<text x="' + C + '" y="' + (C + 8) + '" text-anchor="middle" font-size="11" fill="#6b7f7a">' + L + ' bp · ' + (p.topology === 'circular' ? '环状' : '线性') + '</text>';
  svg += '</svg>';
  return svg;
}

/* ================= 序列视图（SnapGene 式：酶切位点 + 双链碱基 + 特征条）
   rowLen 动态：编辑器里按容器宽度算满行，打印/默认 60 ================= */
const txtOn = bg => {                     /* 按底色亮度选黑/白字 */
  const m = /^#([0-9a-f]{6})$/i.exec(bg || ''); if (!m) return '#fff';
  const v = parseInt(m[1], 16);
  return ((v >> 16 & 255) * .299 + (v >> 8 & 255) * .587 + (v & 255) * .114) > 150 ? '#1c2b28' : '#fff';
};
function seqViewHTML(p, rowLen){
  rowLen = rowLen || 60;
  const sites = findSites(p.seq).map(s => Object.assign({}, s, {cut: s.pos - 1 + Math.floor(s.site.length / 2)})); /* cut=切口右侧碱基（0 起），近似取识别序列中点 */
  const sitesAt = pos => sites.filter(s => pos >= s.pos && pos < s.pos + s.site.length);
  let out = '';
  for (let r = 0; r * rowLen < p.seq.length; r++) {
    const st = r * rowLen;
    const seg = p.seq.slice(st, st + rowLen);
    /* 酶切位点：红名字在上分层避让 + 刻度下指切口；切口 ▼（上）/▲（下）标记 */
    let enz = '', cutTop = '', cutBot = '', maxLane = 0;
    const laneEnd = [-99, -99, -99, -99];      /* 4 道名字避让 */
    sites.forEach(s => {
      if (s.cut <= st || s.cut > st + rowLen) return;
      const x = s.cut - st;                          /* 切口边界（ch 坐标，12px 等宽坐标系） */
      const half = s.name.length * 0.45 + 0.6;       /* 名字近似半宽（ch） */
      const ln = laneEnd.findIndex(e => e < x - half);
      if (ln !== -1) { laneEnd[ln] = x + half; maxLane = Math.max(maxLane, ln + 1); }
      /* 酶名保持常显；悬停时用原生提示露出识别序列/位置/切口（不再铺灰底、不画红线，避免盖住碱基） */
      const tipTxt = s.name + ' ' + s.site + ' · 位置 ' + s.pos + '..' + (s.pos + s.site.length - 1) + ' · 切口 ' + (s.cut + 1);
      enz += '<span class="ezp" data-ez="' + esc(s.name) + '" data-esite="' + esc(s.site) + '" style="left:' + x + 'ch">' +
        '<span class="ez' + (ln === -1 ? ' tick-only' : '') + '" style="top:' + (ln !== -1 ? ln * 13 : 0) + 'px" title="' + esc(tipTxt) + '">' +
        (ln !== -1 ? esc(s.name) : '') + '</span></span>';
      cutTop += '<span class="cutm" style="left:' + x + 'ch">▼</span>';
      cutBot += '<span class="cutm" style="left:' + x + 'ch">▲</span>';
    });
    let top = '', bot = '';
    for (let i = 0; i < seg.length; i++) {
      const pos = st + i + 1;
      const ss = sitesAt(pos);
      const sg = ss.length ? ' data-sg="' + ss.map(s => esc(s.name)).join(' ') + '"' : '';
      top += '<span class="b" data-pos="' + pos + '"' + sg + '>' + seg[i] + '</span>';
      bot += '<span class="b cb" data-pos="' + pos + '"' + sg + '>' + comp(seg[i]) + '</span>';
    }
    /* 特征条：贪心分道避免互相重叠 */
    const lanes = []; let bars = '', braces = '';
    p.features.forEach((f, fi) => {
      if (f.start > f.end) return;
      const lo = Math.max(f.start, st + 1), hi = Math.min(f.end, st + rowLen);
      if (lo > hi) return;
      /* 大括号：悬停该特征时，从片段首到尾括起来（替代「整段碱基变灰」）
         不再渲染内部文字标签——它只能落在碱基行上、会盖住序列；特征名由下方彩色特征条与右侧列表给出 */
      braces += '<span class="fbrace" data-fi="' + fi + '" style="left:' + (lo - st - 1) + 'ch;width:' + (hi - lo + 1) + 'ch"></span>';
      let ln = lanes.findIndex(last => last < lo);
      if (ln === -1) { lanes.push(hi); ln = lanes.length - 1; } else lanes[ln] = hi;
      const color = featColor(f);
      const label = hi - lo + 1 >= Math.max(6, f.name.length) ? esc(f.name) : '';
      /* 定位层 .fbwrap 用 12px 等宽（与碱基同一坐标系），内层 .fbar 才用 9.5px 小字，避免 ch 单位换算错位 */
      bars += '<span class="fbwrap" style="left:' + (lo - st - 1) + 'ch;width:' + (hi - lo + 1) + 'ch;top:' + ln * 16 + 'px">' +
        '<div class="fbar" data-fi="' + fi + '" title="' + esc(f.name) + ' ' + f.start + '..' + f.end +
        '" style="background:' + color + ';color:' + txtOn(color) + '">' + label + '</div></span>';
    });
    out += '<div class="srow">' +
      (maxLane ? '<div class="srow-enz" style="height:' + (maxLane * 13 + 9) + 'px"><span class="lh"></span><span class="enz-abs" style="width:' + rowLen + 'ch">' + enz + '</span></div>' : '') +
      (cutTop ? '<div class="srow-cut"><span class="lh"></span><span class="cut-abs" style="width:' + rowLen + 'ch">' + cutTop + '</span></div>' : '') +
      '<div class="srow-both">' +
      '<span class="lh"></span>' +
      '<span class="both-anchor">' +
      '<div class="srow-seq">' + top + '</div>' +
      '<div class="srow-seq">' + bot + '</div>' +
      braces +
      '</span>' +
      '</div>' +
      (cutBot ? '<div class="srow-cut"><span class="lh"></span><span class="cut-abs" style="width:' + rowLen + 'ch">' + cutBot + '</span></div>' : '') +
      '<div class="srow-feats"><span class="lh"></span><span class="feat-abs" style="width:' + rowLen + 'ch;height:' + Math.max(1, lanes.length) * 16 + 'px">' + bars + '</span></div>' +
      '</div>';
  }
  return out ? '<div class="seqx">' + out + '</div>' : '<p class="muted">暂无序列。点击上方「编辑序列」粘贴序列。</p>';
}
/* 酶切位点面板：可搜索（酶名 / 识别序列）+ 可收起；点击条目定位到序列上对应位置 */
function enzPanelHTML(sites){
  const names = [...new Set(sites.map(s => s.name))];
  return '<div class="enz-block" data-act="enzblock">' +
    '<div class="enz-head"><button class="enz-fold" data-act="enzfold" aria-expanded="true">▾ 酶切位点</button>' +
    '<small class="muted" data-act="enzcount">' + sites.length + ' 处 · ' + names.length + ' 种酶</small>' +
    '<input class="enz-q" data-act="enzq" placeholder="搜酶名或识别序列：EcoRI / GAATTC" aria-label="搜索酶切位点"></div>' +
    '<div class="enz-body" data-act="enzbody">' +
    (sites.length ? sites.map(s => '<button class="enz-chip" data-ezc="' + esc(s.name) + '" data-epos="' + s.pos + '" data-esite="' + esc(s.site) + '">' +
      '<b>' + esc(s.name) + '</b> ' + s.pos + '<small>' + esc(s.site) + '</small></button>').join('') : '<span class="muted">未找到常用酶的识别序列</span>') +
    '</div></div>';
}
function selInfo(p, a, b){
  if (!a || !b) return null;
  const s = Math.min(a, b), e = Math.max(a, b);
  const top = p.seq.slice(s - 1, e);
  const hit = p.features.find(f => f.start === s && f.end === e);
  return {a: s, b: e, len: top.length, top, hit};
}

/* ================= 可编辑 PDF / SVG 导出 ================= */
function printSeqHTML(p){
  const rowLen = 60; let out = '';
  for (let r = 0; r * rowLen < p.seq.length; r++) {
    const st = r * rowLen;
    out += '<div class="pline"><span class="ph">' + String(st + 1).padStart(6) + '</span>' +
      Array.from(p.seq.slice(st, st + rowLen)).map((ch, i) => {
        const pos = st + i + 1;
        const fs = featuresCovering(p, pos);
        const style = fs.length ? ' style="background:' + featColor(fs[fs.length - 1]) + ';color:#fff"' : '';
        return '<span' + style + '>' + ch + '</span>';
      }).join('') + '</div>';
  }
  return out;
}
function exportPDF(p, includeSeq){
  const win = window.open('', '_blank');
  if (!win) { alert('弹出窗口被浏览器拦截，请允许本页面的弹出窗口后重试。'); return; }
  const sites = findSites(p.seq);
  const feats = p.features.map((f, i) =>
    '<tr><td><span class="dot" style="background:' + featColor(f) + '"></span> ' + esc(f.name) + '</td><td>' + esc(f.type) + '</td><td>' + f.start + '..' + f.end + '</td><td>' + (f.end - f.start + 1) + ' bp</td><td>' + (f.strand < 0 ? '反向' : '正向') + '</td></tr>').join('');
  const doc = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(p.name || '载体') + ' · 载体图谱</title><style>' +
    '@page{size:A4;margin:12mm}' +
    'body{font:12px/1.6 "Segoe UI","Microsoft YaHei",sans-serif;color:#111;margin:0 4mm}' +
    'h1{font-size:20px;margin:0}h2{font-size:15px;margin:14px 0 6px;border-bottom:1.5px solid #167c69;padding-bottom:2px}' +
    '.sub{color:#555;font-size:11px;margin:2px 0 10px}' +
    '.no-print{background:#eef7f5;border:1px solid #bcd9d2;border-radius:8px;padding:8px 12px;margin:10px 0;font-size:12.5px;display:flex;gap:10px;align-items:center}' +
    '.no-print button{font:14px/1.4 sans-serif;padding:6px 16px;border:1px solid #167c69;background:#167c69;color:#fff;border-radius:6px;cursor:pointer}' +
    '@media print{.no-print{display:none}}' +
    'svg{width:15cm;height:auto;display:block;margin:4mm auto}' +
    'table{border-collapse:collapse;width:100%;font-size:10.5px}' +
    'th,td{border:1px solid #9db3ad;padding:3px 7px;text-align:left}' +
    'th{background:#e2f1ee}' +
    '.dot{display:inline-block;width:9px;height:9px;border-radius:2px;vertical-align:-1px}' +
    '.pb{page-break-before:always}' +
    '.seq{font:9.5px/1.8 Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-all;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.ph{color:#888;display:inline-block;width:44px}' +
    '.pline{margin:0}' +
    '.legend{font-size:10px;color:#555;margin-top:6px}' +
    '</style></head><body>' +
    '<div class="no-print"><span>💡 在打印对话框中选择「另存为 PDF」：图谱与表格以矢量保存、文字保持文本可编辑，可在 Illustrator / Inkscape / Acrobat 中继续编辑。</span><button onclick="window.print()">打印 / 另存为 PDF</button></div>' +
    '<h1>' + esc(p.name || '未命名载体') + '</h1>' +
    '<div class="sub">' + p.seq.length + ' bp · ' + (p.topology === 'circular' ? '环状' : '线性') + ' · 导出于 ' + CIIB.today() + ' · ciib 植物生信工作台</div>' +
    circularSVG(p, {bg: true}) +
    '<h2>特征（Feature）</h2>' +
    '<table><tr><th>名称</th><th>类型</th><th>位置</th><th>长度</th><th>方向</th></tr>' + (feats || '<tr><td colspan="5">无特征</td></tr>') + '</table>' +
    '<h2>常用酶切位点</h2>' +
    '<table><tr><th>酶</th><th>识别序列</th><th>位置</th></tr>' +
    sites.map(s => '<tr><td>' + s.name + '</td><td>' + s.site + '</td><td>' + s.pos + '</td></tr>').join('') + '</table>' +
    (includeSeq ? '<div class="pb"></div><h2>序列（顶部链 5′→3′，彩色底为对应特征）</h2><div class="seq">' + printSeqHTML(p) + '</div>' +
      '<div class="legend">特征底色与上表一致；共 ' + p.features.length + ' 个特征、' + sites.length + ' 个常用酶切位点。</div>' : '') +
    '</body></html>';
  win.document.open(); win.document.write(doc); win.document.close();
  const go = () => setTimeout(() => { try { win.print(); } catch(e){} }, 350);
  if (win.document.readyState === 'complete') go(); else win.addEventListener('load', go);
}
function exportSVG(p){
  if (!p.seq.length) { alert('暂无序列，无法导出图谱。'); return; }
  CIIB.download('<?xml version="1.0" encoding="UTF-8"?>\n' + circularSVG(p, {bg: true}), (p.name || 'plasmid') + '-map.svg', 'image/svg+xml');
  toast('已导出 SVG（可在 Illustrator / Inkscape 中编辑）');
}

/* ================= 编辑器 ================= */
let selFeat = -1;
function openEditor(pid, mountPage){
  const p = db.plasmids.find(x => x.id === pid); if (!p) return;
  let selA = null, selB = null, dragAnchor = null, baseEls = [], RL = 0, rsT = null;
  let enzFolded = false, enzKW = '';      /* 酶切位点面板状态（重绘后保持） */
  const close = modal('载体图谱 · ' + p.name, '', (body, closeModal) => {
    /* 按容器实宽算每行碱基数：序列区铺满整行（量不到宽度则回落 60） */
    function calcRowLen(){
      const host = body.querySelector('[data-act="seqview"]'); if (!host) return 60;
      let w = 0;
      const bs = host.querySelectorAll('.seqx .srow-seq .b');
      if (bs.length >= 2) {                       /* 首选：真实相邻碱基的间距（含 padding） */
        const r0 = bs[0].getBoundingClientRect(), r1 = bs[1].getBoundingClientRect();
        w = r1.left - r0.left;
      }
      if (!w || !isFinite(w) || w <= 0) {         /* 回落：探针 span 的 offsetWidth（不受 transform 影响） */
        const probe = document.createElement('span');
        probe.className = 'b'; probe.textContent = 'AAAAAAAAAA';
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        host.appendChild(probe);
        w = probe.offsetWidth / 10; probe.remove();
      }
      if (!w || !isFinite(w) || w <= 0) return 60;
      const avail = host.clientWidth - 70;        /* 减去行号与内边距 */
      return Math.max(30, Math.min(240, Math.floor(avail / w)));
    }
    function render(){
      const sites = findSites(p.seq);
      body.innerHTML =
        '<div class="map-wrap"><div class="map-panel">' + circularSVG(p, {selA, selB}) + '</div>' +
        '<div class="map-panel"><div class="toolbar"><button class="primary" data-act="addf">＋ 添加特征</button><button data-act="seq">编辑序列</button>' +
        '<button data-act="primer">引物/结合位点</button><button data-act="pdf">⤓ 导出 PDF</button><button data-act="svg">⤓ SVG</button>' +
        '<button class="danger" data-act="delplasmid">删除此载体</button></div>' +
        '<div class="feat-list">' + (p.features.map((f, i) =>
          '<div class="feat-row' + (selA === f.start && selB === f.end ? ' sel' : '') + '" data-i="' + i + '"><span class="dot" style="background:' + featColor(f) + '"></span>' +
          '<span>' + esc(f.name) + ' <small class="muted">' + esc(f.type) + (f.strand < 0 ? ' ↺反向' : ' →正向') + '</small></span>' +
          '<small>' + f.start + '..' + f.end + '（' + (f.end - f.start + 1) + ' bp）</small></div>').join('') || '<p class="muted">暂无特征。可“添加特征”，或重新导入带注释的 .dna 文件。</p>') + '</div>' +
        '<hr class="hr">' + enzPanelHTML(sites) +
        '</div></div>' +
        '<div class="selbar" data-act="selbar"></div>' +
        '<div class="seq-tip" data-act="seqtip" hidden></div>' +
        '<div class="seq-view" data-act="seqview">' + seqViewHTML(p, RL || 60) + '</div>' +
        '<p class="muted" style="margin:6px 0 0">在序列上点击/拖动即可选择区间（悬停碱基会显示位置、碱基/互补碱基、所属特征与酶）；双击或点击彩色特征条可选中该特征。左侧环状图与序列特征双向联动：悬停任一侧，另一侧同步响应（环弧外移放大 / 片段大括号 / 列表行高亮）。酶切位点面板可折叠、可按「酶名或识别序列」搜索；把光标放到序列上方的红色酶名上，会提示该酶的识别序列、位置与切口。复制方式与 SnapGene 一致：顶部链 5′→3′、底部链 3′→5′、反向互补、翻译。</p>';
      /* 首次渲染：按实宽算每行碱基数，行数变了就重铺序列区（铺满整行宽） */
      if (!RL && p.seq.length) {
        RL = calcRowLen();
        if (RL !== 60) body.querySelector('[data-act="seqview"]').innerHTML = seqViewHTML(p, RL);
      }
      if (hoverIdx !== -1) hoverIdx = -1;        /* 重绘后旧节点已失效 */
      baseEls = Array.from(body.querySelectorAll('.b'));
      bindSelbar(); bindSeqView();
      body.querySelector('.feat-list').onclick = e => {
        const row = e.target.closest('.feat-row'); if (!row) return;
        const f = p.features[+row.dataset.i]; if (!f) return;
        selA = f.start; selB = f.end;
        updateSelVisual();
      };
      body.querySelector('[data-act="addf"]').onclick = () => featForm(p, null, render);
      body.querySelector('[data-act="seq"]').onclick = () => seqForm(p, render);
      body.querySelector('[data-act="primer"]').onclick = () => primerInfo(p);
      body.querySelector('[data-act="pdf"]').onclick = () => {
        const withSeq = p.seq.length && confirm('导出 PDF：是否包含完整序列（会多出若干页）？\n「确定」= 包含序列；「取消」= 仅图谱 + 特征表 + 酶切位点。');
        exportPDF(p, withSeq);
      };
      body.querySelector('[data-act="svg"]').onclick = () => exportSVG(p);
      body.querySelector('[data-act="delplasmid"]').onclick = () => {
        if (!confirm('删除载体「' + p.name + '」？')) return;
        db.plasmids.splice(db.plasmids.indexOf(p), 1); save(); closeModal(); mountPage();
      };
      updateSelVisual();
      bindEnzPanel(sites);
    }
    /* 酶切位点面板：折叠 / 搜索（命中同时高亮序列上的酶名）/ 点击定位 */
    function bindEnzPanel(sites){
      const blk = body.querySelector('[data-act="enzblock"]'); if (!blk) return;
      const q = blk.querySelector('[data-act="enzq"]');
      const foldBtn = blk.querySelector('[data-act="enzfold"]');
      const cnt = blk.querySelector('[data-act="enzcount"]');
      const names = [...new Set(sites.map(s => s.name))];
      const applyFold = () => {
        blk.classList.toggle('folded', enzFolded);
        foldBtn.textContent = (enzFolded ? '▸' : '▾') + ' 酶切位点';
        foldBtn.setAttribute('aria-expanded', String(!enzFolded));
      };
      const applyFilter = () => {
        const kw = (q.value || '').trim().toUpperCase();
        let n = 0;
        blk.querySelectorAll('.enz-chip').forEach(ch => {
          const hit = !kw || String(ch.dataset.ezc).toUpperCase().indexOf(kw) >= 0 || String(ch.dataset.esite).indexOf(kw) >= 0;
          ch.hidden = !hit;
          if (hit) n++;
        });
        /* 序列视图里对应酶的标签同步高亮（含同名的所有切点） */
        body.querySelectorAll('.ezp').forEach(e => {
          const hitName = !!kw && (String(e.dataset.ez).toUpperCase().indexOf(kw) >= 0 || String(e.dataset.esite).indexOf(kw) >= 0);
          e.classList.toggle('ez-hit', hitName);
        });
        enzKW = kw;
        cnt.textContent = kw ? ('命中 ' + n + ' 处 / 共 ' + sites.length + ' 个切点')
          : (sites.length + ' 处 · ' + names.length + ' 种酶');
      };
      foldBtn.onclick = () => { enzFolded = !enzFolded; applyFold(); };
      q.addEventListener('input', applyFilter);
      blk.querySelector('[data-act="enzbody"]').onclick = e => {
        const ch = e.target.closest('.enz-chip'); if (!ch) return;
        const pos = +ch.dataset.epos, len = (ch.dataset.esite || '').length;
        selA = pos; selB = pos + len - 1;
        updateSelVisual();
        /* 只在序列容器内滚到该位置，绝不动整页 */
        const sv = body.querySelector('[data-act="seqview"]');
        const b = sv && sv.querySelector('.b[data-pos="' + pos + '"]');
        if (sv && b){
          const br = b.getBoundingClientRect(), cr = sv.getBoundingClientRect();
          if (br.top < cr.top || br.bottom > cr.bottom)
            sv.scrollTop += br.top - cr.top - (sv.clientHeight - br.height) / 2;
        }
      };
      q.value = enzKW; applyFold(); applyFilter();
    }
    function drawSelbar(){
      const bar = body.querySelector('[data-act="selbar"]'); if (!bar) return;
      const info = selInfo(p, selA, selB);
      if (!info) { bar.innerHTML = '<span class="muted">未选中序列 —— 在下方序列上点击 / 拖动选择区间后可复制。</span>'; return; }
      bar.innerHTML = '<b>' + info.a + '–' + info.b + '</b><span class="muted">（' + info.len + ' bp' + (info.hit ? ' · 特征「' + esc(info.hit.name) + '」' : '') + '）</span>' +
        '<button class="chip" data-act="copyTop">复制顶部链 5′→3′</button>' +
        '<button class="chip" data-act="copyBottom">复制底部链 3′→5′</button>' +
        '<button class="chip" data-act="copyRC">复制反向互补</button>' +
        '<button class="chip" data-act="copyProt">复制翻译（氨基酸）</button>' +
        '<button class="chip text-button" data-act="clearSel">✕ 取消选择</button>';
    }
    function bindSelbar(){
      const bar = body.querySelector('[data-act="selbar"]');
      bar.onclick = e => {
        const info = selInfo(p, selA, selB); if (!info) return;
        const act = e.target.dataset.act;
        if (act === 'copyTop') copyText(info.top, '顶部链 5′→3′');
        if (act === 'copyBottom') copyText(revcomp(info.top), '底部链 3′→5′');
        if (act === 'copyRC') copyText(revcomp(info.top), '反向互补链');
        if (act === 'copyProt') copyText(translate(info.top), '翻译产物');
        if (act === 'clearSel') { selA = selB = null; updateSelVisual(); }
      };
    }
    function updateSelVisual(){
      const info = selInfo(p, selA, selB);
      baseEls.forEach(el => {
        const pos = +el.dataset.pos;
        el.classList.toggle('selb', !!info && pos >= info.a && pos <= info.b);
      });
      // 环状图上的高亮扇形
      const svgHost = body.querySelector('.map-panel');
      if (svgHost && p.seq.length) {
        const tmp = document.createElement('div');
        tmp.innerHTML = circularSVG(p, {selA, selB});
        const old = svgHost.querySelector('svg');
        if (old) svgHost.replaceChild(tmp.firstChild, old);
      }
      drawSelbar();
      // 特征列表选中态：精确命中 = sel；与选区/光标有重叠 = hl（浅色突出）
      body.querySelectorAll('.feat-row').forEach(row => {
        const f = p.features[+row.dataset.i];
        const exact = !!info && f && f.start === info.a && f.end === info.b;
        const over = !!info && f && f.start <= info.b && f.end >= info.a;
        row.classList.toggle('sel', exact);
        row.classList.toggle('hl', !exact && over);
      });
      /* 环状图是刚重建的新节点，悬停监听必须重绑（否则选区一变，环↔序列联动就失效） */
      if (typeof bindHoverTargets === 'function') bindHoverTargets();
    }
    function bindSeqView(){
      const seqEl = body.querySelector('[data-act="seqview"]');
      seqEl.addEventListener('mousedown', e => {
        const t = e.target.closest('.b'); if (!t) return;
        dragAnchor = +t.dataset.pos;
        selA = selB = dragAnchor;
        updateSelVisual();
        e.preventDefault();
      });
      seqEl.addEventListener('mouseover', e => {
        if (dragAnchor == null) return;
        const t = e.target.closest('.b'); if (!t) return;
        const pos = +t.dataset.pos;
        if (pos !== selB) { selA = dragAnchor; selB = pos; updateSelVisual(); }
      });
      seqEl.addEventListener('dblclick', e => {
        const t = e.target.closest('.b'); if (!t) return;
        const pos = +t.dataset.pos;
        const fs = featuresCovering(p, pos);
        if (fs.length) { selA = fs[0].start; selB = fs[0].end; updateSelVisual(); }
      });
      /* 点击特征条 → 选中该特征（序列、环状图、右侧列表三方联动） */
      seqEl.addEventListener('click', e => {
        const bar = e.target.closest('.fbar'); if (!bar) return;
        const f = p.features[+bar.dataset.fi]; if (!f) return;
        selA = f.start; selB = f.end;
        updateSelVisual();
      });
      /* 光标悬停在碱基上 → 跟随光标显示位置信息（SnapGene 式） */
      const tip = body.querySelector('[data-act="seqtip"]');
      seqEl.addEventListener('mousemove', e => {
        const t = e.target.closest('.b');
        if (!t){ if (tip) tip.hidden = true; return; }
        if (!tip) return;
        const pos = +t.dataset.pos;
        const b = t.textContent;
        const fs = featuresCovering(p, pos);
        const enz = String(t.dataset.sg || '').split(/\s+/).filter(Boolean);
        tip.innerHTML = '<b>' + pos + '</b> / ' + (p.seq.length || 0) + '　<b>' + esc(b) + '</b>' +
          (t.classList.contains('cb') ? '' : '　互补 ' + esc(comp(b))) +
          (fs.length ? '<br><span class="tip-f">' + fs.map(f =>
            '<i style="background:' + featColor(f) + '"></i>' + esc(f.name) + '（' + f.start + '..' + f.end + '，' + (f.end - f.start + 1) + ' bp）').join('、') + '</span>' : '') +
          (enz.length ? '<br><span class="tip-e">✂ ' + esc(enz.join('、')) + ' 识别序列内</span>' : '');
        tip.hidden = false;
        const r = seqEl.getBoundingClientRect();
        const tw = tip.offsetWidth || 180;
        let x = e.clientX - r.left + 14, y = e.clientY - r.top + 18;
        if (x + tw > seqEl.clientWidth - 4) x = e.clientX - r.left - tw - 12;
        tip.style.left = Math.max(2, x) + 'px';
        tip.style.top = Math.max(2, y) + 'px';
      });
      seqEl.addEventListener('mouseleave', () => { if (tip) tip.hidden = true; });
    }
    /* ---- 双向联动：环状图扇区 ⇄ 序列特征条 ⇄ 右侧列表 ----
       悬停任一侧：环弧「向外挪一点 + 放大一点」、片段大括号、列表行高亮并在列表容器内定位。
       不滚动整页。
       【闪烁的根治】不用委托的 mouseover/mouseout（会在子元素/间隙间反复触发 → 状态来回切 → 闪），
       改为对每个可悬停元素直接绑定 mouseenter/mouseleave（进出各只触发一次、不冒泡）；
       再叠加 hoverIdx 记忆，状态没变直接 return。悬停源自身不加类，交给 CSS :hover。 */
    let hoverIdx = -1;
    function setFeatHover(i, on, from){
      const f = p.features[i]; if (!f) return;
      if (on){ if (hoverIdx === i) return; if (hoverIdx !== -1) applyHover(hoverIdx, false, ''); hoverIdx = i; }
      else { if (hoverIdx !== i) return; hoverIdx = -1; }
      applyHover(i, on, from);
    }
    function applyHover(i, on, from){
      const f = p.features[i]; if (!f) return;
      const arc = body.querySelector('.farc[data-fi="' + i + '"]');
      if (arc) {
        arc.classList.toggle('arc-hl', on);
        if (on) {
          const L = p.seq.length || 1;
          const span = ((f.end - f.start + L) % L || L);
          const mid = ((f.start - 1) % L) / L * Math.PI * 2 - Math.PI / 2 + span / L * Math.PI;
          arc.style.transformOrigin = '250px 250px';
          arc.style.transform = 'translate(' + (6 * Math.cos(mid)).toFixed(2) + 'px,' + (6 * Math.sin(mid)).toFixed(2) + 'px) scale(1.06)';
        } else arc.style.transform = '';
      }
      /* 悬停源是特征条本身时不重复加类（避免反复重绘闪烁），由 CSS :hover 呈现 */
      if (from !== 'fbar')
        body.querySelectorAll('.fbar[data-fi="' + i + '"]').forEach(b => b.classList.toggle('fhl', on));
      /* 用大括号把片段从头到尾括起来（不再让整段碱基变灰） */
      body.querySelectorAll('.fbrace[data-fi="' + i + '"]').forEach(b => b.classList.toggle('on', on));
      const row = body.querySelector('.feat-row[data-i="' + i + '"]');
      if (row) {
        row.classList.toggle('hl', on);
        if (on) {                          /* 只在特征列表容器内滚动定位，不动整页 */
          const listEl = body.querySelector('.feat-list');
          if (listEl && listEl.contains(row)) {
            const lr = row.getBoundingClientRect(), cr = listEl.getBoundingClientRect();
            if (lr.top < cr.top || lr.bottom > cr.bottom)
              listEl.scrollTop += lr.top - cr.top - (listEl.clientHeight - lr.height) / 2;
          }
        }
      }
    }
    /* 每次重绘后给新的可悬停元素绑 enter/leave（不用事件委托 → 不会因子元素反复触发） */
    function bindHoverTargets(){
      body.querySelectorAll('.farc[data-fi]').forEach(el => {
        el.addEventListener('mouseenter', () => setFeatHover(+el.dataset.fi, true, 'arc'));
        el.addEventListener('mouseleave', () => setFeatHover(+el.dataset.fi, false, ''));
      });
      body.querySelectorAll('.fbar[data-fi]').forEach(el => {
        el.addEventListener('mouseenter', () => setFeatHover(+el.dataset.fi, true, 'fbar'));
        el.addEventListener('mouseleave', () => setFeatHover(+el.dataset.fi, false, ''));
      });
      body.querySelectorAll('.feat-row[data-i]').forEach(el => {
        el.addEventListener('mouseenter', () => setFeatHover(+el.dataset.i, true, 'row'));
        el.addEventListener('mouseleave', () => setFeatHover(+el.dataset.i, false, ''));
      });
    }
    /* 窗口宽度变化 → 重算每行碱基数并重铺序列区（防抖） */
    const onResize = () => {
      clearTimeout(rsT);
      rsT = setTimeout(() => {
        const nr = calcRowLen(); if (nr === RL) return;
        RL = nr;
        const sv = body.querySelector('[data-act="seqview"]');
        if (sv) { sv.innerHTML = seqViewHTML(p, RL); baseEls = Array.from(body.querySelectorAll('.b')); updateSelVisual(); }
      }, 200);
    };
    window.addEventListener('resize', onResize);
    const up = () => { dragAnchor = null; };
    document.addEventListener('mouseup', up);
    render();
    return () => { document.removeEventListener('mouseup', up); window.removeEventListener('resize', onResize); clearTimeout(rsT); selFeat = -1; };
  }, true);
}
function featForm(p, f, done){
  const init = f ? {name: f.name, type: f.type, strand: f.strand < 0 ? '反向' : '正向', start: f.start, end: f.end, color: f.color || PALETTE[p.features.length % PALETTE.length]}
                 : {strand: '正向', start: 1, end: 1, color: PALETTE[p.features.length % PALETTE.length], type: 'CDS'};
  formModal(f ? '编辑特征' : '添加特征', [
    {key:'name', label:'特征名称', full:true},
    {key:'type', label:'类型', type:'select', options:CIIB.FEAT_TYPES},
    {key:'strand', label:'方向', type:'select', options:['正向','反向']},
    {key:'start', label:'起点 (1 起)', type:'number'},
    {key:'end', label:'终点', type:'number'},
    {key:'color', label:'颜色', type:'color'}
  ], init, v => {
    const start = Math.max(1, Math.min(+v.start || 1, p.seq.length)), end = Math.max(start, Math.min(+v.end || start, p.seq.length));
    const rec = {name: v.name.trim() || 'feature', type: v.type, start, end, strand: v.strand === '反向' ? -1 : 1, color: v.color};
    if (f) Object.assign(f, rec); else p.features.push(rec);
    p.features.sort((a, b) => a.start - b.start); save(); done();
  });
}
/* 序列修改后重映射特征位置（碱基级 LCS 对齐，正确处理中间插入/删除/替换） */
function remapFeatures(oldSeq, newSeq, feats){
  const O = oldSeq, N = newSeq, nO = O.length, nN = N.length;
  let pre = 0; while (pre < nO && pre < nN && O[pre] === N[pre]) pre++;
  let suf = 0; while (suf < nO - pre && suf < nN - pre && O[nO - 1 - suf] === N[nN - 1 - suf]) suf++;
  const oldMid = O.slice(pre, nO - suf), newMid = N.slice(pre, nN - suf);
  /* mapTo[k] = 旧序列第 k 个碱基（0 起）在新序列中的下标，删除则为 null */
  const mapTo = new Array(nO).fill(null);
  for (let i = 0; i < pre; i++) mapTo[i] = i;
  for (let i = nO - suf; i < nO; i++) mapTo[i] = i + (nN - nO);
  const na = oldMid.length, nb = newMid.length;
  if (na * nb <= 2000000) {                      /* LCS 对齐中段（小改动很快） */
    const dp = Array.from({length: na + 1}, () => new Int32Array(nb + 1));
    for (let i = na - 1; i >= 0; i--)
      for (let j = nb - 1; j >= 0; j--)
        dp[i][j] = oldMid[i] === newMid[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < na && j < nb) {
      if (oldMid[i] === newMid[j]) { mapTo[pre + i] = pre + j; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  } else {                                        /* 超大改动：退化为按位移保留同字符碱基 */
    const delta = nN - nO;
    for (let k = 0; k < na; k++) {
      const gi = pre + k, sh = gi + delta;
      mapTo[gi] = (sh >= 0 && sh < nN && oldMid[k] === N[sh]) ? sh : null;
    }
  }
  const features = [], touched = [], removed = [];
  feats.forEach(f => {
    const s0 = f.start - 1, e0 = f.end - 1;
    let ns = null, ne = null;
    for (let i = s0; i <= e0; i++) if (mapTo[i] != null) { ns = mapTo[i]; break; }
    if (ns == null) { removed.push(f); return; }
    for (let i = e0; i >= s0; i--) if (mapTo[i] != null) { ne = mapTo[i]; break; }
    const start = Math.max(1, ns + 1), end = Math.max(start, ne + 1);
    if (start !== f.start || end !== f.end) touched.push(f);
    features.push(Object.assign({}, f, {start, end}));
  });
  features.sort((a, b) => a.start - b.start);
  return {features, touched, removed};
}
function seqForm(p, done){
  modal('编辑序列 · ' + p.name,
    '<label class="field full"><span>序列（仅 ACGT，其余字符会被剔除；保存后特征位置按修改自动更新，不会错位）</span>' +
    '<textarea rows="10" data-act="s" style="font-family:Consolas,monospace">' + esc(p.seq) + '</textarea></label>' +
    '<div class="muted" data-act="carethint" style="margin:4px 0 8px;min-height:16px"></div>' +
    '<div class="seq-find"><input data-act="fq" placeholder="查找序列片段…" style="flex:1;min-width:120px">' +
    '<button type="button" data-act="ffind">查找下一个</button><span class="muted" data-act="fcount"></span></div>' +
    '<div class="seq-find" style="margin-top:6px"><input data-act="fr" placeholder="替换为…" style="flex:1;min-width:120px">' +
    '<button type="button" data-act="frep">替换</button><button type="button" data-act="frepall">全部替换</button></div>' +
    '<div class="form-actions"><button data-act="cancel">取消</button><button class="primary" data-act="ok">保存序列</button></div>', (body, close) => {
    const ta = body.querySelector('[data-act="s"]');
    const fq = body.querySelector('[data-act="fq"]'), fr = body.querySelector('[data-act="fr"]');
    const fcount = body.querySelector('[data-act="fcount"]'), hint = body.querySelector('[data-act="carethint"]');
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /* 光标提示：当前位置处于哪些特征内（只提示，不阻止修改） */
    const caretHint = () => {
      const pos = Math.min(ta.selectionStart + 1, ta.value.length);
      if (!ta.value.length) { hint.textContent = ''; return; }
      const fs = p.features.filter(f => f.start <= pos && pos <= f.end);
      hint.textContent = '光标在第 ' + pos + ' 位：' +
        (fs.length ? '位于特征「' + fs.map(f => f.name).join('」「') + '」内，修改会影响其位置/长度' : '不在任何特征内');
    };
    ['keyup', 'click', 'select', 'input'].forEach(ev => ta.addEventListener(ev, caretHint));
    const countOf = (text, n) => (text.match(new RegExp(reEsc(n), 'gi')) || []).length;
    body.querySelector('[data-act="ffind"]').onclick = () => {
      const n = fq.value.trim().toUpperCase(); if (!n) { fcount.textContent = '请先输入要查找的片段'; return; }
      const text = ta.value.toUpperCase();
      let i = text.indexOf(n, ta.selectionEnd);
      if (i === -1) i = text.indexOf(n);
      if (i === -1) { fcount.textContent = '未找到「' + n + '」'; return; }
      ta.focus(); ta.setSelectionRange(i, i + n.length);
      fcount.textContent = '共 ' + countOf(ta.value, n) + ' 处';
      caretHint();
    };
    body.querySelector('[data-act="frep"]').onclick = () => {
      const n = fq.value.trim().toUpperCase(); if (!n) return;
      const cur = ta.value.slice(ta.selectionStart, ta.selectionEnd).toUpperCase();
      if (cur === n) {  /* 当前选中即目标：原地替换后顺延查找下一个 */
        const ins = fr.value;
        if (ta.setRangeText) ta.setRangeText(ins, ta.selectionStart, ta.selectionEnd, 'end');
        else ta.value = ta.value.slice(0, ta.selectionStart) + ins + ta.value.slice(ta.selectionEnd);
        body.querySelector('[data-act="ffind"]').onclick();
      } else body.querySelector('[data-act="ffind"]').onclick();
    };
    body.querySelector('[data-act="frepall"]').onclick = () => {
      const n = fq.value.trim().toUpperCase(); if (!n) { fcount.textContent = '请先输入要查找的片段'; return; }
      const re = new RegExp(reEsc(n), 'gi');
      const cnt = countOf(ta.value, n);
      ta.value = ta.value.replace(re, fr.value);
      fcount.textContent = '已替换 ' + cnt + ' 处';
      caretHint();
    };
    body.querySelector('[data-act="cancel"]').onclick = close;
    body.querySelector('[data-act="ok"]').onclick = () => {
      const oldSeq = p.seq;
      const newSeq = ta.value.toUpperCase().replace(/[^A-Z]/g, '');
      const rm = remapFeatures(oldSeq, newSeq, p.features);
      p.seq = newSeq;
      p.features = rm.features;
      save(); close(); done();
      let msg = '序列已保存';
      if (rm.touched.length) msg += '；已自动更新 ' + rm.touched.length + ' 个特征位置：' +
        rm.touched.map(f => f.name + '→' + f.start + '..' + f.end).join('、');
      if (rm.removed.length) msg += '；已移除完全落在删除区间的特征：' + rm.removed.map(f => f.name).join('、');
      toast(msg);
    };
    caretHint();
  }, true);
}
function primerInfo(p){
  modal('引物 / 结合位点 · ' + p.name,
    (p.primers || []).map(pr => '<div class="card" style="margin-bottom:8px"><h3>' + esc(pr.name || '未命名引物') + '</h3><div class="seq-view" style="max-height:none">' + esc(pr.seq || '') + '</div></div>').join('')
    || '<p class="muted">此文件未包含引物信息。</p>');
}

/* ================= 页面 ================= */
CIIB.pages.plasmid = {
  title: '载体图谱',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>分子实验 · 载体图谱</h1><p>导入 SnapGene .dna / FASTA，环状图谱 + 特征 + 酶切位点；序列可点选复制（顶部链/底部链/反向互补/翻译），可导出可编辑矢量 PDF 与 SVG。</p></div>' +
      '<div class="toolbar" style="margin:0"><button class="primary" data-act="new">＋ 新建空白载体</button>' +
      '<button data-act="import">⤓ 导入 .dna / FASTA</button><input type="file" accept=".dna,.fasta,.fa,.txt" data-act="file"></div></div>' +
      '<div class="card-grid" data-act="list"></div>';
    const list = m.querySelector('[data-act="list"]');
    const draw = () => {
      list.innerHTML = db.plasmids.map(p =>
        '<article class="card" data-id="' + p.id + '"><div class="section-head"><h3>' + esc(p.name || '未命名') + '</h3>' +
        '<button class="text-button" data-act="open">打开图谱</button></div>' +
        '<div class="kv"><span class="k">长度</span><span>' + p.seq.length + ' bp</span>' +
        '<span class="k">拓扑</span><span>' + (p.topology === 'circular' ? '环状' : '线性') + '</span>' +
        '<span class="k">特征</span><span>' + p.features.length + ' 个</span>' +
        '<span class="k">引物</span><span>' + (p.primers || []).length + ' 个</span></div>' +
        '<div class="card-bottom"><small>更新于 ' + (p.updated ? p.updated.slice(0, 10) : '') + '</small>' +
        '<span><button class="text-button" data-act="rename">改名</button> <button class="text-button danger" data-act="del">删除</button></span></div></article>').join('')
        || '<div class="empty"><span>⭯</span><p>还没有载体。点击「导入 .dna / FASTA」载入 ciib_note/protocol 里的 pCAMBIA 质粒试试。</p></div>';
    };
    draw();
    const fileInput = m.querySelector('[data-act="file"]');
    fileInput.onchange = () => {
      const file = fileInput.files[0]; if (!file) return;
      file.arrayBuffer().then(buf => {
        let parsed;
        const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
        if (head[0] === 0x09 && head[5] === 0x53) parsed = parseSnapGene(buf);
        else {
          const text = new TextDecoder().decode(buf);
          parsed = /^[ATGCRYSWKMBDHVN\n\r>\s]+$/i.test(text.trim().slice(0, 200)) && text.trim().startsWith('>')
            ? parseFasta(text)
            : (() => { const s = text.toUpperCase().replace(/[^ATGCRYSWKMBDHVN]/g, ''); return {name: file.name.replace(/\.[^.]+$/, ''), seq: s, topology: 'circular', features: [], primers: []}; })();
        }
        if (!parsed.seq) { alert('未能从文件中解析出序列：' + file.name); return; }
        db.plasmids.unshift({id: uid(), name: parsed.name || file.name.replace(/\.[^.]+$/, ''), seq: parsed.seq,
          topology: parsed.topology, features: parsed.features || [], primers: parsed.primers || [], updated: new Date().toISOString()});
        save(); draw(); rerender();
      });
      fileInput.value = '';
    };
    m.querySelector('[data-act="import"]').onclick = () => fileInput.click();
    m.querySelector('[data-act="new"]').onclick = () => formModal('新建空白载体', [
      {key:'name', label:'载体名称'}, {key:'topology', label:'拓扑', type:'select', options:['circular','linear']}], {id: uid(), topology: 'circular'}, v => {
      db.plasmids.unshift({id: v.id, name: v.name.trim() || '未命名', seq: '', topology: v.topology, features: [], primers: [], updated: new Date().toISOString()});
      save(); draw(); rerender();
    });
    list.onclick = e => {
      const card = e.target.closest('.card'); if (!card) return;
      const p = db.plasmids.find(x => x.id === card.dataset.id); const act = e.target.dataset.act;
      if (act === 'open' || e.target.closest('h3')) openEditor(p.id, rerender);
      if (act === 'rename') formModal('重命名', [{key:'name', label:'名称'}], {name: p.name}, v => { p.name = v.name.trim() || p.name; save(); draw(); rerender(); });
      if (act === 'del') { if (confirm('删除载体「' + p.name + '」？')) { db.plasmids = db.plasmids.filter(x => x.id !== p.id); save(); draw(); rerender(); } }
    };
  }
};
})();
