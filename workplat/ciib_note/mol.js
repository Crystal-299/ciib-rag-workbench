/* ciib_note/mol.js — 分子实验：载体构建 / 片段扩增 / 引物设计（含 CRISPR、RNAI 预留模块） */
(function(){
'use strict';
const {esc, uid, db, save, formModal, PALETTE} = CIIB;
const iso = () => new Date().toISOString();

const BUILD_STATUS = ['未完成', '测序阶段', '已完成'];
const BUILD_FIELDS = [
  {key:'name', label:'构建名称 *', ph:'如 p1300-ProGeneA::GUS'},
  {key:'status', label:'状态', type:'select', options:BUILD_STATUS, def:'未完成'},
  {key:'backbone', label:'载体骨架', ph:'如 pCAMBIA1300 / pGreenII-0800-LUC'},
  {key:'resistance', label:'抗性', ph:'如 Hyg（植物）/ Kan（大肠）/ Rif（农杆菌）'},
  {key:'method', label:'构建方式', type:'select', options:['同源重组','酶切连接','Gateway','Golden Gate','其他']},
  {key:'date', label:'构建时间', type:'date'},
  {key:'fragments', label:'包含片段', type:'textarea', ph:'如 ProGeneA (1200 bp) :: GUS', full:true},
  {key:'enzyme', label:'酶切位点', ph:'如 BamHI(G^GATCC) / KpnI(GGTAC^C)', full:true},
  {key:'adapterF', label:'接头 adapter-F（5′额外序列）', ph:'如 CGCCACTAGTG^GATCC', full:true},
  {key:'adapterR', label:'接头 adapter-R', ph:'如 TACATCCCGGGAGCGGTAC^C', full:true},
  {key:'homoF', label:'同源序列 Homo-F', ph:'如 CCTCTAGAGTCGACCTGCAG'},
  {key:'homoR', label:'同源序列 Homo-R', ph:'如 CTCAGATCTACCATGG'},
  {key:'seqPrimers', label:'测序引物', ph:'如 GUS-R: AAGGGTCCTAACCAAGAA / M13R', full:true},
  {key:'seqNote', label:'测序阶段备注', type:'textarea', rows:2, ph:'如 1号克隆 785 位有杂峰，重测；' + '2号克隆无误', full:true},
  {key:'notes', label:'其他备注', type:'textarea', rows:2, full:true}
];

const PCR_FIELDS = [
  {key:'name', label:'扩增名称 *', ph:'如 GeneA-CDS'},
  {key:'template', label:'使用模板', ph:'如 cDNA（1:10 稀释）/ 质粒 pXXX'},
  {key:'primers', label:'引物 F / R', ph:'如 GeneA-BiFC-F / GeneA-BiFC-R', full:true},
  {key:'size', label:'目的片段大小 (bp)', type:'number'},
  {key:'polymerase', label:'聚合酶', ph:'如 Phanta / KOD One'},
  {key:'notes', label:'备注', type:'textarea', rows:2, full:true}
];
const DEFAULT_SYSTEM = [['10× Buffer','10 μL'],['dNTP (10 mM)','2 μL'],['引物 F (10 μM)','1 μL'],['引物 R (10 μM)','1 μL'],['聚合酶','1 μL'],['ddH2O','补至 50 μL']];
const DEFAULT_PROGRAM = [['预变性','98 ℃','2 min','1'],['变性','98 ℃','10 s','×'],['退火','60 ℃','15 s','×'],['延伸','72 ℃','30 s/kb','×'],['终延伸','72 ℃','5 min','1'],['保存','4 ℃','∞','1']];

const PRIMER_FIELDS = [
  {key:'name', label:'引物名称 *', ph:'如 PsCYC1C-BiFC-F'},
  {key:'module', label:'所属模块', type:'select', options:['普通引物','CRISPR','RNAi'], def:'普通引物'},
  {key:'target', label:'目的基因 / 靶点', ph:'如 PsCYC1C'},
  {key:'usage', label:'用途', ph:'如 BiFC（pSPYCE）/ 载体构建 / 测序', full:true},
  {key:'seq', label:'序列 5′→3′', type:'textarea', rows:2, ph:'如 CGCCACTAGTGGATCCATGTTTGGCAAGAGCTCATACTTT', full:true},
  {key:'tm', label:'Tm (℃)', type:'number'},
  {key:'notes', label:'备注', type:'textarea', rows:2, full:true}
];

function dynamicList(label, rows, keyA, keyB, keyC, defaults){
  return '<div class="group full" data-group="' + keyA + '"><h4>' + label +
    ' <button type="button" class="chip" data-act="add">＋ 添加行</button></h4><div class="row-list">' +
    rows.map(r => rowHTML(keyA, r)).join('') + '</div></div>';
}
function rowHTML(keyA, r){
  const n = (r || []).length;
  let cols = '';
  for (let i = 0; i < (n === 3 ? 3 : n); i++) cols += '<input value="' + esc(r?.[i] ?? '') + '" placeholder="">';
  if (n === 0) cols = '<input><input><input>';
  else if (n === 2) cols += '<input placeholder="循环/备注">';
  return '<div class="row-item" style="grid-template-columns:2fr 1.6fr 1fr auto">' + cols +
    '<button type="button" class="text-button danger" data-act="rm">✕</button></div>';
}

CIIB.pages.mol = {
  title: '分子实验',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>分子实验</h1><p>载体图谱（子页「载体图谱」）｜载体构建｜片段扩增｜引物设计（CRISPR / RNAi 模块预留）</p></div></div>' +
      '<div class="tabs" data-act="tabs">' +
      ['载体构建','片段扩增','引物设计','CRISPR（预留）','RNAi（预留）'].map((t, i) => '<button class="chip' + (i === 0 ? ' active' : '') + '" data-tab="' + i + '">' + t + '</button>').join('') + '</div>' +
      '<div data-act="pane"></div>';
    const pane = m.querySelector('[data-act="pane"]');
    m.querySelector('[data-act="tabs"]').onclick = e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      m.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      tab(+b.dataset.tab);
    };
    function tab(i){
      if (i === 0) buildTab(); else if (i === 1) pcrTab(); else if (i === 2) primerTab('普通引物');
      else primerTab(i === 3 ? 'CRISPR' : 'RNAi');
    }
    tab(0);

    /* ---- 载体构建 ---- */
    function buildTab(){
      const recs = db.builds;
      CIIB.recordPage({mount: pane, records: recs, fields: BUILD_FIELDS, blank: {status:'未完成', method:'同源重组', date: CIIB.today()},
        isDone: CIIB.DONE.build,
        title:'载体构建', sub:'记录构建状态、包含片段、抗性、接头/同源序列与测序备注（字段参考 ciib_note/protocol 内的构建 protocol）',
        cardHTML: r => '<div class="section-head"><h3>' + esc(r.name) + '</h3><span class="status ' + esc(r.status) + '">' + esc(r.status) + '</span></div>' +
          '<div class="kv">' +
          (r.backbone ? '<span class="k">骨架</span><span>' + esc(r.backbone) + '</span>' : '') +
          (r.fragments ? '<span class="k">片段</span><span>' + esc(r.fragments) + '</span>' : '') +
          (r.resistance ? '<span class="k">抗性</span><span>' + esc(r.resistance) + '</span>' : '') +
          (r.method ? '<span class="k">方式</span><span>' + esc(r.method) + '</span>' : '') +
          (r.date ? '<span class="k">构建时间</span><span>' + esc(r.date) + '</span>' : '') +
          ((r.adapterF || r.adapterR) ? '<span class="k">接头</span><span>F: ' + esc(r.adapterF || '—') + '<br>R: ' + esc(r.adapterR || '—') + '</span>' : '') +
          ((r.homoF || r.homoR) ? '<span class="k">同源</span><span>F: ' + esc(r.homoF || '—') + '<br>R: ' + esc(r.homoR || '—') + '</span>' : '') +
          (r.seqPrimers ? '<span class="k">测序引物</span><span>' + esc(r.seqPrimers) + '</span>' : '') +
          '</div>' +
          (r.seqNote ? '<p class="muted" style="margin:0">测序备注：' + esc(r.seqNote) + '</p>' : '') +
          (r.notes ? '<p class="muted" style="margin:0">备注：' + esc(r.notes) + '</p>' : ''),
        onSave: (v, old) => { Object.assign(v, {updated: iso(), id: old ? old.id : v.id});
          if (old) Object.assign(old, v); else recs.unshift(v); save(); },
        onDelete: r => { const i = recs.indexOf(r); if (i >= 0) recs.splice(i, 1); save(); }
      });
    }

    /* ---- 片段扩增 ---- */
    function pcrTab(){
      const recs = db.pcrs;
      function edit(rec, justCreated){
        const sys = (rec.system || DEFAULT_SYSTEM).map(r => r.slice());
        const prog = (rec.program || DEFAULT_PROGRAM).map(r => r.slice());
        const fields = PCR_FIELDS.map(f => ({...f}));
        CIIB.modal(justCreated ? '新建片段扩增记录' : '编辑片段扩增记录',
          '<form class="form-grid">' +
          PCR_FIELDS.map(f => { const v = rec[f.key] ?? '';
            if (f.type === 'textarea') return '<label class="field full"><span>' + esc(f.label) + '</span><textarea rows="' + (f.rows || 3) + '" data-k="' + f.key + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea></label>';
            if (f.type === 'number') return '<label class="field"><span>' + esc(f.label) + '</span><input type="number" data-k="' + f.key + '" value="' + esc(v) + '"></label>';
            return '<label class="field' + (f.full ? ' full' : '') + '"><span>' + esc(f.label) + '</span><input data-k="' + f.key + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '"></label>';
          }).join('') +
          '<div class="group full"><h4>使用体系 <button type="button" class="chip" data-act="sysadd">＋ 添加</button></h4><div class="row-list" data-act="sys"></div></div>' +
          '<div class="group full"><h4>温度/时间程序 <button type="button" class="chip" data-act="progadd">＋ 添加</button></h4><div class="row-list" data-act="prog"></div></div>' +
          '<div class="form-actions"><button type="button" data-act="cancel">取消</button><button class="primary" type="submit">保存记录</button></div></form>',
          (body, close) => {
            const sysBox = body.querySelector('[data-act="sys"]'), progBox = body.querySelector('[data-act="prog"]');
            const drawSys = () => { sysBox.innerHTML = sys.map(r => rowHTML('sys', r)).join('') || rowHTML('sys', []); };
            const drawProg = () => { progBox.innerHTML = prog.map(r => rowHTML('prog', r)).join('') || rowHTML('prog', []); };
            const bindRow = (box, arr, draw) => box.onclick = e => {
              if (e.target.dataset.act === 'rm') { const row = e.target.closest('.row-item'); const i = Array.from(box.children).indexOf(row); arr.splice(i, 1); draw(); }
            };
            drawSys(); drawProg(); bindRow(sysBox, sys, drawSys); bindRow(progBox, prog, drawProg);
            body.querySelector('[data-act="sysadd"]').onclick = () => { sys.push(['','','']); drawSys(); };
            body.querySelector('[data-act="progadd"]').onclick = () => { prog.push(['','','']); drawProg(); };
            const readRows = box => Array.from(box.querySelectorAll('.row-item')).map(row => Array.from(row.querySelectorAll('input')).map(i => i.value.trim()).slice(0, 3));
            body.querySelector('[data-act="cancel"]').onclick = () => {
              if (justCreated && !rec.name.trim()) { const i = db.pcrs.indexOf(rec); if (i >= 0) db.pcrs.splice(i, 1); save(); }
              close(); tab(1);
            };
            body.querySelector('form').onsubmit = e => {
              e.preventDefault();
              if (!rec.name || !rec.name.trim()) { alert('请填写扩增名称'); return; }
              rec.system = readRows(sysBox); rec.program = readRows(progBox);
              rec.updated = iso();
              body.querySelectorAll('[data-k]').forEach(inp => rec[inp.dataset.k] = inp.value);
              save(); close(); tab(1);
            };
          }, true);
      }
      CIIB.recordPage({mount: pane, records: recs, fields: PCR_FIELDS, blank: {name:''},
        title:'片段扩增', sub:'记录使用模板、使用体系与温度/时间程序；点击「打开体系/程序」可编辑默认体系与 PCR 程序',
        extraHTML: '<div class="toolbar"><button data-act="sysdef">编辑默认体系模板</button></div>',
        cardHTML: r => '<div class="section-head"><h3>' + esc(r.name) + '</h3><span class="muted">' + esc(r.size ? r.size + ' bp' : '') + '</span></div>' +
          '<div class="kv"><span class="k">模板</span><span>' + esc(r.template || '—') + '</span>' +
          '<span class="k">引物</span><span>' + esc(r.primers || '—') + '</span>' +
          '<span class="k">聚合酶</span><span>' + esc(r.polymerase || '—') + '</span></div>' +
          '<hr class="hr"><div class="muted">体系：</div>' +
          (r.system || []).map(s => '<div class="kv"><span class="k">' + esc(s[0]) + '</span><span>' + esc(s[1] || '') + '</span></div>').join('') +
          '<div class="muted" style="margin-top:6px">程序：</div>' +
          (r.program || []).map(s => '<div class="kv"><span class="k">' + esc(s[0]) + '</span><span>' + esc([s[1], s[2]].filter(Boolean).join(' · ') + (s[2] && s[2].includes('×') ? '' : '')) + '</span></div>').join('') +
          (r.notes ? '<p class="muted" style="margin:4px 0 0">备注：' + esc(r.notes) + '</p>' : ''),
        onSave: (v, old) => { if (old) { Object.assign(old, v, {updated: iso()}); edit(old, false); } else { const rec = {...v, updated: iso()}; db.pcrs.unshift(rec); save(); edit(rec, true); } },
        onDelete: r => { const i = recs.indexOf(r); if (i >= 0) recs.splice(i, 1); save(); }
      });
      pane.querySelector('[data-act="sysdef"]')?.addEventListener('click', () => {
        alert('在每条记录的「编辑」弹窗里即可修改该记录的体系与程序；新建记录时会自动带出默认体系（10×Buffer 10μL、dNTP 2μL、引物各 1μL、聚合酶 1μL、补水至 50μL）与默认程序。');
      });
    }

    /* ---- 引物设计 / CRISPR / RNAi ---- */
    function primerTab(mod){
      const recs = db.primers.filter(p => p.module === mod);
      const isReserve = mod !== '普通引物';
      CIIB.recordPage({mount: pane, records: recs, fields: PRIMER_FIELDS, blank: {module: mod, name: ''},
        title: '引物设计 · ' + mod,
        sub: isReserve ? '此模块为 CRISPR / RNAi 在线程序与脚本设计预留的位置，当前可先手动登记引物；后续在此接入 sgRNA 设计、效率打分与 RNAi 茎环设计脚本。' : '记录引物名称、序列、用途与 Tm；CRISPR / RNAI 模块请在对应标签页登记。',
        cardHTML: r => '<div class="section-head"><h3>' + esc(r.name) + '</h3><span class="tags"><span>' + esc(r.module) + '</span></span></div>' +
          '<div class="kv">' + (r.target ? '<span class="k">靶点</span><span>' + esc(r.target) + '</span>' : '') +
          (r.tm ? '<span class="k">Tm</span><span>' + esc(r.tm) + ' ℃</span>' : '') +
          (r.usage ? '<span class="k">用途</span><span>' + esc(r.usage) + '</span>' : '') + '</div>' +
          '<div class="seq-view" style="max-height:none;min-height:0">' + esc(r.seq || '') + '</div>' +
          (r.notes ? '<p class="muted" style="margin:4px 0 0">' + esc(r.notes) + '</p>' : ''),
        onSave: (v, old) => { Object.assign(v, {updated: iso(), id: old ? old.id : v.id}); if (old) Object.assign(old, v); else { db.primers.unshift(v); primerTab(mod); } save(); },
        onDelete: r => { const i = db.primers.indexOf(r); if (i >= 0) db.primers.splice(i, 1); save(); }
      });
    }
  }
};
})();
