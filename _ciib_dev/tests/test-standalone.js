/* tests/test-standalone.js — 验证 dist 单文件版：无需任何子文件夹即可独立运行 */
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const ROOT = path.join(__dirname, '..', '..', 'workplat');
const FILE = path.join(ROOT, 'dist', 'ciib-工作台-单文件版.html');

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };

const html = fs.readFileSync(FILE, 'utf8');
ok('单文件版存在且不引用任何 ./ 外部资源', !/(?:href|src)="\.\/[^"]+"/.test(html));
ok('全部 JS 已内联（无 script src）', !/<script src=/.test(html));
ok('CSS 已内联', html.includes('<style>') && html.includes('.cal-week'));
ok('logo 已内联为 data URI', html.includes('data:image/png;base64,'));

ok('科研总览整页已内联（window.__RO_HTML__）', html.includes('window.__RO_HTML__='));
ok('科研总览模式样式已内联（侧栏 width:0 收起 + 展开归位 + 左边缘箭头 + 浮动主 Logo）',
  /\.app\.ro-mode \.sidebar\{width:0/.test(html) &&
  /\.app\.ro-mode\.sb-open \.sidebar\{width:212px/.test(html) &&
  /\.sb-rail\{/.test(html) && /\.ro-floatbrand\{/.test(html));
ok('内联的科研总览里没有自己的配色开关（配色跟随主站）', !/data-act="theme"/.test(html));
const errs = [];
const vcon = new VirtualConsole();
vcon.on('jsdomError', e => errs.push(e.message));

const dom = new JSDOM(html, {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vcon,
  beforeParse(w){
    w.structuredClone = w.structuredClone || (o => JSON.parse(JSON.stringify(o)));
    w.HTMLCanvasElement.prototype.getContext = function(){
      return new Proxy({}, {get:(t,p)=> (p in t ? t[p] : (...a)=>undefined), set:(t,p,v)=>(t[p]=v,true)});
    };
  }
});
const w = dom.window;
setTimeout(() => {
  const $ = s => w.document.querySelector(s);
  const $$ = s => Array.from(w.document.querySelectorAll(s));
  // 从任意目录打开：所有资源必须来自 data URI 或内联
  /* The built page must expose its main navigation. */
  ok('外壳渲染（侧栏入口）', $$('.nav-item').length >= 8);
  ok('内联脚本执行并挂载公共库', !!w.CIIB && typeof w.CIIB.pages === 'object');
  // 遗传转化：新建方案 → 日历连续条
  $$('.nav-item').find(b => b.dataset.page === 'tf').click();
  ok('遗传转化页与主 TextField 正常', !!$('[data-act="pane"]') && !!$('[data-act="new"]'));
  $('[data-act="new"]').click();
  const f = $('.modal form');
  f.querySelector('[data-k="name"]').value = '单文件版-测试方案';
  f.dispatchEvent(new w.Event('submit', {cancelable: true, bubbles: true}));
  ok('内联版可正常新建并持久化方案', $('.card-grid').textContent.includes('单文件版-测试方案'));
  $$('[data-tab]')[1].click();
  ok('日历连续条渲染（条数随今天在月内的位置变化）', $$('.cal-grid .cal-bar:not(.more)').length >= 1);
  ok('写入 localStorage', (w.localStorage.getItem('ciib2:db') || '').includes('单文件版-测试方案'));
  // 载体图谱页也能打开（说明 plasmid.js 内联完整）
  $$('.nav-item').find(b => b.dataset.page === 'plasmid').click();
  ok('载体图谱页可打开（plasmid.js 内联完整）', $('#view').textContent.includes('载体图谱') && !!$('[data-act="import"]'));
  // 科研总览：单文件版没有 ciib-ro/ 目录，必须走 srcdoc 内联；入口是左上角 Logo
  $('.brand').click();
  ok('点左上角 Logo 进入科研总览（侧栏收起、出现唤起箭头）',
    w.document.querySelector('.app').classList.contains('ro-mode') && !!$('#sbRail'));
  const roF = $('#view .ro-frame');
  ok('科研总览页可打开（单文件版走 srcdoc，不引用外部文件）',
    !!roF && roF.hasAttribute('srcdoc') && !roF.hasAttribute('src'));
  ok('内联的科研总览是完整页面（doctype + #roView）',
    !!roF && /<!doctype html>/i.test(roF.getAttribute('srcdoc')) && roF.getAttribute('srcdoc').includes('id="roView"'));
  ok('运行期无 JS 错误', errs.length === 0);
  if (errs.length) console.log('    错误：' + errs.slice(0, 3).join(' | '));
  console.log('\n单文件版结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}, 300);
