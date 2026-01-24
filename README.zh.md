[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **仅使用 HTML 的 Web 框架。无需 CLI，只需标记。**

Bracify 是一个允许您仅通过 HTML 标记即可构建 Web 应用程序的框架。
我们提供“HTML 优先”的开发体验，旨在消除编程和复杂环境配置的壁垒。

## 什么是 Bracify？

Bracify 追求极致的简洁：“仅通过标记即可构建应用”。

- **致深受 React/Vue 疲劳困扰的工程师**：从复杂的构建配置和沉重的框架学习曲线中解放出来。
- **致标记语言工程师（切图仔/页面重构工程师）**：无需编程。仅凭您的 HTML 技能，即可完成从数据对接至部署的全功能 Web 应用构建。

## Demo

![演示动画](./demo.gif)

## 核心概念 (Key Concepts)

- **仅使用 HTML 标记**：无需编写程序，仅通过 HTML 标记即可创建应用。
- **无需 CLI**：不再需要“黑窗口”（终端）。专用的 GUI 启动器将解决一切问题。
- **混合渲染 (Hybrid Rendering)**：使用 `file://` (CSR) 进行开发，生产环境可直接作为服务器 `https://` (SSR) 发布。
- **零配置 (Zero Configuration)**：完全不需要复杂的 `npm install` 等操作。
- **便携 (Portable)**：项目即是 HTML。可携带至任何地方并立即运行。

## 快速入门

让我们从创建一个简单的页面开始。只需 4 个步骤。

### 1. 准备

启动 `Bracify` GUI 应用，并选择一个新的工作目录。

### 2. 创建 HTML

创建一个名为 `index.html` 的文件，并写入以下内容：

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 指定数据源 -->
  <link data-t-source="info" href="/_sys/data/info.json">
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

### 3. 创建数据

创建一个名为 `/_sys/data/info.json` 的文件，并写入以下内容：

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. 运行

在 GUI 应用中点击 `Start Server` 按钮并访问 `localhost:3000`，即可看到 `Hello Bracify!`。
服务器在启动时读取 `index.html` 和 `info.json`，在内存中解析 SSI（服务端包含），并返回响应。
当您编辑并保存文件时，OS 级别的监控会立即更新内存中的模板。

---

## 开发工具 (Bracify Studio)

`Bracify` 提供专用的 GUI 工具（代号：**Bracify Studio**）以最大化开发体验。
该工具采用基于 Electron 的“启动器 (Launcher)”与使用 `Bracify` 自身构建的“管理面板 (Admin Dashboard - Web App)”的混合架构。

### 1. Bracify Launcher (桌面端)

用于启动管理面板的轻量级包装应用。

- **系统服务器 (System Server)**：应用启动时开启用于系统管理的 API 服务器。
- **启动 (Launch)**：自动在浏览器（或 Electron 窗口）中打开管理面板。

### 2. 管理面板 (Web 端)

集成所有操作的统一管理界面。

- **项目控制 (Project Control)**：
  - **打开项目 (Open Project)**：通过系统 API 打开文件夹选择对话框以加载项目。
  - **启动/停止服务器 (Start/Stop Server)**：指定端口号，启动目标项目的预览服务器。
- **数据管理器 (Data Manager)**：
  - JSON 编辑、模式 (Schema) 推断。
- **API 监视器 (API Monitor)**：
  - 查看通信日志。

---

## 项目结构 (File System Structure)

`Bracify` 项目由单一的源码文件夹组成。运行时无需物理构建目录。

### 推荐目录结构

```text
project/
├── index.html          # 入口文件
├── style.css           # 静态资源
├── img/                # 任何不以下划线开头的文件夹都是公开的
│   └── logo.png
├── _parts/             # [非公开] 引用组件
│   ├── header.html
│   └── footer.html
└── _sys/               # [非公开] 系统数据与配置
    ├── data.db         # 数据库文件
    └── data/           # 实体的 JSON 数据
        └── articles.json
```

### 渲染规范

Bracify 允许您在“SSR 模式”（作为 Web 服务器）和“CSR 模式”（在浏览器中直接运行）之间无缝切换。

#### 1. SSR 模式（服务端）
服务器根据请求动态构建 HTML。

- **内存构建**：启动或保存文件时，在**内存**中解析 `data-t-include` 并缓存合并后的 HTML 模板。
- **文件监视**：当 `index.html` 或 `_parts/` 下的文件更新时，服务器会检测 OS 级别事件并自动重构内存缓存。
- **高性能**：从内存中预先合并的模板提供响应，最大限度地减少磁盘 I/O。

#### 2. CSR 模式（客户端）
通过 `file://` 协议在浏览器中直接打开文件夹运行。

- **运行时包含**：当浏览器加载 HTML 时，利用 File System Access API 即时获取并合并 `data-t-include` 指定的文件。
- **一致性**：SSR 和 CSR 使用完全相同的绑定引擎 (`engine.js`)，确保在任何环境下结果一致。

#### 3. 页面跳转与 SPA 路由 (Unified SPA)
Bracify 在 SSR 和 CSR 模式下，**默认将所有页面跳转作为 SPA 处理**。

- **无缝体验**：通过避免完整的页面重新加载，Bracify 使用 Ajax (Fetch) 获取下一页的 HTML，并动态替换 `<body>` 等 DOM 元素。这消除了白屏（闪烁）现象，提供了快速流畅的操作感。
- **权限持久性**：对 CSR 模式至关重要。在 `file://` 环境下，页面重载会重置浏览器的文件夹访问权限。SPA 方式允许在整个会话期间保持该权限。
- **自动拦截链接**：自动检测标准 `<a>` 标签的内部链接，并将其提升为 SPA 跳转。开发者无需编写 JavaScript 即可构建 SPA 应用。
- **浏览器历史记录支持**：利用 `history.pushState` API，确保 URL 更新以及浏览器的“后退/前进”按钮在 SPA 跳转过程中仍能按预期工作。

---

## 参考文档 (Reference)

### 自定义属性

#### `data-t-include`

加载外部 HTML 文件并将其作为元素内容展开。该属性有两种运行模式：**片段插入 (Snippet Include)** 和 **布局应用 (Layout Application)**。

无论哪种模式，**编写 `data-t-include` 的标签本身不会被删除，其子元素 (innerHTML) 将被展开结果替换。**

---

##### 模式 1：片段插入 (Snippet Include)

将页眉、页脚等公共组件插入到当前位置。

- **运行方式**：将指定文件内容直接展开在标签内部。
- **示例**：

    ```html
    <header data-t-include="_parts/header.html"></header>
    ```

    ↓ `_parts/header.html` 的内容将被展开。

---

##### 模式 2：布局应用 (Layout & content)

加载公共“框架（布局）”，并将其中特定区域填充为您自身的内容。

- **运行方式**：
    1. 加载经 `data-t-include` 指定的模板文件。
    2. 将模板内的 `data-t-content` 元素与您自身内部的 `data-t-content` 元素进行匹配。
    3. 将页面端的内容注入模板端的指定位置。
- **匹配规则**：`data-t-content` 属性值（名称）一致的元素将被相互替换。若未提供名称，则视为默认插槽 (Slot)。

- **示例**：
    **模板 (`_parts/layout.html`)**:

    ```html
    <div class="container">
        <h1 data-t-content="page-title">默认标题</h1>
        <main data-t-content="main-body"></main>
    </div>
    ```

    **使用页面 (`index.html`)**:

    ```html
    <body data-t-include="_parts/layout.html">
        <span data-t-content="page-title">我的个人资料</span>
        <div data-t-content="main-body">
            <p>这里是个人资料正文。</p>
        </div>
    </body>
    ```

    ↓ **运行结果**:

    ```html
    <body>
        <div class="container">
            <h1 data-t-content="page-title">我的个人资料</h1>
            <main data-t-content="main-body">
                <div data-t-content="main-body">
                    <p>这里是个人资料正文。</p>
                </div>
            </main>
        </div>
    </body>
    ```

- **注意点**：在开发服务器运行或通过浏览器中的 File System Access API 进行合并。

#### `data-t-source`

获取要在 HTML 中展示的数据，并为该数据命名。

- **指定方法**：在 `href` 属性指定数据获取 URL，并指定任意名称。
- **数据获取 URL 规范**：
  - **推荐格式**：`_sys/data/{数据定义名称}.json` （相对路径）
    - 为确保在本地预览 (`file://`) 中也能运行，推荐省略开头的 `/`。
  - **允许格式**：`/_sys/data/{数据定义名称}.json` （绝对路径风格）
    - 在 CSR (浏览器) 环境下，开头的 `/` 会被自动忽略并作为相对路径处理。
- **数据定义名称限制**：仅允许使用 **字母、数字、下划线 `_` 和连字符 `-`**。
  - **禁止**包含 `..` 或 `/` 的路径指定（目录遍历），此类指定将不会被加载。
- **约束**：仅限在 `<link>` 标签中指定。
- **示例**：

    ```html
    <!-- OK (推荐)：相对路径 -->
    <link data-t-source="articles" href="_sys/data/article.json">

    <!-- OK：包含开头斜杠（内部作为相对路径处理） -->
    <link data-t-source="users" href="/_sys/data/user.json?status=active">

    <!-- NG：禁止目录遍历 -->
    <link data-t-source="invalid" href="_sys/data/../../conf.json">
    ```

#### 数据展示（通用占位符）

通过在 HTML 文本或属性中编写 `{数据源名称.项目名称}` 即可展示数据。

- **基本示例**：
    指定数据源及其属性进行展示。

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **嵌套数据展示**：
  使用点符号 `.` 可以访问对象内嵌套的属性。即使数据层级较深，也可以通过同样的方式进行。

  ```json
   {
    "user": {
      "name": "张三",
      "address": {
        "city": "北京"
      }
    }
  }
  ```

  ```html
  <p>用户名: {user.name}</p>
  <p>城市: {user.address.city}</p>
  ```

- **占位符转义**：
  如果希望直接显示占位符符号而不对其求值，请在开始的花括号前放置一个反斜杠 `\`。

  ```html
  <code>\{user.name\}</code> <!-- 显示结果: {user.name} -->
  ```

### 列表展示 (`data-t-list`)

若要展示多条数据，您必须在需要重复的元素上指定 `data-t-list="数据源名称"`。

```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <ul>
    <li data-t-list="articles">
      <h3>{articles.title}</h3>
    </li>
  </ul>
```

#### 在属性中嵌入数据（通用占位符）

在所有标准属性（`href`, `src`, `class`, `value`, `style` 等）中，您可以直接编写占位符 `{ }` 来嵌入数据。

- **利用示例**：

    ```html
    <img src="{article.thumbnail}" alt="{article.title}">
    <a href="/post/{article.id}" class="btn {article.category}">查看详情</a>
    <div style="background-color: {user.color}; height: {progress}%;"></div>
    ```

- **限制**：为避免与 JavaScript 语法冲突，**无法在事件句柄属性（`onclick`, `onchange` 等）中使用占位符。** 请参阅下文“避免占位符冲突”。

#### 避免占位符冲突与限制

Bracify 的占位符 `{ }` 可在 HTML 属性和文本节点中使用，但为了防止与 JavaScript 或 CSS 代码冲突，在以下位置**已禁用展开**：

- **不执行展开的位置**：
  - `<script>` 标签内部
  - `<style>` 标签内部
  - 事件句柄属性（`onclick`, `onmouseover`, `onsubmit` 等所有以 `on` 开头的属性）

##### 推荐模式：在事件句柄中使用数据

若需在事件句柄 (JavaScript) 中使用动态数据，建议**将数据嵌入 `data-` 属性，并经由 `this.dataset` 进行引用**。

```html
<!-- 不推荐（无法运行） -->
<button onclick="alert('ID: {article.id}')">显示</button>

<!-- 推荐模式 -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">显示</button>
```

通过此方法，可使 Bracify 模板引擎与浏览器标准的 JavaScript 语法安全共存。

#### 表单元素自动绑定

若在 `input`, `select`, `textarea` 属性中指定了 `name`，`Bracify` 将从合适的数据源自动绑定（展示）数值。用户无需手动指定 `value` 或占位符。

- **自动绑定的优先级**：
    1. **当前数据上下文**：从由 `data-t-scope` 等指定的数据属性中设置数值。
    2. **URL 参数 (`_sys.query`)**：若查询参数中存在与 `name` 同名的项目，则设置该数值。

- **通过 `data-t-scope` 指定数据**：
    在容器元素（`div`, `form` 等）上编写 `data-t-scope="article"`，可以指定该元素内的“默认数据源”。

- **示例（搜索表单）**：

    ```html
    <!-- 若 URL 为 ?title=Web，则自动设置 value="Web" -->
    <input type="text" name="title" placeholder="搜索文章...">
    ```

- **示例（编辑表单）**：

    ```html
    <!-- article 数据的 title, content 将自动填充至对应字段 -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article.json">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **选择框自动选中**：
    与绑定值一致的 `value` 所在的 `<option>` 元素将自动获得 `selected` 属性。

#### `data-t-if`

根据条件显示或隐藏元素。当数据值存在（`true`, 非 null, 非 0, 非空字符串）时显示元素。

- **指定方法**：指定要判定的数据项目名称。
- **示例**：

    ```html
    <!-- 仅当 user.is_login 为 true 时显示 -->
    <div data-t-if="user.is_login">
      欢迎，<span>{user.name}</span>!
    </div>
    ```

    ↓ **运行结果（`user.is_login` 为 true 时）**

    ```html
    <div>
      欢迎，<span>张三</span>!
    </div>
    ```

    ↓ **运行结果（`user.is_login` 为 false 时）**

    ```html
    <!-- 元素本身不会被输出 -->
    ```

    **提示（否定条件 / Else）**：
    通过在开头添加 `!`，可以指定“值不存在 (false)”时的条件。

    ```html
    <!-- 仅当 user.is_login 为 false 时显示 -->
    <div data-t-if="!user.is_login">
      <a href="/login.html">请登录</a>
    </div>
    ```

    **比较运算与逻辑运算 (Data API 风格)**：
    您可以使用与 Data API 查询参数相同的语法来指定更详细的条件。

    - **比较运算符**：使用与 [数据访问 API 运算符](#运算符) 相同的记法（`=`, `:ne=`, `:gt=` 等）。
    - **逻辑运算 (AND/OR)**：空格分隔表示 **AND**，值中的逗号分隔表示 **OR**。
    - **使用变量**：通过用 `{ }` 包围，可以在条件中使用数据的值。

    ```html
    <!-- 状态为已发布 (status == 'published') -->
    <span data-t-if="status=published">已发布</span>

    <!-- 价格为 1000 或以上 且 库存大于 0 -->
    <div data-t-if="price:gte=1000 stock:gt=0">
      热门商品 (有货)
    </div>

    <!-- 角色为 admin 或 editor -->
    <button data-t-if="role=admin,editor">编辑</button>

    <!-- 用户 ID 与文章作者 ID 一致 -->
    <div data-t-if="user.id={post.author_id}">
      <a href="/edit">编辑文章</a>
    </div>
    ```

#### `data-t-redirect`

指定处理（如表单提交）完成后页面跳转的目标 URL。

- **指定方法**：指定跳转目标的相对路径或绝对路径。
- **目标标签**：`form` 标签。
- **行为**：服务端处理完成后，以 302 状态码跳转至指定路径。未指定时刷新当前页面。

### 表单与数据保存 (Postback)

可以使用标准的 `<form>` 标签进行数据的创建和更新。Bracify 采用浏览器标准的 **Postback（伴随页面跳转的提交）**，而非 JavaScript 异步提交。

- **自动处理**：在 `action` 属性设置目标（如 `/_sys/data/xxxxx.json`），并使用 `method="POST"` 或 `PUT` 发送。
- **重定向 (PRG 模式)**：服务端保存后，自动跳转至 `data-t-redirect` 指定的 URL 或原页面。防止表单重复提交。
- **数据绑定（初值）**：在 `<form>` 上指定 `data-t-scope`，可将现有数据设置为输入初值。
- **输入项**：`<input>` 或 `<textarea>` 的 `name` 属性即为数据的项目名。

### 处理过滤器 (Pipes)

展示数据时，可使用处理过滤器（管道）`|`。

#### 基本语法

```html
<p>更新日期：{ article.updated_at | date: 'yyyy/mm/dd' }</p>
<span>价格：{ product.price | number } 元</span>
```

↓ **运行结果**

```html
<p>更新日期：2025/12/10</p>
<span>价格：1,500 元</span>
```

#### 过滤器语法

```text
{ 数据名.项目名 | 过滤器名: '参数' }
```

### 标准过滤器 (内置管道函数)

#### `date`

按指定格式输出日期数据。

- **语法**：`{ 项目名 | date: '格式' }`
- **格式指定**：
  - `yyyy`：4 位年份
  - `mm`：2 位月份
  - `dd`：2 位日期

#### `number`

按“三位千分位”格式输出数字。

- **语法**：`{ 字段名 | number }`

#### `json`

输出格式化后的 JSON 字符串。

- **语法**：`{ 字段名 | json }`

## 数据保存处理 (Form Handler)

Bracify 不对外提供数据 API。`/_sys` 下的所有资源都被隐藏，仅以下端点作为表单提交的句柄。

```text
POST /_sys/data/{entity}.json
```

无法从浏览器通过 `GET` 直接访问此端点（403 Forbidden）。仅可用作表单 `action`。

#### 数据操作
虽然通过 HTTP 请求进行，但响应始终是“跳转至页面”。

| 方法 | 行为 | 说明 |
| :--- | :--- | :--- |
| `POST` | 创建 | 创建新数据。 |
| `PUT` | 更新 | 使用提交的数据重写现有信息。 |
| `DELETE`| 删除 | 删除指定数据。 |

### 端点规范 (File API)

管理服务器上静态文件的 API。

```text
/_sys/file/{filename}.{ext}
```

#### 文件操作方法

| 方法 | 行为 | 说明 |
| :--- | :--- | :--- |
| `GET` | 获取 | 获取文件。 |
| `POST` | 创建 | 上传·创建文件。 |
| `PUT` | 更新 | 覆盖更新文件内容。 |
| `DELETE` | 删除 | 删除指定文件。 |

#### 参数

- **`{entity}`**：数据类型（实体）。例如：`article`, `user`
- **`{prop}`**：过滤用的属性名
- **`{val}`**：指定的值

#### 运算符

| 运算符 | 含义 | 书写示例 | 说明 |
| :--- | :--- | :--- | :--- |
| (无) | 等于 | `?status=active` | 状态为 `active` |
| `:ne` | 不等于 | `?status:ne=draft` | 状态**不等于** `draft` |
| `:gt` | 大于 | `?price:gt=1000` | 价格**高于** 1000 |
| `:gte` | 大于等于 | `?price:gte=1000` | 价格 1000 **或以上** |
| `:lt` | 小于 | `?stock:lt=10` | 库存**少于** 10 |
| `:lte` | 小于等于 | `?stock:lte=10` | 库存 10 **或以下** |

### 系统保留变量 (`_sys`)

| 变量名 | 说明 | 示例 |
| :--- | :--- | :--- |
| `_sys.query` | GET 查询参数。获取 URL 中的 `?id=123` 等数值。 | `{_sys.query.id}` |

#### 在 `data-t-source` 中利用（动态参数绑定）

| 写法 | 含义 | 示例 |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | 嵌入指定项（标准） | `?id={_sys.query.id}` |
| `{?}` | **自动绑定**。从 URL 中获取同名数值 | `?title={?}` |
| `{?xxx}` | **缩写**。等同于 `_sys.query.xxx` | `?title={?q}` |

#### 示例

```html
<!-- URL 为 ?title=Web&_limit=10 时 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">
```

### 详细数据信息（系统属性）

| 属性名 | 说明 | 示例 |
| :--- | :--- | :--- |
| `_length` | 显示列表数据件数或字符串长度。 | `{articles._length} 篇文章` |

#### 控制参数（排序·分页）

| 参数 | 说明 | 示例 |
| :--- | :--- | :--- |
| `_limit` | 最大获取件数 | `?_limit=20` |
| `_offset` | 跳过的件数（用于分页） | `?_offset=20` |
| `_sort` | 排序键名 | `?_sort=created_at` |
| `_order` | 顺序 (`asc`: 升序, `desc`: 降序) | `?_order=desc` |

#### 示例

```html
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">
```

#### 目录配置示例

```text
project/
├── index.html
├── _sys/
│   └── data/
│       ├── article.json
│       ├── user.json
│       └── product.json
└── parts/
    ├── header.html
    └── footer.html
```

### 本地开发模式 (True Zero Server Mode)

无需启动服务器，直接在浏览器中打开本地文件 (`file://`) 的模式。

#### 通过 File System Access API 实现无需构建

1. **选择项目文件夹**：初始化时弹出文件夹选择，选取后浏览器可直接操作文件。
2. **无需构建的预览**：由于浏览器直接读取 `.json` 和 `.html`，保存文件后刷新或跳转即可立即反映更改。

#### 页面跳转与 SPA 路由

如前文“[页面跳转与 SPA 路由 (Unified SPA)](#3-页面跳转与-spa-路由-unified-spa)”所述，CSR 模式下的所有跳转均由 SPA 处理。这解决了 `file://` 环境下“重载导致文件夹访问权限丢失”的核心难题。

#### 不支持环境的限制

若浏览器不支持 API 或未选择文件夹，将以限制性的“只读模拟模式”运行。

#### 筛选与控制相关（通用规范）

- **筛选限制**：仅限精确匹配，不支持 `:gt`, `:lt` 等。
- **控制参数**：`_limit`, `_offset`, `_sort`, `_order` 仍可简易运行。

#### JavaScript 行为

- **作用域隔离**：Bracify 自动使用 IIFE 包装页面脚本，防止变量冲突。
- **防止重复执行**：已加载的 `<head>` 脚本不会重复执行。
- **全局变量维持**：`window` 对象上的数据在跳转后仍维持。

## 数据库配置 (Database Configuration)

默认使用内置 SQLite (`_sys/data.db`)，可配置连接 MySQL/PostgreSQL。

### 工作原理

启动时引用项目内的 `_sys/data.db` 检查配置。连接设置存储在 `config` 表中，确保凭据不暴露在源码库。

### 默认行为

若无配置，自动使用内置 SQLite。

### 配置方法

通过 GUI 或直接向 `config` 表插入连接信息的 JSON 数组。

```json
[
  {
    "target_entity": "users",
    "engine": "mysql",
    "option": { "host": "localhost", "port": 3306, "user": "admin", "password": "${DB_PASS}", "database": "app_db" }
  }
]
```

#### 路由优先级

根据实体名按“精确匹配 > 通配符最长匹配 > 定义顺序”自动选择。

## 部署 (Deployment)

- **Serverless**：适配 Vercel, Netlify 等。
- **Zip Upload**：通过 GUI 打包为 Zip，拖拽至各服务仪表盘即可。

## 开发流程

1. 安装 GUI 应用。
2. 创建·选择文件夹。
3. 编辑 HTML/部品，实时预览。
4. 打包并发布。

## 安全性

- **自动转义**：防止 XSS。
- **安全数据注入**：防止脚本标签干扰。
- **URL 清洗**：防止恶意协议。
- **下划线保护 (仅限 SSR)**：
  作为服务器运行时，拒绝所有对根目录下以下划线 (`_`) 开头的资源（如 `data.db`, `_parts/`）的直接外部访问 (403 Forbidden)。
  * 注意：官方表单端点（如 `POST /_sys/data/*.json`）不受此限。
