[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **HTML만으로 만드는 웹 프레임워크. CLI 없이, 마크업만으로.**

Bracify는 HTML 마크업만으로 웹 애플리케이션을 구축할 수 있는 프레임워크입니다.
프로그래밍이나 복잡한 환경 구축의 장벽을 제로로 만드는 것을 목표로 하는 'HTML-first' 개발 경험을 제공합니다.

## Bracify란?

Bracify는 '마크업만으로 앱을 만들 수 있다'는 심플함을 추구합니다.

- **React/Vue에 지친 엔지니어에게**: 복잡한 빌드 설정이나 무거운 프레임워크 학습에서 해방됩니다.
- **마크업 엔지니어에게**: 프로그래밍 지식 없이도, 여러분의 HTML 기술만으로 데이터 연동부터 배포까지 풀 기능 웹 앱을 만들 수 있습니다.

## Demo

![Demo Animation](./demo.gif)

## Key Concepts (주요 컨셉)

- **HTML Markup Only**: 프로그램을 작성하지 않고, HTML 마크업만으로 앱을 제작합니다.
- **No CLI Required**: 검은 화면(터미널)은 필요 없습니다. 전용 GUI 런처가 모든 것을 해결합니다.
- **Hybrid Rendering**: `file://` (CSR) 모드로 개발하고, 운영 환경에서는 그대로 서버 `https://` (SSR)로 공개 가능합니다.
- **Zero Configuration**: 복잡한 `npm install` 등의 과정이 전혀 필요 없습니다.
- **Portable**: 프로젝트는 평범한 HTML 파일입니다. 어디든 가지고 다니며 즉시 실행할 수 있습니다.

## Quick Start (빠른 시작)

간단한 페이지 작성부터 시작해 봅시다. 단 4단계면 충분합니다.

### 1. 준비

`Bracify` GUI 앱을 실행하고 새 작업 폴더를 선택합니다.

### 2. HTML 작성

`index.html` 파일을 생성하고 다음 내용을 작성합니다.

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 데이터 소스 지정 -->
  <link data-t-source="info" href="/_sys/data/info.json">
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

### 3. 데이터 작성

`/_sys/data/info.json` 파일을 생성하고 다음 내용을 작성합니다.

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. 실행

GUI 앱에서 `Start Server` 버튼을 누르면 작업 폴더에 `_dist` 폴더가 생성됩니다. `_dist` 폴더 안의 `index.html`을 브라우저로 열면 `Hello Bracify!`가 표시됩니다. `localhost:3000` 접속 시에도 동일하게 표시됩니다.
JavaScript를 작성하지 않고 HTML만으로 데이터가 표시되는 경험을 즐겨보세요.

---

## Development Tools (Bracify Studio)

`Bracify`는 개발자 경험을 극대화하기 위해 전용 GUI 도구(코드네임: **Bracify Studio**)를 제공합니다.
이 도구는 Electron 기반의 '런처'와 `Bracify` 자체로 구축된 '관리 대시보드(웹 앱)'의 하이브리드 구성으로 작동합니다.

### 1. Bracify Launcher (Desktop)

관리 대시보드를 실행하기 위한 가벼운 래퍼 애플리케이션입니다.

- **System Server**: 앱 실행 시 시스템 관리용 API 서버를 시작합니다.
- **Launch**: 자동으로 브라우저(또는 Electron 창)에서 관리 대시보드를 엽니다.

### 2. Admin Dashboard (Web)

모든 조작을 집약한 통합 관리 화면입니다.

- **Project Control**:
  - **Open Project**: 시스템 API를 통해 폴더 선택 창을 열고 프로젝트를 로드합니다.
  - **Start/Stop Server**: 포트 번호를 지정하여 대상 프로젝트의 프리뷰 서버를 실행합니다.
- **Data Manager**:
  - JSON 편집 및 스키마 추정 기능.
- **API Monitor**:
  - 통신 로그 확인.
- **Static Build**:
  - 정적 파일 빌드 실행.

---

## 프로젝트 구성 (File System Structure)

`Bracify` 프로젝트는 소스 편집용 폴더(루트)와 출력용 폴더(`_dist`)로 구성됩니다.

### 권장 디렉토리 구조

```text
project/
├── index.html          # 엔트리 포인트 (편집 대상)
├── style.css           # 정적 리소스
├── img/                # 이미지 등 에셋
│   └── logo.png
├── _parts/             # 인클루드용 부품 (빌드 결과물에는 포함되지 않음)
│   ├── header.html
│   └── footer.html
├── _sys/               # 시스템 데이터 및 설정 (빌드 결과물에는 포함되지 않음)
│   └── data/
│       └── articles.json
└── _dist/              # [자동 생성] 빌드 결과물 경로 (완성된 결과물이 이곳에 저장됨)
    ├── index.html
    ├── style.css
    └── img/
        └── logo.png
```

### 빌드 사양

GUI 또는 명령줄에서 '빌드'를 실행하면 다음 규칙에 따라 `_dist` 폴더에 출력됩니다.

1. **HTML 파일 처리**:
    - 루트 디렉토리에 있는 `.html` 파일은 `data-t-include`를 해결(부품 결합)한 상태로 `_dist`에 출력됩니다.
2. **정적 리소스 복사**:
    - 이미지, CSS, JS 파일 등은 그대로 `_dist`에 복사됩니다.
3. **제외 규칙**:
    - 언더스코어 `_`로 시작하는 파일이나 디렉토리(`_parts`, `_sys` 등)는 빌드 전용 또는 시스템 관리용으로 간주되어 **`_dist`에 복사되지 않습니다.**
4. **시스템 데이터(`_sys/data`) 변환**:
    - `_sys/data` 폴더 안의 `.json` 파일은 CSR 전용인 `.js` (Mock 형식)로 자동 변환되어 `_dist/_sys/data`에 출력됩니다.
    - **주의**: 소스 폴더 내에 동일한 이름의 `.js` 파일이 있어도 **무시됩니다.** 데이터 원본은 `.json`이며 충돌을 방지합니다.
    - `data-t-include`를 사용하지 않더라도 CSR에서 데이터를 표시하려면 이 변환 과정(빌드)이 필요합니다.

---

## 도움말 (Reference)

### 커스텀 속성

#### `data-t-include`

외부 HTML 파일을 불러와 요소의 내용으로 전개합니다. 이 속성에는 **스니펫 삽입**과 **레이아웃 적용**이라는 두 가지 동작 모드가 있습니다.

두 모드 모두 **`data-t-include`를 작성한 태그 자체는 삭제되지 않으며, 그 자식 요소(innerHTML)가 전개 결과에 의해 치환됩니다.**

---

##### 모드 1: 스니펫 삽입 (Snippet Include)

헤더나 푸터 등 공통 부품을 현재 위치에 끼워 넣습니다.

- **동작**: 지정한 파일의 내용을 태그 내부에 그대로 전개합니다.
- **예시**:

    ```html
    <header data-t-include="_parts/header.html"></header>
    ```

    ↓ `_parts/header.html`의 내용이 전개됩니다.

---

##### 모드 2: 레이아웃 적용 (Layout & content)

공통된 '틀(레이아웃)'을 불러오고, 그 안의 특정 영역을 자신의 콘텐츠로 채웁니다.

- **동작**:
    1. `data-t-include`로 지정한 템플릿 파일을 읽어옵니다.
    2. 템플릿 내부의 `data-t-content` 요소와 자기 자신 내부의 `data-t-content` 요소를 매칭합니다.
    3. 템플릿 측의 지정된 위치에 페이지 측 콘텐츠를 흘려 넣습니다.
- **매칭 규칙**: `data-t-content` 속성값(이름)이 일치하는 요소끼리 치환 대상이 됩니다. 이름이 없는 경우 기본 슬롯(Slot)으로 취급됩니다.

- **예시**:
    **템플릿 (`_parts/layout.html`)**:

    ```html
    <div class="container">
        <h1 data-t-content="page-title">기본 제목</h1>
        <main data-t-content="main-body"></main>
    </div>
    ```

    **사용 페이지 (`index.html`)**:

    ```html
    <body data-t-include="_parts/layout.html">
        <span data-t-content="page-title">내 프로필</span>
        <div data-t-content="main-body">
            <p>프로필 본문 내용이 들어갑니다.</p>
        </div>
    </body>
    ```

    ↓ **실행 결과**:

    ```html
    <body>
        <div class="container">
            <h1 data-t-content="page-title">내 프로필</h1>
            <main data-t-content="main-body">
                <div data-t-content="main-body">
                    <p>프로필 본문 내용이 들어갑니다.</p>
                </div>
            </main>
        </div>
    </body>
    ```

- **주의사항**: 개발 서버 또는 빌드 시 서버 측에서 결합됩니다. 브라우저에서 직접 열기(`file://`) 모드에서는 작동하지 않습니다.

#### `data-t-source`

HTML에 출력할 데이터를 가져와서 해당 데이터에 이름을 붙입니다.

- **지정 방법**: `href` 속성으로 데이터 취득 URL을 지정하고, 임의의 이름을 붙입니다.
- **데이터 취득 URL 사양**:
  - **권장 형식**: `_sys/data/{데이터 정의 명칭}.json` (상대 경로)
    - 로컬 프리뷰 (`file://`)에서도 작동하도록 맨 앞의 `/`를 생략하는 이 형식을 권장합니다.
  - **허용 형식**: `/_sys/data/{데이터 정의 명칭}.json` (절대 경로 스타일)
    - CSR (브라우저) 환경에서는 자동으로 맨 앞의 `/`가 무시되어 상대 경로로 처리됩니다.
- **데이터 정의 명칭 제약**: **영문자, 숫자, 언더스코어 `_`, 하이픈 `-` 만** 사용할 수 있습니다.
  - `..` 나 `/` 를 포함하는 경로 지정(디렉토리 트래버설)은 **금지**되어 있으며 로드되지 않습니다.
- **제약**: `<link>` 태그에만 지정 가능
- **예시**:

    ```html
    <!-- OK (권장): 상대 경로 -->
    <link data-t-source="articles" href="_sys/data/article.json">

    <!-- OK: 맨 앞 슬래시 포함 (내부적으로 상대 경로로 처리됨) -->
    <link data-t-source="users" href="/_sys/data/user.json?status=active">

    <!-- NG: 디렉토리 트래버설 금지 -->
    <link data-t-source="invalid" href="_sys/data/../../conf.json">
    ```

#### 데이터 표시 (유니버설 플레이스홀더)

HTML 텍스트나 속성값에 `{데이터소스명.항목명}`이라고 작성하여 데이터를 표시할 수 있습니다.

- **기본 예시**:
    데이터 소스와 프로퍼티(항목명)를 지정하여 표시합니다.

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **여러 건을 표시할 경우 (`data-t-list`)**:
    표시할 데이터가 여러 건일 경우, 반복하고자 하는 범위(요소)에 `data-t-list="데이터 소스명"`을 지정해야 합니다.

    ```html
    <link data-t-source="articles" href="/_sys/data/articles.json">
    <ul>
      <li data-t-list="articles">
        <h3>{articles.title}</h3>
      </li>
    </ul>
    ```

#### 속성에 데이터 삽입 (유니버설 플레이스홀더)

모든 표준 속성(`href`, `src`, `class`, `value`, `style` 등)에서 플레이스홀더 `{ }`를 직접 작성하여 데이터를 삽입할 수 있습니다.

- **사용 예시**:

    ```html
    <img src="{article.thumbnail}" alt="{article.title}">
    <a href="/post/{article.id}" class="btn {article.category}">자세히 보기</a>
    <div style="background-color: {user.color}; height: {progress}%;"></div>
    ```

- **제한**: JavaScript 구문과의 간섭을 피하기 위해 **이벤트 핸들러 속성(`onclick`, `onchange` 등) 내부에서는 플레이스홀더를 사용할 수 없습니다.** 자세한 내용은 아래 '플레이스홀더 간섭 방지'를 참조하십시오.

#### 플레이스홀더 간섭 방지 및 제한

Bracify의 플레이스홀더 `{ }`는 HTML 속성이나 텍스트 노드에서 사용할 수 있지만, JavaScript나 CSS 코드({ }를 사용하는 구문)와의 충돌을 방지하기 위해 다음 장소에서는 **전개가 비활성화**됩니다.

- **전개되지 않는 장소**:
  - `<script>` 태그 내부
  - `<style>` 태그 내부
  - 이벤트 핸들러 속성 (`onclick`, `onmouseover`, `onsubmit` 등 `on`으로 시작하는 모든 속성)

##### 권장 패턴: 이벤트 핸들러 내부에서 데이터 사용하기

이벤트 핸들러(JavaScript) 내부에서 동적인 데이터를 사용하고 싶은 경우 직접 `{ }`를 작성하지 않고, **`data-` 속성에 데이터를 넣은 후 `this.dataset`을 통해 참조**하는 패턴을 권장합니다.

```html
<!-- 비권장 (작동하지 않음) -->
<button onclick="alert('ID: {article.id}')">보기</button>

<!-- 권장 패턴 -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">보기</button>
```

이 방법을 사용하면 Bracify 템플릿 엔진과 브라우저 표준 JavaScript 구문을 안전하게 공존시킬 수 있습니다.

#### 폼 요소 자동 바인딩

`input`, `select`, `textarea` 요소에 `name` 속성이 지정된 경우 `Bracify`는 적절한 데이터 소스에서 값을 자동으로 바인딩(표시)합니다. 사용자가 수동으로 `value`나 플레이스홀더를 지정할 필요가 없습니다.

- **자동 바인딩 우선순위**:
    1. **현재 데이터 컨텍스트**: `data-t-scope` 등으로 지정된 데이터 프로퍼티에서 값을 설정합니다.
    2. **URL 파라미터 (`_sys.query`)**: 페이지 URL 쿼리 파라미터에 `name`과 같은 이름의 항목이 있으면 해당 값을 설정합니다.

- **`data-t-scope`를 이용한 데이터 지정**:
    컨테이너 요소(`div`, `form` 등)에 `data-t-scope="article"`과 같이 작성하면 해당 요소 내의 '기본 데이터 소스'를 지정할 수 있습니다. 이로 인해 내부의 `name="title"`은 자동으로 `article.title`을 참조하게 됩니다.

- **예시 (검색 폼)**:

    ```html
    <!-- URL이 ?title=Web인 경우 자동으로 value="Web"이 세팅됩니다 -->
    <input type="text" name="title" placeholder="기사 검색...">
    ```

- **예시 (편집 폼)**:

    ```html
    <!-- article 데이터의 title, content가 자동으로 각 필드에 세팅됩니다 -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **셀렉트 박스 자동 선택**:
    `<select>` 태그에 바인딩된 값과 일치하는 `value`를 가진 `<option>` 요소에는 자동으로 `selected` 속성이 부여됩니다.

#### `data-t-if`

조건에 따라 요소를 표시하거나 숨깁니다. 데이터 값이 존재할 경우(`true`, non-null, 0이 아님, 빈 문자열 아님) 요소를 표시합니다.

- **지정 방법**: 판정할 데이터 항목명 지정
- **예시**:

    ```html
    <!-- user.is_login이 true인 경우만 표시 -->
    <div data-t-if="user.is_login">
      어서 오세요, <span>{user.name}</span>님
    </div>
    ```

    ↓ **실행 결과 (`user.is_login`이 true인 경우)**

    ```html
    <div>
      어서 오세요, <span>홍길동</span>님
    </div>
    ```

    ↓ **실행 결과 (`user.is_login`이 false인 경우)**

    ```html
    <!-- 요소 자체가 출력되지 않습니다 -->
    ```

    **참고 (부정 조건 / Else)**:
    앞에 `!`를 붙여 '값이 존재하지 않을(false)' 조건을 지정할 수 있습니다. `else` 대용으로 사용하십시오.

    ```html
    <!-- user.is_login이 false인 경우만 표시 -->
    <div data-t-if="!user.is_login">
      <a href="/login.html">로그인해 주세요</a>
    </div>
    ```

#### `data-t-redirect`

처리(폼 전송 등)가 정상적으로 완료된 후의 페이지 이동 URL을 지정합니다.

- **지정 방법**: 이동할 대상의 상대 경로 또는 절대 경로 지정
- **대상 태그**: 주로 `form` 태그 (향후 버튼 등으로 확장 예정)
- **예시**:

    ```html
    <!-- 전송 완료 후 메인 페이지로 이동 -->
    <form method="POST" action="/_sys/data/contact" data-t-redirect="/">
    ```

### 폼과 데이터 저장

표준 `<form>` 태그를 사용하여 API로의 데이터 전송(생성 및 업데이트)이 가능합니다.

- **자동 API 전송**: `action` 속성에 API URL, `method` 속성에 `POST` 또는 `PUT`을 지정하면 자동으로 JSON 형식으로 데이터가 전송됩니다.
- **페이지 이동**: `data-t-redirect` 속성으로 저장 완료 후 이동할 페이지(상대 경로)를 지정할 수 있습니다. 지정하지 않으면 현재 페이지를 새로고침합니다.
- **데이터 바인딩(초기값)**: `<form>` 태그에 `data-t-bind`를 지정하여 기존 데이터를 입력란 초기값으로 세팅할 수 있습니다(수정 화면 등에서 유용).
- **입력 항목**: `<input>`이나 `<textarea>`의 `name` 속성이 데이터의 항목명(프로퍼티)이 됩니다.

#### 예시: 기사 수정 폼

```html
<!-- 폼 전체에 article 데이터 바인딩 (초기값 세팅) -->
<!-- action으로 지정한 API에 PUT 메서드로 전송 -->
<!-- 저장 완료 후 목록 페이지(../list.html)로 이동 -->
<form method="PUT" action="/_sys/data/article" data-t-bind="article" data-t-redirect="../list.html">

  <label>제목</label>
  <input type="text" name="title"> <!-- article.title 값이 채워짐 -->

  <label>본문</label>
  <textarea name="content"></textarea> <!-- article.content 값이 채워짐 -->

  <button>저장</button>
</form>
```

### 가공 필터 (파이프)

데이터를 표시할 때 가공 필터(정식 명칭: 파이프) `|`를 사용할 수 있습니다.

#### 기본 구문

```html
<p>업데이트일: { article.updated_at | date: 'yyyy/mm/dd' }</p>
<span>가격: { product.price | number } 원</span>
```

↓ **실행 결과**

```html
<p>업데이트일: 2025/12/10</p>
<span>가격: 1,500 원</span>
```

#### 가공 필터 구문 (파이프 구문)

```text
{ 데이터명.항목명 | 필터명: '인수' }
```

### 표준 필터 (내장 파이프 함수)

#### `date`

날짜 데이터(날짜형)를 지정한 형식의 문자로 출력합니다.

- **작성법**: `{ 항목명 | date: '포맷' }`
- **포맷 지정**:
  - `yyyy`: 4자리 연도
  - `mm`: 2자리 월
  - `dd`: 2자리 일

## 데이터 액세스 API

### 엔드포인트 사양 (Data API)

서버 상의 데이터(JSON 파일 등)에 대해 조회뿐만 아니라 추가, 수정, 삭제도 가능합니다.

```text
/_sys/data/{entity}.json?{prop}={val}
```

#### 데이터 조작 메서드

| 메서드 | 동작 | 설명 |
| :--- | :--- | :--- |
| `GET` | 조회 | 조건에 따라 데이터를 가져옵니다. |
| `POST` | 추가 | 새로운 데이터를 생성합니다. |
| `PUT` | 수정 | 조건에 맞는 데이터를 지정된 값으로 덮어씁니다. |
| `DELETE` | 삭제 | 조건에 일치하는 데이터를 삭제합니다. |

### 엔드포인트 사양 (File API)

서버 상의 정적 파일(이미지 등)을 관리하기 위한 API입니다.

```text
/_sys/file/{filename}.{ext}
```

#### 파일 조작 메서드

| 메서드 | 동작 | 설명 |
| :--- | :--- | :--- |
| `GET` | 조회 | 파일을 가져옵니다. |
| `POST` | 추가 | 파일을 새로 업로드하거나 생성합니다. |
| `PUT` | 수정 | 지정된 파일의 내용을 덮어씁니다. |
| `DELETE` | 삭제 | 지정된 파일을 삭제합니다. |

#### 파라미터

- **`{entity}`**: 데이터 타입 (정식 명칭: 엔티티). 예: `article` (기사), `user` (사용자)
- **`{prop}`**: 필터링 조건에 사용할 데이터 항목명 (정식 명칭: 프로퍼티)
- **`{val}`**: 조건에 지정할 값

#### 연산자

항목명 뒤에 기호(연산자)를 붙여 더욱 상세한 조건을 지정할 수 있습니다.

| 연산자 | 의미 | 작성 예시 | 예시 설명 |
| :--- | :--- | :--- | :--- |
| (없음) | 일치함 | `?status=active` | 상태가 `active`인 것 |
| `:ne` | 일치하지 않음 | `?status:ne=draft` | 상태가 `draft`가 **아닌** 것 |
| `:gt` | ~보다 큼 | `?price:gt=1000` | 가격이 1000원을 **초과**하는 것 |
| `:gte` | 이상 | `?price:gte=1000` | 가격이 1000원 **이상**인 것 |
| `:lt` | ~보다 작음 | `?stock:lt=10` | 재고가 10개 **미만**인 것 |
| `:lte` | 이하 | `?stock:lte=10` | 재고가 10개 **이하**인 것 |

### 시스템 예약 변수 (`_sys`)

애플리케이션 전체의 컨텍스트나 브라우저의 요청 정보를 가져오기 위해 `_sys`라는 예약 변수가 제공됩니다.

| 변수명 | 설명 | 작성 예시 |
| :--- | :--- | :--- |
| `_sys.query` | GET 쿼리 파라미터. URL의 `?id=123` 등의 값을 가져옵니다. | `{_sys.query.id}` |

#### `data-t-source`에서의 활용 (동적 파라미터 바인딩)

`data-t-source`의 `href` 속성 내에서는 플레이스홀더 `{ }`를 사용하여 쿼리 파라미터를 동적으로 넣을 수 있습니다. 또한 URL 파라미터 전용 단축 표기법인 `{?}`를 사용할 수 있습니다.

| 표기법 | 의미 | 작성 예시 |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | 지정한 항목을 삽입 (표준 형식) | `?id={_sys.query.id}` |
| `{?}` | **자동 바인딩**. 호출하는 키 이름과 같은 이름의 값을 URL에서 가져옴 | `?title={?}` |
| `{?xxx}` | **단축 형식**. `_sys.query.xxx`와 동일 | `?title={?q}` |

#### 데이터 소스 작성 예시

```html
<!-- URL이 ?title=Web&_limit=10 인 경우 -->

<!-- 1. 자동 바인딩 표기: 키 이름이 URL 파라미터 이름과 일치할 때 최적 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. 단축 표기: URL 파라미터 이름(예: q)과 API 키 이름(예: title)이 다를 경우 -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. 표준 형식: 더욱 명시적으로 작성할 경우 -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

### 데이터 상세 정보 (시스템 프로퍼티)

데이터 자체에 포함된 값(제목이나 ID 등) 외에 데이터의 '개수'나 '상태'를 알고 싶을 때가 있습니다.
`Bracify`에서는 데이터 이름 뒤에 언더스코어 `_`로 시작하는 이름을 붙여 이러한 특별 정보를 가져올 수 있습니다.

| 프로퍼티명 | 설명 | 작성 예시 |
| :--- | :--- | :--- |
| `_length` | 리스트(배열)에 포함된 데이터 개수 또는 문자열 길이를 표시합니다. | `{articles._length}개의 기사` |

#### 제어 파라미터 (정렬 및 페이지네이션)

데이터 취득 개수 제어나 정렬에는 언더스코어 `_`로 시작하는 예약 파라미터를 사용합니다. 이는 실제 데이터 항목(예: `limit`이라는 컬럼)과의 충돌을 방지합니다.

| 파라미터 | 설명 | 작성 예시 |
| :--- | :--- | :--- |
| `_limit` | 취득할 최대 개수 | `?_limit=20` |
| `_offset` | 건너뛸 개수 (페이지네이션용) | `?_offset=20` (21번째부터 조회) |
| `_sort` | 정렬 기준 키 항목명 | `?_sort=created_at` |
| `_order` | 정렬 순서 (`asc`: 오름차순, `desc`: 내림차순) | `?_order=desc` (생략 시 `asc`) |

#### 제어 파라미터 사용 예시

```html
<!-- URL 파라미터를 활용한 검색/정렬 예시 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- 카테고리 고정, 페이지만 파라미터로 지정 -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">
```

#### 로컬 디렉토리 구성 예시

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

**JSON 파일 예시** (`_sys/data/article.json`):

```json
[
  {
    "id": 1,
    "title": "기사 제목 1",
    "summary": "기사 요약...",
    "published_at": "2025-12-01T10:00:00Z"
  },
  {
    "id": 2,
    "title": "기사 제목 2",
    "summary": "기사 요약...",
    "published_at": "2025-12-05T15:30:00Z"
  }
]
```

### 로컬 프리뷰 ("Zero Server" 모드)에서의 데이터 제한

서버를 실행하지 않고 로컬 파일(`file://`)로 프리뷰할 경우(예: `index.html` 더블 클릭), 데이터 취득 처리는 브라우저 내부의 간이 모의 데이터(Mock)로 작동합니다.
이 모드는 디자인 확인이나 간단한 동작 체크를 목적으로 하며, 서버 환경(SSR)과는 동작이 일부 다릅니다.

- **필터 기능의 제한**:
  - **완전 일치만 지원**: 지정된 키와 값이 완전히 일치하는 경우에만 데이터를 반환합니다.
  - **빈 값 무시**: 검색 파라미터 값이 빈 문자열(`?name=`)인 경우 해당 필터 조건 자체를 무시합니다(모든 데이터 표시).
  - **고급 연산차 미지원**: `:gt`나 `:lt` 등의 연산자는 작동하지 않으며 무시되거나 기대와 다르게 작동할 수 있습니다.

- **지원되는 제어 파라미터**:
    다음 파라미터는 로컬 프리뷰에서도 간이적으로 작동합니다.
  - `_limit`: 표시 개수 제한
  - `_offset`: 데이터 건너뛰기
  - `_sort`: 정렬 기준 키
  - `_order`: `asc` (오름차순) 또는 `desc` (내림차순)

## 배포 (Deployment)

- **Serverless**: Vercel이나 Netlify로의 배포를 권장합니다.
- **Zip Upload**: GUI 앱에서 프로젝트를 Zip으로 압축하여 각 서비스 대시보드에 드래그 앤 드롭하는 것만으로 배포가 완료됩니다.

## 개발 흐름

1. 공식 사이트에서 `Bracify` GUI 앱을 다운로드 및 설치합니다.
2. 앱을 실행하고 작업 폴더를 생성 또는 선택합니다.
3. `index.html`, `_parts/header.html` 등을 편집합니다. GUI 앱이 실시간 프리뷰를 제공합니다.
4. 완성이 되면 Zip으로 압축하여 공개합니다.

## 보안

Bracify는 안전한 프론트엔드 개발을 지원하기 위해 다음과 같은 보호 기능을 기본적으로 제공합니다.

- **자동 이스케이프 (Auto-Escaping)**: `{placeholder}`를 통한 데이터 전개 시 자동으로 HTML 이스케이프 처리(일반 텍스트로 취급)가 수행되어 XSS(교차 사이트 스크립팅)를 방지합니다.
- **안전한 데이터 주입 (Secure Data Injection)**: SSR 또는 빌드 프로세스 중에 HTML에 데이터를 주입할 때, 스크립트 태그 간섭(`</script>` 중단 등)을 방지하기 위해 자동으로 이스케이프 처리됩니다.
- **URL 새니타이징(Sanitization)**: `href` 또는 `src` 속성에 데이터를 삽입할 때, `javascript:`와 같은 위험한 프로토콜을 감지하면 자동으로 무효화하여 예기치 않은 스크립트 실행을 방지합니다.
