/* ciib_kb/kb.js — 知识库：笔记 + 点子库（头脑风暴/待验证灵感），存 localStorage，支持备份导出 */
(function(){
'use strict';
const {esc, uid, db, save, formModal} = CIIB;
const iso = () => new Date().toISOString();

const FIELDS = [
  {key:'title', label:'标题 *'},
  {key:'tags', label:'标签（逗号分隔）', ph:'如 课题一, 转化, 生信'},
  {key:'content', label:'内容', type:'textarea', rows:8, full:true, ph:'知识要点、步骤、参数、链接…'}
];
const IDEA_FIELDS = [
  {key:'title', label:'点子 *', ph:'一句话描述这个灵感'},
  {key:'tags', label:'标签（逗号分隔）', ph:'如 转化, 生信, 待讨论'},
  {key:'content', label:'背景 / 设想', type:'textarea', rows:5, full:true, ph:'为什么想到、打算怎么验证、相关线索…'}
];
const IDEA_STATUS = [
  {key:'未解决', color:'#e8a13a'},
  {key:'已归档', color:'#9aa8a3'}
];
const statusOf = k => IDEA_STATUS.find(s => s.key === k) || IDEA_STATUS[0];
/* 旧数据迁移：状态合并为 未解决/已归档；批注（字符串或 {text,at}）升级为「想法」{id,text,at,replies:[]} */
(db.ideas || []).forEach(r => {
  if (r.status === '待验证' || r.status === '已验证' || !r.status) r.status = '未解决';
  r.notes = (r.notes || []).map(n => typeof n === 'string'
    ? {id: uid(), text: n, at: r.created || iso(), replies: []}
    : Object.assign({id: uid(), at: iso(), replies: []}, n, {replies: n.replies || []}));
});

CIIB.pages.kb = {
  title: '知识库',
  render(m, rerender){
    m.innerHTML = '<div class="page-head"><div><h1>知识库</h1><p>拾贝：个人知识检索与录入；点子库：头脑风暴的灵感与想法讨论（可在每个想法下继续回应补充，数据存浏览器本地，可在工作台导出备份）。</p></div></div>' +
      '<div class="tabs" data-act="tabs">' +
      ['拾贝', '点子库'].map((t, i) => '<button class="chip' + (i === 0 ? ' active' : '') + '" data-tab="' + i + '">' + t + '</button>').join('') + '</div>' +
      '<div data-act="pane"></div>';
    const tabs = m.querySelector('[data-act="tabs"]'), pane = m.querySelector('[data-act="pane"]');
    tabs.onclick = e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      tabs.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
      sub(+b.dataset.tab);
    };
    function sub(i){
      if (i === 0) drawNotes(); else drawIdeas();
    }

    /* ---------- 笔记 ---------- */
    function kbForm(rec, isNew, redraw){
      formModal(isNew ? '新建知识条目' : '编辑知识条目', FIELDS, rec, v => {
        if (!v.title || !v.title.trim()) { alert('请填写标题'); return; }
        const out = {...v, id: rec.id || uid(), updated: iso()};
        if (isNew) db.kb.unshift(out); else Object.assign(rec, out);
        save(); redraw();
      });
    }
    function drawNotes(){
      let q = '', tag = '';
      pane.innerHTML = '<div class="filter-bar" data-act="tagbar"></div>' +
        '<div class="toolbar-row"><input class="search" placeholder="搜索标题、标签、内容…" data-act="q">' +
        '<button class="primary" data-act="newk">＋ 新建条目</button></div>' +
        '<div class="card-grid"></div>';
      const tagbar = pane.querySelector('[data-act="tagbar"]'), list = pane.querySelector('.card-grid'), qi = pane.querySelector('[data-act="q"]');
      function draw(){
        const tags = new Set();
        db.kb.forEach(r => String(r.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean).forEach(t => tags.add(t)));
        const tl = [...tags].sort();
        tagbar.innerHTML = tl.map(t => '<label><input type="radio" name="kbtag"' + (t === tag ? ' checked' : '') + ' data-tag="' + esc(t) + '"><span class="dot" style="background:#729d51"></span>' + esc(t) + '</label>').join('')
          + (tag ? '<button class="chip" data-act="cleartag">清除筛选 ✕</button>' : '');
        tagbar.querySelectorAll('[data-tag]').forEach(rb => rb.onchange = () => { tag = rb.dataset.tag; draw(); });
        const ct = tagbar.querySelector('[data-act="cleartag"]');
        if (ct) ct.onclick = () => { tag = ''; draw(); };
        const kw = q.toLowerCase();
        const vis = db.kb.filter(r => (!tag || String(r.tags || '').includes(tag)) && (!kw || JSON.stringify(r).toLowerCase().includes(kw)));
        list.innerHTML = vis.map(r => '<article class="card" data-id="' + r.id + '"><div class="section-head"><h3>' + esc(r.title) + '</h3>' +
          '<span><button class="text-button" data-act="edit">编辑</button> <button class="text-button danger" data-act="del">删除</button></span></div>' +
          '<div class="tags">' + String(r.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' +
          '<p style="margin:0;white-space:pre-wrap;max-height:180px;overflow:auto">' + esc(r.content || '') + '</p>' +
          '<div class="card-bottom"><small>更新于 ' + (r.updated ? r.updated.slice(0, 10) : '') + '</small></div></article>').join('')
          || '<div class="empty"><span>❖</span><p>知识库还是空的，点击右上角录入第一条。</p></div>';
      }
      qi.oninput = e => { q = e.target.value; draw(); };
      pane.querySelector('[data-act="newk"]').onclick = () => kbForm({id: uid()}, true, draw);
      list.onclick = e => {
        const card = e.target.closest('.card'); if (!card) return;
        const rec = db.kb.find(r => r.id === card.dataset.id); const act = e.target.dataset.act;
        if (act === 'edit') kbForm(rec, false, draw);
        if (act === 'del') { if (confirm('删除条目「' + rec.title + '」？')) { db.kb = db.kb.filter(x => x.id !== rec.id); save(); draw(); } }
      };
      draw();
    }

    /* ---------- 点子库 ---------- */
    function ideaForm(rec, isNew, redraw){
      formModal(isNew ? '记录一个点子' : '编辑点子', IDEA_FIELDS, rec, v => {
        if (!v.title || !v.title.trim()) { alert('请填写点子内容'); return; }
        const out = {...v, id: rec.id || uid()};
        if (isNew) { out.created = iso(); out.status = rec.status || '未解决'; out.notes = []; db.ideas.unshift(out); }
        else Object.assign(rec, out);
        save(); redraw();
      });
    }
    /* 想法：疑问/思考，可层层回应（下一层级可折叠） */
    function noteModal(rec, redraw){
      const notes = rec.notes || (rec.notes = []);
      const open = {};  /* 想法 id -> 回应区是否展开 */
      const bodyHTML = () => '<div class="idea-notes">' +
        (notes.length ? notes.slice().reverse().map(n => {
          const reps = n.replies || (n.replies = []);
          const openR = !!open[n.id];
          return '<div class="idea-note" data-nid="' + n.id + '">' +
          '<p style="margin:0;white-space:pre-wrap">' + esc(n.text) + '</p>' +
          '<small class="muted">' + esc(String(n.at || '').slice(0, 10)) + '</small>' +
          '<div class="reply-head"><button class="text-button" data-act="treply">回应' + (reps.length ? ' (' + reps.length + ')' : '') + ' ' + (openR ? '▴' : '▾') + '</button></div>' +
          (openR ? '<div class="reply-list">' +
            reps.map(rp => '<div class="reply-row"><p style="margin:0;white-space:pre-wrap">' + esc(rp.text) + '</p><small class="muted">' + esc(String(rp.at || '').slice(0, 10)) + '</small></div>').join('') +
            '<div class="reply-add"><input type="text" data-act="rtext" placeholder="补充想法 / 回答这个问题…"><button class="primary" data-act="rok">回应</button></div></div>' : '') +
          '</div>';
        }).join('')
        : '<p class="muted" style="margin:0 0 10px">还没有想法。疑问、思考都可以先记在这里，之后随时回应、补充、回答。</p>') +
        '<textarea rows="3" data-act="ntext" placeholder="发出一条新想法（疑问 / 思考 / 线索）…" style="width:100%"></textarea>' +
        '<div class="form-actions"><button class="ghost" type="button" data-act="nc">关闭</button><button class="primary" type="button" data-act="nok">发出想法</button></div></div>';
      CIIB.modal('想法 · ' + (rec.title || '点子'), bodyHTML(), (body, close) => {
        function render(){
          body.innerHTML = bodyHTML();
          bind();
        }
        function bind(){
          body.querySelector('[data-act="nc"]').onclick = close;
          body.querySelector('[data-act="nok"]').onclick = () => {
            const t = body.querySelector('[data-act="ntext"]').value.trim(); if (!t) return;
            notes.push({id: uid(), text: t, at: iso(), replies: []});
            save(); render(); redraw();
          };
          body.onclick = e => {
            const tg = e.target.closest('[data-act="treply"], [data-act="rok"]');
            if (!tg) return;
            const noteEl = tg.closest('.idea-note');
            const n = notes.find(x => x.id === noteEl.dataset.nid);
            if (tg.dataset.act === 'treply') {
              open[n.id] = !open[n.id]; render();
            } else {
              const t = noteEl.querySelector('[data-act="rtext"]').value.trim(); if (!t) return;
              (n.replies || (n.replies = [])).push({id: uid(), text: t, at: iso()});
              open[n.id] = true; save(); render(); redraw();
            }
          };
          body.querySelectorAll('[data-act="rtext"]').forEach(inp =>
            inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.closest('.reply-add').querySelector('[data-act="rok"]').click(); } });
        }
        bind();
      }, true);
    }
    function drawIdeas(){
      let q = '', st = '';
      pane.innerHTML = '<div class="filter-bar" data-act="stbar"></div>' +
        '<input class="search" placeholder="搜索点子、标签、想法…" data-act="q">' +
        '<div class="card-grid"></div>';
      const stbar = pane.querySelector('[data-act="stbar"]'), list = pane.querySelector('.card-grid'), qi = pane.querySelector('[data-act="q"]');
      function draw(){
        const cnt = k => db.ideas.filter(i => (i.status || '未解决') === k).length;
        stbar.innerHTML = '<button class="chip' + (st === '' ? ' active' : '') + '" data-st="">全部 · ' + db.ideas.length + '</button>' +
          IDEA_STATUS.map(s => '<button class="chip' + (st === s.key ? ' active' : '') + '" data-st="' + s.key + '"><span class="dot" style="background:' + s.color + '"></span>' + s.key + ' · ' + cnt(s.key) + '</button>').join('') +
          '<button class="primary" data-act="newi" style="margin-left:auto">＋ 记录点子</button>';
        stbar.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { st = b.dataset.st; draw(); });
        const kw = q.toLowerCase();
        const vis = CIIB.byDone('idea', db.ideas.filter(i => (!st || (i.status || '未解决') === st) &&
          (!kw || JSON.stringify({...i, notes: (i.notes || []).map(n => n.text + ' ' + (n.replies || []).map(r0 => r0.text).join(' '))}).toLowerCase().includes(kw))));
        list.innerHTML = vis.map(r => {
          const s = statusOf(r.status || '未解决'), ns = (r.notes || []).length;
          const lastN = ns ? (r.notes || [])[ns - 1] : null;
          return '<article class="card idea" data-id="' + r.id + '">' +
          '<div class="section-head"><h3>' + esc(r.title) + '</h3>' +
          '<span><button class="text-button" data-act="edit">编辑</button> <button class="text-button danger" data-act="del">删除</button></span></div>' +
          '<div class="tags"><span class="idea-st" style="background:' + s.color + '1a;color:' + s.color + ';border:1px solid ' + s.color + '55">' + s.key + '</span>' +
          String(r.tags || '').split(/[,，]/).map(x => x.trim()).filter(Boolean).map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' +
          (r.content ? '<p style="margin:0;white-space:pre-wrap;max-height:120px;overflow:auto">' + esc(r.content) + '</p>' : '') +
          (lastN ? '<div class="idea-last" role="button" tabindex="0" data-act="note"><span class="k">最近想法</span>' + esc(String(lastN.text).slice(0, 60)) + '</div>' : '') +
          '<div class="card-bottom"><small>创建于 ' + (r.created ? r.created.slice(0, 10) : '') +
          (ns ? ' · 想法 ' + ns + ' 条' : '') + '</small>' +
          '<span class="idea-btns">' +
          '<button class="text-button" data-act="note">想法' + (ns ? ' (' + ns + ')' : '') + '</button>' +
          (r.status !== '已归档' ? '<button class="text-button" data-act="arch">📦 归档</button>' : '<button class="text-button ok" data-act="reopen">↩ 恢复未解决</button>') +
          '</span></div></article>';
        }).join('') || '<div class="empty"><span>✦</span><p>点子库还是空的——头脑风暴、疑问与思考都可以先记在这里。</p></div>';
      }
      qi.oninput = e => { q = e.target.value; draw(); };
      draw();
      /* 「记录点子」按钮由 draw() 渲染进状态栏，需在 draw() 之后绑定 */
      stbar.querySelector('[data-act="newi"]').onclick = () => ideaForm({id: uid()}, true, draw);
      list.onclick = e => {
        const card = e.target.closest('.card'); if (!card) return;
        const rec = db.ideas.find(r => r.id === card.dataset.id); if (!rec) return;
        const actEl = e.target.closest('[data-act]');
        const act = actEl ? actEl.dataset.act : '';
        if (act === 'edit') ideaForm(rec, false, draw);
        else if (act === 'note') noteModal(rec, draw);
        else if (act === 'arch') { rec.status = '已归档'; rec.archivedAt = iso(); save(); draw(); }
        else if (act === 'reopen') { rec.status = '未解决'; save(); draw(); }
        else if (act === 'del') { if (confirm('删除点子「' + rec.title + '」？')) { db.ideas = db.ideas.filter(x => x.id !== rec.id); save(); draw(); } }
      };
    }

    sub(CIIB.pendingSub && CIIB.pendingSub.key === 'kb' ? CIIB.pendingSub.sub : 0);
  }
};
/* 暴露给主页联合检索：点知识库结果直接打开详情（只读） */
CIIB.openKb = function(rec){
  if (!rec) return;
  const tags = String(rec.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  CIIB.modal(rec.title || '知识条目',
    '<div class="lit-detail">' +
    (tags.length ? '<div class="tags" style="margin:0 0 10px">' + tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') +
    '<p style="margin:0;white-space:pre-wrap">' + esc(rec.content || '') + '</p>' +
    '<div class="form-actions" style="margin-top:14px"><button class="primary" type="button" data-act="closed">关闭</button></div></div>',
    (body, close) => { body.querySelector('[data-act="closed"]').onclick = close; }, true);
};
/* 主页联合检索：点「点子库」结果打开点子详情（只读：状态 + 背景/设想 + 想法列表） */
CIIB.openIdea = function(rec){
  if (!rec) return;
  const tags = String(rec.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  const s = statusOf(rec.status);
  const notes = (rec.notes || []);
  CIIB.modal(rec.title || '点子',
    '<div class="lit-detail">' +
    '<div class="tags" style="margin:0 0 10px"><span class="idea-st" style="background:' + s.color + '1a;color:' + s.color + ';border:1px solid ' + s.color + '55">' + s.key + '</span>' +
    tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' +
    (rec.content ? '<p style="margin:0 0 10px;white-space:pre-wrap">' + esc(rec.content) + '</p>' : '') +
    (notes.length ? '<h4 style="margin:8px 0 6px">想法 · ' + notes.length + '</h4>' +
      notes.map(n => '<div class="idea-note"><p style="margin:0;white-space:pre-wrap">' + esc(n.text) + '</p>' +
        ((n.replies || []).length ? '<small class="muted">' + esc(String(n.at).slice(0, 10)) + ' · 回应 ' + n.replies.length + ' 条</small>'
          : '<small class="muted">' + esc(String(n.at).slice(0, 10)) + '</small>') + '</div>').join('')
      : '') +
    '<div class="form-actions" style="margin-top:14px"><button class="primary" type="button" data-act="closed">关闭</button></div></div>',
    (body, close) => { body.querySelector('[data-act="closed"]').onclick = close; }, true);
};
})();
