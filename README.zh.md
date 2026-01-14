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

在 GUI 应用中点击 `Start Server` 按钮，工作目录中将生成一个 `_dist` 文件夹。在浏览器中打开 `_dist` 文件夹内的 `index.html`，即可看到 `Hello Bracify!`。访问 `localhost:3000` 同样可以展示该页面。
无需编写任何 JavaScript，尽情享受仅通过 HTML 展示数据的体验。

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
- **静态构建 (Static Build)**：
  - 执行静态网站生成。

---

## 项目结构 (File System Structure)

`Bracify` 项目由源码编辑文件夹（根目录）和输出文件夹（`_dist`）组成。

### 推荐目录结构

```text
project/
├── index.html          # 入口文件 (编辑对象)
├── style.css           # 静态资源
├── img/                # 图片等资产
│   └── logo.png
├── _parts/             # 引用组件 (不包含在构建结果中)
│   ├── header.html
│   └── footer.html
├── _sys/               # 系统数据与配置 (不包含在构建结果中)
│   └── data/
│       └── articles.json
└── _dist/              # [自动生成] 构建输出目录 (最终产品位于此处)
    ├── index.html
    ├── style.css
    └── img/
        └── logo.png
```

### 构建规范

当您通过 GUI 或命令行执行“构建 (Build)”时，输出将按照以下规则生成在 `_dist` 文件夹中：

1. **HTML 文件处理**：
    - 根目录下的 `.html` 文件将在解析 `data-t-include`（合并组件）后输出到 `_dist`。
2. **拷贝静态资源**：
    - 图片、CSS、JS 文件等将原样拷贝到 `_dist`。
3. **排除规则**：
    - 以下划线 `_` 开头的文件或目录（如 `_parts`, `_sys`）被视为构建专用或系统管理专用，**不会被拷贝到 `_dist`**。
4. **系统数据转换 (`_sys/data`)**：
    - `_sys/data` 文件夹内的 `.json` 文件将自动转换为 CSR 专用的 `.js` (Mock 格式) 并输出到 `_dist/_sys/data`。
    - **注意**：即使源码文件夹内存在同名的 `.js` 文件，也会被**忽略**。为防止冲突，数据的原始版本应为 `.json`。
    - 即使不使用 `data-t-include`，为了在 CSR 中展示数据，也需要执行此转换（构建）处理。

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

- **注意点**：在开发服务器运行或构建处理时在服务端进行合并。无法在浏览器直接预览（`file://`）时运行。

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

#### 数据展示（通用占位符 Universal Placeholder）

通过在 HTML 文本或属性值中编写 `{数据源名称.项目名称}` 即可展示数据。

- **基本示例**：
    指定数据源及其属性（项目名称）进行展示。

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **嵌套数据展示**：
  使用点符号 `.` 可以访问对象内嵌套的属性。即使数据层级较深，也可以通过同样的方式进行描述。

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
  如果希望直接显示占位符符号而不对其进行求值，请在开始的大括号前放置一个反斜杠 `\`。

  ```html
  <code>\{user.name\}</code> <!-- 显示结果: {user.name} -->
  ```

- **展示多条数据 (`data-t-list`)**：
    若要展示多条数据，您必须在需要重复的范围（元素）上指定 `data-t-list="数据源名称"`。

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

- **限制**：为避免与 JavaScript 语法冲突，**无法在事件句柄属性（`onclick`, `onchange` 等）中使用占位符。** 请参阅后文“避免占位符冲突”。

#### 避免占位符冲突与限制

Bracify 的占位符 `{ }` 可在 HTML 属性和文本节点中使用，但为了防止与 JavaScript 或 CSS 代码（使用花括号的语法）冲突，在以下位置**已禁用展开**：

- **不执行展开的位置**：
  - `<script>` 标签内部
  - `<style>` 标签内部
  - 事件句柄属性（`onclick`, `onmouseover`, `onsubmit` 等所有以 `on` 开头的属性）

##### 推荐模式：在事件句柄中使用数据

若需在事件句柄 (JavaScript) 中使用动态数据，建议不直接编写 `{ }`，而是**将数据嵌入 `data-` 属性，并经由 `this.dataset` 进行引用**。

```html
<!-- 不推荐（无法运行） -->
<button onclick="alert('ID: {article.id}')">显示</button>

<!-- 推荐模式 -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">显示</button>
```

通过此方法，可使 Bracify 模板引擎与浏览器标准的 JavaScript 语法安全共存。

#### 表单元素自动绑定 (Automatic Binding)

若在 `input`, `select`, `textarea` 元素中指定了 `name` 属性，`Bracify` 将从合适的数据源自动绑定（展示）数值。用户无需手动指定 `value` 或占位符。

- **自动绑定的优先级**：
    1. **当前数据上下文**：从由 `data-t-scope` 等指定的数据属性中设置数值。
    2. **URL 参数 (`_sys.query`)**：若页面 URL 的查询参数中存在与 `name` 同名的项目，则设置该数值。

- **通过 `data-t-scope` 指定数据**：
    通过在容器元素（`div`, `form` 等）上编写 `data-t-scope="article"`，可以指定该元素内的“默认数据源”。由此，内部的 `name="title"` 将自动引用 `article.title`。

- **示例（搜索表单）**：

    ```html
    <!-- 若 URL 为 ?title=Web，则自动设置 value="Web" -->
    <input type="text" name="title" placeholder="搜索文章...">
    ```

- **示例（编辑表单）**：

    ```html
    <!-- article 数据的 title, content 将自动设置到各对应字段 -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **选择框自动选中**：
    与绑定到 `<select>` 标签的值一致的 `value` 所在的 `<option>` 元素将自动获得 `selected` 属性。

#### `data-t-if`

根据条件显示或隐藏元素。当数据值存在（`true`, 非 null, 非 0, 非空字符串）时显示元素。

- **指定方法**：指定要判定的数据项目名称。
- **示例**：

    ```html
    <!-- 仅当 user.is_login 为 true 时显示 -->
    <div data-t-if="user.is_login">
      欢迎，<span>{user.name}</span>
    </div>
    ```

    ↓ **运行结果（`user.is_login` 为 true 时）**

    ```html
    <div>
      欢迎，<span>张三</span>
    </div>
    ```

    ↓ **运行结果（`user.is_login` 为 false 时）**

    ```html
    <!-- 元素本身不会被输出 -->
    ```

    **提示（否定条件 / Else）**：
    通过在开头添加 `!`，可以指定“值不存在 (false)”时的条件。可作为 `else` 的替代方案。

    ```html
    <!-- 仅当 user.is_login 为 false 时显示 -->
    <div data-t-if="!user.is_login">
      <a href="/login.html">请登录</a>
    </div>
    ```

#### `data-t-redirect`

指定处理（如表单提交）正常完成后页面跳转的目标 URL。

- **指定方法**：指定跳转目标的相对路径或绝对路径。
- **目标标签**：主要为 `form` 标签（未来计划扩展至按钮等）。
- **示例**：

    ```html
    <!-- 提交完成后返回首页 -->
    <form method="POST" action="/_sys/data/contact" data-t-redirect="/">
    ```

### 表单与数据保存

可使用标准的 `<form>` 标签向 API 发送数据（创建·更新）。

- **自动 API 发送**：在 `action` 属性设置 API URL，并在 `method` 属性设置 `POST` 或 `PUT`，数据将自动以 JSON 格式发送。
- **页面跳转**：通过 `data-t-redirect` 属性，可以指定保存完成后的目标跳转页面（相对路径）。若未指定，则刷新当前页面。
- **数据绑定（初始值）**：通过在 `<form>` 标签中指定 `data-t-scope`，可以将现有数据设置为输入栏的初始值（常用于编辑页面等）。
- **输入项目**：`<input>` 或 `<textarea>` 的 `name` 属性即为数据的项目名（属性名）。

#### 示例：文章编辑（更新）表单

```html
<!-- 在整个表单中绑定 article 数据（设置初始值） -->
<!-- 使用 PUT 方法发送至 action 指定的 API -->
<!-- 保存完成后返回列表页 (../list.html) -->
<form method="PUT" action="/_sys/data/article" data-t-scope="article" data-t-redirect="../list.html">

  <label>标题</label>
  <input type="text" name="title"> <!-- 将填入 article.title 的值 -->

  <label>正文</label>
  <textarea name="content"></textarea> <!-- 将填入 article.content 的值 -->

  <button>保存</button>
</form>
```

### 加工过滤器 (Pipes)

展示数据时，可使用加工过滤器（正式名称：管道）`|`。

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

#### 过滤器语法（管道语法）

```text
{ 数据名.项目名 | 过滤器名: '参数' }
```

### 标准过滤器 (内置管道函数)

#### `date`

按指定格式将日期数据（日期型）作为字符输出。

- **写法**：`{ 项目名 | date: '格式' }`
- **格式指定**：
  - `yyyy`：4 位年份
  - `mm`：2 位月份
  - `dd`：2 位日期

#### `number`

将数字输出为“三位逗号分隔”格式。

- **语法**: `{ 字段名 | number }`

#### `json`

将数据输出为格式化后的 JSON 字符串。在调试或希望直接在 JavaScript 中使用数据时非常有用。

- **语法**: `{ 字段名 | json }`

## 数据访问 API

### 端点规范 (Data API)

对于服务器上的数据（JSON 文件等），不仅可以引用，还可以进行更新·删除。

```text
/_sys/data/{entity}.json?{prop}={val}
```

#### 数据操作方法

| 方法 | 动作 | 说明 |
| :--- | :--- | :--- |
| `GET` | 获取 | 根据条件获取数据。 |
| `POST` | 创建 | 创建新数据。 |
| `PUT` | 更新 | 根据条件使用指定值重写数据。 |
| `DELETE` | 删除 | 删除符合条件的对应数据。 |

### 端点规范 (File API)

用于管理服务器上静态文件（图片等）的 API。

```text
/_sys/file/{filename}.{ext}
```

#### 文件操作方法

| 方法 | 动作 | 说明 |
| :--- | :--- | :--- |
| `GET` | 获取 | 获取文件。 |
| `POST` | 创建 | 重新上传·创建文件。 |
| `PUT` | 更新 | 覆盖更新指定文件内容。 |
| `DELETE` | 删除 | 删除指定文件。 |

#### 参数

- **`{entity}`**：数据类型（正式名称：实体）。例：`article` (文章), `user` (用户)
- **`{prop}`**：用于过滤条件的属性名称（正式名称：属性）
- **`{val}`**：条件中指定的值

#### 运算符

通过在项目名称后添加符号（运算符），可以指定更详细的条件。

| 运算符 | 含义 | 书写示例 | 示例说明 |
| :--- | :--- | :--- | :--- |
| (无) | 等于 | `?status=active` | 状态为 `active` 的数据 |
| `:ne` | 不等于 | `?status:ne=draft` | 状态**不等于** `draft` 的数据 |
| `:gt` | 大于 | `?price:gt=1000` | 价格**高于** 1000 元的数据 (1001元〜) |
| `:gte` | 大于等于 | `?price:gte=1000` | 价格在 1000 元**或以上**的数据 (1000元〜) |
| `:lt` | 小于 | `?stock:lt=10` | 库存**少于** 10 个的数据 (〜9个) |
| `:lte` | 小于等于 | `?stock:lte=10` | 库存**不大于** 10 个的数据 (〜10个) |

### 系统保留变量 (`_sys`)

为获取整个应用程序的上下文或浏览器的请求信息，提供了名为 `_sys` 的保留变量。

| 变量名 | 说明 | 书写示例 |
| :--- | :--- | :--- |
| `_sys.query` | GET 查询参数。获取 URL 中 `?id=123` 等数值。 | `{_sys.query.id}` |

#### 在 `data-t-source` 中的利用（动态参数绑定）

在 `data-t-source` 的 `href` 属性内，可使用占位符 `{ }` 动态嵌入查询参数。此外，还可使用专门针对 URL 参数的缩写形式 `{?}`。

| 写法 | 含义 | 书写示例 |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | 嵌入指定项目（标准形式） | `?id={_sys.query.id}` |
| `{?}` | **自动绑定**。从 URL 中获取与左侧键名一致的数值 | `?title={?}` |
| `{?xxx}` | **缩写形式**。等同于 `_sys.query.xxx` | `?title={?q}` |

#### 数据源中的写作示例

```html
<!-- URL 为 ?title=Web&_limit=10 时 -->

<!-- 1. 自动绑定：最适合键名与 URL 参数名一致的情况 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. 缩写形式：URL 参数名（例: q）与 API 键名（例: title）不一致时 -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. 标准形式：需要更显式的描述时 -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

### 数据详细信息（系统属性）

除了包含在数据本身的值（如标题或 ID）外，有时还需了解数据的“件数”或“状态”。
在 `Bracify` 中，通过在数据名后添加以下划线 `_` 开头的名称，即可获取这些特殊信息。

| 属性名 | 说明 | 书写示例 |
| :--- | :--- | :--- |
| `_length` | 显示列表（数组）包含的数据件数，或字符串的长度。 | `{articles._length} 篇文章` |

#### 控制参数（排序·分页）

通过使用以下划线 `_` 开头的保留参数，可以控制获取数据的件数或排序。这可防止与普通数据项目（例：名为 `limit` 的列）冲突。

| 参数 | 说明 | 书写示例 |
| :--- | :--- | :--- |
| `_limit` | 获取的最大件数 | `?_limit=20` |
| `_offset` | 跳过的件数（用于分页） | `?_offset=20` (从第21件开始获取) |
| `_sort` | 用于排序的键项目名称 | `?_sort=created_at` |
| `_order` | 排序顺序 (`asc`: 升序, `desc`: 降序) | `?_order=desc` (默认 `asc`) |

#### 控制参数使用示例

```html
<!-- 利用 URL 参数进行搜索/排序的示例 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- 分类固定，仅通过参数指定页面 -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">
```

#### 本地目录构成示例

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

**JSON 文件示例** (`_sys/data/article.json`):

```json
[
  {
    "id": 1,
    "title": "文章标题1",
    "summary": "文章摘要...",
    "published_at": "2025-12-01T10:00:00Z"
  },
  {
    "id": 2,
    "title": "文章标题2",
    "summary": "文章摘要...",
    "published_at": "2025-12-05T15:30:00Z"
  }
]
```

### 本地开发模式 (True Zero Server Mode)

无需启动服务器，直接在浏览器中以本地文件 (`file://`) 形式打开 `index.html` 进行开发的模式。

#### 通过 File System Access API 实现无需构建的开发

通过利用现代浏览器（Chrome, Edge 等）提供的 **File System Access API**，以往需要的“将 JSON 文件转换为 JS 文件的构建过程”变得不再必要。

1. **选择项目文件夹**: 通过 `file://` 打开页面时，初始化过程中会弹出文件夹选择提示。选择项目的根目录后，浏览器即可直接获取和操作文件。
2. **无需构建的预览**: 由于浏览器直接读取 `_sys/data/*.json` 和 `_parts/*.html`，只要编辑并保存文件后刷新浏览器（或跳转），更改就会立即反映出来。

#### 页面跳转与 SPA 路由

在 `file://` 环境下，浏览器刷新会重置文件夹访问权限，因此 Bracify 将所有跳转都作为 SPA（单页应用）处理。

- **自动拦截链接**: `<a>` 标签的内部跳转会被自动检测，在不刷新页面的情况下仅替换 DOM 进行跳转（Full DOM Replacement）。
- **JavaScript 跳转 API**: 如果通过脚本进行编程式跳转，请使用 `Bracify.navigate('/path/to/page.html')` 代替 `location.href`。
- **浏览器历史记录**: 支持浏览器的“后退”和“前进”按钮，能够在不刷新的情况下在历史状态间切换。

#### 不支持浏览器的限制

如果浏览器不支持 File System Access API，或者未进行文件夹选择，则会以限制性的“只读模拟模式”运行：

- **筛选功能限制**: 仅支持精确匹配。不支持 `:gt` 或 `:lt` 等操作符。
- **不可更新**: 不执行通过表单提交的数据保存。
- **部分显示**: 加载外部文件 (`data-t-include`) 可能会受到限制。

#### 关于数据筛选与控制（通用规范）

在本地开发模式（True Zero Server / 模拟模式通用）下，为了在浏览器内进行简易的数据处理，存在以下限制和规范：

- **筛选功能限制**:
  - **仅限精确匹配**: 仅当指定的键和值完全匹配时才返回数据。
  - **忽略空值**: 如果筛选参数值为空字符串 (`?name=`)，则忽略该筛选条件本身（展示所有记录）。
  - **不支持高级操作符**: `:gt` 或 `:lt` 等操作符无法工作，会被忽略或无法按预期运行。

- **支持的控制参数**:
  以下参数在本地环境下也可以简易运行：
  - `_limit`: 限制显示条数
  - `_offset`: 跳过数据条数
  - `_sort`: 排序字段
  - `_order`: `asc` (升序) 或 `desc` (降顺)

#### SPA 模式下的 JavaScript 行为

在本地开发模式 (True Zero Server Mode) 下，在不刷新页面的情况下跳转时，JavaScript 的执行遵循以下规则：

- **作用域隔离 (IIFE 包装)**: 为了防止与前一个页面的变量声明 (`const`, `let`) 冲突，页面特有的脚本（`<body>` 内以及新加载的 `<head>` 内脚本）会被 Bracify 自动包装在立即执行函数 (IIFE) 中运行。
- **防止重复执行**: 在 `<head>` 中编写的脚本中，已经加载过的脚本（如 `engine.js` 或公共库等）不会在跳转目标页面重复执行。
- **全局变量维持**: 明确挂载在 `window` 对象上的数据，以及在 IIFE 之外定义的 `var` 变量在跳转后仍会维持。
- **事件监听器**: 直接添加到 `window` 或 `document` 的事件监听器在跳转时不会自动清除。建议尽可能针对 `<body>` 内的元素设置页面特有的事件，或采用考虑了跳转的设计。

## 数据库配置 (Database Configuration)

Bracify 默认使用内置的 SQLite (`_sys/data.db`)，但您可以通过配置连接设置来连接到外部数据库，如 MySQL 或 PostgreSQL。

### 工作原理

在启动时，Bracify 始终会引用项目内的 `_sys/data.db` (SQLite) 来检查系统配置。数据库连接和路由设置存储在该文件内的 `config` 表中。

这消除了以文本文件形式管理或提交敏感信息（如凭据）的需求，通过将这些信息排除在代码库之外来确保安全操作。

### 默认行为（无配置）

如果 `config` 表不存在或没有针对特定实体的配置，**将自动使用内置的 SQLite (`_sys/data.db`)。** 对于简单项目，不需要进行任何配置。

### 如何配置

您可以通过图形界面 (Bracify Studio) 或直接按照以下格式向数据库的 `config` 表插入值来进行配置：

- **目标表**: `config`
- **列**: `name` = 'db', `value` = (下面的连接信息 JSON 数组)

**连接信息格式 (JSON):**

```json
[
  {
    "target_entity": "users",
    "engine": "mysql",
    "option": { "host": "localhost", "port": 3306, "user": "admin", "password": "${DB_PASS}", "database": "app_db" }
  },
  {
    "target_entity": "logs_*",
    "engine": "mongodb",
    "option": { "url": "mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017" }
  },
  {
    "target_entity": "*",
    "engine": "postgresql",
    "option": { "host": "db.example.com", "port": 5432, "database": "shared_db" }
  }
]
```

#### 路由优先级 (target_entity)

连接目标将根据实体名称按照以下规则自动选择：

1. **完全匹配**: 与名称完全匹配的设置优先级最高。
2. **模式匹配**: 对于包含通配符 `*` 的设置，优先考虑“固定部分（字符）最长”的设置（例如，`data_*` 优先于 `*`）。
3. **定义顺序**: 如果有多个模式匹配且固定部分长度相同，则优先考虑 **JSON 数组中定义靠前**的设置。
4. **内置 SQLite**: 如果以上规则均不匹配，则作为备用选项。

- **engine**: `sqlite`, `mysql`, `postgresql`, `mongodb` 等（逐步实现）。
- **option**: 驱动程序特定的连接设置。支持使用 `${ENV_VAR}` 格式的环境变量。

## 部署 (Deployment)

- **Serverless**：计划支持部署至 Vercel 或 Netlify。
- **Zip Upload**：通过 GUI 应用将项目打包为 Zip，仅需拖拽至各服务的仪表盘即可完成部署。

## 开发流程

1. 从官方网站下载并安装 `Bracify` GUI 应用。
2. 启动应用，并创建·选择工作文件夹。
3. 编辑 `index.html`, `_parts/header.html` 等。GUI 应用将提供实时预览。
4. 完成后打包为 Zip 并发布。

## 安全性

Bracify 内置了多项保护功能，以支持安全的前端开发。

- **自动转义**：通过 `{placeholder}` 展开的数据会自动进行 HTML 转义（作为纯文本处理），从而防止 XSS（跨站脚本攻击）。
- **安全数据注入**：在 SSR 或构建过程中将数据注入 HTML 时，会自动进行转义以防止脚本标签干扰（例如 `</script>` 造成的截断）。
- **URL 清洗**：在 `href` 或 `src` 属性中嵌入数据时，如果检测到 `javascript:` 等危险协议，会自动将其停用，以防止非预期的脚本执行。
