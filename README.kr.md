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

GUI 앱에서 `Start Server` 버튼을 누르고 `localhost:3000`을 열면 `Hello Bracify!`가 표시됩니다.
서버는 시작 시 `index.html`과 `info.json`을 읽고, 메모리에서 SSI(Server Side Includes)를 해결하여 응답을 반환합니다.
파일을 편집하고 저장하면 OS 수준의 모니터링을 통해 메모리의 템플릿이 즉시 업데이트됩니다.

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

---

## 프로젝트 구성 (File System Structure)

`Bracify` 프로젝트는 소스 편집 전용의 단일 폴더로 구성됩니다. 실행을 위해 물리적인 빌드 디렉토리가 필요하지 않습니다.

### 권장 디렉토리 구조

```text
project/
├── index.html          # 엔트리 포인트
├── style.css           # 정적 리소스
├── img/                # 언더스코어로 시작하지 않는 폴더는 공개됨
│   └── logo.png
├── _parts/             # [비공개] 인클루드용 부품
│   ├── header.html
│   └── footer.html
└── _sys/               # [비공개] 시스템 데이터 및 설정
    ├── data.db         # 데이터베이스 파일
    └── data/           # 엔티티용 JSON 데이터
        └── articles.json
```

### 렌더링 사양

Bracify는 웹 서버로 동작하는 'SSR 모드'와 브라우저에서 직접 동작하는 'CSR 모드'를 자유롭게 전환할 수 있습니다.

#### 1. SSR 모드 (서버 측 실행)
서버는 요청에 따라 HTML을 동적으로 구성합니다.

- **온메모리 빌드**: 시작 시 및 파일 저장 시 `data-t-include`를 해결하고 결합된 HTML 템플릿을 **메모리**에 캐싱합니다.
- **파일 감시**: `index.html`이나 `_parts/` 하위 파일이 업데이트되면 서버는 OS 수준 이벤트를 감지하여 메모리 캐시를 자동으로 재구축합니다.
- **고성능**: 메모리상의 완성된 템플릿에서 응답하므로 디스크 I/O를 최소화하여 빠른 응답이 가능합니다.

#### 2. CSR 모드 (클라이언트 측 실행)
서버 없이 `file://` 프로토콜을 통해 브라우저에서 직접 폴더를 열어 동작합니다.

- **런타임 인클루드**: 브라우저가 HTML을 로드할 때 File System Access API를 통해 `data-t-include`로 지정된 파일을 즉석에서 가져와 결합합니다.
- **일관성**: SSR과 CSR 모두 동일한 바인딩 엔진(`engine.js`)을 사용하므로 환경에 관계없이 동일한 결과물을 얻을 수 있습니다.

---

## Reference

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

- **주의사항**: 개발 서버 또는 브라우저의 File System Access API를 통해 결합됩니다.

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

- **중첩된 데이터 표시**:
  점 표기법 `.` 을 사용하여 객체 내의 중첩된 프로퍼티에 접근할 수 있습니다. 데이터의 계층 구조가 깊어도 동일하게 기술할 수 있습니다.

  ```json
   {
    "user": {
      "name": "홍길동",
      "address": {
        "city": "서울"
      }
    }
  }
  ```

  ```html
  <p>사용자명: {user.name}</p>
  <p>도시명: {user.address.city}</p>
  ```

- **플레이스홀더 이스케이프**:
  플레이스홀더 표기를 평가하지 않고 그대로 표시하고 싶은 경우, 시작 중괄호 앞에 백슬래시 `\`를 둡니다.

  ```html
  <code>\{user.name\}</code> <!-- 표시 결과: {user.name} -->
  ```

### 리스트 표시 (`data-t-list`)

표시할 데이터가 여러 건일 경우, 반복하고자 하는 요소에 `data-t-list="데이터 소스명"`을 지정해야 합니다.

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

- **제한**: JavaScript 구문과의 간섭을 피하기 위해 **이벤트 핸들러 속성(`onclick`, `onchange` 등) 내부에서는 플레이스홀더를 사용할 수 없습니다.**

#### 플레이스홀더 간섭 방지 및 제한

Bracify의 플레이스홀더 `{ }`는 HTML 속성이나 텍스트 노드에서 사용할 수 있지만, JavaScript나 CSS 코드와의 충돌을 방지하기 위해 다음 장소에서는 **전개가 비활성화**됩니다.

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
    컨테이너 요소(`div`, `form` 등)에 `data-t-scope="article"`과 같이 작성하면 해당 요소 내의 '기본 데이터 소스'를 지정할 수 있습니다.

- **예시 (검색 폼)**:

    ```html
    <!-- URL이 ?title=Web인 경우 자동으로 value="Web"이 세팅됩니다 -->
    <input type="text" name="title" placeholder="기사 검색...">
    ```

- **예시 (편집 폼)**:

    ```html
    <!-- article 데이터의 title, content가 자동으로 각 필드에 세팅됩니다 -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article.json">
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
      어서 오세요, <span>{user.name}</span>님!
    </div>
    ```

    ↓ **실행 결과 (`user.is_login`이 true인 경우)**

    ```html
    <div>
      어서 오세요, <span>홍길동</span>님!
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

    **비교 연산 및 논리 연산 (Data API 스타일)**:
    Data API의 쿼리 파라미터와 동일한 구문을 사용하여 더욱 상세한 조건을 지정할 수 있습니다.

    - **비교 연산자**: [데이터 액세스 API의 연산자](#연산자)와 동일한 표기법(`=`, `:ne=`, `:gt=` 등)을 사용할 수 있습니다.
    - **논리 연산(AND/OR)**: 공백으로 구분하면 **AND**, 값에 쉼표를 사용하면 **OR**가 됩니다.
    - **변수 사용**: `{ }`로 감싸면 데이터 값을 조건에 사용할 수 있습니다.

    ```html
    <!-- 상태가 공개 중 (status == 'published') -->
    <span data-t-if="status=published">공개 중</span>

    <!-- 가격이 1000 이상 이고 재고가 있음 -->
    <div data-t-if="price:gte=1000 stock:gt=0">
      인기 상품 (재고 있음)
    </div>

    <!-- 역할이 admin 또는 editor -->
    <button data-t-if="role=admin,editor">편집</button>

    <!-- 사용자 ID가 기사 작성자 ID와 일치할 경우 -->
    <div data-t-if="user.id={post.author_id}">
      <a href="/edit">기사 편집</a>
    </div>
    ```

#### `data-t-redirect`

처리(폼 전송 등)가 정상적으로 완료된 후의 페이지 이동 URL을 지정합니다.

- **지정 방법**: 이동할 대상의 상대 경로 또는 절대 경로 지정
- **대상 태그**: `form` 태그.
- **동작**: 서버 측 처리 후 302 상태로 해당 경로로 리다이렉트합니다. 지정하지 않으면 현재 페이지를 새로고침합니다.

### 폼과 데이터 저장 (포스트백)

표준 `<form>` 태그를 사용하여 데이터를 생성 및 업데이트할 수 있습니다. Bracify는 브라우저 표준의 **포스트백(페이지 이동을 수반하는 전송)** 방식으로 작동하며, JavaScript 비동기 통신(fetch)을 사용하지 않습니다.

- **자동 처리**: `action` 속성에 저장 경로(예: `/_sys/data/xxxxx.json`)를 지정하고 `method="POST"` 또는 `PUT`으로 전송합니다.
- **리다이렉트 (PRG 패턴)**: 서버 저장 완료 후 `data-t-redirect`로 지정한 URL 또는 원본 페이지로 자동 리다이렉트합니다. 이를 통해 '폼 중복 전송'을 방지하고 안전한 페이지 이동이 가능합니다.
- **데이터 바인딩(기초값)**: `<form>` 태그에 `data-t-scope`를 지정하여 기존 데이터를 입력란의 기초값으로 세팅할 수 있습니다.
- **입력 항목**: `<input>` 이나 `<textarea>` 의 `name` 속성이 데이터의 항목명(프로퍼티)이 됩니다.

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

#### 가공 필터 구문

```text
{ 데이터명.항목명 | 필터명: '인수' }
```

### 표준 필터 (내장 파이프 함수)

#### `date`

날짜 데이터를 지정한 형식으로 출력합니다.

- **구문**: `{ 항목명 | date: '포맷' }`
- **포맷 지정**:
  - `yyyy`: 4자리 연도
  - `mm`: 2자리 월
  - `dd`: 2자리 일

#### `number`

숫자를 '3자리 단위 콤마' 형식으로 출력합니다.

- **구문**: `{ 항목명 | number }`

#### `json`

데이터를 서식이 지정된 JSON 문자열로 출력합니다. 디버깅에 유용합니다.

- **구문**: `{ 항목명 | json }`

## 데이터 저장 처리 (Form Handler)

Bracify는 외부로의 데이터 API를 직접 제공하지 않습니다. `/_sys` 하위의 모든 리소스는 숨겨지며, 폼 전송을 위한 입구로 다음 엔드포인트만 작동합니다.

```text
POST /_sys/data/{entity}.json
```

이 엔드포인트는 브라우저에서 `GET`으로 직접 접근할 수 없습니다(403 Forbidden). 폼의 `action`으로만 사용 가능합니다.

#### 데이터 조작
조작은 HTTP 요청으로 수행되지만, 응답은 항상 '페이지로의 리다이렉트'가 됩니다.

| 메서드 | 동작 | 설명 |
| :--- | :--- | :--- |
| `POST` | 생성 | 새로운 데이터를 생성합니다. |
| `PUT` | 업데이트 | 전송된 데이터로 기존 정보를 덮어씁니다. |
| `DELETE`| 삭제 | 지정된 데이터를 삭제합니다. |

### 엔드포인트 사양 (File API)

서버 상의 정적 파일(이미지 등)을 관리하기 위한 API입니다.

```text
/_sys/file/{filename}.{ext}
```

#### 파일 조작 메서드

| 메서드 | 동작 | 설명 |
| :--- | :--- | :--- |
| `GET` | 조회 | 파일을 가져옵니다. |
| `POST` | 생성 | 파일을 업로드 또는 생성합니다. |
| `PUT` | 업데이트 | 파일을 덮어씁니다. |
| `DELETE` | 삭제 | 파일을 삭제합니다. |

#### 파라미터

- **`{entity}`**: 데이터 타입 (엔티티). 예: `article`, `user`
- **`{prop}`**: 필터링 기준 항목명
- **`{val}`**: 조건 값

#### 연산자

| 연산자 | 의미 | 작성 예시 | 설명 |
| :--- | :--- | :--- | :--- |
| (없음) | 일치함 | `?status=active` | 상태가 `active`인 것 |
| `:ne` | 일치하지 않음 | `?status:ne=draft` | 상태가 `draft`가 아닌 것 |
| `:gt` | 초과 | `?price:gt=1000` | 1000원 초과 |
| `:gte` | 이상 | `?price:gte=1000` | 1000원 이상 |
| `:lt` | 미만 | `?stock:lt=10` | 10개 미만 |
| `:lte` | 이하 | `?stock:lte=10` | 10개 이하 |

### 시스템 예약 변수 (`_sys`)

| 변수명 | 설명 | 예시 |
| :--- | :--- | :--- |
| `_sys.query` | GET 쿼리 파라미터. `?id=123` 등의 값. | `{_sys.query.id}` |

#### `data-t-source`에서의 활용

| 표기법 | 의미 | 예시 |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | 특정 항목 삽입 | `?id={_sys.query.id}` |
| `{?}` | **자동 바인딩**. 키 이름과 같은 파라미터를 URL에서 가져옴 | `?title={?}` |
| `{?xxx}` | **단축 표기**. `_sys.query.xxx` 와 동일 | `?title={?q}` |

#### 작성 예시

```html
<!-- URL이 ?title=Web&_limit=10 인 경우 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">
```

### 데이터 상세 정보 (시스템 프로퍼티)

| 프로퍼티명 | 설명 | 예시 |
| :--- | :--- | :--- |
| `_length` | 데이터 개수 또는 문자열 길이. | `{articles._length}개의 기사` |

#### 제어 파라미터 (정렬 및 페이지네이션)

| 파라미터 | 설명 | 예시 |
| :--- | :--- | :--- |
| `_limit` | 최대 개수 | `?_limit=20` |
| `_offset` | 건너뛸 개수 | `?_offset=20` |
| `_sort` | 정렬 기준 항목 | `?_sort=created_at` |
| `_order` | 순서 (`asc`, `desc`) | `?_order=desc` |

#### 사용 예시

```html
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">
```

#### 디렉토리 구성 예시

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

### 로컬 개발 모드 (True Zero Server Mode)

서버 없이 브라우저에서 `index.html`을 로컬 파일(`file://`)로 열어 개발하는 모드입니다.

#### File System Access API를 통한 빌드 없는 개발

1. **프로젝트 폴더 선택**: 초기화 시 표시되는 폴더 선택 창에서 루트 디렉토리를 선택하면 브라우저가 직접 파일을 조작합니다.
2. **빌드 없는 프리뷰**: 브라우저가 `.json` 과 `.html` 파일을 직접 읽으므로, 파일 저장 후 새로고침이나 이동만으로 즉시 반영됩니다.

#### 페이지 이동과 SPA 라우팅

`file://` 환경에서 새로고침은 권한을 초기화하므로, Bracify는 모든 이동을 SPA 방식으로 처리합니다.

- **링크 자동 가로채기**: `<a>` 태그 이동을 감지하여 DOM만 교체합니다.
- **JavaScript 이동 API**: `Bracify.navigate('/path/to/page.html')` 를 사용하십시오.
- **브라우저 히스토리**: 뒤로/앞으로 가기를 지원합니다.

#### 비지원 환경에서의 제한

API 미지원 브라우저나 폴더 미선택 시에는 '읽기 전용 모크 모드'로 작동합니다.

#### 필터링 및 제어 (공통 사양)

- **필터 제한**: 완전 일치만 가능하며 `:gt` 등의 연산자는 무시됩니다.
- **제어 파라미터**: `_limit`, `_offset`, `_sort`, `_order` 는 간이적으로 동작합니다.

#### JavaScript 동작 규칙

- **스코프 분리**: 페이지 스크립트를 IIFE로 자동 래핑하여 변수 충돌을 방지합니다.
- **중복 실행 방지**: 이미 로드된 `<head>` 스크립트는 다시 실행되지 않습니다.
- **전역 변수 유지**: `window` 객체에 명시적으로 담은 데이터는 유지됩니다.

## 데이터베이스 설정 (Database Configuration)

기본적으로 내장 SQLite(`_sys/data.db`)를 사용하며, 외부 MySQL/PostgreSQL 연결이 가능합니다.

### 작동 원리

시작 시 프로젝트 내의 `_sys/data.db` 를 참조하여 설정을 확인합니다. 인증 정보가 소스 코드에 남지 않도록 저장소 외부에서 안전하게 관리됩니다.

### 기본 동작

설정이 없으면 내장 SQLite를 자동으로 사용합니다.

### 설정 방법

GUI 또는 `config` 테이블에 직접 연결 정보(JSON)를 입력합니다.

```json
[
  {
    "target_entity": "users",
    "engine": "mysql",
    "option": { "host": "localhost", "port": 3306, "user": "admin", "password": "${DB_PASS}", "database": "app_db" }
  }
]
```

#### 라우팅 우선순위

엔티티 이름에 따라 '완전 일치 > 와일드카드 매칭 > JSON 정의 순서' 로 자동 선택됩니다.

## 배포 (Deployment)

- **Serverless**: Vercel, Netlify 등 지원.
- **Zip Upload**: GUI 앱에서 Zip으로 압축하여 각 서비스 대시보드에 드래그 앤 드롭하면 배포가 완료됩니다.

## 개발 흐름

1. GUI 앱 설치.
2. 폴더 생성 및 선택.
3. HTML/부품 편집 및 실시간 프리뷰.
4. 배포용 Zip 압축 및 공개.

## 보안

- **자동 이스케이프**: XSS 방지.
- **안전한 데이터 주입**: 스크립트 태그 간섭 방지.
- **URL 새니타이징**: 위험한 프로토콜 자동 차단.
- **언더스코어 가드 (SSR 전용)**:
  서버 동작 시, 루트의 언더스코어(`_`)로 시작하는 리소스(예: `data.db`, `_parts/`)에 대한 외부 직접 접근을 전면 차단(403 Forbidden)합니다.
  * 참고: 공식 폼 엔드포인트(예: `POST /_sys/data/*.json`)는 이 제한에서 제외됩니다.
