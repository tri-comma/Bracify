[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Logo do Bracify" width="200">
</p>

# Bracify 🚀

> **O framework web focado apenas em HTML. Apenas marcação.**
>
> Não é preciso terminal para criar um app (o Studio, a GUI, resolve tudo). A CLI é uma ferramenta opcional para builds estáticos.

Bracify é um framework que permite construir aplicações web utilizando apenas marcação HTML.
Oferece uma experiência de desenvolvimento focada em HTML ("HTML-first"), que busca reduzir as barreiras da programação e das configurações de ambiente complexas.

## O que é o Bracify?

O Bracify preza pela simplicidade: "Crie aplicações apenas com marcação".

- **Para desenvolvedores cansados de React/Vue**: Liberte-se de configurações de build complexas e da curva de aprendizado de frameworks pesados.
- **Para desenvolvedores de marcação (Web Designers)**: Sem necessidade de programação. Use apenas suas habilidades em HTML para criar aplicações web funcionais, incluindo a integração de dados.

## Demo

![Animação de demonstração](./demo.gif)

## Conceitos-chave

- **Apenas Marcação HTML**: Construa aplicações apenas marcando HTML, sem escrever código de programação.
- **Criação sem terminal**: Criar páginas, visualizá-las e gerenciar dados não exige terminal. O Bracify Studio, a ferramenta GUI, resolve tudo. A CLI (para builds estáticos) é opcional.
- **Renderização Híbrida**: Desenvolva com `file://` (CSR) e publique como servidor `https://` (SSR) sem alterações.
- **Configuração Mínima**: Um projeto não precisa de arquivos de configuração nem de etapas de build. Iniciar o Studio exige Node.js e um `npm install` uma única vez (veja o Início Rápido).
- **Portátil**: O projeto é apenas HTML. Leve para qualquer lugar e rode instantaneamente.

## Início Rápido

Vamos começar criando uma página simples. Leva apenas 4 passos.

### 1. Preparação

Inicie o Bracify Studio e selecione uma nova pasta de trabalho. Por enquanto o Studio é iniciado a partir do código-fonte (requer Node.js): execute `npm install` uma vez na raiz do repositório e depois `npm start`. Veja [Studio](./docs/en/studio.md) para mais detalhes.

### 2. Criar o HTML

Crie um arquivo chamado `index.html` e escreva o seguinte:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Especificar fonte de dados -->
  <link data-t-source="info" href="/_sys/data/info.json">
  <script src="bracify.js"></script>
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

`<script src="bracify.js"></script>` carrega o motor do lado do cliente (necessário para transições SPA e para o Modo de Desenvolvimento Local; veja [Estrutura do projeto](./docs/en/project-structure.md)).

### 3. Criar os Dados

Crie um arquivo chamado `/_sys/data/info.json` e escreva o seguinte:

```json
{
  "msg": "Olá Bracify!"
}
```

### 4. Executar

Pressione o botão `Start Server` no Studio e abra `localhost:3000`. Você verá `Olá Bracify!`.
O servidor lê o `index.html` e o `info.json` ao iniciar, resolve o SSI (Server Side Includes) em memória e retorna a resposta.
Ao editar e salvar um arquivo, o monitoramento a nível de sistema operacional atualiza instantaneamente o template na memória.

---

## O que você pode construir

Um exemplo mínimo por recurso. Veja a [Documentação](#documentação) para detalhes.

### Exibir dados (`data-t-source` e placeholders)

Dê um nome aos dados JSON e insira-os em textos ou atributos com `{nome.campo}`. Os parâmetros da URL ficam disponíveis como `{?id}`.

```html
<link data-t-source="article" href="_sys/data/articles.json?id={?id}">
<h1>{article.title}</h1>
<p>{article.body}</p>
```

### Listas (`data-t-list`)

Coloque no elemento que deve se repetir; ele é clonado uma vez por registro. Ordenação, limite e paginação são definidos por parâmetros de URL.

```html
<link data-t-source="articles" href="_sys/data/articles.json?_sort=id&_order=desc&_limit=5">
<ul>
  <li data-t-list="articles"><a href="article.html?id={articles.id}">{articles.title}</a></li>
</ul>
```

### Condições (`data-t-if`)

Mostre ou oculte elementos por existência, comparação (`=`, `:gt`, ...), AND (espaço) e OR (vírgula).

```html
<span data-t-if="status=published">Published</span>
<div data-t-if="price:gte=1000 stock:gt=0">In stock</div>
<div data-t-if="!user.is_login"><a href="login.html">Log in</a></div>
```

### Salvar formulários (Data API com validação no servidor)

Envie um `<form>` comum para a Data API e os dados são salvos. Restrições como `required`, `maxlength` e `pattern` também são validadas no servidor; em caso de falha, o usuário volta à página com `?error=`.

```html
<form method="POST" action="/_sys/data/articles.json" data-t-redirect="articles.html">
  <input type="text" name="title" required maxlength="100">
  <input type="email" name="email" required>
  <button>Save</button>
</form>
<p>{_sys.query.error}</p>
```

### Partes e layouts (`data-t-include`)

Insira partes compartilhadas, como um cabeçalho, ou despeje o conteúdo da página em um layout comum.

```html
<!-- _parts/layout.html contains <main data-t-content="main-body"></main> -->
<body data-t-include="_parts/layout.html">
  <div data-t-content="main-body"><p>Page content</p></div>
</body>
```

### Pipes (filtros)

Formate com `|`: datas, números, moeda, truncamento e valores padrão. `date`, `number`, `currency`, `uppercase`, `lowercase`, `truncate`, `default`, `ternary` e `json` já vêm incluídos.

```html
<p>{ article.updated_at | date: 'yyyy/mm/dd HH:MM' }</p>
<span>{ product.price | currency }</span>
<span>{ article.summary | truncate: 10 | uppercase }</span>
```

### Navegação SPA

Links `<a>` comuns para páginas internas navegam automaticamente sem recarregar a página inteira. Não é preciso JavaScript.

```html
<a href="book.html?id=1">Book</a>
```

### Modo local (`file://`, sem servidor)

Abra o `index.html` no Chrome / Edge com um duplo clique e escolha a pasta do projeto (somente leitura; usa a File System Access API). Cada página precisa desta linha.

```html
<script src="bracify.js"></script>
```

### Gerenciador de dados e scaffold do Studio

O Studio coleta entidades e esquemas do seu HTML, permite listar, criar, editar e excluir registros, e gera modelos de páginas de lista e edição.

## Limitações atuais

O Bracify é um projeto em estágio inicial. Use-o tendo em mente o seguinte.

- **O modo local é somente leitura.** Formulários não podem ser salvos em `file://` ([#56](https://github.com/tri-comma/Bracify/issues/56)).
- **Ainda não há autenticação.** Em um servidor público, qualquer pessoa que alcance a Data API pode gravar dados ([#106](https://github.com/tri-comma/Bracify/issues/106)). Tenha cuidado ao publicar.
- **Upload de arquivos não é suportado** ([#107](https://github.com/tri-comma/Bracify/issues/107)).
- **Não há implantação em um único passo.** Coloque o build estático em uma hospedagem estática, ou execute o modo servidor em um host que rode Node.js ([#105](https://github.com/tri-comma/Bracify/issues/105)).

## Documentação

A especificação detalhada está em `docs/`. A referência está disponível em inglês e japonês.

| Arquivo | Conteúdo |
| --- | --- |
| [`docs/en/README.md`](./docs/en/README.md) | Índice da documentação |
| [`docs/en/studio.md`](./docs/en/studio.md) | Bracify Studio (launcher, painel de administração, gerenciador de dados, scaffold) |
| [`docs/en/project-structure.md`](./docs/en/project-structure.md) | Estrutura do projeto, renderização (SSR / CSR / SPA), carregamento do motor do lado do cliente |
| [`docs/en/attributes.md`](./docs/en/attributes.md) | Atributos personalizados (`data-t-include`, `data-t-source`, `data-t-list`, `data-t-if`, ...), formulários e gravação |
| [`docs/en/pipes.md`](./docs/en/pipes.md) | Pipes (filtros) e filtros embutidos |
| [`docs/en/data-api.md`](./docs/en/data-api.md) | Data API (operações, validação no servidor, tipos de valores) e condições de consulta |
| [`docs/en/system-variables.md`](./docs/en/system-variables.md) | Variáveis reservadas `_sys` e propriedades do sistema |
| [`docs/en/local-mode.md`](./docs/en/local-mode.md) | Modo de desenvolvimento local (`file://`) |
| [`docs/en/database.md`](./docs/en/database.md) | Configuração do banco de dados e prioridade de roteamento |
| [`docs/en/deployment.md`](./docs/en/deployment.md) | Build, implantação e fluxo de desenvolvimento |
| [`docs/en/security.md`](./docs/en/security.md) | Segurança |

## Exemplos

A pasta [`examples/`](./examples/) contém o "Bracify Books", um aplicativo prático de biblioteca / registro de leitura que usa os principais recursos da documentação. Os mesmos arquivos funcionam sem alterações tanto no modo servidor (SSR + SQLite) quanto no modo de desenvolvimento local `file://`. Veja [`examples/README.md`](./examples/README.md) para saber como executar e para o mapa de recursos por arquivo.

## Contribuindo

Este projeto é desenvolvido por um único mantenedor, portanto Pull Requests de terceiros não são aceitos. Issues (relatos de bugs, solicitações de recursos e dúvidas) são bem-vindos. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para mais detalhes.
