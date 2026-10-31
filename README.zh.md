[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **仅使用 HTML 的 Web 框架。只需标记。**
>
> 构建应用无需使用终端（GUI 工具 Studio 即可完成）。CLI 是用于静态构建的可选工具。

Bracify 是一个允许您仅通过 HTML 标记即可构建 Web 应用程序的框架。
我们提供“HTML 优先”的开发体验，旨在降低编程和复杂环境配置的门槛。

## 什么是 Bracify？

Bracify 追求极致的简洁：“仅通过标记即可构建应用”。

- **致深受 React/Vue 疲劳困扰的工程师**：从复杂的构建配置和沉重的框架学习曲线中解放出来。
- **致标记语言工程师（切图仔/页面重构工程师）**：无需编程。仅凭您的 HTML 技能，即可构建包含数据对接的可运行 Web 应用。

## Demo

![演示动画](./demo.gif)

## 核心概念 (Key Concepts)

- **仅使用 HTML 标记**：无需编写程序，仅通过 HTML 标记即可创建应用。
- **创作无需终端**：创建页面、预览和管理数据都不需要终端，GUI 工具 Bracify Studio 即可完成。CLI（用于静态构建）是可选的。
- **混合渲染 (Hybrid Rendering)**：使用 `file://` (CSR) 进行开发，生产环境可直接作为服务器 `https://` (SSR) 发布。
- **极简配置 (Minimal Setup)**：项目不需要配置文件或构建步骤。启动 Studio 需要 Node.js 以及一次性的 `npm install`（见下方快速入门）。
- **便携 (Portable)**：项目即是 HTML。可携带至任何地方并立即运行。

## 快速入门

让我们从创建一个简单的页面开始。只需 4 个步骤。

### 1. 准备

启动 Bracify Studio，并选择一个新的工作目录。目前 Studio 需从源码启动（需要 Node.js）：在仓库根目录执行一次 `npm install`，然后执行 `npm start`。详见 [Studio](./docs/en/studio.md)。

### 2. 创建 HTML

创建一个名为 `index.html` 的文件，并写入以下内容：

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 指定数据源 -->
  <link data-t-source="info" href="/_sys/data/info.json">
  <script src="bracify.js"></script>
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

`<script src="bracify.js"></script>` 用于加载客户端引擎（SPA 跳转和本地开发模式需要；详见[项目结构](./docs/en/project-structure.md)）。

### 3. 创建数据

创建一个名为 `/_sys/data/info.json` 的文件，并写入以下内容：

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. 运行

在 Studio 中点击 `Start Server` 按钮并访问 `localhost:3000`，即可看到 `Hello Bracify!`。
服务器在启动时读取 `index.html` 和 `info.json`，在内存中解析 SSI（服务端包含），并返回响应。
当您编辑并保存文件时，OS 级别的监控会立即更新内存中的模板。

---

## 你可以构建什么

每个功能给出一个最小示例。详情请参阅[文档](#文档)。

### 显示数据（`data-t-source` 与占位符）

为 JSON 等数据命名，并用 `{名称.字段}` 嵌入文本或属性。URL 参数可用 `{?id}` 引用。

```html
<link data-t-source="article" href="_sys/data/articles.json?id={?id}">
<h1>{article.title}</h1>
<p>{article.body}</p>
```

### 列表（`data-t-list`）

加在需要重复的元素上，每条记录会复制一份。排序、条数限制和分页通过 URL 参数指定。

```html
<link data-t-source="articles" href="_sys/data/articles.json?_sort=id&_order=desc&_limit=5">
<ul>
  <li data-t-list="articles"><a href="article.html?id={articles.id}">{articles.title}</a></li>
</ul>
```

### 条件显示（`data-t-if`）

按是否存在、比较（`=`、`:gt` 等）、AND（空格）和 OR（逗号）来显示或隐藏元素。

```html
<span data-t-if="status=published">Published</span>
<div data-t-if="price:gte=1000 stock:gt=0">In stock</div>
<div data-t-if="!user.is_login"><a href="login.html">Log in</a></div>
```

### 保存表单（带服务端校验的 Data API）

把普通的 `<form>` 提交到 Data API 即可保存数据。`required`、`maxlength`、`pattern` 等约束也会在服务器端校验；失败时带着 `?error=` 返回原页面。

```html
<form method="POST" action="/_sys/data/articles.json" data-t-redirect="articles.html">
  <input type="text" name="title" required maxlength="100">
  <input type="email" name="email" required>
  <button>Save</button>
</form>
<p>{_sys.query.error}</p>
```

### 部件与布局（`data-t-include`）

可以插入页眉等共用部件，也可以把页面内容填入通用布局。

```html
<!-- _parts/layout.html contains <main data-t-content="main-body"></main> -->
<body data-t-include="_parts/layout.html">
  <div data-t-content="main-body"><p>Page content</p></div>
</body>
```

### 管道 (Pipes，过滤器)

用 `|` 格式化日期、数字、货币，或截断、设置默认值。内置 `date`、`number`、`currency`、`uppercase`、`lowercase`、`truncate`、`default`、`ternary` 和 `json`。

```html
<p>{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>{ product.price | currency }</span>
<span>{ article.summary | truncate: 10 | uppercase }</span>
```

### SPA 导航

内部链接只需写普通的 `<a>`，就会自动以不刷新整页的方式跳转。无需 JavaScript。

```html
<a href="book.html?id=1">Book</a>
```

### 本地模式（`file://`，无需服务器）

在 Chrome / Edge 中双击打开 `index.html` 并选择项目文件夹即可运行（只读；使用 File System Access API）。每个页面都需要这一行。

```html
<script src="bracify.js"></script>
```

### Studio 数据管理与脚手架

Studio 会从 HTML 中自动收集实体和 Schema，支持记录的列表、新增、编辑、删除，并生成列表页与编辑页的脚手架。

## 当前限制

Bracify 尚处于早期阶段，请在了解以下几点的前提下使用。

- **本地模式是只读的。** 在 `file://` 下无法保存表单（[#56](https://github.com/tri-comma/Bracify/issues/56)）。
- **尚无认证功能。** 在公开服务器上，任何能访问 Data API 的人都可以写入数据（[#106](https://github.com/tri-comma/Bracify/issues/106)）。公开部署时请务必谨慎。
- **暂不支持文件上传**（[#107](https://github.com/tri-comma/Bracify/issues/107)）。
- **没有一键部署功能。** 可将静态构建产物放到静态托管，或在可运行 Node.js 的主机上运行服务器模式（[#105](https://github.com/tri-comma/Bracify/issues/105)）。

## 文档

详细规范位于 `docs/`。参考文档提供英文和日文版本。

| 文件 | 内容 |
| --- | --- |
| [`docs/en/README.md`](./docs/en/README.md) | 文档目录 |
| [`docs/en/studio.md`](./docs/en/studio.md) | Bracify Studio（启动器、管理仪表盘、数据管理、脚手架） |
| [`docs/en/project-structure.md`](./docs/en/project-structure.md) | 项目结构、渲染方式（SSR / CSR / SPA）、客户端引擎的加载 |
| [`docs/en/attributes.md`](./docs/en/attributes.md) | 自定义属性（`data-t-include`、`data-t-source`、`data-t-list`、`data-t-if` 等）、表单与数据保存 |
| [`docs/en/pipes.md`](./docs/en/pipes.md) | 管道（过滤器）与内置过滤器 |
| [`docs/en/data-api.md`](./docs/en/data-api.md) | Data API（数据操作、服务端校验、值的类型）与数据查询条件 |
| [`docs/en/system-variables.md`](./docs/en/system-variables.md) | `_sys` 保留变量与系统属性 |
| [`docs/en/local-mode.md`](./docs/en/local-mode.md) | 本地开发模式（`file://`） |
| [`docs/en/database.md`](./docs/en/database.md) | 数据库配置与路由优先级 |
| [`docs/en/deployment.md`](./docs/en/deployment.md) | 构建、部署与开发流程 |
| [`docs/en/security.md`](./docs/en/security.md) | 安全 |

## 示例 (Examples)

[`examples/`](./examples/) 文件夹中提供了实用示例应用 "Bracify Books"（藏书 / 阅读记录应用），使用了文档中的主要功能。同一份文件无需修改即可在服务器模式（SSR + SQLite）和本地 `file://` 开发模式下运行。运行方法及“功能 → 文件”对照表请参阅 [`examples/README.md`](./examples/README.md)。

## 贡献 (Contributing)

本项目由作者一人独立开发，因此不接受第三方的 Pull Request。欢迎通过 Issue 提交错误报告、功能建议和问题。详情请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。
