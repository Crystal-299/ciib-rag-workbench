/* ciib_app/build-standalone.cjs — 把工作台打包成一个自包含的 HTML（零依赖）
   用法：<node> ciib_app/build-standalone.cjs   输出到 dist/ciib-工作台-单文件版.html */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'ciib · 植物生信可视化工作台.html');
let html = fs.readFileSync(entry, 'utf8');

let inlined = 0;
/* 内联样式（忽略 ?v= 缓存版本参数） */
html = html.replace(/<link rel="stylesheet" href="\.\/([^"?]+)(\?[^"]*)?">/g, (m, rel) => {
  const css = fs.readFileSync(path.join(root, rel), 'utf8');
  if (/<\/style/i.test(css)) throw new Error(rel + ' 含 </style>，无法安全内联');
  inlined++;
  return '<style>\n' + css + '\n</style>';
});
/* 内联脚本（忽略 ?v= 缓存版本参数） */
html = html.replace(/<script src="\.\/([^"?]+)(\?[^"]*)?"><\/script>/g, (m, rel) => {
  const js = fs.readFileSync(path.join(root, rel), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(rel + ' 含 </script>，无法安全内联');
  inlined++;
  return '<script>\n' + js + '\n</script>';
});
/* logo 转 base64 data URI（favicon + 侧栏图标） */
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'logo.png')).toString('base64');
html = html.replace(/\.\/logo\.png/g, logo);
/* 云 SDK 走 CDN 外链，单文件版（离线场景）直接剥离；cloud.js 对缺失 SDK 已容错 */
html = html.replace(/<script src="https?:[^"]*"><\/script>/g, () => { inlined++; return ''; });
/* 科研总览（ciib-ro/ro.html）：单文件版里没有该文件，把整页 HTML 注入成
   window.__RO_HTML__，ro.js 会优先用 iframe 的 srcdoc 内联渲染。
   用 JSON.stringify 转义（引号 / 反斜杠 / 换行都安全），再拆掉可能的 </script。 */
const roPath = path.join(root, 'ciib-ro', 'ro.html');
if (fs.existsSync(roPath)) {
  const roHtml = fs.readFileSync(roPath, 'utf8');
  const roJs = 'window.__RO_HTML__=' + JSON.stringify(roHtml).replace(/<\/script/gi, '<\\/script') + ';';
  if (!/<\/head>/.test(html)) throw new Error('入口 HTML 里找不到 </head>，无法注入科研总览内联数据');
  html = html.replace('</head>', '<script>' + roJs + '</script></head>');
  inlined++;
}
/* 单文件版不需要依赖子文件夹的提示 */
html = html.replace(/<p style="padding:40px">[^<]*<\/p>/, '<p style="padding:40px">正在打开 ciib 工作台…</p>');

/* 完整性检查：不允许残留 ./ 相对引用 */
const left = html.match(/(?:href|src)="\.\/[^"]+"/g);
if (left) throw new Error('仍有未内联的外部引用：' + left.join(', '));

const out = path.join(root, 'dist', 'ciib-工作台-单文件版.html');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, html, 'utf8');
console.log('已生成: ' + out + '  (' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0) + ' KB，内联 ' + inlined + ' 个文件 + logo)');
