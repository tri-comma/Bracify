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
</head>
<body>
  <h1>{info.msg}</h1>
</body>
</html>
```

### 3. Criar os Dados

Crie um arquivo chamado `/_sys/data/info.json` e escreva o seguinte:

```json
{
  "msg": "Olá Bracify!"
}
```

### 4. Executar

Pressione o botão `Start Server` no aplicativo GUI. Uma pasta `_dist` será gerada no seu projeto. Abra o arquivo `index.html` dentro da pasta `_dist` no seu navegador e você verá `Olá Bracify!`. Acessar `localhost:3000` mostrará o mesmo resultado.
Aproveite a experiência de exibir dados apenas com HTML, sem escrever uma única linha de JavaScript.

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
- **Gerenciador de Dados**:
  - Edição de JSON, estimativa de esquema.
- **Monitor de API**:
  - Verificação de logs de comunicação.
- **Build Estático**:
  - Execução de geração de site estático.

---

## Estrutura do Projeto (File System Structure)

Um projeto `Bracify` consiste em uma pasta de edição (root) e uma pasta de saída (`_dist`).

### Estrutura de Diretórios Recomendada

```text
projeto/
├── index.html          # Ponto de entrada (arquivo para editar)
├── style.css           # Recurso estático
├── img/                # Assets como imagens
│   └── logo.png
├── _parts/             # Componentes para inclusão (não incluídos no build final)
│   ├── header.html
│   └── footer.html
├── _sys/               # Dados do sistema e configurações (não incluídos no build final)
│   └── data/
│       └── articles.json
└── _dist/              # [Gerado Automaticamente] Destino do build (o produto final fica aqui)
    ├── index.html
    ├── style.css
    └── img/
        └── logo.png
```

### Especificações de Build

Ao executar um "Build" via GUI ou linha de comando, a saída é gerada na pasta `_dist` seguindo estas regras:

1. **Processamento de Arquivos HTML**:
    - Arquivos `.html` na raiz são enviados para `_dist` com as tags `data-t-include` resolvidas (componentes mesclados).
2. **Cópia de Recursos Estáticos**:
    - Imagens, CSS, JS, etc., são copiados para `_dist` sem alterações.
3. **Regras de Exclusão**:
    - Arquivos e pastas iniciados com underscore `_` (`_parts`, `_sys`, etc.) são considerados arquivos de sistema ou de build e **não são copiados para a pasta `_dist`**.
4. **Conversão de Dados do Sistema (`_sys/data`)**:
    - Arquivos `.json` na pasta `_sys/data` são convertidos automaticamente para `.js` (formato Mock) para CSR e enviados para `_dist/_sys/data`.
    - **Nota**: Mesmo que exista um arquivo `.js` com o mesmo nome na pasta de origem, ele será **ignorado**. A fonte oficial de dados é o arquivo `.json`.
    - Esta conversão (build) é necessária para exibir dados via CSR, mesmo que você não use `data-t-include`.

---

## Referência

### Atributos Customizados

#### `data-t-include`

Carrega um arquivo HTML externo e o expande como conteúdo do elemento. Este atributo possui dois modos: **Snippet Include** (Inclusão de Fragmento) e **Layout Application** (Aplicação de Layout).

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

- **Nota**: A mesclagem ocorre no lado do servidor durante o uso do servidor de desenvolvimento ou no processo de build. Não funciona ao visualizar o arquivo diretamente no navegador via `file://`.

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

- **Exibindo Múltiplos Itens (`data-t-list`)**:
    Se houver vários itens para exibir, você deve usar `data-t-list="nome_da_fonte"` no elemento que deseja repetir.

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

- **Limitação**: Para evitar interferência com a sintaxe do JavaScript, **não é possível usar placeholders dentro de atributos de eventos (`onclick`, `onchange`, etc.).** Veja a seção abaixo sobre interferências.

#### Evitando Interferências e Limitações

Os placeholders `{ }` do Bracify podem ser usados em atributos HTML e nós de texto. No entanto, para evitar conflitos com códigos JavaScript ou CSS (que também usam chaves), a **expansão é desativada** nos seguintes locais:

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
    2. **Parâmetros de URL (`_sys.query`)**: Se houver um item na URL com o mesmo nome do atributo `name`, esse valor será usado.

- **Definindo o Escopo com `data-t-scope`**:
    Ao usar `data-t-scope="article"` em um elemento pai (`div`, `form`, etc.), você define a fonte de dados padrão para todos os elementos internos. Assim, um `name="title"` interno referenciará automaticamente `article.title`.

- **Exemplo (Formulário de Busca)**:

    ```html
    <!-- Se a URL for ?title=Web, o valor "Web" será automaticamente preenchido -->
    <input type="text" name="title" placeholder="Buscar artigos...">
    ```

- **Exemplo (Formulário de Edição)**:

    ```html
    <!-- title e content do objeto article serão preenchidos nos campos correspondentes -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article">
      <input type="text" name="title">
      <textarea name="content"></textarea>
    </form>
    ```

- **Seleção Automática em Selects**:
    O atributo `selected` é adicionado automaticamente ao `<option>` cujo `value` corresponder ao dado vinculado ao `<select>`.

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

#### `data-t-redirect`

Define a URL para onde o usuário será redirecionado após um processo (como envio de formulário) ser concluído com sucesso.

- **Especificação**: Indique o caminho relativo ou absoluto.
- **Alvo**: Principalmente tags `form` (expansão para botões está planejada).
- **Exemplo**:

    ```html
    <!-- Volta para a home após o envio -->
    <form method="POST" action="/_sys/data/contact" data-t-redirect="/">
    ```

### Formulários e Salvamento de Dados

Você pode enviar dados (criar/atualizar) para a API usando tags `<form>` padrão.

- **Envio Automático para API**: Se você definir a URL no atributo `action` e `POST` ou `PUT` no `method`, os dados serão enviados automaticamente em formato JSON.
- **Transição de Página**: Use `data-t-redirect` para definir para onde ir após salvar. Se não definido, a página atual será recarregada.
- **Data Binding (Valores Iniciais)**: Use `data-t-bind` no `<form>` para preencher os campos com dados existentes (útil para telas de edição).
- **Nomes dos Campos**: O atributo `name` de `<input>` e `<textarea>` corresponde à propriedade (campo) no objeto de dados.

#### Exemplo: Formulário de Edição de Artigo

```html
<!-- Vincula os dados de article ao form, preenchendo os valores iniciais -->
<!-- Envia via PUT para a URL especificada no action -->
<!-- Redireciona para a lista (../list.html) após salvar -->
<form method="PUT" action="/_sys/data/article" data-t-bind="article" data-t-redirect="../list.html">

  <label>Título</label>
  <input type="text" name="title"> <!-- Preenchido com article.title -->

  <label>Conteúdo</label>
  <textarea name="content"></textarea> <!-- Preenchido com article.content -->

  <button>Salvar</button>
</form>
```

### Filtros de Processamento (Pipes)

Você pode usar filtros de processamento (nome oficial: pipes) `|` ao exibir dados.

#### Sintaxe Básica

```html
<p>Atualizado em: { article.updated_at | date: 'dd/mm/yyyy' }</p>
<span>Preço: { product.price | number } BRL</span>
```

↓ **Resultado**

```html
<p>Atualizado em: 10/12/2025</p>
<span>Preço: 1.500 BRL</span>
```

#### Sintaxe de Pipe

```text
{ nome_da_fonte.nome_do_item | nome_do_filtro: 'argumento' }
```

### Filtros Padrão (Pipes embutidos)

#### `date`

Gera texto a partir de um objeto de data no formato especificado.

- **Sintaxe**: `{ item | date: 'formato' }`
- **Opções de Formato**:
  - `yyyy`: Ano com 4 dígitos
  - `mm`: Mês com 2 dígitos
  - `dd`: Dia com 2 dígitos

## API de Acesso a Dados

### Especificação de Endpoint (Data API)

Você pode não apenas ler, mas também atualizar e deletar dados (arquivos JSON, etc.) no servidor.

```text
/_sys/data/{entity}.json?{prop}={val}
```

#### Métodos de Operação

| Método | Ação | Descrição |
| :--- | :--- | :--- |
| `GET` | Ler | Busca dados de acordo com as condições. |
| `POST` | Criar | Cria novos dados. |
| `PUT` | Atualizar | Substitui dados que atendem às condições pelos novos valores. |
| `DELETE` | Deletar | Remove dados que atendem às condições. |

### Especificação de Endpoint (File API)

Uma API para gerenciar arquivos estáticos (como imagens) no servidor.

```text
/_sys/file/{filename}.{ext}
```

#### Métodos de Operação de Arquivos

| Método | Ação | Descrição |
| :--- | :--- | :--- |
| `GET` | Ler | Busca o arquivo. |
| `POST` | Criar | Faz o upload/cria um novo arquivo. |
| `PUT` | Atualizar | Sobrescreve e atualiza o conteúdo de um arquivo existente. |
| `DELETE` | Deletar | Remove o arquivo especificado. |

#### Parâmetros

- **`{entity}`**: O tipo de dado (nome da entidade). Ex: `article`, `user`.
- **`{prop}`**: O nome do campo usado para filtrar.
- **`{val}`**: O valor usado na condição do filtro.

#### Operadores

Adicionando símbolos (operadores) após o nome do campo, você pode refinar as condições de busca.

| Operador | Significado | Exemplo | Descrição do Exemplo |
| :--- | :--- | :--- | :--- |
| (nenhum) | Igual | `?status=active` | Status é `active` |
| `:ne` | Diferente de | `?status:ne=draft` | Status **NÃO** é `draft` |
| `:gt` | Maior que | `?price:gt=1000` | Preço é **maior que** 1000 (1001 em diante) |
| `:gte` | Maior ou igual | `?price:gte=1000` | Preço é 1000 **ou maior** |
| `:lt` | Menor que | `?stock:lt=10` | Estoque é **menor que** 10 |
| `:lte` | Menor ou igual | `?stock:lte=10` | Estoque é 10 **ou menor** |

### Variável Reservada do Sistema (`_sys`)

A variável `_sys` é usada para acessar o contexto da aplicação e informações da requisição.

| Nome | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_sys.query` | Parâmetros GET da URL. Acessa valores como `?id=123`. | `{_sys.query.id}` |

#### Uso no `data-t-source` (Dynamic Parameter Binding)

No atributo `href` do `data-t-source`, você pode usar placeholders `{ }` para embutir parâmetros da URL dinamicamente. Existe também uma versão curta `{?}` específica para parâmetros de URL.

| Notação | Significado | Exemplo |
| :--- | :--- | :--- |
| `{_sys.query.xxx}` | Embutir o campo especificado (formato padrão) | `?id={_sys.query.id}` |
| `{?}` | **Auto Binding**. Busca na URL um valor com o mesmo nome da chave à esquerda | `?title={?}` |
| `{?xxx}` | **Atalho**. Equivalente a `_sys.query.xxx` | `?title={?q}` |

#### Exemplos no Data Source

```html
<!-- Se a URL for ?title=Web&_limit=10 -->

<!-- 1. Auto Binding: Melhor quando os nomes da chave e do parâmetro da URL são iguais -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={?}&_limit={?}&_sort=created_at">

<!-- 2. Atalho: Quando os nomes na URL (ex: q) e na API (ex: title) são diferentes -->
<link data-t-source="search" href="/_sys/data/articles.json?title={?q}">

<!-- 3. Formato Padrão: Para ser mais explícito -->
<link data-t-source="items" href="/_sys/data/items.json?category={_sys.query.cat}">
```

### Informações Detalhadas (Propriedades de Sistema)

Além dos valores dos dados em si (títulos, IDs), você pode acessar informações como "quantidade" de itens.
No `Bracify`, você acessa essas informações especiais adicionando um nome prefixado com underscore `_` após o nome da fonte.

| Propriedade | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_length` | Mostra a quantidade de itens em uma lista ou o tamanho de uma string. | `{articles._length} artigos` |

#### Parâmetros de Controle (Ordenação e Paginação)

Para controlar a quantidade e a ordem dos dados buscados, use parâmetros reservados iniciados com underscore `_`. Isso evita conflitos com nomes de campos reais dos seus dados.

| Parâmetro | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_limit` | Quantidade máxima de itens para buscar | `?_limit=20` |
| `_offset` | Pular N itens (para paginação) | `?_offset=20` (começa a partir do 21º) |
| `_sort` | O campo pelo qual ordenar | `?_sort=created_at` |
| `_order` | Ordem (`asc`: crescente, `desc`: decrescente) | `?_order=desc` (padrão é `asc`) |

#### Exemplos de Parâmetros de Controle

```html
<!-- Busca/ordenação baseada em parâmetros da URL -->
<link data-t-source="articles" href="/_sys/data/articles.json?title={_sys.query.title}&_sort={_sys.query._sort}&_order={_sys.query._order}&_limit={_sys.query._limit}">

<!-- Categoria fixa, mas página definida por parâmetro -->
<link data-t-source="techArticles" href="/_sys/data/articles.json?category=Tech&_limit=10&_offset={_sys.query._offset}">
```

#### Exemplo de Estrutura Local

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

**Exemplo de Arquivo JSON** (`_sys/data/article.json`):

```json
[
  {
    "id": 1,
    "title": "Título do Artigo 1",
    "summary": "Resumo do artigo...",
    "published_at": "2025-12-01T10:00:00Z"
  },
  {
    "id": 2,
    "title": "Título do Artigo 2",
    "summary": "Resumo do artigo...",
    "published_at": "2025-12-05T15:30:00Z"
  }
]
```

### Restrições no Preview Local (Modo "Zero Server")

Ao visualizar como arquivo local (`file://`) sem iniciar o servidor (ex: clicando duas vezes no `index.html`), a busca de dados funciona como um mock simples dentro do navegador.
Este modo é indicado para testes rápidos de design e funcionalidade, e seu comportamento difere do ambiente de servidor (SSR).

- **Restrições de filtros**:
  - **Apenas Correspondência Exata**: Só retorna dados quando a chave e o valor são idênticos.
  - **Ignora Valores Vazios**: Se o parâmetro de busca estiver vazio (`?name=`), o filtro será ignorado e todos os itens serão exibidos.
  - **Operadores Avançados não suportados**: Operadores como `:gt` ou `:lt` não funcionam no preview local.

- **Parâmetros de Controle Suportados**:
    Estes parâmetros operam de forma simplificada no preview local:
  - `_limit`: Limitar quantidade exibida.
  - `_offset`: Pular dados.
  - `_sort`: Escolher campo para ordenar.
  - `_order`: `asc` ou `desc`.

## Implantação (Deployment)

- **Serverless**: Preparado para implantação em serviços como Vercel ou Netlify.
- **Upload de Zip**: Basta gerar o Zip do projeto no aplicativo GUI e arrastar para o dashboard do serviço escolhido.

## Fluxo de Desenvolvimento

1. Baixe e instale o aplicativo GUI do `Bracify` pelo site oficial.
2. Inicie o app e crie ou selecione uma pasta de projeto.
3. Edite seu `index.html`, `_parts/header.html`, etc. O app GUI fornece preview em tempo real.
4. Quando terminar, gere o Zip e publique!
