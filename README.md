# CIIB · Research Workbench | 植物生信科研工作台

## 中文

这是 CIIB 网页的**可下载、可本机运行版本**：实验/载体/引物记录、文献与知识库、绘图和科研总览，外加在本机记录上建索引的问答助手。公开版不含真实实验记录、原云服务配置及来源未确认的大型基因 ID 映射表；因此可以复现工作台页面与本机功能，**不能等同于原线上账号/云同步部署**。

**直接使用：**下载仓库，双击 [`workplat/dist/ciib-工作台-单文件版.html`](workplat/dist/ciib-工作台-单文件版.html)。它已内联 CSS、JS、科研总览和图标，无需 Node、服务器或账号；记录存在当前浏览器的 localStorage。请先用虚构记录试用，不要在未审查隐私前输入真实未发表资料。

**从源码重建并验证（Node.js 20+）：**

```bash
npm ci
npm run verify
```

`verify` 运行 82 项助手回归检查、重新生成离线 HTML，再运行 18 项独立页面检查（打开导航、建记录、持久化、载体页、科研总览与运行期错误）。预期均为 0 失败。另用 Edge 无头模式实际打开离线文件，确认标题、10 个导航入口和问答按钮出现。源码入口是 `workplat/ciib · 植物生信可视化工作台.html`；`npm run build:offline` 可单独重建单文件版。RAG 在浏览器本地用 BM25 检索最多 6 条记录；只有配置了自己的云服务且登录后才会把命中片段送模型生成回答。未配置时提供本机检索，引用可回跳记录但不等于事实核验。[局限](LIMITATIONS.md)。

作者确认的原网页二维码（外部页面，不保证与此脱敏版部署相同）：

![CIIB 网页二维码](docs/ciib-page-qr.jpg)

## English

This is a downloadable, locally usable CIIB workbench with research records, literature/knowledge modules, plotting, a project overview and a browser-local BM25 assistant. The public edition omits real research records, the original cloud configuration and an ownership-uncertain generated gene-ID database. It reproduces the **local UI and interactions**, not the original hosted account/sync service.

Download the repository and open the prebuilt `workplat/dist/ciib-工作台-单文件版.html` directly—no server or login is needed. To rebuild from source, run `npm ci` and `npm run verify`; expect 82 assistant checks and 18 standalone-page checks, all passing. Records remain in your browser's localStorage. Cloud-generated answers require a separately configured service; the offline edition searches locally only. Do not enter confidential data into an unreviewed deployment. See [limitations](LIMITATIONS.md).
