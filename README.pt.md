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
- **Gerenciador de Dados**:
  - Edição de JSON, estimativa de esquema.
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

- **Escapando Placeholders**:
  Se você quiser exibir a notação do placeholder como está sem avaliá-la, coloque uma barra invertida `\` antes da chave de abertura.

  ```html
  <code>\{user.name\}</code> <!-- Resultado: {user.name} -->
  ```

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
    2. **Parámetros de URL (`_sys.query`)**: Se houver um item na URL com o mesmo nome do atributo `name`, esse valor será usado.

- **Exemplo (Formulário de Busca)**:

    ```html
    <!-- Se a URL for ?title=Web, o valor "Web" será automaticamente preenchido -->
    <input type="text" name="title" placeholder="Buscar artigos...">
    ```

- **Exemplo (Formulário de Edição)**:

    ```html
    <!-- title e content do objeto article serão preenchidos nos campos correspondentes -->
    <form data-t-scope="article" method="PUT" action="/_sys/data/article.json">
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

    **Operações de Comparação e Lógicas (Estilo Data API)**:
    Você pode especificar condições mais detalhadas usando a mesma sintaxe dos parâmetros de consulta da Data API.

    - **Operadores de Comparação**: Usa a mesma notação que os [Operadores da API de Acesso a Dados](#operadores) (`=`, `:ne=`, `:gt=`, etc.).
    - **Operações Lógicas (AND/OR)**: A separação por espaços representa **AND**, e a separação por vírgulas nos valores representa **OR**.
    - **Uso de Variáveis**: Ao inserir entre `{ }`, você pode usar valores de dados nas condições.
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
    ```

#### `data-t-redirect`

Define a URL para onde o usuário será redirecionado após um processo (como envio de formulário) ser concluído com sucesso.

- **Especificação**: Indique o caminho relativo ou absoluto.
- **Alvo**: Tag `form`.
- **Funcionamento**: Após o servidor completar o processamento, redireciona com status 302 para o caminho especificado. Caso contrário, recarrega a página atual.

### Formulários e Salvamento de Dados (Postback)

Você pode criar e atualizar dados usando tags `<form>` padrão. O Bracify utiliza **postbacks padrão do navegador (envios que envolvem transição de página)**, sem o uso de JavaScript assíncrono (fetch).

- **Tratamento Automático**: Defina o destino no atributo `action` (ex: `/_sys/data/xxxxx.json`) e envie via `method="POST"` ou `PUT`.
- **Redirecionamento (Padrão PRG)**: Após salvar no servidor, redireciona automaticamente para a URL definida em `data-t-redirect` ou para a página original. Isso evita o "reenvio de formulário" e permite uma navegação segura.
- **Data Binding (Valores Iniciais)**: Ao usar `data-t-scope` na tag `<form>`, você pode preencher os campos com dados existentes.
- **Nomes dos Campos**: O atributo `name` de `<input>` e `<textarea>` corresponde à propriedade no objeto de dados.

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

Gera texto a partir de uma data no formato especificado.

- **Sintaxe**: `{ item | date: 'formato' }`
- **Opções**:
  - `yyyy`: Ano (4 dígitos)
  - `mm`: Mês (2 dígitos)
  - `dd`: Dia (2 dígitos)

#### `number`

Exibe números com separação de milhar.

- **Sintaxe**: `{ nome_item | number }`

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
| `POST` | Criar | Cria novos dados. |
| `PUT` | Atualizar | Substitui informações existentes pelos dados enviados. |
| `DELETE`| Deletar | Remove os dados especificados. |

### Especificação de Endpoint (File API)

API para gerenciar arquivos estáticos (como imagens) no servidor.

```text
/_sys/file/{filename}.{ext}
```

#### Métodos de Arquivos

| Método | Ação | Descrição |
| :--- | :--- | :--- |
| `GET` | Ler | Busca o arquivo. |
| `POST` | Criar | Upload de novo arquivo. |
| `PUT` | Atualizar | Sobrescreve um arquivo. |
| `DELETE` | Deletar | Deleta um arquivo. |

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

### Variável Reservada (`_sys`)

| Nome | Descrição | Exemplo |
| :--- | :--- | :--- |
| `_sys.query` | Parâmetros GET da URL. | `{_sys.query.id}` |

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

#### Navegação SPA

Em `file://`, recarregamentos resetam permissões, então o Bracify trata tudo como SPA.

- **Interceptação de Links**: Detecta `<a>` e troca apenas o DOM.
- **Navegação via JS**: Use `Bracify.navigate('/caminho/para/pagina.html')`.
- **Histórico**: Suporta os botões de voltar/avançar.

#### Limitações em Navegadores Não Compatíveis

Opera em modo "Mock Somente Leitura" com filtros limitados e sem salvamento.

#### Filtros e Controle (Especificações Comuns)

- **Filtros**: Apenas correspondência exata.
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
