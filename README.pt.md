[English](./README.en.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [简体中文](./README.zh.md) | [한국어](./README.kr.md) | [日本語](./README.md)

<p align="center">
  <img src="./logo.png" alt="Logo do Bracify" width="200">
</p>

# Bracify 🚀

> **O framework web focado apenas em HTML. Sem CLI, apenas marcação.**

Bracify é um framework que permite construir aplicações web utilizando apenas marcação HTML.
Oferecemos uma experiência de desenvolvimento focada em HTML ("HTML-first"), eliminando as barreiras da programação complexa e das configurações de ambiente pesadas.

## O que é o Bracify?

O Bracify preza pela simplicidade: "Crie aplicações apenas com marcação".

- **Para desenvolvedores cansados de React/Vue**: Liberte-se de configurações de build complexas e da curva de aprendizado de frameworks pesados.
- **Para desenvolvedores de marcação (Web Designers)**: Sem necessidade de programação. Use apenas suas habilidades em HTML para criar aplicações web completas, desde a integração de dados até o deploy.

## Demo

![Animação de demonstração](./demo.gif)

## Conceitos-chave

- **Apenas Marcação HTML**: Construa aplicações apenas marcando HTML, sem escrever código de programação.
- **Sem Necessidade de CLI**: Chega de "telas pretas" (terminais). Nosso launcher GUI dedicado resolve tudo para você.
- **Renderização Híbrida**: Desenvolva com `file://` (CSR) e publique como servidor `https://` (SSR) sem alterações.
- **Configuração Zero**: Não requer `npm install` ou outras configurações complexas.
- **Portátil**: O projeto é apenas HTML. Leve para qualquer lugar e rode instantaneamente.

## Início Rápido

Vamos começar criando uma página simples. Leva apenas 4 passos.

### 1. Preparação

Inicie o aplicativo GUI do `Bracify` e selecione uma nova pasta de projeto.

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

`<script src="bracify.js"></script>` carrega o motor do lado do cliente (necessário para transições SPA e para o Modo de Desenvolvimento Local; veja a seção sobre o carregamento do motor).

### 3. Criar os Dados

Crie um arquivo chamado `/_sys/data/info.json` e escreva o seguinte:

```json
{
  "msg": "Olá Bracify!"
}
```

### 4. Executar

Pressione o botão `Start Server` no aplicativo GUI e abra `localhost:3000`. Você verá `Olá Bracify!`.
O servidor lê o `index.html` e o `info.json` ao iniciar, resolve o SSI (Server Side Includes) em memória e retorna a resposta.
Ao editar e salvar um arquivo, o monitoramento a nível de sistema operacional atualiza instantaneamente o template na memória.

---

## Ferramentas de Desenvolvimento (Bracify Studio)

O `Bracify` oferece uma ferramenta GUI dedicada (codinome: **Bracify Studio**) para maximizar a experiência do desenvolvedor.
Esta ferramenta opera em uma configuração híbrida: um "Launcher" baseado em Electron e um "Painel de Administração (Web App)" construído com o próprio `Bracify`.

### 1. Bracify Launcher (Desktop)

Um aplicativo leve que serve para iniciar o Painel de Administração.

- **Servidor do Sistema**: Inicia um servidor API de gerenciamento do sistema ao abrir o aplicativo.
- **Launch**: Abre automaticamente o Painel de Administração no navegador (ou em uma janela Electron).

### 2. Painel de Administração (Web)

Uma tela de gerenciamento integrada que consolida todas as operações.

- **Controle de Projetos**:
  - **Abrir Projeto**: Abre um diálogo de seleção de pasta via API do sistema para carregar projetos.
  - **Iniciar/Parar Servidor**: Especifica uma porta para iniciar o servidor de preview do projeto selecionado.
  - **Execução simultânea de vários projetos**: Cada projeto roda como um processo filho independente (`node engine/start.cjs <path> <port>`), permitindo vários ao mesmo tempo.
    - Iniciar/parar usa `<form method="POST">` padrão (SSR), sem JavaScript.
      - `POST /_sys/server/start` (campo: `id` = ID do projeto)
      - `POST /_sys/server/stop` (campo: `id`)
      - Após o processamento, redireciona (303) para `data-t-redirect`, senão o Referer, senão `/`. Em caso de erro, redireciona de volta com `?error=mensagem`, exibível com `{?error}`.
    - Usa o `port` da entidade `projects`. Se vazio, a busca começa em 3000; se a porta configurada estiver ocupada, procura portas livres a partir dela, para cima. A porta realmente usada sobrescreve `port` no registro.
    - Este recurso só está ativo no servidor que atua como servidor do sistema (Studio); nos demais, `/_sys/server/*` retorna 404. POSTs cujo cabeçalho `Origin` não corresponda ao `Host` são rejeitados com 403. Se um processo filho terminar inesperadamente, `status` passa para `stopped`.
    - O resultado (`status` = `running`/`stopped`, `pid`, porta real) é gravado no registro do projeto e exibido no painel.
    - Ao parar o servidor do sistema, todos os processos filhos iniciados também são parados.
- **Gerenciador de Dados**:
  - Coleta automaticamente entidades e esquema do HTML do projeto e oferece listagem, criação/edição/exclusão (CRUD) e geração de modelos (Scaffold). As páginas são `studio/data/index.html?project=<id>` (lista de entidades) e `studio/data/entity.html?project=<id>&entity=<name>` (esquema, registros, formulário de criação), todas formulários SSR sem JavaScript.
  - **Descoberta de entidades**: varre todos os `*.html` do projeto (exceto `node_modules`, `_sys` e pastas iniciadas por `.`; `_parts` é incluída) e coleta entidades de:
    - o `href` de `data-t-source` (`_sys/data/<entity>.json`)
    - `<form action="..._sys/data/<entity>.json">` e o `name` de seus `input` / `select` / `textarea` (`data-t-redirect` é ignorado; nomes com ponto como `a.b` são campos aninhados)
    - marcadores `{<source>.<field>}` que usam uma fonte conhecida (tipo `unknown`)
    - registros existentes no BD (campos não definidos por formulários inferem `number` / `boolean` / `string` / `object` a partir dos valores)
  - **Informações de esquema**: por campo, o tipo (`text` / `number` / `email` / `date` / `checkbox` / `enum` (opções do `select`) / `unknown`, ...), `required`, `maxlength`, `minlength`, `min`, `max` e `pattern`.
  - **Limites de validação**: os nomes de campo devem corresponder a `[A-Za-z0-9_.-]` (os demais são ignorados). `required` não é aplicado a `checkbox` (uma caixa desmarcada não é enviada). Valores com mais de 1000 caracteres são rejeitados nas verificações de `pattern`. Um `pattern` com quantificadores aninhados (ex.: `(a+)+$`) não é aplicado por segurança e `patternSkipped` é `true` no esquema.
  - **CRUD**: opera diretamente nos dados do projeto de destino (`<project>/_sys/data.db` e sua configuração de roteamento). O BD do Studio não é afetado.
    - `POST /_sys/studio/records?project=<id>&entity=<name>` (criar), `POST /_sys/studio/records/update?project=<id>&entity=<name>&id=<id>` (atualizar), `POST /_sys/studio/records/delete?project=<id>&entity=<name>&id=<id>` (excluir)
    - Criar/atualizar são validados no servidor contra o esquema detectado (`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / tipo); em caso de falha, redirecionamento 303 de volta com `?error=mensagem`. Em caso de sucesso, redireciona para `data-t-redirect` ou o Referer.
    - Fontes de dados SSR (hrefs virtuais apenas para páginas do Studio): `_sys/studio/entities.json?project=<id>`, `_sys/studio/records.json?project=<id>&entity=<name>` (mesmos filtros, `_sort`, `_limit`, `_offset` da Data API) e `_sys/studio/schema.json?project=<id>&entity=<name>`.
  - **Scaffold (somente desenvolvimento)**: `POST /_sys/studio/scaffold?project=<id>&entity=<name>` gera no projeto `<entity>/index.html` (lista e formulários de exclusão) e `<entity>/edit.html` (formulário de criação/edição com `type` / `required` / `maxlength` / `pattern` conforme o esquema). Usa apenas atributos documentados do Bracify e nunca sobrescreve arquivos existentes (retorna erro).
  - Como `/_sys/server/*`, só está ativo no servidor do sistema (Studio) (404 nos demais), e POSTs com `Origin` diferente de `Host` são rejeitados com 403. `entity` aceita apenas letras, dígitos, `_` e `-` (sem iniciar por `_`).
- **Monitor de API**:
  - Verificação de logs de comunicação.

---

## Estrutura do Projeto (File System Structure)

Um projeto `Bracify` consiste em uma única pasta de origem. Nenhuma pasta de build física é necessária para a execução.

### Estrutura de Diretórios Recomendada

```text
projeto/
├── index.html          # Ponto de entrada
├── style.css           # Recurso estático
├── img/                # Qualquer pasta que não comece com underscore é pública
│   └── logo.png
├── _parts/             # [Privado] Componentes para inclusão
│   ├── header.html
│   └── footer.html
└── _sys/               # [Privado] Dados do sistema e configurações
    ├── data.db         # Arquivo do banco de dados
    └── data/           # Dados JSON para entidades
        └── articles.json
```

### Especificações de Renderização

Bracify permite alternar facilmente entre o "Modo SSR" (agindo como servidor web) e o "Modo CSR" (rodando diretamente no navegador).

#### 1. Modo SSR (Lado do Servidor)
O servidor constrói dinamicamente o HTML em resposta às requisições.

- **Build em Memória**: Resolve o `data-t-include` e armazena em **memória** o template HTML combinado ao iniciar ou salvar arquivos.
- **Monitoramento de Arquivos**: Quando o `index.html` ou arquivos em `_parts/` são atualizados, o servidor detecta eventos do SO e reconstrói automaticamente o cache em memória.
- **Alta Performance**: As respostas são servidas a partir dos templates já combinados na memória, minimizando o I/O de disco.

#### 2. Modo CSR (Lado do Cliente)
Funciona via protocolo `file://` abrindo a pasta diretamente em um navegador.

- **Inclusão em Tempo de Execução**: Quando o navegador carrega o HTML, ele busca e mescla os arquivos especificados por `data-t-include` dinamicamente usando a File System Access API.
- **Consistência**: Tanto o SSR quanto o CSR usam exatamente o mesmo motor de vinculação (`engine.js`), garantindo resultados idênticos em qualquer ambiente.

#### 3. Navegação SPA Unificada (Unified SPA)
Bracify trata **todas as transições de página como SPA por padrão**, tanto no modo SSR quanto no CSR.

- **Experiência Fluida**: Ao evitar o carregamento completo da página, o Bracify utiliza Ajax (Fetch) para buscar o HTML da próxima página e substitui dinamicamente o `<body>` e outros elementos do DOM. Isso elimina o "flash" de tela branca e oferece uma sensação de aplicativo rápido e moderno.
- **Persistência de Permissões**: Crucial para o modo CSR. No ambiente `file://`, um recarregamento total da página redefine as permissões de acesso à pasta do navegador. A abordagem SPA permite manter essas permissões durante toda a sessão.
- **Interceptação Automática**: Links internos através de tags `<a>` padrão são detectados automaticamente e promovidos a transições SPA. Desenvolvedores podem criar apps SPA sem escrever uma única linha de JavaScript.
- **Suporte ao Histórico**: Utiliza a API `history.pushState` para que as atualizações de URL e os botões de "Voltar/Avançar" funcionem exatamente como o esperado, mesmo em transições SPA.

#### 4. Carregando o Motor do Lado do Cliente

Páginas exibidas apenas com SSR não precisam de `<script>`, mas para usar transições SPA, o Modo de Desenvolvimento Local (`file://`) ou CSR, cada página precisa carregar o motor do lado do cliente no seu `<head>`.

Em todos os modos o motor é carregado com este único `<script>`:

```html
<script src="bracify.js"></script>
```

Em páginas dentro de uma subpasta use um caminho relativo (p. ex. `<script src="../bracify.js"></script>`).

- **Modo servidor**: O servidor serve o motor no caminho virtual `/bracify.js` (somente na raiz) como `text/javascript`. Mesmo que o projeto tenha um arquivo com o mesmo nome, o motor do próprio servidor sempre prevalece, de modo que SSR e navegador executem a mesma versão. Requisições condicionais com ETag são suportadas.
- **Modo de Desenvolvimento Local (`file://`)**: Como não há servidor, `bracify.js` precisa estar dentro do projeto, acessível a partir da página por um caminho relativo. O scaffold do Studio e o build da CLI o criam automaticamente. Caso contrário, copie `engine/lib/engine.cjs` do repositório como `bracify.js` ([`examples/`](./examples/) atualiza sua cópia com `npm run sync:examples`).
- **Compatibilidade**: O antigo `/engine/engine.cjs` continua sendo servido (como `text/javascript`). Nas transições SPA o script do motor é reconhecido por qualquer um dos nomes `bracify.js`, `engine.js` e `engine.cjs` e não é carregado novamente.

---

## Referência

### Atributos Customizados

#### `data-t-include`

Carrega um arquivo HTML externo e o expande como conteúdo do elemento. Este atributo possui dois modos: **Snippet Include** e **Layout Application**.

Em ambos os modos, **a tag que contém o atributo `data-t-include` não é removida; seu conteúdo interno (innerHTML) é substituído pelo resultado da expansão.**

---

##### Modo 1: Snippet Include (Inclusão de Fragmento)

Insere componentes comuns, como headers ou footers, no local atual.

- **Operação**: Expande o conteúdo do arquivo especificado diretamente dentro da tag.
- **Exemplo**:

    ```html
    <header data-t-include="_parts/header.html"></header>
    ```

    ↓ O conteúdo de `_parts/header.html` é inserido.

---

##### Modo 2: Layout & content (Layout e Conteúdo)

Carrega uma estrutura comum ("layout") e preenche áreas específicas dentro dela com seu próprio conteúdo.

- **Operação**:
    1. Carrega o arquivo de template especificado em `data-t-include`.
    2. Associa os elementos `data-t-content` do template com os elementos `data-t-content` dentro da página atual.
    3. Injeta o conteúdo da página nos locais correspondentes do template.
- **Regra de Associação**: Elementos com valores (nomes) idênticos no atributo `data-t-content` são usados para a substituição. Se nenhum nome for fornecido, será tratado como o slot padrão.

- **Exemplo**:
    **Template (`_parts/layout.html`)**:

    ```html
    <div class="container">
        <h1 data-t-content="page-title">Título Padrão</h1>
        <main data-t-content="main-body"></main>
    </div>
    ```

    **Página que usa o layout (`index.html`)**:

    ```html
    <body data-t-include="_parts/layout.html">
        <span data-t-content="page-title">Meu Perfil</span>
        <div data-t-content="main-body">
            <p>O conteúdo do corpo da página vai aqui.</p>
        </div>
    </body>
    ```

    ↓ **Resultado**:

    ```html
    <body>
        <div class="container">
            <h1 data-t-content="page-title">Meu Perfil</h1>
            <main data-t-content="main-body">
                <div data-t-content="main-body">
                    <p>O conteúdo do corpo da página vai aqui.</p>
                </div>
            </main>
        </div>
    </body>
    ```

- **Nota**: A mesclagem ocorre no lado do servidor durante o uso do servidor de desenvolvimento ou via File System Access API no navegador.

---

##### Inclusão Dinâmica (Caminho via Placeholder)

O caminho do include pode usar o placeholder `{ }`, permitindo trocar o arquivo carregado por um parâmetro de URL, por exemplo.

```html
<!-- Se ?p=_parts/help.html, expande _parts/help.html -->
<div data-t-include="{?p}"></div>
```

- Se o valor estiver vazio (por exemplo, o parâmetro não foi informado) ou o carregamento for recusado pelas restrições abaixo, nada é expandido e o conteúdo original do elemento é mantido (o mesmo vale quando se atinge uma inclusão circular, o limite de aninhamento ou o limite de includes por renderização).
- **Restrições de caminho**: O caminho expandido deve ficar dentro do projeto. Caminhos que contenham `..`, que contenham o diretório `_sys`, que contenham `:` (como `C:` ou `http:`) ou que comecem com `\` não são carregados (igual em SSR e CSR). Também não é expandido se o arquivo informado não existir.
- **Nota de segurança**: Se você usar um parâmetro de URL diretamente como caminho, os visitantes poderão inserir qualquer HTML do projeto (inclusive partes em `_parts/`). Se os destinos possíveis forem conhecidos, recomenda-se usar `data-t-if` para exibir um include de caminho fixo para cada candidato.

  ```html
  <div data-t-if="_sys.query.tab=help" data-t-include="_parts/help.html"></div>
  <div data-t-if="_sys.query.tab=faq" data-t-include="_parts/faq.html"></div>
  ```

#### `data-t-source`

Buscar dados para exibir no HTML e dar um nome a eles.

- **Uso**: Especifique a URL dos dados no atributo `href` e atribua qualquer nome.
- **Especificação da URL de Dados**:
  - **Formato Recomendado**: `_sys/data/{NomeDados}.json` (Caminho Relativo)
    - Recomenda-se omitir a barra inicial `/`, pois este formato funciona na visualização local (`file://`).
  - **Formato Permitido**: `/_sys/data/{NomeDados}.json` (Aparência de Caminho Absoluto)
    - No CSR (navegador), a barra inicial `/` é ignorada automaticamente e tratada como caminho relativo.
- **Restrições de Nome**: Apenas **caracteres alfanuméricos, underscores `_` e hifens `-`** são permitidos.
  - Caminhos contendo `..` ou `/` (Directory Traversal) são **proibidos** e não serão carregados.
- **Restrição**: Pode ser especificado apenas em tags `<link>`.
- **Exemplo**:

    ```html
    <!-- OK (Recomendado): Caminho Relativo -->
    <link data-t-source="articles" href="_sys/data/article.json">

    <!-- OK: Com barra inicial (tratada internamente como relativa) -->
    <link data-t-source="users" href="/_sys/data/user.json?status=active">

    <!-- NG: Directory traversal proibido -->
    <link data-t-source="invalid" href="_sys/data/../../conf.json">
    ```

#### Exibição de Dados (Placeholder Universal)

Você pode exibir dados escrevendo `{nome_da_fonte.nome_do_item}` no texto HTML ou em valores de atributos.

- **Exemplo Básico**:
    Especifique a fonte de dados e a propriedade (item) para exibir.

    ```html
    <link data-t-source="article" href="/_sys/data/articles.json?id={?id}">
    <h1>{article.title}</h1>
    <p>{article.body}</p>
    ```

- **Exibição de Dados Aninhados**:
  Você pode acessar propriedades aninhadas dentro de um objeto usando a notação de ponto `.`. Você pode descrever hierarquias profundas da mesma maneira.

  ```json
   {
    "user": {
      "name": "João Silva",
      "address": {
        "city": "São Paulo"
      }
    }
  }
  ```

  ```html
  <p>Nome de Usuário: {user.name}</p>
  <p>Cidade: {user.address.city}</p>
  ```

- **Relações de dados automáticas (lookup)**:
  Quando várias fontes são carregadas com `data-t-source`, você pode seguir uma chave estrangeira até dados relacionados com a notação de ponto. Para `article.category`, se o objeto não tiver a propriedade `category` mas tiver `category_id` (ou `categoryId`), o Bracify procura automaticamente o registro cujo `id` coincide na fonte de dados com o nome no plural de `category` (`categories`). Nenhum atributo ou sintaxe adicional é necessário.

  ```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <link data-t-source="categories" href="/_sys/data/categories.json">

  <!-- articles: [{ "id": 1, "title": "Hello", "category_id": 2 }] -->
  <!-- categories: [{ "id": 2, "name": "Tech" }] -->
  <ul>
    <li data-t-list="articles">{articles.title} ({articles.category.name})</li>
  </ul>
  ```

  - O nome da fonte é testado como `X + s`, `X + es`, (se terminar em `y`) `ies` e por fim `X`; a primeira que existir é usada.
  - Os `id` são comparados como strings. Se não houver correspondência, comporta-se como qualquer valor indefinido.
  - Uma propriedade real `category` no objeto sempre tem prioridade.
  - Cadeias como `article.category.parent.name` também funcionam.
  - `article.category` em si resolve para o registro relacionado inteiro, podendo ser usado com `data-t-scope="article.category"` ou `data-t-if="article.category"`.
  - O auto-binding de formulários (preencher inputs por `name`) NÃO segue relações; use o campo da chave estrangeira (ex.: `name="category_id"`).
  - Usa-se a primeira fonte existente mesmo sem registro correspondente; as seguintes não são tentadas.
  - Funciona em `{ }`, `data-t-if`, `data-t-list`, `data-t-scope` e em bindings de atributos (`href="/cat.html?id={article.category.id}"`), de forma idêntica em SSR e CSR.

- **Cálculos numéricos (aritmética)**:
  Você pode realizar operações aritméticas (`+`, `-`, `*`, `/`, `%`) e usar parênteses `()` dentro dos placeholders `{ }` para calcular valores numéricos sem escrever JavaScript. Combine valores de dados e literais numéricos e passe o resultado para os pipes subsequentes (`|`).

  ```html
  <!-- Soma de variáveis (próximo offset de paginação) -->
  <a href="?_offset={_sys.query._offset + 10}">Next</a>

  <!-- Multiplicação combinada com pipe (imposto / total) -->
  <span>Total: {item.price * 1.1 | number} 円</span>

  <!-- Precedência com parênteses -->
  <span>Total: {(item.price + item.shipping) * item.qty}</span>
  ```

  - As variáveis na expressão (por exemplo, `item.price`) são resolvidas automaticamente a partir dos dados. Valores indefinidos, `null` ou não numéricos são tratados com segurança como `0`, portanto a renderização nunca é interrompida por um erro.
  - Divisão/módulo por `0` retorna `0`.

- **Exibindo índices de lista**:
  Para cada elemento iterado por `data-t-list`, um índice baseado em zero `_index` é injetado automaticamente. Adicione `+ 1` para corrigir para um índice baseado em um.

  ```html
  <ul>
    <li data-t-list="projects">No. {projects._index + 1}: {projects.title}</li>
  </ul>
  ```

- **Escapando Placeholders**:
  Se você quiser exibir a notação do placeholder como está sem avaliá-la, coloque uma barra invertida `\` antes da chave de abertura.

  ```html
  <code>\{user.name\}</code> <!-- Resultado: {user.name} -->
  <code>C:\\temp</code> <!-- Resultado: C:\temp (uma barra invertida literal é escrita como \\) -->
  ```

- **Quando um valor não existe**:
  Quando os dados existem (um `data-t-source`, um `data-t-scope` ou o item atual de `data-t-list`) mas falta o campo ou o registro relacionado (p. ex. `{book.author.name}` de um autor excluído), o placeholder é renderizado como **string vazia**, tanto em texto quanto em atributos (`class="s-{book.status}"` vira `class="s-"`). Use `data-t-if` para controlar a exibição. `{...}` só permanece como está quando os próprios dados não estão disponíveis (fonte/escopo não carregado ou indefinido).
  - `{?x}` / `{_sys.query.x}` com um parâmetro de URL ausente também são renderizados vazios (`_sys` está sempre disponível). Um `data-t-scope` sobre um registro relacionado inexistente (p. ex. `data-t-scope="book.author"`) é um escopo vazio válido e seus placeholders internos são renderizados vazios.
  - **Limitação de valores de filtro**: no `href` de um `data-t-source`, um valor de filtro que contenha `{` e `}` ao mesmo tempo (p. ex. buscar um livro intitulado `{foo}` com `?title={foo}`) é tratado como placeholder não resolvido e o filtro é ignorado (SSR e CSR).

### Exibindo Listas (`data-t-list`)

Se houver vários itens de dados que você deseja exibir, você deve especificar `data-t-list="Nome da Fonte de Dados"` no elemento (intervalo) que deseja repetir.

```html
  <link data-t-source="articles" href="/_sys/data/articles.json">
  <ul>
    <li data-t-list="articles">
      <h3>{articles.title}</h3>
    </li>
  </ul>
```

#### Inserindo Dados em Atributos (Placeholder Universal)

Em todos os atributos padrão (`href`, `src`, `class`, `value`, `style`, etc.), você pode inserir dados diretamente usando placeholders `{ }`.

- **Exemplo de Uso**:

    ```html
    <img src="{article.thumbnail}" alt="{article.title}">
    <a href="/post/{article.id}" class="btn {article.category}">Ver Detalhes</a>
    <div style="background-color: {user.color}; height: {progress}%;"></div>
    ```

- **Limitação**: Para evitar interferência com a sintaxe do JavaScript, **não é possível usar placeholders dentro de atributos de eventos (`onclick`, `onchange`, etc.).**

#### Evitando Interferências e Limitações

Os placeholders `{ }` do Bracify podem ser usados em atributos HTML e nós de texto. No entanto, para evitar conflitos com códigos JavaScript ou CSS, a **expansão é desativada** nos seguintes locais:

- **Onde a expansão NÃO ocorre**:
  - Dentro de tags `<script>`.
  - Dentro de tags `<style>`.
  - Dentro de atributos de eventos (todos que começam com `on`, como `onclick`, `onmouseover`).

##### Padrão Recomendado: Usando dados em eventos

Se precisar de dados dinâmicos em um evento JavaScript, recomendamos **inserir o dado em um atributo `data-` e acessá-lo via `this.dataset`**, em vez de escrever `{ }` diretamente no atributo de evento.

```html
<!-- NÃO recomendado (não funcionará) -->
<button onclick="alert('ID: {article.id}')">Mostrar</button>

<!-- Padrão RECOMENDADO -->
<button data-id="{article.id}" onclick="alert('ID: ' + this.dataset.id)">Mostrar</button>
```

Dessa forma, o motor de templates do Bracify e o JavaScript padrão do navegador coexistem de forma segura.

#### Vinculação Automática de Formulários

Se um atributo `name` for definido em elementos `input`, `select` ou `textarea`, o `Bracify` vinculará automaticamente o valor da fonte de dados correspondente. Não é necessário definir `value` ou placeholders manualmente.

- **Prioridade de Vinculação**:
    1. **Contexto de dados atual**: Define o valor baseado em propriedades de dados especificados por `data-t-scope`, etc.
    2. **Parámetros de URL (`_sys.query`)**: Se houver um item na URL com o mesmo nome do atributo `name`, esse valor será usado. Se um parâmetro se repetir (`?tag=a&tag=b`), usa-se o último valor (tanto em SSR quanto em CSR).

- **Exemplo (Formulário de Busca)**:

    ```html
    <!-- Se a URL for ?title=Web, o valor "Web" será automaticamente preenchido -->
    <input type="text" name="title" placeholder="Buscar artigos...">
    ```

- **Exemplo (Formulário de Edição)**:

    ```html
    <!-- title e content do objeto article serão preenchidos nos campos correspondentes -->
    <form data-t-scope="article" method="POST" action="/_sys/data/article.json?_method=PUT">
      <input type="hidden" name="id">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **Seleção Automática em Selects**:
    O atributo `selected` é adicionado automaticamente ao `<option>` cujo `value` corresponder ao dado vinculado ao `<select>`. Também vale para opções geradas com `data-t-list`.

#### `data-t-if`

Exibe ou esconde elementos baseado em condições. O elemento é exibido se o valor do dado existir (`true`, não nulo, não zero, string não vazia).

- **Especificação**: Indique o nome do item de dado a ser avaliado.
- **Exemplo**:

    ```html
    <!-- Exibido apenas se user.is_login for verdadeiro -->
    <div data-t-if="user.is_login">
      Bem-vindo, <span>{user.name}</span>!
    </div>
    ```

    ↓ **Resultado (se `user.is_login` for true)**

    ```html
    <div>
      Bem-vindo, <span>João Silva</span>!
    </div>
    ```

    ↓ **Resultado (se `user.is_login` for false)**

    ```html
    <!-- O elemento não é gerado no HTML final -->
    ```

    **Nota (Condição Negativa / Else)**:
    Adicionando `!` no início, você define a condição para quando o valor não existe (falso). Use isso como alternativa ao `else`.

    ```html
    <!-- Exibido apenas se user.is_login for falso -->
    <div data-t-if="!user.is_login">
      <a href="/login.html">Por favor, faça login</a>
    </div>
    ```

    **Operações de Comparação e Lógicas (Estilo Data API)**:
    Você pode especificar condições mais detalhadas usando a mesma sintaxe dos parâmetros de consulta da Data API.

    - **Operadores de Comparação**: Usa a mesma notação que os [Operadores da API de Acesso a Dados](#operadores) (`=`, `:ne=`, `:gt=`, etc.).
    - **Operações Lógicas (AND/OR)**: A separação por espaços representa **AND**, e a separação por vírgulas nos valores representa **OR**.
    - **Uso de Variáveis**: Ao inserir entre `{ }`, você pode usar valores de dados nas condições. Dentro de `{ }` também é possível usar [operações aritméticas](#exibição-de-dados-placeholder-universal) (ex.: `matched._length:gt={_sys.query._offset + 10}`).
    - **Chave Única**: Se você escrever apenas a chave sem operadores, será determinada a presença (veracidade) desse valor como antes.

    ```html
    <!-- Status for publicado (status == 'published') -->
    <span data-t-if="status=published">Publicado</span>

    <!-- Preço for 1000 ou mais E estoque for maior que 0 -->
    <div data-t-if="price:gte=1000 stock:gt=0">
      Item Popular (Em Estoque)
    </div>

    <!-- Função for admin OU editor -->
    <button data-t-if="role=admin,editor">Editar</button>

    <!-- ID do usuário for igual ao ID do autor do artigo -->
    <div data-t-if="user.id={post.author_id}">
      <a href="/edit">Editar Artigo</a>
    </div>

    <!-- Exibir "Próxima" apenas se houver uma próxima página. allArticles é uma fonte separada carregada sem _limit / _offset, usada para contagem (quantidade > offset atual + 10) -->
    <a data-t-if="allArticles._length:gt={_sys.query._offset + 10}" href="?_offset={_sys.query._offset + 10}">Próxima</a>
    ```

#### `data-t-redirect`

Define a URL para onde o usuário será redirecionado após um processo (como envio de formulário) ser concluído com sucesso.

- **Especificação**: Indique o caminho relativo ou absoluto.
- **Alvo**: Tag `form`.
- **Funcionamento**: Após o servidor completar o processamento, redireciona com status 302 para o caminho especificado. Caso contrário, recarrega a página atual.
- **Regras de destino**: Caminhos relativos são resolvidos a partir da página que contém o formulário. Apenas destinos de mesma origem são permitidos; qualquer outro volta para a página do formulário, ou `/`.

### Formulários e Salvamento de Dados (Postback)

Você pode criar e atualizar dados usando tags `<form>` padrão. O Bracify utiliza **postbacks padrão do navegador (envios que envolvem transição de página)**, sem o uso de JavaScript assíncrono (fetch).

- **Tratamento Automático**: Defina o destino no atributo `action` (ex: `/_sys/data/xxxxx.json`) e envie via `method="POST"` (para atualizar, use `action="/_sys/data/xxxxx.json?_method=PUT"` mais `<input type="hidden" name="id">`; o `<form>` do navegador não consegue enviar `PUT`).
- **Redirecionamento (Padrão PRG)**: Após salvar no servidor, redireciona automaticamente para a URL definida em `data-t-redirect` ou para a página original. Isso evita o "reenvio de formulário" e permite uma navegação segura.
- **Data Binding (Valores Iniciais)**: Ao usar `data-t-scope` na tag `<form>`, você pode preencher os campos com dados existentes.
- **Nomes dos Campos**: O atributo `name` de `<input>` e `<textarea>` corresponde à propriedade no objeto de dados.
- **Validação no servidor**: as restrições escritas no formulário (`required` / `maxlength` / `minlength` / `min` / `max` / `pattern` / `type="email"` / `type="date"` / opções de `select` e `radio`) também são aplicadas no servidor (veja "Validação no servidor" no tratamento de formulários). Em caso de falha, nada é salvo e o usuário volta para `data-t-redirect` (ou a página de origem) com `?error=mensagem`; exiba com `{_sys.query.error}`.
- **Somente no modo servidor**: Os dados são salvos apenas no servidor (SSR). O Modo de Desenvolvimento Local (`file://`) não tem mecanismo de escrita, então formulários `POST` / `PUT` / `DELETE` não são salvos (suporte em estudo em [#56](https://github.com/tri-comma/Bracify/issues/56)).

### Filtros de Processamento (Pipes)

Você pode usar filtros de processamento (nome oficial: pipes) `|` ao exibir dados.

#### Sintaxe Básica

```html
<p>Atualizado em: { article.updated_at | date: 'dd/mm/yyyy HH:MM' }</p>
<span>Preço: { product.price | currency }</span>
<span>Status: { article.is_published | ternary: 'Publicado', 'Rascunho' }</span>
<span>Apelido: { user.nickname | default: 'Anônimo' }</span>
<span>Resumo: { article.summary | truncate: 10 | uppercase }</span>
```

↓ **Resultado** (quando `article.summary` é `"Bracify is simple"`)

```html
<p>Atualizado em: 10/12/2025 14:05</p>
<span>Preço: ¥1.500</span>
<span>Status: Rascunho</span>
<span>Apelido: Anônimo</span>
<span>Resumo: BRACIFY...</span>
```

#### Sintaxe de Pipe

```text
{ nome_da_fonte.nome_do_item | nome_do_filtro }
{ nome_da_fonte.nome_do_item | nome_do_filtro: argumento }
{ nome_da_fonte.nome_do_item | nome_do_filtro: 'argumento1', 'argumento2' }
{ nome_da_fonte.nome_do_item | nome_do_filtro1 | nome_do_filtro2: 'argumento' }   ← encadeamento (aplicado da esquerda para a direita)
```

- Tudo o que segue o primeiro `:` após o nome do filtro é tratado como seus argumentos. Múltiplos argumentos são separados por `,`.
- Os argumentos podem ser envolvidos em `'...'` ou `"..."`. Dentro das aspas, `:` `,` e `|` não são tratados como separadores. Argumentos numéricos não precisam de aspas (ex.: `truncate: 20`).
- **Os argumentos não podem conter `}`** (seria interpretado como o fim do placeholder).
- Vários filtros podem ser encadeados com `|`. A saída do filtro anterior se torna a entrada do próximo (aplicado da esquerda para a direita).
- Pipes também podem ser aplicados ao resultado de uma expressão aritmética: `{ item.price * 1.1 | currency }`

#### Nota sobre o momento de aplicação

Os pipes são aplicados somente depois que os dados alvo terminam de carregar. Enquanto os dados ainda não foram carregados, o placeholder `{ ... }` permanece como está na página e é substituído pelo valor correto assim que o carregamento é concluído. Para aproveitar isso, posicione `data-t-source` o mais cedo possível em relação ao local de uso (recomendado: um `<link data-t-source>` no `<head>`).

### Filtros Padrão (Pipes embutidos)

#### `date`

Gera texto a partir de uma data no formato especificado.

- **Sintaxe**: `{ item | date: 'formato' }`
- **Opções**:
  - `yyyy`: Ano (4 dígitos)
  - `mm`: Mês (2 dígitos)
  - `dd`: Dia (2 dígitos)
  - `HH`: Hora (2 dígitos, formato 24h)
  - `MM`: Minuto (2 dígitos)
  - `SS`: Segundo (2 dígitos)
- **Observação**: `mm` (minúsculo, mês) e `MM` (maiúsculo, minuto) são diferenciados por maiúsculas/minúsculas.
- Exemplo: `{ article.updated_at | date: 'dd/mm/yyyy HH:MM' }` → `10/12/2025 14:05`

#### `number`

Exibe números com separação de milhar.

- **Sintaxe**: `{ nome_item | number }`

#### `currency`

Exibe números formatados como moeda.

- **Sintaxe**: `{ nome_item | currency }` / `{ nome_item | currency: 'código_da_moeda' }`
- O código da moeda segue o padrão ISO 4217 (ex.: `USD`, `EUR`). Se omitido, `JPY` é usado.
- Exemplo: `{ product.price | currency }` → `¥1.500`
- Exemplo: `{ product.price | currency: 'USD' }` → `$1,500.00`

#### `uppercase` / `lowercase`

Converte uma string para maiúsculas ou minúsculas.

- **Sintaxe**: `{ nome_item | uppercase }` / `{ nome_item | lowercase }`
- Exemplo: `{ user.code | uppercase }` → `ABC-001`

#### `truncate`

Trunca uma string no comprimento especificado, adicionando `...` se ela foi reduzida.

- **Sintaxe**: `{ nome_item | truncate: comprimento }`
- A string truncada, incluindo `...`, cabe dentro do comprimento especificado (ex.: com `truncate: 10`, `Bracify is simple` → `Bracify...` (10 caracteres)).
- Se o comprimento especificado for 3 ou menos, `...` não é adicionado — apenas os primeiros caracteres são exibidos, conforme o comprimento indicado.
- Se o valor já estiver dentro do comprimento especificado, é exibido sem alterações.

#### `default`

Define um valor alternativo a ser exibido quando o valor está vazio (`undefined`, `null` ou string vazia).

- **Sintaxe**: `{ nome_item | default: 'valor_alternativo' }`
- `0` e `false` não são considerados "vazios" e são exibidos como estão.
- Exemplo: `{ user.nickname | default: 'Anônimo' }`

#### `ternary`

Alterna a string exibida com base em uma condição booleana.

- **Sintaxe**: `{ nome_item | ternary: 'valor_se_verdadeiro', 'valor_se_falso' }`
- A avaliação de veracidade usa as mesmas regras de `data-t-if` (`false`, `0`, `""`, `null`, `undefined`, arrays vazios e objetos vazios são falsos). Observe que as strings `"false"` e `"0"` são verdadeiras.
- Se o argumento do caso falso for omitido, uma string vazia é exibida.
- Exemplo: `{ article.is_published | ternary: 'Publicado', 'Rascunho' }`

#### `json`

Exibe os dados como uma string JSON formatada. Útil para depuração.

- **Sintaxe**: `{ nome_item | json }`

## Processamento de Salvamento (Form Handler)

O Bracify não fornece APIs de dados externas. Todos os recursos sob `/_sys` são ocultados, exceto os seguintes endpoints que funcionam como receptores de formulários.

```text
POST /_sys/data/{entity}.json
```

Este endpoint não pode ser acessado via `GET` pelo navegador (403 Forbidden). Ele só está disponível como o `action` de um formulário.

#### Operações de Dados
As operações são feitas via HTTP, mas a resposta é sempre um "redirecionamento para uma página".

| Método | Ação | Descrição |
| :--- | :--- | :--- |
| `POST` | Criar | Cria novos dados. Um `id` que já existe é recusado e não é sobrescrito (sobrescrever é somente com `PUT`). |
| `PUT` | Atualizar | **Substitui por completo** o registro indicado por `id` pelos dados enviados (se o `id` não existir, o registro é criado). |
| `DELETE`| Deletar | Remove os dados especificados. |

Os `<form>` padrão só enviam `GET` / `POST`; assim, um `POST` com `_method=PUT` ou `_method=DELETE` na query é tratado como esse método (ex.: `<form method="POST" action="/_sys/data/article.json?id=1&_method=DELETE">`).

`PUT` exige o `id` de destino (`?id=` na query ou um campo `id` no formulário) e não é uma atualização parcial. Campos não incluídos no formulário são **removidos** do registro salvo. Para os valores que deseja manter, inclua-os no formulário como campos preenchidos com `data-t-scope` (com `type="hidden"`, se necessário).

Um `DELETE` exige pelo menos um filtro de dados (como `id`). Um `DELETE` sem filtro (inclusive com apenas `_limit` e parâmetros semelhantes) é rejeitado com 400 para que nunca apague toda a entidade.

#### Validação no servidor

Em `POST` / `PUT`, antes de salvar o corpo (inclusive nomes aninhados `a.b`) é verificado com as restrições derivadas dos formulários do projeto. Requisições que contornam o navegador (ex.: `curl`) ficam sujeitas às mesmas restrições.

- **Restrições aplicadas**: `required`, `maxlength`, `minlength`, `min` / `max` de `type="number"` / `type="range"`, `pattern` (correspondência total; padrões perigosos com quantificadores aninhados são ignorados e valores com mais de 1000 caracteres são recusados), `type="email"`, `type="date"` (`YYYY-MM-DD`) e as opções de `<select>` e `radio`.
- **Quais formulários contam**: os formulários cujo `action` é o `_sys/data/<entity>.json` da entidade e cujo `method` é `POST` (ou `PUT`). Os campos de parciais carregados com `data-t-include` são incluídos. Formulários `GET` (ex.: busca) e de `_method=DELETE` são ignorados. Contam todos os arquivos HTML do projeto (exceto `_sys`, pastas iniciadas por ponto e `node_modules`); por isso uma cópia obsoleta de uma página pode afrouxar a validação. `data-t-include` só é expandido dentro de elementos `<form>`, portanto os campos fornecidos por um layout cujo formulário envolve slots da página não são validados nem tipados. Uma entidade sem tais formulários, e campos que nenhum formulário declara, não são validados. Se os valores de `<option>` / `radio` são gerados com `{ }`, as opções não são verificadas.
- **Vários formulários gravando na mesma entidade**: prevalece a declaração mais permissiva, para que um formulário nunca recuse envios legítimos de outro. Um campo é `required` somente se todos os formulários de escrita o contêm e o marcam como obrigatório; qualquer outra restrição recusa um valor somente se ele a viola em todos os formulários que declaram o campo (sem restrição em um, sem restrição).
- **Não verificado**: controles `disabled`, restrições de `type="hidden"`, o `required` de controles dentro de `data-t-if` ou repetidos por `data-t-list` (podem não ser exibidos; um grupo de `radio` gerado com `data-t-list` mantém seu `required`) e o `required` de um grupo de checkboxes de mesmo nome (o `required` de um checkbox único é aplicado). Um campo aceita um único valor: arrays e objetos são recusados, exceto em `<select multiple>` e grupos de checkboxes de mesmo nome. `type="email" multiple` é validado por cada endereço separado por vírgula.
- **Em caso de falha**: nada é salvo. Um envio de formulário (requisição que espera HTML) recebe um 303 para `data-t-redirect` (ou o `Referer`) com `?error=`; clientes JSON recebem `400` e `{ "error": "..." }`. Exiba a mensagem na página com `{_sys.query.error}`.
- **`id` duplicado**: um `POST` com um `id` que já existe (no corpo ou como `?id=`) é recusado da mesma forma (`409` em JSON). Um `id` que não seja texto nem número é recusado com 400 tanto em `POST` quanto em `PUT`. Para atualizar um registro existente use `PUT` (em um formulário: `action="...?_method=PUT"` mais `<input type="hidden" name="id">`).
- `DELETE` não é validado. Alterações no HTML têm efeito sem reiniciar.

```html
<form method="POST" action="/_sys/data/books.json" data-t-redirect="/books.html">
  <p data-t-if="_sys.query.error">{_sys.query.error}</p>
  <input name="title" required maxlength="80">
  <button type="submit">Criar</button>
</form>
```

#### Tipos dos valores armazenados

Os valores de um `POST` / `PUT` que passam na validação são convertidos para o tipo do input do formulário antes de serem gravados (a criação e a atualização de registros do Studio seguem as mesmas regras). Os valores de um formulário são strings por natureza, e gravá-los assim faz o `_sort` ordenar como texto e o `"false"` contar como verdadeiro em `data-t-if`.

| Input | Envio de formulário | JSON |
| :--- | :--- | :--- |
| `type="number"` / `"range"` | Uma string numérica vira número (`" 9 "` -> `9`). Uma string vazia ou só com espaços omite o campo. `0x10`, `1e999`, `NaN`, `1,5`, `9px` e semelhantes são rejeitados, assim como inteiros além de ±2^53 (`Number.MAX_SAFE_INTEGER`), por serem grandes demais | Números finitos são mantidos; strings numéricas são convertidas; booleanos e arrays são rejeitados. `min` / `max` valem para o número convertido |
| Um `checkbox` único | `true` se enviado (qualquer que seja o `value`), `false` se não | Booleanos são mantidos. Strings se limitam a `"true"`, `"on"`, o próprio `value` do checkbox (todas `true`) e `"false"` (`false`), sem distinção de maiúsculas (o `value` declarado distingue); qualquer outra string (`"no"`, `"0"` ...) ou número é rejeitado. Um checkbox obrigatório não aceita `false`. Uma string vazia conta como não enviada |
| Um grupo de `checkbox` (mesmo nome, várias caixas) e `<select multiple>` | Sempre um array de strings (`["x"]` mesmo com um valor); sem seleção, o campo é omitido | Um array de strings (uma string isolada é envolvida em um array) |
| `text`, `textarea`, `email`, `select`, `radio`, `date` ... | Mantido como string | Apenas strings; números e booleanos são rejeitados (`false` / `0` não satisfazem mais `required`). `radio`, `select` e `hidden` também aceitam números finitos, gravados como enviados (para ids de relação como `author_id: 1`); booleanos são rejeitados |

- **Quando uma caixa desmarcada vira `false`**: somente se **todos** os formulários de escrita da entidade contêm esse `checkbox`. Se algum formulário não o tem, o campo não enviado não é gravado (para não sobrescrever os dados desse formulário). O `PUT` se comporta igual: uma caixa desmarcada é substituída por `false`.
- **Não convertidos**: campos cujo tipo difere entre formulários (ex.: `type="number"` em um e `type="text"` em outro), campos que nenhum formulário declara, `id` (sempre string) e entidades sem formulário de escrita são gravados como enviados. Os campos fornecidos por um layout cujo formulário envolve slots da página (`data-t-include` só é expandido dentro de elementos `<form>`) não são validados nem tipados.
- **Notação com pontos**: se um campo como `meta.isbn` é declarado, enviar o pai (`meta`) como algo que não seja objeto (string, número, booleano, array ou `null`) é rejeitado para que as restrições do filho não sejam contornadas (o mesmo vale para `meta=str&meta.isbn=x`).
- `NaN` / `Infinity` nunca são gravados. Se a validação ou a verificação de tipos falhar, nada é gravado.
- **Os dados existentes não são migrados**: valores já gravados como strings (`"9"`, `"on"`) permanecem como estão e continuam sendo ordenados e comparados como texto até o registro ser salvo de novo.

> **Sobre a File API**: Os endpoints de gerenciamento de arquivos descritos em versões anteriores (GET/POST/PUT/DELETE em `/_sys/file/{filename}.{ext}`) **não estão implementados**. Coloque arquivos estáticos, como imagens, dentro do projeto e referencie-os por URLs normais (ex.: `/images/logo.png`).

### Condições de Filtragem de Dados

Parâmetros de consulta adicionados ao `href` de `data-t-source` filtram os dados a serem obtidos (a mesma notação é usada nas condições de filtro do `DELETE`).

#### Parâmetros

- **`{entity}`**: Tipo de dado (entidade). Ex: `article`, `user`.
- **`{prop}`**: Campo usado para filtrar.
- **`{val}`**: Valor para a condição.

#### Operadores

| Operador | Significado | Exemplo | Descrição |
| :--- | :--- | :--- | :--- |
| (nenhum) | Igual | `?status=active` | Status é `active` |
| `:ne` | Diferente | `?status:ne=draft` | Status NÃO é `draft` |
| `:gt` | Maior que | `?price:gt=1000` | Maior que 1000 |
| `:gte` | Maior ou igual | `?price:gte=1000` | 1000 ou maior |
| `:lt` | Menor que | `?stock:lt=10` | Menor que 10 |
| `:lte` | Menor ou igual | `?stock:lte=10` | 10 ou menor |

#### Curinga (`*`)

Se o valor de uma condição sem operador (igual) contiver `*`, ela se torna uma busca por padrão (como o `LIKE` do SQL), em que `*` corresponde a qualquer string.

| Exemplo | Corresponde a |
| :--- | :--- |
| `?title=Web*` | Títulos que começam com `Web` |
| `?title=*Guia*` | Títulos que contêm `Guia` |

- Válido apenas no modo servidor (Data API). O Modo de Desenvolvimento Local só aceita correspondência exata, e `*` é comparado como um caractere comum.
- Na condição de `id` e nas condições de filtro do `DELETE`, `*` é tratado como caractere comum (não há busca por padrão).
- **Atenção**: Se você usar a entrada do usuário diretamente como condição, como em `?title={?q}`, os usuários podem especificar uma busca por padrão; por exemplo, `q=*` corresponde a todos os registros que têm esse campo. Além disso, quando o valor contém `*`, assim como no `LIKE` do SQL, `_` corresponde a qualquer caractere único e `%` a qualquer string, e letras latinas não diferenciam maiúsculas de minúsculas.

### Variável Reservada (`_sys`)

| Nome | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_sys.query` | Parâmetros GET da URL. | `{_sys.query.id}` |

#### Atalho `{?xxx}`

`{?xxx}` é uma forma abreviada de `{_sys.query.xxx}` e pode ser usada não só no `href` de `data-t-source`, mas em qualquer lugar onde placeholders sejam aceitos, como texto, valores de atributos, `data-t-if` e `data-t-include`. Pipes e operações aritméticas funcionam da mesma forma.

```html
<!-- Se a URL for ?q=bracify -->
<p>Resultados da busca por "{?q}"</p>     <!-- Resultados da busca por "bracify" -->
<p>{?q | uppercase}</p>                    <!-- BRACIFY -->
<a href="books.html?q={?q | default: ''}&_sort=title">Ordenar por título</a>
```

- Se o parâmetro não existir, vira uma string vazia.
- **Sobre a codificação de URL**: Valores embutidos na parte de consulta do `href` de `data-t-source` são codificados em URL automaticamente, mas em atributos comuns (como `<a href>`) é feito apenas o escape de HTML, sem codificação de URL. Colocar na query de um link um valor que possa conter `&` ou `=` pode fazer com que seja interpretado como outro parâmetro.
- O `{?}` sem valor (auto binding) só pode ser usado dentro do `href` de `data-t-source` (veja abaixo).

#### Uso no `data-t-source`

| Notação | Significado | Exemplo |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | Embutir campo (padrão) | `?id={_sys.query.id}` |
| `{?}` | **Auto Binding**. Busca valor na URL com mesmo nome da chave | `?title={?}` |
| `{?xxx}` | **Atalho**. | `?title={?q}` |

#### Exemplo

```html
<!-- Se a URL for ?title=Web&_limit=10 -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">
```

### Detalhes dos Dados (Propriedades de Sistema)

| Propriedade | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_length` | Quantidade de itens em uma lista ou tamanho de string. | `{articles._length} artigos` |

#### Parâmetros de Controle (Ordenação e Paginação)

| Parâmetro | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_limit` | Limite de busca | `?_limit=20` |
| `_offset` | Pular N itens | `?_offset=20` |
| `_sort` | Campo para ordenar | `?_sort=created_at` |
| `_order` | Ordem (`asc`, `desc`) | `?_order=desc` |

#### Exemplo de Estrutura de Diretórios

```text
projeto/
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

### Modo de Desenvolvimento Local (True Zero Server Mode)

Desenvolvimento abrindo o `index.html` via `file://` sem necessidade de servidor.

#### Desenvolvimento sem build via File System Access API

1. **Seleção de Pasta**: Ao abrir via `file://`, selecione a pasta raiz para que o navegador opere nos arquivos.
2. **Preview Instantâneo**: Como os arquivos são lidos diretamente, as mudanças aparecem ao recarregar ou navegar.

#### Redefinir o acesso à pasta

O identificador da pasta selecionada é salvo no IndexedDB do navegador e restaurado automaticamente na próxima vez. Para trocar de projeto ou refazer a permissão, redefina de uma destas formas (somente no modo `file://`).

- **Botão Disconnect Folder**: enquanto uma pasta está conectada, o motor exibe um pequeno botão "Disconnect Folder" no canto inferior direito. Ao clicar, o identificador salvo é descartado e a sobreposição de seleção de pasta é exibida novamente.
- **API JavaScript**: `Bracify.resetRootAccess()` (retorna uma Promise). Remove o identificador do IndexedDB, descarta o da memória e exibe novamente a sobreposição de seleção de pasta.
- **Parâmetro de URL**: abrir com `?bracify_reset=1` descarta o identificador salvo em vez de restaurá-lo e exibe a sobreposição. O parâmetro é removido da URL automaticamente via `history.replaceState`.

Nada dessa interface é incluído na saída SSR (servidor).

#### Navegação SPA

Conforme descrito em [Navegação SPA Unificada (Unified SPA)](#3-navegação-spa-unificada-unified-spa), todas as transições no modo CSR são tratadas como SPA. Isso resolve o grande desafio de perder as permissões de acesso à pasta ao recarregar um ambiente `file://`.

#### Limitações em Navegadores Não Compatíveis

Opera em modo "Mock Somente Leitura" com filtros limitados e sem salvamento.

#### Filtros e Controle (Especificações Comuns)

- **Filtros**: Apenas correspondência exata.
  - **Exceção do `id` vazio**: um filtro sobre a chave `id` é a exceção: se o valor estiver vazio ou for um marcador não resolvido (ex.: `{?}`), não retorna nenhum registro em vez de ser ignorado (assim, `?id={?id}&_limit=1` sem id mostra "não encontrado" em vez do primeiro registro).
- **Parâmetros**: `_limit`, `_offset`, `_sort`, `_order` funcionam de forma simples.

#### Comportamento do JavaScript

- **Isolamento**: Bracify usa IIFE nos scripts para evitar conflitos de variáveis entre páginas.
- **Não Duplicação**: Scripts do `<head>` já carregados não são reexecutados.
- **Variáveis Globais**: Dados no `window` persistem.

## Configuração do Banco de Dados

Usa SQLite (`_sys/data.db`) por padrão, mas pode conectar a MySQL/PostgreSQL via configurações na tabela `config`. As credenciais ficam fora do código-fonte.

### Como configurar

Via GUI (Bracify Studio) ou inserindo o JSON de conexão na tabela `config`.

```json
[
  {
    "target_entity": "users",
    "engine": "mysql",
    "option": { "host": "localhost", "port": 3306, "user": "admin", "password": "${DB_PASS}", "database": "app_db" }
  }
]
```

#### Prioridade de Roteamento

Seleciona o banco por nome da entidade: Correspondência Exata > Padrão Mais Longo > Ordem de Definição.

## Implantação (Deployment)

- **Serverless**: Vercel ou Netlify.
- **Upload de Zip**: Gere o Zip na GUI e arraste para o dashboard do seu provedor.

## Fluxo de Desenvolvimento

1. Instale o app GUI.
2. Crie ou selecione uma pasta.
3. Edite e veja o preview real.
4. Gere o Zip e publique!

## Segurança

- **Auto-Escape**: Previne XSS.
- **Injeção Segura**: Previne quebras de scripts.
- **Sanitização de URL**: Bloqueia protocolos perigosos.
- **Guarda de Underscore (Apenas SSR)**:
  Quando rodando como servidor, nega todo acesso externo direto (403 Forbidden) a recursos onde o nome do diretório ou arquivo na raiz começa com underscore (`_`).
  Isso protege dados internos como `data.db` ou componentes de inclusão (`_parts/`) a nível de servidor web.
  * Nota: Endpoints oficiais de formulário (ex: `POST /_sys/data/*.json`) estão isentos.
- **Proteção entre origens (Data API)**: qualquer requisição `POST` / `PUT` / `DELETE` para `/_sys/data/*.json` (incluindo substituições via `?_method=`) cujo cabeçalho `Origin` seja diferente de `Host` é rejeitada com 403 (requisições sem `Origin`, como envios de formulário normais, são permitidas).

## Exemplos (Examples)

A pasta [`examples/`](./examples/) contém o "Bracify Books", um aplicativo prático de biblioteca / registro de leitura que usa os recursos de referência deste README. Os mesmos arquivos funcionam sem alterações tanto no modo servidor (SSR + SQLite) quanto no modo de desenvolvimento local `file://`. Veja [`examples/README.md`](./examples/README.md) para saber como executar e para o mapa de recursos por arquivo.

## Contribuindo

Este projeto é desenvolvido por um único mantenedor, portanto Pull Requests de terceiros não são aceitos. Issues (relatos de bugs, solicitações de recursos e dúvidas) são bem-vindos. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para mais detalhes.
