/* ciib_plot/plot.js — 科研绘图：基因结构 / 蛋白结构 / 基因排布 / 表达热图 / 分组柱状图（SVG，可导出矢量 PDF，柱状图含自动统计）+ 富集气泡图（Canvas） */
(function(){
'use strict';
const {esc, parseTSV} = CIIB;

const EXAMPLES = {
  gene: [
    '基因\t类型\t名称\t起点\t终点',
    'WT\texon\tE1\t1000\t1190', 'WT\tintron\t\t1191\t1949', 'WT\texon\tE2\t1950\t2000',
    'WT\texon\tE3\t2070\t2125', 'WT\texon\tE4\t2205\t2275', 'WT\texon\tE5\t2380\t2495',
    'WT\texon\tE6\t2610\t2665', 'WT\texon\tE7\t2770\t2840', 'WT\texon\tE8\t2960\t3035',
    'WT\texon\tE9\t3170\t3220', 'WT\texon\tE10\t3380\t3490', 'WT\tutr\t3\'UTR\t3491\t4030',
    'WT\tsite\tmiRNA\t3460\t3461',
    'Δmut\texon\tE1\t1000\t1190', 'Δmut\tintron\t\t1191\t1949', 'Δmut\texon\tE2\t1950\t2000',
    'Δmut\texon\tE3\t2070\t2125', 'Δmut\texon\tE4\t2205\t2275', 'Δmut\texon\tE5\t2380\t2495',
    'Δmut\texon\tE6\t2610\t2665', 'Δmut\texon\tE7\t2770\t2840', 'Δmut\texon\tE8\t2960\t3076',
    'Δmut\tdeletion\t240 bp 缺失\t3077\t3316', 'Δmut\tutr\t3\'UTR\t3317\t3856'
  ].join('\n'),
  heat: [
    '基因\tCK1\tCK2\tCK3\tT1\tT2\tT3',
    '分组\tCK\tCK\tCK\tT\tT\tT',
    'AT1G01010\t1.02\t0.88\t1.13\t4.62\t5.11\t4.37',
    'AT1G01230\t0.41\t0.52\t0.37\t2.15\t2.48\t2.06',
    'AT1G02310\t6.30\t5.94\t6.71\t1.22\t1.05\t1.38',
    'AT1G05570\t2.11\t1.87\t2.34\t7.90\t8.42\t7.51',
    'AT1G07430\t0.95\t1.24\t0.86\t3.77\t4.02\t3.58',
    'AT1G09570\t8.02\t7.55\t8.44\t0.44\t0.51\t0.39',
    'AT1G13950\t1.63\t1.78\t1.52\t1.71\t1.66\t1.80',
    'AT1G18570\t4.12\t3.88\t4.35\t9.66\t9.21\t10.04',
    'AT1G22770\t0.22\t0.31\t0.19\t1.88\t2.10\t1.72',
    'AT1G29930\t5.45\t6.02\t5.11\t2.03\t2.21\t1.88',
    'AT1G34370\t3.10\t2.94\t3.28\t6.55\t6.12\t6.98',
    'AT1G43160\t1.05\t0.92\t1.18\t0.88\t1.02\t0.81',
    'AT1G51800\t7.21\t6.88\t7.65\t3.40\t3.62\t3.19',
    'AT1G67090\t2.55\t2.71\t2.39\t5.88\t5.42\t6.31',
    'AT1G78370\t0.63\t0.71\t0.58\t2.94\t3.15\t2.77'
  ].join('\n'),
  enrich: '通路\t数目\t富集倍数(%)\tP值\n光合作用-天线蛋白\t18\t32.1\t1.2e-6\n植物激素信号转导\t25\t12.4\t3.4e-5\nMAPK信号通路\t14\t9.8\t0.00021\n苯丙烷生物合成\t11\t18.6\t0.00087\n淀粉与蔗糖代谢\t9\t7.2\t0.013',
  bar: [
    /* Relative abundance data.csv（Nature 谷胱甘肽分解代谢一文示例，4 组 × 10 重复） */
    'Relative abundance',
    'Vehicle\t0.943952', 'Vehicle\t0.976982', 'Vehicle\t1.155871', 'Vehicle\t1.007051', 'Vehicle\t1.012929',
    'Vehicle\t1.171506', 'Vehicle\t1.046092', 'Vehicle\t0.873494', 'Vehicle\t0.931315', 'Vehicle\t0.955434',
    'Vehicle+NAC\t0.622408', 'Vehicle+NAC\t0.535981', 'Vehicle+NAC\t0.540077', 'Vehicle+NAC\t0.511068', 'Vehicle+NAC\t0.444416',
    'Vehicle+NAC\t0.678691', 'Vehicle+NAC\t0.549785', 'Vehicle+NAC\t0.303338', 'Vehicle+NAC\t0.570136', 'Vehicle+NAC\t0.452721',
    'GGsTop\t1.193218', 'GGsTop\t1.278203', 'GGsTop\t1.1974', 'GGsTop\t1.227111', 'GGsTop\t1.237496',
    'GGsTop\t1.131331', 'GGsTop\t1.383779', 'GGsTop\t1.315337', 'GGsTop\t1.186186', 'GGsTop\t1.425381',
    'GGsTop+NAC\t0.742646', 'GGsTop+NAC\t0.670493', 'GGsTop+NAC\t0.789513', 'GGsTop+NAC\t0.787813', 'GGsTop+NAC\t0.782158',
    'GGsTop+NAC\t0.768864', 'GGsTop+NAC\t0.755392', 'GGsTop+NAC\t0.693809', 'GGsTop+NAC\t0.669404', 'GGsTop+NAC\t0.661953'
  ].join('\n'),
  /* cmp 示例已并入 gene 示例（基因结构支持单/多转录本与多种注释） */
  prot: [
    '蛋白\t类型\t名称\t起点\t终点\t颜色',
    'Protein1\tmotif\tMotif1\t40\t75\t#f0c75e',
    'Protein1\tmotif\tNLS\t180\t215\t#f2c4cc',
    'Protein1\tdomain\tDomainA\t225\t395',
    'Protein1\tmotif\tLinker\t400\t440\t#4f8a3d',
    'Protein1\tdomain\tDomainB\t445\t615',
    'Protein1\tmotif\tMotif2\t630\t665\t#f0c75e',
    'Protein1\tsite\tmiRNA 位点\t700\t701\t#cc4b4b',
    'Protein1_del\tmotif\tMotif1\t40\t75\t#f0c75e',
    'Protein1_del\tmotif\tNLS\t180\t215\t#f2c4cc',
    'Protein1_del\tdomain\tDomainA\t225\t395',
    'Protein1_del\tmotif\tLinker\t400\t440\t#4f8a3d',
    'Protein1_del\tdomain\tDomainB\t445\t615',
    'Protein1_del\tmotif\tMotif2\t630\t665\t#f0c75e'
  ].join('\n'),
  chr: [
    '基因\t起点\t终点\t标签\t高亮',
    'Gene01\t100000\t102400', 'Gene02\t112400\t116800', 'Gene03\t128100\t131200', 'Gene04\t132300\t134900',
    'Gene05\t150900\t153100', 'Gene06\t153300\t155000', 'Gene07\t157200\t158900',
    'Gene08\t173100\t175600\tGene08\t1',
    'Gene09\t212100\t214700', 'Gene10\t214800\t217200', 'Gene11\t221500\t224800', 'Gene12\t225200\t227900',
    'Gene13\t230600\t233400', 'Gene14\t234700\t237100', 'Gene15\t241500\t244200', 'Gene16\t258200\t260600',
    'Gene17\t273000\t275400', 'Gene18\t281400\t283700', 'Gene19\t295500\t298400'
  ].join('\n')
};
const FONT = 'Segoe UI, Microsoft YaHei, sans-serif';

function exportPNG(canvas, name){
  canvas.toBlob(b => {
    const url = URL.createObjectURL(b); const a = document.createElement('a');
    a.href = url; a.download = name + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
}
function panel(m, key, title, sub){
  m.innerHTML = '<div class="plot-lab"><div class="map-panel">' +
    '<div class="section-head"><h2>' + title + '</h2></div><p class="muted">' + sub + '</p>' +
    '<label class="field"><span>数据（每行一条，Tab / 逗号 / 分号分隔）</span>' +
    '<textarea class="data" data-act="data">' + esc(EXAMPLES[key]) + '</textarea></label>' +
    '<div class="opt-row" data-act="opts"></div>' +
    '<div class="toolbar"><button class="primary" data-act="draw">生成图形</button><button data-act="png">导出 PNG</button></div>' +
    '</div><div><canvas class="plot" width="900" height="620"></canvas>' +
    '<p class="muted" data-act="msg" style="margin-top:8px">修改数据后点「生成图形」。</p></div></div>';
  return {data: m.querySelector('[data-act="data"]'), canvas: m.querySelector('canvas.plot'),
    opts: m.querySelector('[data-act="opts"]'), msg: m.querySelector('[data-act="msg"]')};
}
function opt(sel, label, options){
  return '<label>' + label + '<select data-opt="' + sel + '">' + options.map(o => '<option>' + o + '</option>').join('') + '</select></label>';
}
function getOpts(box){
  const o = {};
  box.querySelectorAll('[data-opt]').forEach(s => {
    if (s.type === 'checkbox') o[s.dataset.opt] = s.checked;
    else o[s.dataset.opt] = s.value;
  });
  return o;
}
function axes(ctx, x0, y0, w, h, xmax, ymax, xlabel, ylabel, fmtX, fmtY){
  ctx.strokeStyle = '#c9d4d0'; ctx.fillStyle = '#54655f'; ctx.lineWidth = 1;
  ctx.font = '11px ' + FONT;
  ctx.strokeRect(x0, y0, w, h);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    const v = ymax * i / 5, y = y0 + h - h * i / 5;
    ctx.fillText(fmtY ? fmtY(v) : +v.toFixed(2), x0 - 6, y);
    ctx.strokeStyle = '#edf1f0'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
  }
  ctx.strokeStyle = '#c9d4d0';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i <= 5; i++) {
    const v = xmax * i / 5, x = x0 + w * i / 5;
    ctx.fillText(fmtX ? fmtX(v) : +v.toFixed(2), x, y0 + h + 8);
    ctx.strokeStyle = '#edf1f0'; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke();
  }
  ctx.strokeStyle = '#c9d4d0';
  ctx.fillStyle = '#1c2b28'; ctx.font = '12.5px ' + FONT;
  ctx.textAlign = 'center'; ctx.fillText(xlabel, x0 + w / 2, y0 + h + 32);
  ctx.save(); ctx.translate(x0 - 46, y0 + h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
}

/* ---- 1. 基因结构（单基因或多个转录本；exon/CDS/UTR/intron/site/deletion） ---- */
function geneSVG(rows, o, W, H){
  const recs = [];
  rows.forEach(r => {
    if (r.length < 4) return;
    const hasName = r.length >= 5;
    const s = +r[hasName ? 3 : 2], e = +r[hasName ? 4 : 3];
    if (!Number.isFinite(s) || !Number.isFinite(e)) return;
    recs.push({g: (r[0] || '').trim(), type: (r[1] || 'CDS').toLowerCase(), name: hasName ? (r[2] || '').trim() : '', s: Math.min(s, e), e: Math.max(s, e)});
  });
  if (!recs.length) return '数据需要 4–5 列：基因/转录本、类型(exon/CDS/UTR/intron/site/deletion)、名称(可选)、起点、终点';
  const ts = [];
  recs.forEach(r => { if (!ts.includes(r.g)) ts.push(r.g); });
  let mn = Infinity, mx = -Infinity;
  recs.forEach(r => { mn = Math.min(mn, r.s); mx = Math.max(mx, r.e); });
  const C = SCHEMES[o.scheme] || SCHEMES['经典'];
  const showLab = showLabOf(o);
  const hls = String(o.hl || '').split(/[,，]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const blkHL = (name, group) => hls.some(h => (name || '').toLowerCase().includes(h) || (group || '').toLowerCase().includes(h));
  const x0 = 90, x1 = W - 40, k = (x1 - x0) / (mx - mn || 1), X = v => x0 + (v - mn) * k;
  const topPad = 52, axH = 84, rh = Math.max(56, Math.min(130, (H - topPad - axH) / ts.length));
  const s = [svgHead(W, H, o.font)];
  let delN = 0;
  const hatch = (sx, y, sw, hh) => {
    const id = 'delclip' + (delN++);
    let lines = '';
    for (let x = sx - hh; x < sx + sw; x += 7)
      lines += '<line x1="' + x.toFixed(1) + '" y1="' + (y + hh).toFixed(1) + '" x2="' + (x + hh).toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
    return '<clipPath id="' + id + '"><rect x="' + sx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + hh.toFixed(1) + '"/></clipPath>' +
      '<rect x="' + sx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="#f8e2df"/>' +
      '<g clip-path="url(#' + id + ')" stroke="' + C.del + '" stroke-width="2">' + lines + '</g>' +
      '<rect x="' + sx.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="none" stroke="' + C.del + '" stroke-width="1"/>';
  };
  const used = [...new Set(recs.map(r => r.type))];
  const items = [];
  if (used.some(t => t === 'exon' || t === 'cds')) items.push(['<rect width="18" height="9" fill="' + C.gene + '"/>', 'CDS/外显子']);
  if (used.includes('utr')) items.push(['<rect width="18" height="9" fill="' + C.utr + '"/>', 'UTR']);
  if (used.includes('intron')) items.push(['<line x1="0" y1="4" x2="18" y2="4" stroke="' + C.line + '" stroke-width="1.4" stroke-dasharray="4 3"/>', 'Intron']);
  if (used.includes('deletion')) items.push(['<rect width="18" height="9" fill="#f8e2df" stroke="' + C.del + '"/><line x1="4" y1="9" x2="14" y2="0" stroke="' + C.del + '" stroke-width="2"/><line x1="12" y1="9" x2="18" y2="3" stroke="' + C.del + '" stroke-width="2"/>', 'Deletion']);
  if (used.includes('site')) items.push(['<rect x="8" y="-3" width="2.5" height="15" fill="' + C.site + '"/>', 'Site']);
  let lx = 14;
  items.forEach(it => {
    s.push('<g transform="translate(' + lx + ',22)">' + it[0] + T(24, 9, it[1], 11, 'start', C.text) + '</g>');
    lx += 30 + it[1].length * 6.4 + 16;
  });
  ts.forEach((t, i) => {
    const list = recs.filter(r => r.g === t).sort((a, b) => a.s - b.s);
    const mid = topPad + i * rh + Math.min(rh * .55, 44);
    const exons = list.filter(r => r.type === 'exon' || r.type === 'cds');
    const lineS = X((exons.length ? exons : list)[0].s), lineE = X(list[list.length - 1].e);
    const hl = list.some(r => blkHL(r.name, r.g));
    const col = hl ? C.hl : C.text;
    s.push(T(x0 - 12, mid + 4, t, 13, 'end', col, ' font-weight="600"'));
    s.push('<line x1="' + lineS + '" y1="' + mid + '" x2="' + lineE + '" y2="' + mid + '" stroke="' + (hl ? C.hl : C.line) + '" stroke-width="' + (hl ? 2.4 : 1.6) + '"/>');
    list.forEach(r => {
      const sx = X(r.s), sw = Math.max(2, (r.e - r.s + 1) * k);
      const b = blkHL(r.name, r.g);
      if (r.type.includes('utr')) {
        s.push('<rect x="' + sx.toFixed(1) + '" y="' + (mid - 6).toFixed(1) + '" width="' + sw.toFixed(1) + '" height="12" fill="' + C.utr + '"/>');
        if (showLab && r.name) s.push(T(sx + sw / 2, mid - 11, r.name, 10.5, 'middle', b ? C.hl : '#888'));
        if (b) s.push(hlBox(C.hl, sx, mid - 6, sw, 12));
      } else if (r.type.includes('intron')) {
        s.push('<line x1="' + sx.toFixed(1) + '" y1="' + mid + '" x2="' + X(r.e).toFixed(1) + '" y2="' + mid + '" stroke="' + (b ? C.hl : C.line) + '" stroke-width="' + (b ? 2 : 1.2) + '"' + (b ? '' : ' stroke-dasharray="4 3"') + '/>');
      } else if (r.type === 'deletion') {
        s.push(hatch(sx, mid - 13, sw, 26));
        if (showLab) {
          s.push(T(sx + sw / 2, mid - 20, r.name, 11, 'middle', C.del, ' font-weight="600"'));
          s.push(T(sx + sw / 2, mid + 40, r.s.toLocaleString('en-US') + '–' + r.e.toLocaleString('en-US'), 10, 'middle', '#888'));
        }
        if (b) s.push(hlBox(C.hl, sx, mid - 13, sw, 26));
      } else if (r.type === 'site') {
        s.push('<rect x="' + (sx - 1.2).toFixed(1) + '" y="' + (mid - 16).toFixed(1) + '" width="2.4" height="32" fill="' + (b ? C.hl : C.site) + '"/>');
        if (showLab && r.name) s.push(T(sx, mid + 34, r.name, 10.5, 'middle', b ? C.hl : C.site));
      } else {
        const eh = 22;
        s.push('<rect x="' + sx.toFixed(1) + '" y="' + (mid - eh / 2).toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + eh + '" rx="1" fill="' + C.gene + '"/>');
        if (showLab && r.name) s.push(T(sx + sw / 2, mid - eh / 2 - 6, r.name, 11, 'middle', col));
        if (b) s.push(hlBox(C.hl, sx, mid - eh / 2, sw, eh));
      }
    });
  });
  const mb = mx - mn >= 1e6;
  const lastMid = topPad + (ts.length - 1) * rh + Math.min(rh * .55, 44);
  const axY = Math.min(H - 44, lastMid + 64);
  s.push('<line x1="' + x0 + '" y1="' + axY + '" x2="' + x1 + '" y2="' + axY + '" stroke="' + C.line + '"/>');
  ticks(mn, mx, 6).forEach(v => {
    const x = X(v);
    s.push('<line x1="' + x.toFixed(1) + '" y1="' + axY + '" x2="' + x.toFixed(1) + '" y2="' + (axY + 5) + '" stroke="' + C.line + '"/>');
    s.push(T(x, axY + 19, mb ? (v / 1e6).toFixed(2) : Math.round(v).toLocaleString('en-US'), 11, 'middle', C.axis));
  });
  s.push(T((x0 + x1) / 2, axY + 35, mb ? 'Coordinate (Mb)' : 'Position (bp)', 11.5, 'middle', C.axis));
  s.push('</svg>');
  return s.join('');
}

/* ---- 2. 表达热图（SVG：列分组注释条 + 自定义图例） ---- */
const HEAT_PALS = {
  '绿-白-红': ['#2f9e89', '#fdfdfd', '#e05263'],
  '蓝-白-红': ['#2166ac', '#f7f7f7', '#b2182b'],
  '紫-白-绿': ['#762a83', '#f7f7f7', '#1a7833'],
  '蓝-白-橙': ['#2b6cb0', '#fbfbfb', '#e08214'],
  '黄-白-紫': ['#d8b365', '#fdfdfd', '#5f4690']
};
const GROUP_PALS = {
  '默认（粉-青）': ['#f2a2bd', '#63c6b2', '#f6c86b', '#8fa9e0', '#c3a6d8', '#e9967a', '#86c9a0', '#9fc6e0'],
  '明亮': ['#e5866b', '#19b2b2', '#f5b731', '#3cb44b', '#911eb4', '#0082c8', '#d45087', '#808000'],
  '柔和': ['#b3cde3', '#b8ddc6', '#decbe4', '#f2d7b6', '#e8e8c8', '#d9dfd0', '#f6d3e2', '#cfd9e6']
};
function mixHex(a, b, t){
  const p = h => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [0, 0, 0]; };
  const A = p(a), B = p(b);
  return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}
function heatCol(P, t){
  const d = Math.max(0, Math.min(1, t));
  return d < .5 ? mixHex(P[0], P[1], d * 2) : mixHex(P[1], P[2], (d - .5) * 2);
}
let HEAT_GROUPS = [], HEAT_CUSTOM = {};
/* 热图「组色」动态取色器：按数据里出现的组名生成一组 <input type="color"> */
function heatGroupColorUI(ui){
  const box = ui.opts.querySelector('[data-act="gcolbox"]');
  if (!box) return;
  const nsig = HEAT_GROUPS.map(g => g.name).join('|');
  if (box.dataset.nsig !== nsig) { /* 组名变了才重建 */
    box.dataset.nsig = nsig;
    box.innerHTML = HEAT_GROUPS.length
      ? '<span class="lab-txt">组色</span>' + HEAT_GROUPS.map(g => '<label class="gcol-item"><input type="color" data-opt="gcol:' + esc(g.name) + '" value="' + esc(g.color) + '"><span>' + esc(g.name) + '</span></label>').join('') +
        '<button type="button" class="gcol-reset" data-act="greset" title="清除自定义颜色，恢复按配色方案自动取色">重置组色</button>'
      : '';
    box.querySelectorAll('input[type=color]').forEach(inp => {
      inp.addEventListener('input', () => { HEAT_CUSTOM[inp.dataset.opt.slice(5)] = inp.value.toLowerCase(); });
    });
    const rs = box.querySelector('[data-act="greset"]');
    if (rs) rs.onclick = () => {
      HEAT_CUSTOM = {};
      const btn = ui.opts.closest('.map-panel').querySelector('[data-act="draw"]');
      if (btn) btn.click();
    };
    return;
  }
  /* 切换配色方案时同步未自定义的颜色显示 */
  [...box.querySelectorAll('input[type=color]')].forEach(inp => {
    const name = inp.dataset.opt.slice(5), g = HEAT_GROUPS.find(x => x.name === name);
    if (g && !HEAT_CUSTOM[name]) inp.value = g.color;
  });
}
const vfmt = v => Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
function heatSVG(rows, o, W, H){
  const trimEnd = a => { let n = a.length; while (n > 0 && String(a[n - 1] || '').trim() === '') n--; return a.slice(0, n); };
  if (!rows.length) return '数据为空';
  const head = trimEnd(rows[0].slice(1)).map(x => String(x).trim());
  let rest = rows.slice(1), grpRaw = null;
  if (rest.length && /^(#?分组|group|grp)$/i.test(String(rest[0][0] || '').trim())) {
    grpRaw = trimEnd(rest[0].slice(1)).map(x => String(x).trim());
    rest = rest.slice(1);
  }
  const nc = head.length;
  if (!nc) return '首行需要为样本名（表头）';
  if (rest.length && !rest.some(r => String(r[0] || '').trim())) return '数据行缺少基因名';
  const genes = [], raw = [];
  rest.forEach(r => {
    const nm = String(r[0] || '').trim(); if (!nm) return;
    genes.push(nm);
    raw.push(Array.from({length: nc}, (_, j) => { const t = String(r[j + 1] == null ? '' : r[j + 1]).trim(); return t === '' ? NaN : Number(t); }));
  });
  if (!genes.length) return '没有数据行';
  const doZ = o.z !== false && o.z !== 'false';
  const mat = doZ ? raw.map(r => {
    const v = r.filter(Number.isFinite);
    const mu = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) * (b - mu), 0) / (v.length || 1));
    return r.map(x => Number.isFinite(x) ? (sd ? (x - mu) / sd : 0) : NaN);
  }) : raw;
  const all = mat.flat().filter(Number.isFinite);
  if (!all.length) return '没有可用的数值单元格';
  let mn = Math.min(...all), mx = Math.max(...all);
  if (mn === mx) { mn -= 1; mx += 1; }

  const font = o.font || 'Arial';
  const P = HEAT_PALS[o.pal] || HEAT_PALS['绿-白-红'];
  const gp = GROUP_PALS[o.gpal] || GROUP_PALS['默认（粉-青）'];
  const cols = head.map((h, j) => (grpRaw && grpRaw[j]) ? grpRaw[j] : '');
  const grpNames = [], gcol = {};
  const isHex = c => /^#[0-9a-f]{6}$/i.test(String(c || '').trim());
  cols.forEach(g => {
    if (!g || gcol[g]) return;
    const custom = HEAT_CUSTOM[g] || '';
    gcol[g] = isHex(custom) ? custom.toLowerCase() : gp[grpNames.length % gp.length];
    grpNames.push(g);
  });
  HEAT_GROUPS = grpNames.map(g => ({name: g, color: gcol[g]}));
  const hasGrp = grpNames.length > 0;
  const grpTitle = String(o.glab == null || o.glab === '' ? 'Group' : o.glab);
  const zTitle = String(o.zlab == null || o.zlab === '' ? 'Z-score' : o.zlab);

  const gfs = 12;
  const left = Math.max(58, Math.min(230, Math.max(...genes.map(g => g.length)) * gfs * 0.62 + 16));
  const legendW = Math.max(grpTitle.length, zTitle.length, ...grpNames.map(g => g.length)) * 7.4;
  const right = (hasGrp ? Math.max(92, legendW + 52) : 80) + 20;
  const botRes = Math.round(Math.max(...head.map(h => h.length)) * 11 * 0.62 * 0.707 + 26);
  const x0 = left, x1 = W - right;
  const topPad = 12, topRes = hasGrp ? 30 : 8;
  const y0 = topPad + topRes, y1 = H - botRes - 8;
  if (x1 - x0 < 60 || y1 - y0 < 40) return '画布太小，请增大「宽 / 高」';
  /* 组间距：相邻两组之间留一段空白（注释条与矩阵同步位移） */
  const gsp = Math.max(0, Math.min(60, Number(o.gspace) || 0));
  const cuts = new Array(nc).fill(false);
  for (let j = 1; j < nc; j++) if (cols[j] && cols[j - 1] && cols[j] !== cols[j - 1]) cuts[j] = true;
  const nCut = cuts.filter(Boolean).length;
  const pre = new Array(nc).fill(0);
  for (let j = 1, acc = 0; j < nc; j++) { if (cuts[j]) acc += gsp; pre[j] = acc; }
  const gw = ((x1 - x0) - gsp * nCut) / nc;
  if (gw < 4) return '组间距过大，请减小「组间距」或增大「宽」';
  const gh = (y1 - y0) / genes.length;
  const X = j => x0 + j * gw + pre[j];
  const gap = Math.max(0, Math.min(2.5, gw * 0.06, gh * 0.06));

  const s = [svgHead(W, H, font)];
  /* 顶部：列分组注释条（每组一段圆角色块，组间留白） */
  if (hasGrp) {
    const by = topPad + 2, bh = 16;
    for (let j = 0; j < nc;) {
      const g = cols[j];
      if (!g) { j++; continue; }
      let k = j; while (k + 1 < nc && cols[k + 1] === g) k++;
      const bx = X(j), bw = X(k) + gw - bx;
      if (bw > 0.5) s.push('<rect x="' + bx.toFixed(1) + '" y="' + by + '" width="' + bw.toFixed(1) + '" height="' + bh + '" rx="5" fill="' + gcol[g] + '"/>');
      j = k + 1;
    }
  }
  /* 热图格子 */
  const showVal = !!o.cellval && o.cellval !== 'false';
  mat.forEach((row, i) => {
    const cy = y0 + i * gh;
    s.push(T(x0 - 10, cy + gh / 2 + gfs * 0.36, genes[i], gfs, 'end', '#1c2b28'));
    row.forEach((v, j) => {
      const sx = X(j) + gap / 2, sw = gw - gap, sy = cy + gap / 2, sh = gh - gap;
      if (!Number.isFinite(v)) { s.push('<rect x="' + sx.toFixed(1) + '" y="' + sy.toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + sh.toFixed(1) + '" fill="#f2f2f2" stroke="#e3e3e3" stroke-width="0.5"/>'); return; }
      const c = heatCol(P, (v - mn) / (mx - mn));
      s.push('<rect x="' + sx.toFixed(1) + '" y="' + sy.toFixed(1) + '" width="' + sw.toFixed(1) + '" height="' + sh.toFixed(1) + '" rx="2" fill="' + c + '"/>');
      if (showVal && sh > 13 && sw > 18) s.push(T(sx + sw / 2, sy + sh / 2 + 3.6, vfmt(v), Math.min(11, sh * 0.62), 'middle', txtOn(c)));
    });
  });
  /* 底部：样本名（旋转 45°） */
  const labY = y1 + 10;
  head.forEach((h, j) => {
    const cx = X(j) + gw / 2;
    s.push('<text x="' + cx.toFixed(1) + '" y="' + labY + '" font-size="11.5" text-anchor="end" fill="#1c2b28" transform="rotate(-45 ' + cx.toFixed(1) + ' ' + labY + ')">' + esc(h) + '</text>');
  });
  /* 右侧图例：分组 + 色标 */
  const lgx = x1 + 24;
  let ly = y0 + 2;
  if (hasGrp) {
    s.push(T(lgx, ly, grpTitle, 12.5, 'start', '#333', ' font-weight="600"'));
    grpNames.forEach((g, i) => {
      const yy = ly + 21 + i * 19;
      s.push('<rect x="' + lgx + '" y="' + (yy - 9) + '" width="17" height="11" rx="3" fill="' + gcol[g] + '"/>');
      s.push(T(lgx + 25, yy, g, 11.5, 'start', '#333'));
    });
    ly += 21 + grpNames.length * 19 + 24;
  }
  const barW = 14, barH = Math.max(70, Math.min(160, (y1 - y0) * 0.6));
  s.push(T(lgx, ly, zTitle, 12.5, 'start', '#333', ' font-weight="600"'));
  /* 色标用细矩形切片实现渐变（兼容性最好，避免 gradient 在部分渲染器变黑） */
  const SL = 80;
  for (let i = 0; i < SL; i++) {
    const t = i / (SL - 1); /* 0=顶(高值) → 1=底(低值) */
    const yy = ly + 12 + barH * t;
    s.push('<rect x="' + lgx + '" y="' + yy.toFixed(2) + '" width="' + barW + '" height="' + (barH / SL + 0.6).toFixed(2) + '" fill="' + heatCol(P, 1 - t) + '"/>');
  }
  s.push('<rect x="' + lgx + '" y="' + (ly + 12) + '" width="' + barW + '" height="' + barH + '" fill="none" stroke="#c9c9c9" stroke-width="0.8"/>');
  ticks(mn, mx, 4).forEach(v => {
    const yy = ly + 12 + barH * (1 - (v - mn) / (mx - mn));
    s.push('<line x1="' + (lgx + barW) + '" y1="' + yy.toFixed(1) + '" x2="' + (lgx + barW + 4) + '" y2="' + yy.toFixed(1) + '" stroke="#555"/>');
    s.push(T(lgx + barW + 7, yy + 3.6, vfmt(v), 10.5, 'start', '#555'));
  });
  s.push('</svg>');
  return s.join('');
}

/* ---- 3. 富集气泡 ---- */
function drawEnrich(ctx, rows, W, H){
  const items = rows.slice(1).filter(r => r.length >= 4).map(r => ({term: r[0], count: +r[1], ratio: +r[2], p: +r[3]}))
    .filter(i => Number.isFinite(i.p) && Number.isFinite(i.ratio));
  if (!items.length) return '数据需要：通路 数目 富集倍数(%) P值';
  const x0 = 90, y0 = 60, w = W - 200, h = H - 130;
  const xmax = Math.max(...items.map(i => i.ratio)) * 1.15;
  const ymax = Math.max(...items.map(i => -Math.log10(i.p))) * 1.15;
  const cmin = Math.min(...items.map(i => i.count)), cmax = Math.max(...items.map(i => i.count));
  ctx.clearRect(0, 0, W, H);
  axes(ctx, x0, y0, w, h, xmax, ymax, '富集倍数 (%)', '-log10(P)', v => +v.toFixed(0), v => +v.toFixed(1));
  const grd = ['#2166ac', '#4393c3', '#92c5de', '#f4a582', '#b2182b'];
  items.forEach(i => {
    const t = (i.count - cmin) / (cmax - cmin || 1);
    const x = x0 + i.ratio / xmax * w, y = y0 + h - (-Math.log10(i.p)) / ymax * h;
    const r = 7 + t * 13;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = grd[Math.round(t * 4)]; ctx.globalAlpha = .85; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#1c2b28'; ctx.font = '11.5px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText(i.term.length > 10 ? i.term.slice(0, 10) + '…' : i.term, x, y - r - 8);
  });
  // 图例：气泡大小
  ctx.fillStyle = '#54655f'; ctx.textAlign = 'left'; ctx.font = '11px ' + FONT;
  ctx.fillText('气泡大小 = 基因数目 (' + cmin + '–' + cmax + ')', x0 + w + 14, y0 + h - 14);
  return '';
}

/* ---------- SVG 科研图（矢量，可导出 PDF） ---------- */
const SCHEMES = {
  '经典': {gene:'#4d4d4d', utr:'#c8c8c8', del:'#c0392b', site:'#d0021b', line:'#8a8a8a', text:'#1c2b28', hl:'#c0392b', axis:'#666'},
  '蓝绿': {gene:'#167c69', utr:'#a9ccc3', del:'#d88b4b', site:'#cc4b4b', line:'#7ba79d', text:'#1c2b28', hl:'#cc4b4b', axis:'#666'},
  '黑白': {gene:'#2f2f2f', utr:'#bdbdbd', del:'#5a5a5a', site:'#000000', line:'#9a9a9a', text:'#111111', hl:'#000000', axis:'#555'}
};
function svgHead(W, H, font){
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="' + font + ',Helvetica,Arial,sans-serif" style="background:#fff">';
}
/* 高亮块：围绕某个 block 画一圈选中框（与块自身配色区分，统一用高亮色） */
function hlBox(c, sx, sy, sw, sh, pad){
  pad = pad == null ? 2.5 : pad;
  return '<rect x="' + (sx - pad).toFixed(1) + '" y="' + (sy - pad).toFixed(1) + '" width="' + (sw + pad * 2).toFixed(1) + '" height="' + (sh + pad * 2).toFixed(1) + '" rx="3" fill="none" stroke="' + c + '" stroke-width="2.4"/>';
}
/* 实心色块上的文字颜色：浅底用深字、深底用白字 */
function txtOn(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#1c2b28';
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#1c2b28' : '#fff';
}
function T(x, y, s, size, anchor, fill, extra){
  return '<text x="' + (+x).toFixed(1) + '" y="' + (+y).toFixed(1) + '" font-size="' + size + '" text-anchor="' + (anchor || 'start') + '" fill="' + (fill || '#1c2b28') + '"' + (extra || '') + '>' + esc(s) + '</text>';
}
function ticks(a, b, n){
  const span = b - a, mag = Math.pow(10, Math.floor(Math.log10(span / n)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(v);
  return out;
}
const showLabOf = o => o.labels !== false && o.labels !== 'false';

/* 突变对比已并入 geneSVG（见「基因结构」模块：单/多转录本 + 多种注释） */

/* ---- 6. 蛋白结构（domain / motif 排布） ---- */
/* motif 自动配色方案：按特征名称首次出现顺序循环取色；「跟随数据颜色列」= null */
const PPALS = {
  '跟随数据颜色列': null,
  '自然': ['#f0c75e', '#8fbf6f', '#7aa6c2', '#c78fc9', '#e8965a', '#6fb3a8', '#d98f8f', '#b5a264'],
  '海洋': ['#2f6db3', '#6fb3d9', '#3fa9a0', '#8fd0c4', '#1c4e80', '#5a8fd0', '#7fcdbb', '#a8d8ea'],
  '莓果': ['#c04a6b', '#e08ba0', '#a23b72', '#f2c4cc', '#8c2f4b', '#e8748f', '#d9537a', '#f5a3b5'],
  '暖阳': ['#e8a13a', '#cf5c2a', '#f0cf72', '#d97b4b', '#f2b857', '#b34720', '#e8c98a', '#c96f2f'],
  '森林': ['#4f8a3d', '#7fb069', '#2d6a4f', '#a3c585', '#6b8e23', '#40916c', '#74a892', '#95d5b2'],
  '灰阶': ['#4d4d4d', '#8c8c8c', '#b3b3b3', '#666666', '#a6a6a6', '#737373', '#999999', '#d0d0d0']
};
function protSVG(rows, o, W, H){
  const recs = [];
  rows.forEach(r => {
    if (r.length < 5) return;
    const s = +r[3], e = +r[4];
    if (!Number.isFinite(s) || !Number.isFinite(e)) return;
    recs.push({p: r[0], type: (r[1] || 'domain').toLowerCase(), name: r[2] || '', s: Math.min(s, e), e: Math.max(s, e), c: (r[5] || '').trim()});
  });
  if (!recs.length) return '数据需要 5–6 列：蛋白、类型(domain/motif/site)、名称、起点、终点、颜色(可选)';
  const ps = [];
  recs.forEach(r => { if (!ps.includes(r.p)) ps.push(r.p); });
  const mx = Math.max(...recs.map(r => r.e));
  const C = SCHEMES[o.scheme] || SCHEMES['经典'];
  const showLab = showLabOf(o);
  const hls = String(o.hl || '').split(/[,，]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const blkHL = (name, group) => hls.some(h => (name || '').toLowerCase().includes(h) || (group || '').toLowerCase().includes(h));
  const x0 = Math.min(200, W * .22), x1 = W - 80, k = (x1 - x0) / mx, X = v => x0 + (v - 1) * k;
  const topPad = 26, rh = Math.min(120, (H - topPad - 16) / ps.length);
  /* motif/domain 配色：选了自动方案则按特征名循环取色，domain 用同色浅底；否则跟随数据颜色列 */
  const pal = PPALS[o.ppal] !== undefined ? PPALS[o.ppal] : null;
  const names = [];
  recs.forEach(r => { if (!names.includes(r.name)) names.push(r.name); });
  const colorOf = r => pal ? pal[names.indexOf(r.name) % pal.length] : (r.c || '');
  const s = [svgHead(W, H, o.font)];
  ps.forEach((p, i) => {
    const items = recs.filter(r => r.p === p);
    const rowMax = Math.max(...items.map(r => r.e));
    const mid = topPad + i * rh + Math.min(rh * .5, 40);
    const hl = items.some(r => blkHL(r.name, r.p));
    s.push(T(x0 - 14, mid + 4, p, 12.5, 'end', hl ? C.hl : C.text, ' font-style="italic" font-weight="600"'));
    s.push('<line x1="' + X(1) + '" y1="' + mid + '" x2="' + X(rowMax) + '" y2="' + mid + '" stroke="' + (hl ? C.hl : '#3a3a3a') + '" stroke-width="2.5"/>');
    s.push(T(X(rowMax) + 8, mid + 4, rowMax + ' aa', 11.5, 'start', C.axis || '#666'));
    items.forEach(r => {
      const sx = X(r.s), sw = Math.max(3, (r.e - r.s + 1) * k);
      const cc = colorOf(r);
      const b = blkHL(r.name, r.p);
      if (r.type === 'domain') {
        const ds = b ? C.hl : (cc || '#6d6d6d'), dw = b ? 2.6 : (cc ? 1.8 : 1.6);
        s.push('<rect x="' + sx.toFixed(1) + '" y="' + (mid - 14).toFixed(1) + '" width="' + sw.toFixed(1) + '" height="28" rx="9" fill="' + (cc || '#fff') + '" stroke="' + ds + '" stroke-width="' + dw + '"/>');
        if (showLab && r.name) {
          const tc = b ? C.hl : (cc ? txtOn(cc) : C.text);
          if (sw > r.name.length * 7 + 10) s.push(T(sx + sw / 2, mid + 4, r.name, 11, 'middle', tc));
          else s.push(T(sx + sw / 2, mid - 20, r.name, 10.5, 'middle', b ? C.hl : C.text));
        }
        if (b) s.push(hlBox(C.hl, sx, mid - 14, sw, 28));
      } else if (r.type === 'site') {
        const c = b ? C.hl : (cc || C.site);
        s.push('<rect x="' + (sx - 1.4).toFixed(1) + '" y="' + (mid - 11).toFixed(1) + '" width="2.8" height="22" fill="' + c + '"/>');
        if (showLab && r.name) s.push(T(sx, mid - 17, r.name, 10.5, 'middle', c));
        if (b) s.push(hlBox(C.hl, sx - 1.4, mid - 11, 2.8, 22, 3));
      } else {
        const fill = cc || '#7aa6c2';
        s.push('<rect x="' + sx.toFixed(1) + '" y="' + (mid - 9).toFixed(1) + '" width="' + sw.toFixed(1) + '" height="18" fill="' + fill + '" stroke="' + (b ? C.hl : 'rgba(0,0,0,.25)') + '" stroke-width="' + (b ? 2.6 : 0.6) + '"/>');
        if (showLab && r.name) s.push(T(sx + sw / 2, mid - 14, r.name, 10.5, 'middle', b ? C.hl : C.text));
        if (b) s.push(hlBox(C.hl, sx, mid - 9, sw, 18));
      }
    });
  });
  s.push('</svg>');
  return s.join('');
}

/* ---- 7. 基因排布（染色体/区段） ---- */
function chrSVG(rows, o, W, H){
  const genes = [];
  rows.forEach(r => {
    if (r.length < 3) return;
    const s = +r[1], e = +r[2];
    if (!Number.isFinite(s) || !Number.isFinite(e)) return;
    genes.push({g: r[0], s: Math.min(s, e), e: Math.max(s, e), label: (r[3] || '').trim() || r[0], hl: (r[4] || '').trim() === '1'});
  });
  if (!genes.length) return '数据需要 3–5 列：基因、起点、终点、标签(可选)、高亮(可选,填1)';
  const C = SCHEMES[o.scheme] || SCHEMES['经典'];
  const showLab = showLabOf(o);
  const hls = String(o.hl || '').split(/[,，]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  genes.forEach(g => { if (hls.some(h => g.g.toLowerCase().includes(h))) g.hl = true; });
  const mn = Math.min(...genes.map(g => g.s)), mx = Math.max(...genes.map(g => g.e));
  const pad = (mx - mn) * .015, lo = mn - pad, hi = mx + pad;
  const x0 = 60, x1 = W - 60, k = (x1 - x0) / (hi - lo), X = v => x0 + (v - lo) * k;
  const s = [svgHead(W, H, o.font)];
  let yTop = 16;
  const title = String(o.title || '').trim();
  if (title) {
    s.push(T(W / 2, 30, title, 17, 'middle', '#1c2b28', ' font-weight="700"'));
    s.push(T(W / 2, 51, genes.length + ' genes | Linear genomic scale | ' + mn.toLocaleString('en-US') + '–' + mx.toLocaleString('en-US') + ' bp', 11.5, 'middle', C.axis));
    yTop = 66;
  }
  const axY = H - 52, midY = Math.round((yTop + axY - 24) / 2) + 10;
  genes.filter(g => g.hl).forEach(g =>
    s.push('<rect x="' + X(g.s - pad).toFixed(1) + '" y="' + yTop + '" width="' + ((g.e - g.s + 2 * pad) * k).toFixed(1) + '" height="' + (axY - 14 - yTop) + '" fill="' + C.hl + '" fill-opacity="0.1"/>'));
  s.push('<line x1="' + x0 + '" y1="' + midY + '" x2="' + x1 + '" y2="' + midY + '" stroke="#9a9a9a" stroke-width="1.4"/>');
  /* 标签上下交替 + 泳道防重叠 */
  const laneH = 22, fs = 10.5, la = [], lb = [];
  genes.slice().sort((a, b) => a.s - b.s).forEach((g, idx) => {
    const bx = X(g.s), gw = Math.max(4, (g.e - g.s + 1) * k), cx = bx + gw / 2;
    s.push('<rect x="' + bx.toFixed(1) + '" y="' + (midY - 7) + '" width="' + gw.toFixed(1) + '" height="14" fill="' + (g.hl ? C.hl : C.gene) + '"/>');
    if (!showLab) return;
    const above = idx % 2 === 0, w = g.label.length * fs * .62 + 6;
    const lanes = above ? la : lb;
    let li = lanes.findIndex(end => end + 8 < cx - w / 2);
    if (li < 0) { li = lanes.length; lanes.push(0); }
    lanes[li] = cx + w / 2;
    const ly = above ? midY - 16 - li * laneH : midY + 30 + li * laneH;
    s.push('<line x1="' + cx.toFixed(1) + '" y1="' + (above ? midY - 8 : midY + 8) + '" x2="' + cx.toFixed(1) + '" y2="' + (above ? ly + 4 : ly - 11) + '" stroke="#b9b9b9" stroke-width="1"/>');
    s.push(T(cx, ly, g.label, fs, 'middle', g.hl ? C.hl : '#3d3d3d', g.hl ? ' font-weight="700" font-style="italic"' : ''));
  });
  s.push('<line x1="' + x0 + '" y1="' + axY + '" x2="' + x1 + '" y2="' + axY + '" stroke="#9a9a9a"/>');
  ticks(lo, hi, 8).forEach(v => {
    const x = X(v);
    s.push('<line x1="' + x.toFixed(1) + '" y1="' + axY + '" x2="' + x.toFixed(1) + '" y2="' + (axY + 5) + '" stroke="#9a9a9a"/>');
    s.push(T(x, axY + 18, (v / 1e6).toFixed(2), 11, 'middle', C.axis));
  });
  s.push(T((x0 + x1) / 2, H - 12, 'Chromosome position (Mb)', 11.5, 'middle', C.axis));
  /* 图例：右上角（标题居中，互不遮挡） */
  const hln = genes.filter(g => g.hl).map(g => g.label);
  const ly = 24;
  let rx = x1;
  if (hln.length) {
    const tw = hln.join(', ').length * 6.6;
    s.push(T(rx - tw, ly, hln.join(', '), 11, 'start', C.hl, ' font-style="italic"'));
    rx -= tw + 26;
    s.push('<rect x="' + rx + '" y="' + (ly - 9) + '" width="20" height="10" fill="' + C.hl + '"/>');
    rx -= 40;
  }
  s.push(T(rx, ly, 'Gene', 11, 'end', '#3d3d3d'));
  s.push('<rect x="' + (rx - 46) + '" y="' + (ly - 9) + '" width="20" height="10" fill="' + C.gene + '"/>');
  s.push('</svg>');
  return s.join('');
}

/* ---- 8. 分组柱状图与显著性（原始数据 → 自动均值/SE/ANOVA/Tukey/t 检验 → a/b/c 或 星号） ---- */
/* --- 统计工具（纯 JS，无依赖） --- */
function lgamma(x){
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5, ser = 1.000000000190015;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x){
  const FPMIN = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 300; m++){
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}
/* 正则化不完全 beta I_x(a,b) */
const betai = (a, b, x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.exp(lgamma(a+b)-lgamma(a)-lgamma(b)+a*Math.log(x)+b*Math.log(1-x)) * (x < (a+1)/(a+b+2) ? betacf(a,b,x)/a : 1 - betacf(b,a,1-x)/b));
const phi = y => Math.exp(-y*y/2) / Math.sqrt(2*Math.PI);
function normCdf(x){ const t = 1/(1+0.2316419*Math.abs(x)); const d = 0.3989422804014327*Math.exp(-x*x/2);
  let p = d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return x >= 0 ? 1-p : p; }
/* t 分布双侧 p */
const tTwoSidedP = (t, df) => df <= 0 ? 1 : betai(df/2, 0.5, df/(df + t*t));
/* t 分位数（对双侧 p 二分求逆） */
function tQuantile(p2, df){
  let lo = 0, hi = 200;
  for (let i = 0; i < 80; i++){ const mid = (lo+hi)/2; (tTwoSidedP(mid, df) > p2) ? lo = mid : hi = mid; }
  return (lo+hi)/2;
}
/* 学生化极差分布 Tukey p：P(Q<q) = ∫ G_R(q√(v/df)) f_χ²(v) dv，G_R 用已知方差公式内层积分 */
function rangeCdf(r, k){ /* 已知方差时 k 个 N(0,1) 极差的 CDF */
  if (r <= 0) return 0; if (r > 12) return 1;
  const n = 200, a = -7, b = 7, h = (b-a)/n;
  let s = phi(a) * Math.pow(normCdf(a) - normCdf(a - r), k-1) + phi(b) * Math.pow(normCdf(b) - normCdf(b - r), k-1);
  for (let i = 1; i < n; i++){ const y = a + i*h; s += phi(y) * Math.pow(normCdf(y) - normCdf(y - r), k-1) * (i % 2 ? 4 : 2); }
  return k * s * h / 3;
}
function tukeyP(q, k, df){
  if (k < 2 || df <= 0) return 1;
  /* χ²_df 集中在 df 附近，Simpson 外层积分 */
  const hi = df + 12 * Math.sqrt(2 * df), n = 160, h = hi / n;
  const f = v => { const r = q * Math.sqrt(Math.max(v, 1e-9) / df); return rangeCdf(r, k) * Math.exp(-v/2) * Math.pow(v, df/2 - 1) || 0; };
  let s = f(1e-9) + f(hi);
  for (let i = 1; i < n; i++) s += f(i*h) * (i % 2 ? 4 : 2);
  const p = 1 - s * h / 3 / (Math.pow(2, df/2) * Math.exp(lgamma(df/2)));
  return Math.min(1, Math.max(0, p));
}
/* 单因素方差分析：返回 {mse, dfw} */
function anova(groups){ /* groups: [{values:[...] }] */
  const all = groups.flatMap(g => g.values), N = all.length;
  const gm = all.reduce((a,b)=>a+b,0) / N;
  let ssb = 0, ssw = 0;
  groups.forEach(g => { const m = g.mean, dsw = g.values.reduce((a,v)=>a+(v-m)*(v-m),0);
    ssb += g.n * (m-gm)*(m-gm); ssw += dsw; });
  const dfb = groups.length - 1, dfw = N - groups.length;
  return {mse: dfw > 0 ? ssw/dfw : 0, dfw, ssb, ssw, dfb};
}
/* 显著性字母（贪心，均值降序）：sig(g,h)=true 表示显著差异 */
function sigLetters(keys, sig){
  const order = keys.slice().sort((a,b) => b.mean - a.mean).map(g => g.key);
  const sets = [], res = {}; let ch = 0;
  const nextCh = () => String.fromCharCode(97 + ch++);
  for (const g of order){
    const mine = new Set();
    for (const s of sets) if ([...s.members].every(m => !sig[g][m])) { mine.add(s); }
    let conflict = false;
    for (const h of order){
      if (h === g || !res[h] || !sig[g][h]) continue;
      const hs = sets.filter(s => s.members.has(h));
      if (hs.length && hs.every(s => mine.has(s))) conflict = true;
    }
    if (conflict || !mine.size){ const ns = {ch: nextCh(), members: new Set()}; sets.push(ns); mine.add(ns); }
    for (const s of mine) s.members.add(g);
    res[g] = [...mine].map(s => s.ch).sort().join('');
  }
  return res;
}
/* 星号（vs 对照=每组第一个组）：p<0.05 *, <0.01 **, <0.001 *** */
const astOf = p => p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';

const BAR_PALS = {
  '经典': ['#a8d3e8','#3f9fd4','#efa9c4','#f5d47f','#96ce7f','#b39ddb','#ffab91','#90a4ae'],
  '自然': ['#f0c75e','#8fbf6f','#7aa6c2','#c78fc9','#e8965a','#6fb3a8','#d98f8f','#b5a264'],
  '海洋': ['#2f6db3','#6fb3d9','#3fa9a0','#8fd0c4','#1c4e80','#5a8fd0','#7fcdbb','#a8d8ea'],
  '莓果': ['#c04a6b','#e08ba0','#a23b72','#f2c4cc','#8c2f4b','#e8748f','#d9537a','#f5a3b5'],
  '灰阶': ['#4d4d4d','#8c8c8c','#b3b3b3','#666666','#a6a6a6','#737373','#999999','#d0d0d0']
};

/* Welch t 检验双侧 p（两组原始重复或均值/SD/n） */
function welchP(A, B){
  const v1 = A.sd * A.sd / A.n, v2 = B.sd * B.sd / B.n, se = Math.sqrt(v1 + v2);
  if (!(se > 0)) return 1;
  const t = Math.abs(A.mean - B.mean) / se;
  const df = (v1 + v2) * (v1 + v2) / (v1 * v1 / (A.n - 1) + v2 * v2 / (B.n - 1));
  return tTwoSidedP(t, df);
}
/* 解析 P 值比较对：优先按序号（如 1+3 表示第 1 组与第 3 组），也可直接写组名用 + 连接（组名本身含 + 时请用序号）；
   多个对比之间用逗号 / 分号 / 换行分隔；留空 = 首组 vs 末组 */
function parsePairs(str, groups){
  const out = [];
  String(str || '').split(/[;；\n]/).map(x => x.trim()).filter(Boolean).forEach(line => {
    line.split(/[,，]/).map(t => t.trim()).filter(Boolean).forEach(tok => {
      const m = tok.match(/^(\d+)\s*[+\-]\s*(\d+)$/);
      if (m){
        const A = groups[+m[1] - 1], B = groups[+m[2] - 1];
        if (A && B) out.push([A, B]);
        return;
      }
      const parts = tok.split(/\+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2 && parts.length % 2 === 0)
        for (let i = 0; i + 1 < parts.length; i += 2) out.push([parts[i], parts[i+1]]);
    });
  });
  return out.length ? out : (groups.length >= 2 ? [[groups[0], groups[groups.length - 1]]] : []);
}
/* 统计计算（barSVG 与 CSV 导出共用），返回 {gs, facets, groups, pvRows, manual?, preErr?} 或错误字符串 */
function barCompute(rows, o){
  const num = v => Number.isFinite(parseFloat(String(v).replace(/[,%]/g,''))) && String(v).trim() !== '';
  const data = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (!data.length) return '数据为空';
  const drows = data.slice();
  /* 模式识别：①汇总模式(组别,均值,标准差[,显著性])——≥3列且第2列数值；②长表(分面,组别,均值,SE[,显著性])——≥4列且第3、4列数值；③原始重复(分面,组别,数值)。
     表头容忍：最多允许 1 行数字列不齐（首行表头自动剔除），其余行必须全部合格 */
  /* 自定义配色：数据最后一列写颜色（#hex / rgb() / 颜色名），同一组别所有行写同一个颜色；留空则用预设配色。散点也用这个颜色 */
  const isColor = v => { const t = String(v == null ? '' : v).trim();
    return !!t && (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/.test(t) || /^rgba?\(/i.test(t) || /^hsla?\(/i.test(t) || /^[a-zA-Z]{3,20}$/.test(t)); };
  const maxLen = drows.reduce((m, r) => Math.max(m, r.length), 0);
  let colorCol = -1;
  for (let i = drows.length > 1 ? 1 : 0; i < drows.length; i++) if (isColor(drows[i][maxLen - 1])) { colorCol = maxLen - 1; break; } /* 跳过首行表头 */
  const colVal = r => { const v = String(r[colorCol] == null ? '' : r[colorCol]).trim(); return isColor(v) ? v : ''; };
  /* 显著性标记 = 最后一个既不是数字也不是颜色的非空单元格（自动跳过颜色列与表头） */
  const sigOf = r => { for (let i = r.length - 1; i >= 0; i--){ const t = String(r[i] == null ? '' : r[i]).trim(); if (!t || num(t) || isColor(t)) continue; return t; } return ''; };
  const colorMap = g2 => { const m = {}; g2.forEach(x => { if (x.color && !m[x.key]) m[x.key] = x.color; }); return m; };
  const sumRows = drows.filter(r => r.length >= 3 && num(r[1]) && (r.length === 3 ? num(r[2]) : (num(r[2]) || isColor(r[2]))));
  const preRows = drows.filter(r => r.length >= 4 && num(r[2]) && num(r[3]));
  const pre = preRows.length >= 1 && drows.length - preRows.length <= 1;
  if (pre){
    const gs = preRows.map(r => ({facet: String(r[0]).trim(), key: String(r[1]).trim(), mean: parseFloat(r[2]), sd: parseFloat(r[3]), sig: sigOf(r), n: 0, color: colVal(r)}));
    return {gs, preErr: true, colors: colorMap(gs), facets: [...new Set(gs.map(x => x.facet))], groups: [...new Set(gs.map(x => x.key))], pvRows: []};
  }
  if (sumRows.length >= 1 && drows.length - sumRows.length <= 1){
    /* 汇总模式：单分面，手动显著性 */
    const gs = sumRows.map(r => ({facet: '', key: String(r[0]).trim(), mean: parseFloat(r[1]), sd: parseFloat(r[2]) || 0, sig: sigOf(r), color: colVal(r)}));
    return {gs, manual: true, colors: colorMap(gs), facets: [''], groups: [...new Set(gs.map(x => x.key))], pvRows: []};
  }
  /* 原始重复 */
  const byFacet = {}, colors = {};
  drows.forEach(r => {
    /* 无分面（组别, 数值[, 颜色]）：≤2 列，或恰好 3 列且第 3 列是颜色名 */
    const noFacet = r.length <= 2 || (r.length === 3 && colorCol === 2);
    const f = noFacet ? '' : String(r[0]).trim();
    const g = String(r[noFacet ? 0 : 1]).trim(), v = parseFloat(r[noFacet ? 1 : 2]);
    if (!g || !Number.isFinite(v)) return;
    const cv = colVal(r);
    if (cv && !colors[g]) colors[g] = cv;
    (byFacet[f] = byFacet[f] || {}); const cell = byFacet[f][g] = byFacet[f][g] || [];
    cell.push(v);
  });
  const gs = [];
  Object.keys(byFacet).forEach(f => Object.keys(byFacet[f]).forEach(g => {
    const vals = byFacet[f][g], n = vals.length, mean = vals.reduce((a,b)=>a+b,0)/n;
    const sd = n > 1 ? Math.sqrt(vals.reduce((a,v)=>a+(v-mean)*(v-mean),0)/(n-1)) : 0;
    gs.push({facet: f, key: g, mean, sd, n, values: vals, color: colors[g] || ''});
  }));
  if (!gs.length) return '数据需要：分面(可选) 组别 数值（每行一个重复），或 组别 均值 标准差';
  /* 统计：每个分面内做方差分析 + 多重比较 */
  const method = o.method || 'Tukey HSD';
  const facets = [...new Set(gs.map(x => x.facet))];
  const groups = [...new Set(gs.map(x => x.key))];
  facets.forEach(f => {
    const cells = gs.filter(x => x.facet === f);
    const valid = cells.filter(x => x.n >= 2);
    if (method === '无' || valid.length < 2) return;
    const a = anova(valid);
    if (a.dfw <= 0 || a.mse <= 0) return;
    const sig = {}; valid.forEach(x => sig[x.key] = {});
    for (let i = 0; i < valid.length; i++) for (let j = i+1; j < valid.length; j++){
      const A = valid[i], B = valid[j];
      const se = Math.sqrt(a.mse/2 * (1/A.n + 1/B.n));
      let p;
      if (method === 'Tukey HSD') p = tukeyP(Math.abs(A.mean - B.mean)/se, valid.length, a.dfw);
      else { const t = Math.abs(A.mean - B.mean)/(se * Math.sqrt(2)); p = tTwoSidedP(t, a.dfw) * (valid.length*(valid.length-1)/2); }
      p = Math.min(1, p);
      sig[A.key][B.key] = sig[B.key][A.key] = p < 0.05;
      A['_p_' + B.key] = p; B['_p_' + A.key] = p;
    }
    if ((o.mark || '字母').startsWith('字母')){
      const letters = sigLetters(valid, sig);
      cells.forEach(x => x.sig = letters[x.key] || '');
    } else {
      const ctrl = cells[0];
      cells.forEach(x => { if (x === ctrl) { x.sig = ''; return; }
        const p = x['_p_' + ctrl.key];
        x.sig = p == null ? '' : astOf(p); });
    }
  });
  /* P 值括号标注：指定比较对做 Welch t 检验 */
  const pvRows = [];
  if (o.pv){
    parsePairs(o.pairs, groups).forEach(pr => {
      facets.forEach(f => {
        const A = gs.find(x => x.facet === f && x.key === pr[0]), B = gs.find(x => x.facet === f && x.key === pr[1]);
        if (!A || !B || !A.values || A.n < 2 || B.n < 2) return;
        pvRows.push({facet: f, a: A.key, b: B.key, p: welchP(A, B)});
      });
    });
  }
  return {gs, facets, groups, pvRows, colors: colorMap(gs)};
}

function barSVG(rows, o, W, H){
  const c = barCompute(rows, o);
  if (typeof c === 'string') return c;
  barSVG.last = c;
  if (c.manual) return barRender(c.gs, o, W, H, true, false, c.pvRows, c.colors);
  if (c.preErr) return barRender(c.gs, o, W, H, false, true, c.pvRows, c.colors);
  return barRender(c.gs, o, W, H, false, false, c.pvRows, c.colors);
}

/* 计算结果表格（CSV）：组统计 + 多重比较 + P 值标注，供 Origin/SPSS/R 等平台复现用图 */
const csvQ = v => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v; };
function barStatsCSV(rows, o){
  const c = barCompute(rows, o);
  if (typeof c === 'string' || !c.gs || !c.gs.length) return '';
  const hasC = c.gs.some(x => x.color);
  const L = ['组统计', '分面,组别,n,均值,标准差SD,标准误SE,显著性标记' + (hasC ? ',配色' : '')];
  c.gs.forEach(x => {
    const se = x.n ? x.sd / Math.sqrt(x.n) : '';
    L.push([x.facet, x.key, x.n || '', x.mean.toFixed(6), (x.sd || 0).toFixed(6), se === '' ? '' : se.toFixed(6), x.sig || ''].map(csvQ).join(',') + (hasC ? ',' + csvQ(x.color || '') : ''));
  });
  const pw = [];
  c.gs.forEach(x => Object.keys(x).filter(k => k.indexOf('_p_') === 0)
    .forEach(k => pw.push({f: x.facet, a: x.key, b: k.slice(3), p: x[k]})));
  if (pw.length){
    L.push('', '组间多重比较(' + (o.method || 'Tukey HSD') + ')', '分面,组1,组2,P值');
    pw.forEach(r => L.push([r.f, r.a, r.b, (+r.p).toFixed(6)].map(csvQ).join(',')));
  }
  if (c.pvRows && c.pvRows.length){
    L.push('', 'P值标注比较(Welch t检验)', '分面,组1,组2,P值');
    c.pvRows.forEach(r => L.push([r.facet, r.a, r.b, r.p < 0.0001 ? '<0.0001' : r.p.toFixed(6)].map(csvQ).join(',')));
  }
  return L.join('\r\n');
}

function barRender(gs, o, W, H, manual, preErr, pvRows, colors){
  pvRows = pvRows || [];
  colors = colors || {}; /* 数据最后一列的自定义配色：{组名: 颜色}，柱/散点/图例统一使用 */
  const F = [...new Set(gs.map(x => x.facet))];
  const facets = F.length ? F : [''];
  const groups = [...new Set(gs.map(x => x.key))]; /* 全局组顺序 = 首次出现顺序（图例与配色按组名固定） */
  const pal = BAR_PALS[o.bpal] || BAR_PALS['经典'];
  const colOf = g => colors[g] || pal[groups.indexOf(g) % pal.length];
  /* 颜色加深：hex → 各通道乘系数（散点用深色版组色，参考 Nature 风格图） */
  const darken = (hex, k) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = Math.round(((n >> 16) & 255) * k), g2 = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
    return '#' + [r, g2, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  };
  /* 误差线取值 */
  const tcrit = df => df > 0 ? tQuantile(0.05, df) : 1.96;
  const errOf = x => {
    if (preErr) return x.sd; /* 预计算模式第 4 列直接当误差值 */
    if (!x.values) return x.sd || 0;
    const se = x.sd / Math.sqrt(x.n);
    if (o.err === 'SD') return x.sd;
    if (o.err === '95%CI') return (x.n > 1 ? tcrit(x.n - 1) * se : 0);
    if (o.err === '无') return 0;
    return se;
  };
  const ml = 74, mr = 16, mt = 30, mb = 96;
  const x0 = ml, y0 = mt, w = Math.max(120, W - ml - mr), h = Math.max(80, H - mt - mb);
  const valMax = x => (o.dots && x.values && x.values.length ? Math.max(...x.values) : 0);
  const ymaxRaw = Math.max(...gs.map(x => Math.max(x.mean + errOf(x), valMax(x))), 1e-9);
  /* y 轴自适应：目标上限 = 数据最大值 × 头部余量，再向上取整到「nice 刻度」。
     不能直接用最后一个刻度当上限——步长选择可能让最后刻度低于数据（散点关掉时柱子冲出边框） */
  const padF = o.pv ? 1.28 : 1.12;
  const target = ymaxRaw * padF;
  const tks = ticks(0, target * (1 + 1e-9), 5);
  let ymax = tks.slice(-1)[0] || target;
  if (ymax < target - 1e-9) {
    const stp = tks.length > 1 ? +(tks[1] - tks[0]).toFixed(10) : target / 5;
    ymax = Math.ceil(target / stp - 1e-9) * stp;
  }
  const Y = v => y0 + h - v / ymax * h;
  const font = o.font || 'Arial';
  const s = [svgHead(W, H, font)];
  if (o.title) s.push(T(x0 + w/2, 18, o.title, 13.5, 'middle', '#1c2b28'));
  /* Origin 风格边框 + Y 轴刻度 */
  s.push('<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + h + '" fill="none" stroke="#333" stroke-width="1.2"/>');
  ticks(0, ymax, 5).forEach(v => {
    const yy = Y(v);
    if (yy < y0 - .5) return;
    s.push('<line x1="' + x0 + '" y1="' + yy.toFixed(1) + '" x2="' + (x0-5) + '" y2="' + yy.toFixed(1) + '" stroke="#333"/>');
    s.push(T(x0 - 8, yy + 4, +v.toFixed(3), 11.5, 'end', '#333'));
    if (v > 0) s.push('<line x1="' + x0 + '" y1="' + yy.toFixed(1) + '" x2="' + (x0+w) + '" y2="' + yy.toFixed(1) + '" stroke="#e6e6e6" stroke-width="0.6"/>');
  });
  /* 柱 + 误差线 + 显著性 */
  const innerW = w / facets.length, slot = innerW / groups.length, bw = slot * .62;
  facets.forEach((f, fi) => {
    const fx = x0 + innerW * fi;
    groups.forEach((g, gi) => {
      const cell = gs.find(x => x.facet === f && x.key === g);
      if (!cell) return;
      const cx = fx + slot * (gi + .5), e = errOf(cell), bh = Math.max(0, (y0 + h) - Y(cell.mean));
      const yt = Y(cell.mean + e);
      const bop = o.dots ? ' fill-opacity="0.42"' : ''; /* 散点模式下柱子变浅，参考 Nature 风格 */
      /* 无边框柱子（用户偏好）：rect 不加 stroke */
      s.push('<rect x="' + (cx-bw/2).toFixed(1) + '" y="' + Y(cell.mean).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" fill="' + colOf(g) + '"' + bop + '/>');
      /* 散点叠加（原始重复模式）：确定性抖动，重绘位置稳定。用自定义配色原色；未自定义时才自动加深，保证清晰可辨 */
      if (o.dots && cell.values) cell.values.forEach((v, k) => {
        const rnd = Math.abs(Math.sin((k + 1) * 12.9898 + (gi + 1) * 78.233 + (fi + 1) * 37.719)) % 1;
        const jx = (rnd - 0.5) * bw * 0.6;
        const dc = colors[g] ? colOf(g) : darken(colOf(g), .74);
        s.push('<circle cx="' + (cx + jx).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="4.2" fill="' + dc + '" stroke="#fff" stroke-width="1"/>');
      });
      if (e > 0){
        const yb = Y(Math.max(0, cell.mean - e));
        s.push('<line x1="' + cx.toFixed(1) + '" y1="' + yt.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + yb.toFixed(1) + '" stroke="#1c2b28" stroke-width="1.3"/>');
        [yt, yb].forEach(yy => s.push('<line x1="' + (cx-4.5).toFixed(1) + '" y1="' + yy.toFixed(1) + '" x2="' + (cx+4.5).toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="#1c2b28" stroke-width="1.3"/>'));
      }
      if (cell.sig) s.push(T(cx, yt - 7, cell.sig, 13, 'middle', '#1c2b28'));
      /* 组名：斜排 */
      const lx = cx, ly = y0 + h + 14;
      s.push('<text x="' + lx.toFixed(1) + '" y="' + ly + '" font-size="12" text-anchor="end" fill="#1c2b28" transform="rotate(-35 ' + lx.toFixed(1) + ' ' + ly + ')">' + esc(g) + '</text>');
    });
    /* 分面分隔虚线 + 分面标签 */
    if (fi > 0) s.push('<line x1="' + fx.toFixed(1) + '" y1="' + y0 + '" x2="' + fx.toFixed(1) + '" y2="' + (y0+h) + '" stroke="#d24a43" stroke-width="1.6" stroke-dasharray="7 5"/>');
    if (f){
      const cx = fx + innerW/2;
      s.push('<line x1="' + (fx + innerW*.22).toFixed(1) + '" y1="' + (y0+h+44) + '" x2="' + (fx + innerW*.78).toFixed(1) + '" y2="' + (y0+h+44) + '" stroke="#333" stroke-width="1"/>');
      s.push(T(cx, y0 + h + 62, f, 13.5, 'middle', '#1c2b28', ' font-weight="600"'));
    }
  });
  /* P 值括号标注（Welch t 检验，参考 ggpubr stat_pvalue_manual 样式） */
  pvRows.forEach((pr, idx) => {
    const fi = facets.indexOf(pr.facet);
    if (fi < 0) return;
    const A = gs.find(x => x.facet === pr.facet && x.key === pr.a), B = gs.find(x => x.facet === pr.facet && x.key === pr.b);
    if (!A || !B) return;
    const ax = x0 + innerW * fi + slot * (groups.indexOf(pr.a) + .5);
    const bx = x0 + innerW * fi + slot * (groups.indexOf(pr.b) + .5);
    const topA = Y(A.mean + errOf(A)), topB = Y(B.mean + errOf(B));
    const level = pvRows.filter((r, i) => i < idx && r.facet === pr.facet).length;
    const hasSig = !!(A.sig || B.sig);
    const yB = Math.max(y0 + 14, Math.min(topA, topB) - (hasSig ? 30 : 16) - level * 20);
    const lbl = 'P = ' + (pr.p < 0.001 ? '< 0.001' : pr.p.toFixed(4));
    s.push('<path d="M ' + ax.toFixed(1) + ' ' + (yB + 6).toFixed(1) + ' L ' + ax.toFixed(1) + ' ' + yB.toFixed(1) + ' L ' + bx.toFixed(1) + ' ' + yB.toFixed(1) + ' L ' + bx.toFixed(1) + ' ' + (yB + 6).toFixed(1) + '" fill="none" stroke="#1c2b28" stroke-width="1.2"/>');
    s.push(T((ax + bx) / 2, yB - 6, lbl, 12.5, 'middle', '#1c2b28', ' font-weight="700"'));
  });
  /* Y 轴标题 */
  if (o.ylab) s.push('<text x="16" y="' + (y0 + h/2) + '" font-size="13" text-anchor="middle" fill="#1c2b28" transform="rotate(-90 16 ' + (y0 + h/2).toFixed(1) + ')">' + esc(o.ylab) + '</text>');
  /* 图例（右上，组名固定配色） */
  const lw = Math.max(...groups.map(g => g.length)) * 7 + 44, lh = groups.length * 18 + 10;
  const lgx = x0 + w - lw - 8, lgy = y0 + 8;
  s.push('<rect x="' + lgx + '" y="' + lgy + '" width="' + lw + '" height="' + lh + '" fill="#fff" fill-opacity="0.85" stroke="#bbb" stroke-width="0.6"/>');
  groups.forEach((g, i) => {
    const yy = lgy + 8 + i * 18;
    s.push('<rect x="' + (lgx+8) + '" y="' + yy + '" width="14" height="14" fill="' + colOf(g) + '" stroke="#5a6b80" stroke-width="0.5"/>');
    s.push(T(lgx + 28, yy + 11.5, g, 12, 'start', '#1c2b28'));
  });
  s.push('</svg>');
  return s.join('');
}
function panelSVG(m, key, title, sub, extraToolbar, exs){
  /* 柱状图说明很长：不放在标题下，挪到图片下方（右侧栏底部）折叠展示 */
  const under = key === 'bar' ? '' : '<p class="muted">' + sub + '</p>';
  const help = key === 'bar' ? '<details class="plot-help" style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;color:#5a6b80">📖 使用说明（点击展开）</summary><p class="muted" style="margin:8px 0 0">' + sub + '</p></details>' : '';
  m.innerHTML = '<div class="plot-lab"><div class="map-panel">' +
    '<div class="section-head"><h2>' + title + '</h2></div>' + under +
    (exs ? '<label class="field"><span>示例数据（切换后自动重新生成，可直接在下方改）</span><select data-act="exsel">' + exs.map((e, i) => '<option value="' + i + '">' + esc(e.n) + '</option>').join('') + '</select></label>' : '') +
    (key === 'bar' ? '<p class="muted" style="margin:-4px 0 8px">🎨 自定义配色：数据<b>最后一列</b>写颜色（如 <code>#4c72b0</code> 或 <code>royalblue</code>），同一组别写同一个颜色，柱子 / 散点 / 图例都会用它；留空则用预设配色。</p>' : '') +
    '<label class="field"><span>数据（每行一条，Tab / 逗号 / 分号分隔）</span>' +
    '<textarea class="data" data-act="data">' + esc(EXAMPLES[key]) + '</textarea></label>' +
    '<div class="opt-row" data-act="opts"></div>' +
    '<div class="toolbar"><button class="primary" data-act="draw">生成图形</button><button data-act="png">导出 PNG</button><button data-act="svg">导出 SVG</button><button data-act="pdf">导出 PDF（矢量）</button>' + (extraToolbar || '') + '</div>' +
    '</div><div><div class="plot-svg" data-act="out"></div>' +
    '<p class="muted" data-act="msg" style="margin-top:8px">修改数据后点「生成图形」。</p>' + help + '</div></div>';
  return {data: m.querySelector('[data-act="data"]'), out: m.querySelector('[data-act="out"]'),
    opts: m.querySelector('[data-act="opts"]'), msg: m.querySelector('[data-act="msg"]'),
    exsel: m.querySelector('[data-act="exsel"]')};
}
function exportPNGFromSVG(out, name){
  const el = out.querySelector('svg');
  if (!el) { alert('请先生成图形'); return; }
  const s = new XMLSerializer().serializeToString(el);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = +el.getAttribute('width'); c.height = +el.getAttribute('height');
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    c.toBlob(b => {
      const url = URL.createObjectURL(b); const a = document.createElement('a');
      a.href = url; a.download = name + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    });
  };
  img.onerror = () => alert('PNG 导出失败，可改用「导出 SVG」或「导出 PDF」。');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
function exportPDFSVG(out, name){
  const el = out.querySelector('svg');
  if (!el) { alert('请先生成图形'); return; }
  const win = window.open('', '_blank');
  if (!win) { alert('弹出窗口被浏览器拦截，请允许本页面的弹出窗口后重试。'); return; }
  const doc = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(name) + '</title><style>' +
    '@page{size:A4 landscape;margin:10mm}' +
    'body{font:12px/1.6 Arial,"Microsoft YaHei",sans-serif;color:#111;margin:0}' +
    '.no-print{background:#eef7f5;border:1px solid #bcd9d2;border-radius:8px;padding:8px 12px;margin:8px;font-size:12.5px;display:flex;gap:10px;align-items:center}' +
    '.no-print button{font:14px/1.4 sans-serif;padding:6px 16px;border:1px solid #167c69;background:#167c69;color:#fff;border-radius:6px;cursor:pointer}' +
    '@media print{.no-print{display:none}}' +
    'svg{width:100%;height:auto;display:block;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '</style></head><body>' +
    '<div class="no-print"><span>💡 在打印对话框中选择「另存为 PDF」，图形以矢量保存、文字保持文本可编辑（Illustrator / Inkscape / Acrobat 可继续编辑）。</span><button onclick="window.print()">打印 / 另存为 PDF</button></div>' +
    new XMLSerializer().serializeToString(el) + '</body></html>';
  win.document.open(); win.document.write(doc); win.document.close();
  const go = () => setTimeout(() => { try { win.print(); } catch(e){} }, 350);
  if (win.document.readyState === 'complete') go(); else win.addEventListener('load', go);
}

/* ---- 通用绘图选项 ---- */
const sizeOpts = (w, h) =>
  '<label>宽<input type="number" data-opt="w" value="' + w + '" step="20" min="420" max="2400"></label>' +
  '<label>高<input type="number" data-opt="h" value="' + h + '" step="20" min="280" max="1600"></label>';
const fontOpt = '<label>字体<select data-opt="font">' + ['Arial', 'Helvetica', 'Times New Roman', 'Segoe UI', 'Microsoft YaHei'].map(f => '<option>' + f + '</option>').join('') + '</select></label>';
const schemeOpt = opt('scheme', '配色', ['经典', '蓝绿', '黑白']);
/* 柱状图示例集：下拉切换，覆盖三种数据格式（分面示例还原 mRNA 分组柱状图） */
const BAR_EXS = [
  { n: '示例① 原始重复（4 组 × 10 重复，自动统计）', t: EXAMPLES.bar },
  { n: '示例② 原始重复 · 分面（基因 × 组别，组内 ANOVA）', t: [
    '基因\t组别\t表达量',
    'FAS\tND\t0.9', 'FAS\tND\t1.1', 'FAS\tND\t1.3', 'FAS\tND\t1.7',
    'FAS\tAXOS\t2.0', 'FAS\tAXOS\t2.2', 'FAS\tAXOS\t2.3', 'FAS\tAXOS\t2.78',
    'FAS\tHFD\t0.65', 'FAS\tHFD\t0.8', 'FAS\tHFD\t0.85', 'FAS\tHFD\t1.1',
    'SREBP-1c\tND\t1.75', 'SREBP-1c\tND\t1.9', 'SREBP-1c\tND\t2.0', 'SREBP-1c\tND\t2.19',
    'SREBP-1c\tAXOS\t1.05', 'SREBP-1c\tAXOS\t1.2', 'SREBP-1c\tAXOS\t1.3', 'SREBP-1c\tAXOS\t1.49',
    'SREBP-1c\tHFD\t0.95', 'SREBP-1c\tHFD\t1.0', 'SREBP-1c\tHFD\t1.1', 'SREBP-1c\tHFD\t1.27',
    'CPT-1a\tND\t2.75', 'CPT-1a\tND\t2.9', 'CPT-1a\tND\t3.05', 'CPT-1a\tND\t3.22',
    'CPT-1a\tAXOS\t1.6', 'CPT-1a\tAXOS\t1.8', 'CPT-1a\tAXOS\t1.9', 'CPT-1a\tAXOS\t2.1',
    'CPT-1a\tHFD\t0.78', 'CPT-1a\tHFD\t0.9', 'CPT-1a\tHFD\t1.0', 'CPT-1a\tHFD\t1.16',
    'PPAR-a\tND\t2.0', 'PPAR-a\tND\t2.3', 'PPAR-a\tND\t2.4', 'PPAR-a\tND\t2.66',
    'PPAR-a\tAXOS\t2.35', 'PPAR-a\tAXOS\t2.55', 'PPAR-a\tAXOS\t2.7', 'PPAR-a\tAXOS\t2.92',
    'PPAR-a\tHFD\t1.65', 'PPAR-a\tHFD\t1.9', 'PPAR-a\tHFD\t2.0', 'PPAR-a\tHFD\t2.29'
  ].join('\n') },
  { n: '示例③ Origin 汇总（分面, 组别, 均值, 标准误）', t: [
    'Inflammatory factor\tGroup\tRelative mRNA expression\tSE',
    'FAS\tND\t1.25\t0.4', 'FAS\tAXOS\t2.32\t0.3', 'FAS\tHFD\t0.85\t0.2',
    'SREBP-1c\tND\t1.96\t0.15', 'SREBP-1c\tAXOS\t1.26\t0.18', 'SREBP-1c\tHFD\t1.08\t0.22',
    'CPT-1a\tND\t2.98\t0.14', 'CPT-1a\tAXOS\t1.85\t0.21', 'CPT-1a\tHFD\t0.96\t0.2',
    'PPAR-a\tND\t2.34\t0.26', 'PPAR-a\tAXOS\t2.63\t0.16', 'PPAR-a\tHFD\t1.96\t0.32'
  ].join('\n') },
  { n: '示例④ 自定义配色（最后一列写颜色，柱与散点同色）', t: [
    '组别\t相对表达量\t颜色',
    'CK\t1.02\t#4c72b0', 'CK\t1.15\t#4c72b0', 'CK\t1.31\t#4c72b0', 'CK\t1.08\t#4c72b0', 'CK\t1.22\t#4c72b0', 'CK\t1.40\t#4c72b0',
    'Tre-A\t2.10\t#dd8452', 'Tre-A\t2.28\t#dd8452', 'Tre-A\t2.45\t#dd8452', 'Tre-A\t2.02\t#dd8452', 'Tre-A\t2.36\t#dd8452', 'Tre-A\t2.55\t#dd8452',
    'Tre-B\t3.20\t#55a868', 'Tre-B\t3.05\t#55a868', 'Tre-B\t3.40\t#55a868', 'Tre-B\t3.28\t#55a868', 'Tre-B\t3.12\t#55a868', 'Tre-B\t3.55\t#55a868',
    'Tre-C\t4.10\t#c44e52', 'Tre-C\t3.95\t#c44e52', 'Tre-C\t4.35\t#c44e52', 'Tre-C\t4.20\t#c44e52', 'Tre-C\t4.48\t#c44e52', 'Tre-C\t4.02\t#c44e52'
  ].join('\n') }
];
const ppalOpt = opt('ppal', 'Motif 配色', Object.keys(PPALS));
const labOpt = '<label><input type="checkbox" data-opt="labels" checked>显示标签</label>';
const hlOpt = '<label>高亮块<input type="text" data-opt="hl" placeholder="块名(多个逗号分隔)" style="width:120px"></label>';

/* ---- 页面 ---- */
const SUBS = [
  ['gene', '基因结构', '单基因或多个转录本的结构图：外显子(CDS)/UTR/内含子/site/缺失区段，并叠加多种注释。列：基因(或转录本)、类型(exon/CDS/UTR/intron/site/deletion)、名称(可选)、起点、终点。「高亮块」按块名称匹配（多个逗号分隔），可单独高亮某个外显子/UTR/site（如 E3）。', [schemeOpt, sizeOpts(1100, 440), fontOpt, labOpt, hlOpt], null, geneSVG],
  ['prot', '蛋白结构', '蛋白 domain 与 motif 排布图，支持同时展示多条蛋白。列：蛋白、类型(domain/motif/site)、名称、起点、终点、颜色(可选)。选「Motif 配色」可整体换色（domain/motif 均为实心色块，深色块上文字自动用白色），「跟随数据颜色列」则用数据第 6 列。「高亮块」按 motif/domain/site 名称匹配，可单独高亮某个特征（如 EAR）。', [schemeOpt, ppalOpt, sizeOpts(1100, 400), fontOpt, labOpt, hlOpt], null, protSVG],
  ['chr', '基因排布', '染色体/基因组区段上基因数量与相对位置，方块长度与基因长度等比，可高亮靶基因。列：基因、起点、终点、标签(可选)、高亮(可选,填1)。', [schemeOpt, sizeOpts(1200, 540), fontOpt, labOpt, '<label>标题<input type="text" data-opt="title" value="Gene organization on chromosome 9" style="width:190px"></label>', hlOpt], null, chrSVG],
  ['heat', '表达热图', '表达量矩阵热图：首行为样本名、首列为基因名；可选第二行写分组信息（首格填「分组」或 group，其余格填该样本所属组名，留空则不画注释条），组色按顺序自动取色。默认按行做 Z-score 标准化（可关），右侧给出分组图例与色标图例，两个图例的标题均可自定义（如 Group / Z-score、处理时间 / log2FC）；「组间距」控制相邻分组之间的留白（注释条与矩阵同步留白）。', [opt('pal', '配色', Object.keys(HEAT_PALS)), opt('gpal', '分组配色', Object.keys(GROUP_PALS)), sizeOpts(1000, 560), fontOpt, '<label>分组图例名<input type="text" data-opt="glab" value="Group" style="width:92px"></label>', '<label>色标名<input type="text" data-opt="zlab" value="Z-score" style="width:92px"></label>', '<label title="相邻分组之间的留白宽度">组间距<input type="number" data-opt="gspace" value="4" step="1" min="0" max="60" style="width:56px"></label>', '<span data-act="gcolbox" class="gcol-box"></span>', '<label><input type="checkbox" data-opt="z" checked>按行 Z-score</label>', '<label><input type="checkbox" data-opt="cellval">显示数值</label>'], null, heatSVG, heatGroupColorUI],
  ['enrich', '富集气泡图', 'GO/KEGG 富集气泡图。列：通路、数目、富集倍数(%)、P值。', [], drawEnrich],
  ['bar', '柱状图与显著性', '分组柱状图 + 自动统计，三种数据格式任选（见「示例数据」下拉，切换即出图）：①原始重复（分面, 组别, 数值，每行一个重复）——自动计算均值与标准误差线，并在每个分面内做单因素方差分析 + 多重比较（Tukey HSD 或 t 检验+Bonferroni），按 p<0.05 自动标注 a/b/c 字母或 */** 星号（星号 = 各组与对照组比，对照组为组别首次出现者）；②Origin 风格汇总（分面, 组别, 均值, 标准误差[, 显著性]）；③简单汇总（组别, 均值, 标准差, 显著性）。第一列写分面（如基因名）即自动分组：组别配色全局固定并生成图例，分面之间红色虚线分隔、下方标分面名；不写分面（两列）则为单组图。数据最后一列可写颜色（#hex / rgb() / 颜色名，如 `#4c72b0`、`royalblue`），同一组别写同一个颜色即自定义配色：柱子、散点与图例全部使用该颜色（指定颜色后散点不再自动加深）；留空则用预设配色。勾选「叠加散点」可把每个原始重复以抖动散点画在柱上；勾选「标注 P 值」并填写比较对（最稳的是写序号对，如 `1+3, 3+4` 表示第 1 组与第 3 组、第 3 组与第 4 组；也可直接写组名用 + 连接）即可在图上画显著性括号并直接标 p 值。点「输出计算结果表格」可导出 CSV（组统计 + 多重比较 P 值 + 标注比较 P 值），便于在 Origin / SPSS / R 等平台复现作图。', [opt('bpal', '配色', Object.keys(BAR_PALS)), opt('method', '显著性方法', ['Tukey HSD', 't检验+Bonferroni', '无']), opt('mark', '显著性标记', ['字母 a/b/c', '星号 *']), opt('err', '误差线', ['SE', 'SD', '95%CI', '无']), '<label>Y轴标题<input type="text" data-opt="ylab" value="Relative abundance" style="width:150px"></label>', '<label title="把每个原始重复以抖动散点画在柱上">叠加散点<input type="checkbox" data-opt="dots" checked></label>', '<label title="画显著性括号并标注 p 值">标注P值<input type="checkbox" data-opt="pv"></label>', '<label title="填序号对最稳妥（1+3 = 第1组与第3组），也可直接写组名用 + 连接；多个对比用逗号分隔，如 1+3, 1+4">P值比较对<input type="text" data-opt="pairs" value="1+3, 3+4" style="width:200px"></label>', sizeOpts(1200, 640), fontOpt], null, barSVG]
];
CIIB.pages.plot = {
  title: '科研绘图',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>科研绘图</h1><p>基因结构（单/多转录本 + 多种注释）、蛋白结构、基因排布、表达热图（列分组注释条 + 可命名图例，支持 Z-score）为 SVG 矢量图，可导出 PNG / SVG / 矢量 PDF；富集气泡图为 Canvas 图，导出 PNG。柱状图支持粘贴原始重复数据自动统计（ANOVA + Tukey/t 检验 → a/b/c 字母或星号）。粘贴数据即可出图，配色/尺寸/字体/标签均可即时调整。</p></div></div>' +
      '<div class="tabs" data-act="tabs">' + SUBS.map((s, i) => '<button class="chip' + (i === 0 ? ' active' : '') + '" data-tab="' + i + '">' + s[1] + '</button>').join('') + '</div>' +
      '<div data-act="pane"></div>';
    const pane = m.querySelector('[data-act="pane"]');
    m.querySelector('[data-act="tabs"]').onclick = e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      m.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      sub(+b.dataset.tab);
    };
    function sub(i){
      const [key, title, desc, optsHtml, fn, svgFn, post] = SUBS[i];
      if (svgFn) {
        const ui = panelSVG(pane, key, title, desc, key === 'bar' ? '<button data-act="table">输出计算结果表格</button>' : '', key === 'bar' ? BAR_EXS : null);
        ui.opts.innerHTML = optsHtml;
        const doDraw = () => {
          const o = getOpts(ui.opts);
          const W = Math.max(420, Math.min(2400, Math.round(+o.w) || 900));
          const H = Math.max(280, Math.min(1600, Math.round(+o.h) || 600));
          const rows = parseTSV(ui.data.value);
          try {
            const res = svgFn(rows, o, W, H);
            if (res.startsWith('<svg')) {
              ui.out.innerHTML = res;
              ui.msg.textContent = '已生成。可导出 PNG / SVG，或「导出 PDF」获得矢量可编辑版本。';
              if (post) { try { post(ui, o); } catch(e) {} }
            }
            else ui.msg.textContent = res;
          } catch(e) { ui.msg.textContent = '绘图出错：' + e.message; }
        };
        ui.opts.addEventListener('change', doDraw);
        ui.opts.addEventListener('input', doDraw);
        /* 示例下拉：切换后填入数据并重绘 */
        if (ui.exsel) ui.exsel.addEventListener('change', () => {
          ui.data.value = BAR_EXS[+ui.exsel.value].t;
          doDraw();
        });
        pane.querySelector('[data-act="draw"]').onclick = doDraw;
        pane.querySelector('[data-act="png"]').onclick = () => exportPNGFromSVG(ui.out, 'ciib-' + key);
        pane.querySelector('[data-act="svg"]').onclick = () => {
          const el = ui.out.querySelector('svg');
          if (el) CIIB.download(new XMLSerializer().serializeToString(el), 'ciib-' + key + '.svg', 'image/svg+xml');
        };
        pane.querySelector('[data-act="pdf"]').onclick = () => exportPDFSVG(ui.out, 'ciib-' + key);
        if (key === 'bar'){
          pane.querySelector('[data-act="table"]').onclick = () => {
            const csv = barStatsCSV(parseTSV(ui.data.value), getOpts(ui.opts));
            if (!csv) { alert('当前数据没有可统计的内容，请先生成图形。'); return; }
            CIIB.download('﻿' + csv, 'ciib-bar-stats-' + CIIB.today() + '.csv', 'text/csv;charset=utf-8');
          };
        }
        doDraw();
        return;
      }
      const ui = panel(pane, key, title, desc);
      ui.opts.innerHTML = optsHtml;
      const doDraw = () => {
        const rows = parseTSV(ui.data.value);
        try {
          const err = fn(ui.canvas.getContext('2d'), rows, ui.canvas.width, ui.canvas.height);
          ui.msg.textContent = err || '已生成。可点「导出 PNG」保存到本地。';
        } catch(e) { ui.msg.textContent = '绘图出错：' + e.message; }
      };
      pane.querySelector('[data-act="draw"]').onclick = doDraw;
      pane.querySelector('[data-act="png"]').onclick = () => exportPNG(ui.canvas, 'ciib-' + key);
      doDraw();
    }
    sub(0);
  }
};
})();
