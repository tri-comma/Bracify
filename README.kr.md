[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Bracify Logo" width="200">
</p>

# Bracify 🚀

> **HTML만으로 만드는 웹 프레임워크. 마크업만 있으면 됩니다.**
>
> 앱을 만드는 데 터미널은 필요 없습니다(GUI인 Studio로 충분합니다). CLI는 정적 빌드용 선택 도구입니다.

Bracify는 HTML 마크업만으로 웹 애플리케이션을 구축할 수 있는 프레임워크입니다.
프로그래밍이나 복잡한 환경 구축의 장벽을 낮추는 것을 목표로 하는 'HTML-first' 개발 경험을 제공합니다.

## Bracify란?

Bracify는 '마크업만으로 앱을 만들 수 있다'는 심플함을 추구합니다.

- **React/Vue에 지친 엔지니어에게**: 복잡한 빌드 설정이나 무거운 프레임워크 학습에서 해방됩니다.
- **마크업 엔지니어에게**: 프로그래밍 지식 없이도, 여러분의 HTML 기술만으로 데이터 연동까지 포함한 동작하는 웹 앱을 만들 수 있습니다.

## Demo

![Demo Animation](./demo.gif)

## Key Concepts (주요 컨셉)

- **HTML Markup Only**: 프로그램을 작성하지 않고, HTML 마크업만으로 앱을 제작합니다.
- **Terminal-free Authoring**: 페이지 작성, 미리보기, 데이터 관리에 터미널이 필요 없습니다. GUI 도구인 Bracify Studio로 모두 해결됩니다. CLI(정적 빌드용)는 선택 사항입니다.
- **Hybrid Rendering**: `file://` (CSR) 모드로 개발하고, 운영 환경에서는 그대로 서버 `https://` (SSR)로 공개 가능합니다.
- **Minimal Setup**: 프로젝트에는 설정 파일이나 빌드 단계가 필요 없습니다. Studio를 실행하려면 Node.js와 최초 1회의 `npm install`이 필요합니다(아래 Quick Start 참고).
- **Portable**: 프로젝트는 평범한 HTML 파일입니다. 어디든 가지고 다니며 즉시 실행할 수 있습니다.

## Quick Start (빠른 시작)

간단한 페이지 작성부터 시작해 봅시다. 단 4단계면 충분합니다.

### 1. 준비

Bracify Studio를 실행하고 새 작업 폴더를 선택합니다. 현재 Studio는 소스에서 실행합니다(Node.js 필요). 저장소 루트에서 `npm install`을 한 번 실행한 뒤 `npm start`로 시작합니다. 자세한 내용은 [Studio](./docs/en/studio.md)를 참고하세요.

### 2. HTML 작성

`index.html` 파일을 생성하고 다음 내용을 작성합니다.

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 데이터 소스 지정 -->
  <link data-t-source="info" href="/_sys/data/info.json">
  <script src="bracify.js"></script>
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

`<script src="bracify.js"></script>`는 클라이언트 측 엔진을 로드합니다(SPA 이동과 로컬 개발 모드에 필요하며, 자세한 내용은 [프로젝트 구조](./docs/en/project-structure.md)를 참고하세요).

### 3. 데이터 작성

`/_sys/data/info.json` 파일을 생성하고 다음 내용을 작성합니다.

```json
{
  "msg": "Hello Bracify!"
}
```

### 4. 실행

Studio에서 `Start Server` 버튼을 누르고 `localhost:3000`을 열면 `Hello Bracify!`가 표시됩니다.
서버는 시작 시 `index.html`과 `info.json`을 읽고, 메모리에서 SSI(Server Side Includes)를 해결하여 응답을 반환합니다.
파일을 편집하고 저장하면 OS 수준의 모니터링을 통해 메모리의 템플릿이 즉시 업데이트됩니다.

---

## 만들 수 있는 것

기능별로 최소한의 예제를 보여 줍니다. 자세한 내용은 [문서](#문서)를 참고하세요.

### 데이터 표시(`data-t-source`와 플레이스홀더)

JSON 등의 데이터에 이름을 붙이고 `{이름.항목}`으로 텍스트나 속성에 삽입합니다. URL 파라미터는 `{?id}`로 참조할 수 있습니다.

```html
<link data-t-source="article" href="_sys/data/articles.json?id={?id}">
<h1>{article.title}</h1>
<p>{article.body}</p>
```

### 목록 표시(`data-t-list`)

반복할 요소에 지정하면 레코드 수만큼 복제됩니다. 정렬, 건수 제한, 페이지 이동은 URL 파라미터로 지정합니다.

```html
<link data-t-source="articles" href="_sys/data/articles.json?_sort=id&_order=desc&_limit=5">
<ul>
  <li data-t-list="articles"><a href="article.html?id={articles.id}">{articles.title}</a></li>
</ul>
```

### 조건 표시(`data-t-if`)

값의 존재 여부, 비교(`=`, `:gt` 등), AND(공백) / OR(쉼표)로 요소의 표시를 전환합니다.

```html
<span data-t-if="status=published">Published</span>
<div data-t-if="price:gte=1000 stock:gt=0">In stock</div>
<div data-t-if="!user.is_login"><a href="login.html">Log in</a></div>
```

### 폼 저장(서버 측 검증이 있는 Data API)

표준 `<form>`을 Data API로 보내기만 하면 데이터가 저장됩니다. `required`, `maxlength`, `pattern` 등의 제약은 서버에서도 검증되며, 실패하면 `?error=`와 함께 원래 페이지로 돌아옵니다.

```html
<form method="POST" action="/_sys/data/articles.json" data-t-redirect="articles.html">
  <input type="text" name="title" required maxlength="100">
  <input type="email" name="email" required>
  <button>Save</button>
</form>
<p>{_sys.query.error}</p>
```

### 부품과 레이아웃(`data-t-include`)

헤더 같은 공통 부품을 삽입하거나, 공통 레이아웃에 페이지 콘텐츠를 채워 넣을 수 있습니다.

```html
<!-- _parts/layout.html contains <main data-t-content="main-body"></main> -->
<body data-t-include="_parts/layout.html">
  <div data-t-content="main-body"><p>Page content</p></div>
</body>
```

### 파이프(필터)

`|`로 날짜, 숫자, 통화 형식 지정이나 문자열 자르기, 기본값 지정을 할 수 있습니다. `date`, `number`, `currency`, `uppercase`, `lowercase`, `truncate`, `default`, `ternary`, `json`이 기본 제공됩니다.

```html
<p>{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>{ product.price | currency }</span>
<span>{ article.summary | truncate: 10 | uppercase }</span>
```

### SPA 내비게이션

내부 링크는 평범한 `<a>`만 쓰면 자동으로 전체 페이지를 새로 고치지 않는 이동이 됩니다. JavaScript는 필요 없습니다.

```html
<a href="book.html?id=1">Book</a>
```

### 로컬 모드(`file://`, 서버 불필요)

Chrome / Edge에서 `index.html`을 더블클릭해 열고 프로젝트 폴더를 선택하면 동작합니다(읽기 전용, File System Access API 사용). 각 페이지에 이 한 줄이 필요합니다.

```html
<script src="bracify.js"></script>
```

### Studio 데이터 관리와 스캐폴드

Studio는 HTML에서 엔티티와 스키마를 자동으로 수집하여 레코드의 목록, 등록, 편집, 삭제와 목록·편집 페이지 스캐폴드 생성을 지원합니다.

## 현재의 제한

Bracify는 초기 단계의 프로젝트입니다. 다음 사항을 이해하고 사용해 주세요.

- **로컬 모드는 읽기 전용**입니다. `file://`에서는 폼을 저장할 수 없습니다([#56](https://github.com/tri-comma/Bracify/issues/56)).
- **아직 인증 기능이 없습니다.** 공개 서버에서는 Data API에 접근할 수 있는 누구나 데이터를 쓸 수 있습니다([#106](https://github.com/tri-comma/Bracify/issues/106)). 공개할 때는 충분히 주의하세요.
- **파일 업로드는 지원하지 않습니다**([#107](https://github.com/tri-comma/Bracify/issues/107)).
- **원스텝 배포 기능은 없습니다.** 정적 빌드를 정적 호스팅에 올리거나, Node.js가 동작하는 호스트에서 서버 모드를 실행합니다([#105](https://github.com/tri-comma/Bracify/issues/105)).

## 문서

자세한 사양은 `docs/`에 있습니다. 레퍼런스는 영어와 일본어로 제공됩니다.

| 파일 | 내용 |
| --- | --- |
| [`docs/en/README.md`](./docs/en/README.md) | 문서 목차 |
| [`docs/en/studio.md`](./docs/en/studio.md) | Bracify Studio(런처, 관리 대시보드, 데이터 관리, 스캐폴드) |
| [`docs/en/project-structure.md`](./docs/en/project-structure.md) | 프로젝트 구조, 렌더링(SSR / CSR / SPA), 클라이언트 측 엔진 로드 |
| [`docs/en/attributes.md`](./docs/en/attributes.md) | 커스텀 속성(`data-t-include`, `data-t-source`, `data-t-list`, `data-t-if` 등), 폼과 데이터 저장 |
| [`docs/en/pipes.md`](./docs/en/pipes.md) | 파이프(필터)와 기본 제공 필터 |
| [`docs/en/data-api.md`](./docs/en/data-api.md) | Data API(데이터 조작, 서버 측 검증, 값의 타입)와 조회 조건 |
| [`docs/en/system-variables.md`](./docs/en/system-variables.md) | `_sys` 예약 변수와 시스템 속성 |
| [`docs/en/local-mode.md`](./docs/en/local-mode.md) | 로컬 개발 모드(`file://`) |
| [`docs/en/database.md`](./docs/en/database.md) | 데이터베이스 설정과 라우팅 우선순위 |
| [`docs/en/deployment.md`](./docs/en/deployment.md) | 빌드, 배포, 개발 흐름 |
| [`docs/en/security.md`](./docs/en/security.md) | 보안 |

## 예제 (Examples)

[`examples/`](./examples/) 폴더에는 문서의 주요 기능을 사용하는 실용 예제 앱 "Bracify Books"(장서 / 독서 기록 앱)가 있습니다. 같은 파일이 서버 모드(SSR + SQLite)와 로컬 `file://` 개발 모드 양쪽에서 그대로 동작합니다. 실행 방법과 기능별 파일 대응표는 [`examples/README.md`](./examples/README.md)를 참고하세요.

## 기여하기 (Contributing)

이 프로젝트는 작성자 1인이 개발하는 방침이므로 제3자의 Pull Request는 받지 않습니다. 버그 보고, 기능 제안, 질문 등의 Issue는 환영합니다. 자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.
