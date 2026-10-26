# Requisitos + Design — Fatia: Exportação (Markdown + PDF)

> Design técnico da fatia de **exportação** dos artefatos gerados (resumo,
> flashcards, exercícios, mapa mental, quiz) para **Markdown** e **PDF**, por
> artefato individual **e** documento inteiro. Fonte da verdade:
> `tasks/roadmap-exportacao.md`, `SPEC.md` e as convenções consolidadas nas
> fatias anteriores (resumo, flashcards, exercícios, cadernos, mapa mental,
> quiz, correção por IA). As decisões de produto já estão confirmadas com o
> usuário (roadmap, 2026-10-16); este documento define o **COMO** implementar,
> não o **SE**.
>
> Baseline a preservar: **434 testes passando**, `npm run build`
> (`tsc --noEmit && electron-vite build`) e `npm run lint` limpos. Nada aqui
> pode regredir isso. Funcionalidades existentes (importar arquivo/pasta,
> Histórico de dois níveis, geração de resumo/flashcards/exercícios/mapa/quiz,
> Agenda/Provas, correção por IA) devem continuar funcionando.
>
> Textos de UI e conteúdo exportado em **português (Brasil)**; identificadores
> de código em **inglês**.
>
> **Revisão (2ª passada):** este documento foi revisado contra
> `tasks/design-review.json` (veredito `CHANGES_REQUESTED`, 2 HIGH + 4 MEDIUM +
> 5 NIT). Todos os 11 achados foram endereçados no corpo; o resumo das respostas
> está na **seção 11**. Os pontos de pdfmake (entrypoints/fontes) foram
> verificados instalando o pacote neste worktree e renderizando um PDF real.

---

## 1. Requisitos

### 1.1 Resumo

Permitir que o usuário **exporte para arquivos** o material de estudo já gerado
em um documento, para usá-lo fora do app (ler no celular, imprimir, compartilhar,
versionar). Dois formatos nesta fatia: **Markdown (`.md`)** e **PDF (`.pdf`)**.
Dois alcances: **por artefato** (exporta só aquele artefato da tela aberta) e
**documento inteiro** (junta todos os artefatos presentes do documento em um
único arquivo). A exportação é **100% local, offline e determinística** — **não
usa o Ollama**. O usuário **sempre escolhe o destino** do arquivo (nunca gravamos
sem um save dialog).

Esta fatia introduz **uma única** dependência nova aprovada: **`pdfmake`** (mais
seus tipos), para a geração de PDF no processo main.

### 1.2 Requisitos funcionais

- **RF1 — Exportar artefato (Markdown).** De cada tela de artefato (Resumo,
  Flashcards, Exercícios, Mapa mental, Quiz) o usuário pode exportar **somente
  aquele artefato** para um `.md`.
- **RF2 — Exportar artefato (PDF).** Idem RF1, mas para `.pdf`.
- **RF3 — Exportar documento inteiro (Markdown).** Um controle no nível do
  documento gera **um único `.md`** concatenando **todos os artefatos presentes**
  do documento, com cabeçalhos por seção, na ordem canônica (resumo → flashcards
  → exercícios → mapa mental → quiz).
- **RF4 — Exportar documento inteiro (PDF).** Idem RF3, mas para `.pdf`.
- **RF5 — Mapa no PDF como imagem vetorial.** No PDF, o mapa mental entra como
  **SVG vetorial** (via o suporte a SVG do pdfmake), reusando o mesmo desenho da
  visualização.
- **RF6 — Mapa no Markdown como lista aninhada.** No Markdown, o mapa mental é
  representado como uma **lista indentada/aninhada** (a árvore vira tópicos) — sem
  imagem.
- **RF7 — Escolha de destino.** Toda exportação abre `dialog.showSaveDialog` com
  **nome de arquivo sugerido** (derivado do nome do documento + artefato +
  extensão). Se o usuário cancelar, nada é gravado e nada falha.
- **RF8 — Só artefatos existentes.** A exportação de documento inteiro inclui
  apenas os artefatos presentes. Um controle de exportar artefato **não aparece**
  quando aquele artefato não existe na tela. Se o documento não tiver **nenhum**
  artefato, a exportação de documento é **desabilitada** com orientação (sem
  crash).
- **RF9 — Feedback.** Em sucesso, a UI confirma discretamente (“Exportado.”); em
  falha, mostra uma mensagem amigável em pt-BR; cancelar é um no-op silencioso.

### 1.3 Requisitos não funcionais

- **RNF1 — Offline/local.** Nenhuma chamada de rede externa; nenhuma chamada ao
  Ollama. Determinística para as mesmas entradas (com uma exceção documentada: o
  carimbo de data/hora no rodapé/metadados — ver 5.4 e 7.1, isolável nos testes).
- **RNF2 — Dependência pinada.** `pdfmake` e `@types/pdfmake` fixados em versão
  exata no `package.json` (sem `^`/`~`), coerente com a regra do SPEC.
- **RNF3 — Camadas.** Markdown é lógica **pura em `src/shared`** (testável sem
  Node/Electron). PDF e gravação vivem no **processo main** (Node). O renderer
  chama o main **só** via `getApi()` — sem `window.api?.` nos novos call sites.
- **RNF4 — Segurança de disco.** Nunca gravar sem o save dialog. O diálogo
  **nunca** usa como destino padrão `C:\Users\enzom\OneDrive\Desktop\Facul`
  (ver 5.4). Nenhum teste depende dessa pasta.
- **RNF5 — Consistência visual.** O PDF usa cores/tipografia coerentes com os
  tokens de `src/renderer/styles.css`.
- **RNF6 — Acessibilidade da UI.** Controles de exportação são `<button>` com
  rótulo textual e `aria-label` quando o rótulo visível for um ícone; estados
  `disabled` comunicados; mensagens de erro em `role="alert"`.

### 1.4 Critérios de aceitação (testáveis)

1. **CA1.** `package.json` lista `pdfmake` e `@types/pdfmake` em versão **exata**
   (sem range); `npm run build` e `npm run lint` seguem limpos.
2. **CA2.** Dado um `Resumo`, `gerarMarkdownResumo` produz Markdown com um
   título `##` e o conteúdo; idêntico para a mesma entrada (puro).
3. **CA3.** Dado `Flashcard[]`, `gerarMarkdownFlashcards` produz uma lista
   numerada/estruturada com pergunta e resposta por card.
4. **CA4.** Dado `Exercicio[]`, `gerarMarkdownExercicios` produz enunciado +
   resposta por item, com o modo indicado.
5. **CA5.** Dado um `MapaMental`, `gerarMarkdownMapaMental` produz `## Mapa
   mental` seguido de uma **lista aninhada**: a raiz é o primeiro `- ` **sem
   indentação** (profundidade 0, não duplicada no título), cada filho `  - `
   (2 espaços), cada neto `    - ` (4 espaços) — a indentação reflete a
   profundidade da árvore de domínio.
6. **CA6.** Dado um `Quiz`, `gerarMarkdownQuiz` produz, por pergunta: o
   enunciado; para múltipla escolha, as alternativas marcando a correta; para
   aberta, o gabarito.
7. **CA7.** `gerarMarkdownDocumento` concatena **apenas os artefatos presentes**
   em um `DocumentoSalvo`, na ordem canônica, com um título `#` do documento e
   um `##` por seção; artefatos ausentes não geram seção.
8. **CA8.** `gerarMarkdownDocumento` de um documento **sem nenhum artefato**
   produz o cabeçalho do documento mais uma linha de aviso (“Nenhum artefato
   gerado ainda.”), sem lançar.
9. **CA9.** `montarDefinicaoPdfArtefato`/`montarDefinicaoPdfDocumento` devolvem
   um **document-definition** do pdfmake (objeto JS) cuja estrutura pode ser
   asserida sem renderizar o binário: `content` é um array; há um nó de título;
   o mapa, quando presente, aparece como **um nó `{ svg: <string> }`**.
10. **CA10.** O document-definition do **documento inteiro** inclui uma seção por
    artefato presente, na ordem canônica, e **nenhuma** para os ausentes.
11. **CA11.** Os handlers IPC `export:markdown` e `export:pdf` existem,
    registrados em `registerIpcHandlers`, e cada um aceita um **alvo**
    (`artefato` específico ou `documento`); ao cancelar o save dialog resolvem
    com um resultado “cancelado” (sem gravar, sem rejeitar).
12. **CA12.** As telas de artefato só mostram o controle “Exportar” quando o
    respectivo artefato existe; o controle de **documento inteiro** fica
    desabilitado quando o documento não tem artefato algum.
13. **CA13.** Nenhum teste novo usa o Ollama nem lê/grava na pasta `Facul`; a
    suíte total continua verde e **acima de 434** testes.

### 1.5 Fora de escopo (não desenhar nesta fatia)

- Exportação para **Anki** (`.apkg`/CSV) — roadmap.
- Exportação para **`.docx`**, **HTML standalone** ou **impressão direta**.
- **Temas/templates** de exportação configuráveis pelo usuário.
- Exportar **vários documentos** de uma vez / exportação em lote por caderno.
- Reabrir/importar arquivos exportados de volta no app.

---

## 2. Visão geral do design

A exportação segue a arquitetura em camadas já estabelecida e **não introduz
padrões novos**, exceto a dependência aprovada `pdfmake`:

- **shared** (`src/shared/export/markdown.ts`): funções **puras** que convertem
  cada artefato — e o documento inteiro — em Markdown. Sem Node, sem Electron,
  sem React. Testáveis em isolamento no vitest `node`.
- **shared** (`src/shared/export/types.ts`): os tipos de opções de exportação
  (`FormatoExportacao`, `AlvoExportacao`, `ResultadoExportacao`), compartilhados
  entre main e renderer via o contrato de IPC.
- **main** (`src/main/services/pdfDefinicao.ts`): funções **puras** que montam o
  **document-definition** do pdfmake a partir dos mesmos dados dos artefatos
  (incluindo o SVG do mapa). **NÃO** importa `pdfmake` em runtime — só
  `import type` de `pdfmake/interfaces` (apagado na compilação). Nenhum efeito de
  módulo: importar este arquivo num teste `node` não puxa pdfmake/pdfkit/fontkit.
  (ver decisão em 5.3 — separação exigida pela revisão, achado 1.)
- **main** (`src/main/services/export.ts`): a camada de **efeito** — instancia o
  `PdfPrinter` (preguiçosamente, nunca em module scope), renderiza o PDF a partir
  do document-definition de `pdfDefinicao.ts`, e grava o arquivo via
  `dialog.showSaveDialog` + escrita atômica. Importa a camada shared de Markdown
  para a gravação `.md`. É o único módulo que carrega `pdfmake` em runtime.
- **main** (`src/main/services/mapaSvg.ts`): função **pura** que serializa a
  árvore do mapa em uma **string SVG** autônoma, reusando `calcularLayout` de
  `@shared/mapaLayout` (a mesma lógica da view). Vive em main por conveniência de
  colocalização com o serviço de export, mas é pura (testável).
- **main** (`src/main/ipc/index.ts`): dois handlers novos (`export:markdown`,
  `export:pdf`), cada um resolvendo o **alvo** (artefato único ou documento
  inteiro) e abrindo o save dialog.
- **renderer**: um pequeno componente reutilizável `ExportarControles` colocado
  em cada view de artefato e um controle “Exportar documento” no nível do App
  (cabeçalho), chamando o main **só** via `getApi()`.

O fluxo de uma exportação:

1. O renderer tem em mãos o artefato ou o `DocumentoSalvo` atual (já em memória).
2. O renderer chama `getApi().exportarMarkdown(alvo)` ou `exportarPdf(alvo)`,
   passando os **dados** do alvo (não um id — ver 4.2 para a decisão).
3. O main monta o conteúdo (Markdown puro, ou document-definition do pdfmake),
   abre `dialog.showSaveDialog` com um nome sugerido, e grava se o usuário
   confirmar.
4. O main resolve com um `ResultadoExportacao` (`salvo` + caminho, ou
   `cancelado`), que o renderer traduz em feedback.

---

## 3. Camada de Markdown (pura, `src/shared/export/markdown.ts`)

### 3.1 Tipos de opções (`src/shared/export/types.ts`)

```ts
/** Formato de arquivo de exportação. */
export type FormatoExportacao = "markdown" | "pdf";

/** Identifica qual artefato de um documento exportar isoladamente. */
export type TipoArtefato =
  | "resumo"
  | "flashcards"
  | "exercicios"
  | "mapaMental"
  | "quiz";

/**
 * Alvo de uma exportação: um artefato específico de um documento, ou o
 * documento inteiro (todos os artefatos presentes). Em ambos os casos os DADOS
 * necessários viajam no próprio alvo — a exportação é pura/local e não precisa
 * reler o disco (ver decisão 4.2). União discriminada por `escopo`.
 */
export type AlvoExportacao =
  | {
      escopo: "artefato";
      tipo: TipoArtefato;
      /** O documento inteiro; o serviço lê só o artefato de `tipo`. */
      documento: DocumentoExportavel;
    }
  | {
      escopo: "documento";
      documento: DocumentoExportavel;
    };

/**
 * Subconjunto de `DocumentoSalvo` suficiente para exportar: nome, formato e os
 * artefatos opcionais. Declarado à parte (em vez de usar `DocumentoSalvo`
 * cru) para deixar explícito que a exportação só depende destes campos e não
 * de datas/ids de persistência. O renderer monta isto a partir do
 * `DocumentoSalvo` ativo.
 */
export interface DocumentoExportavel {
  nome: string;
  resumo?: Resumo;
  flashcards?: Flashcard[];
  exercicios?: Exercicio[];
  mapaMental?: MapaMental;
  quiz?: Quiz;
}

/** Resultado de uma exportação, devolvido ao renderer pelo IPC. */
export type ResultadoExportacao =
  | { status: "salvo"; caminho: string }
  | { status: "cancelado" };
```

Decisão: `DocumentoExportavel` é um tipo próprio e mínimo em vez de reusar
`DocumentoSalvo`. Isso documenta na assinatura que a exportação **não** usa
`id`/`cadernoId`/datas e evita acoplar a exportação a campos de persistência que
podem mudar. O renderer já tem o `DocumentoSalvo` em mãos e monta o
`DocumentoExportavel` com um spread dos artefatos presentes.

**Fonte única do nome do documento (resolve o achado 8):** o nome vive **só** em
`DocumentoExportavel.nome`. `AlvoExportacao` **não** carrega mais um
`nomeDocumento` redundante; tudo que precisa do nome (título do PDF/Markdown e
`sugerirNomeArquivo`) lê `alvo.documento.nome`. (O prop de view `nomeDocumento?`
em §6.2 é outro conceito: é o insumo que a view usa para **montar** o campo
`nome` do seu `DocumentoExportavel` mínimo — não é um segundo campo no alvo.)

Imports de tipo (todos `import type`, respeitando `verbatimModuleSyntax` +
`noUnusedLocals`): `types.ts` importa `Exercicio`, `Flashcard`, `MapaMental`,
`Quiz`, `Resumo` de `../types`.

### 3.2 Funções puras por artefato

Todas recebem o artefato e devolvem uma `string` Markdown **sem** o título de
nível de documento (os títulos de seção são `##`, para que o documento inteiro
possa prefixar um `#` de título de documento e as seções fiquem um nível abaixo).
Terminam sem `\n` final sobrando (o concatenador controla o espaçamento entre
seções), e usam `\n` como quebra de linha (não `\r\n`) — determinístico e
independente de plataforma.

```ts
export function gerarMarkdownResumo(resumo: Resumo): string;
export function gerarMarkdownFlashcards(flashcards: Flashcard[]): string;
export function gerarMarkdownExercicios(exercicios: Exercicio[]): string;
export function gerarMarkdownMapaMental(mapa: MapaMental): string;
export function gerarMarkdownQuiz(quiz: Quiz): string;
```

Regras concretas de formatação (determinísticas e testáveis):

- **Resumo** → `## Resumo` + uma linha em branco + o `conteudo` como está (texto
  corrido). O modo (`curto`/`longo`) aparece como uma linha em itálico abaixo do
  título: `*Modo: curto*` / `*Modo: longo*`.
- **Flashcards** → `## Flashcards` + um bloco por card, numerado:
  ```
  ### 1. <pergunta>

  <resposta>
  ```
  A pergunta vira um `###` numerado; a resposta é um parágrafo abaixo. Numeração
  base-1 na ordem do array.
- **Exercícios** → `## Exercícios` + um bloco por item:
  ```
  ### 1. <enunciado>

  **Resposta:** <resposta>
  ```
  O modo da lista (quando todos iguais) aparece em itálico sob o título; se
  houver mistura, cada item recebe um sufixo `(teórica|prática|mista)` ao lado do
  número. Decisão: mostrar o modo **por item** só quando há mistura evita ruído no
  caso comum (lista homogênea) e preserva a informação no caso misto.
- **Mapa mental** → `## Mapa mental` + uma **lista aninhada** por indentação
  (dois espaços por nível), a partir de `mapa.raiz`. **Convenção explícita de
  profundidade (resolve o achado 5):** a recursão usa `profundidade` começando em
  **0 na raiz** (esta é a profundidade da árvore de domínio, **independente** do
  `NoPosicionado.nivel` 1-based do layout — não confundir as duas numerações). A
  raiz é renderizada como o **primeiro `- ` sem indentação** logo abaixo do título
  `## Mapa mental`; cada descida soma 2 espaços (`"  ".repeat(profundidade) +
  "- " + rotulo`). O título `## Mapa mental` é um **rótulo de seção genérico** e
  **não** repete o rótulo da raiz — a raiz aparece só como o primeiro item da
  lista (sem duplicação). A geração reaproveita o helper puro `itensMapa` (§5.3):
  `itensMapa` devolve `{ nivel, rotulo }[]` em pré-ordem com `nivel` = 0 na raiz,
  e o adaptador Markdown faz `"  ".repeat(item.nivel) + "- " + item.rotulo`. Os
  rótulos já chegam saneados/truncados da geração (sem re-sanitização; no Markdown
  não há escape — ver abaixo).
- **Quiz** → `## Quiz` + um bloco por pergunta (base-1):
  - Múltipla escolha:
    ```
    ### 1. <enunciado>

    - [ ] Alternativa A
    - [x] Alternativa correta
    ```
    Usa checkbox Markdown (`- [x]`) para marcar a correta — legível em qualquer
    leitor de Markdown e sem revelar a resposta por um gabarito separado. Decisão:
    marcar inline com `- [x]` é mais claro que listar “Resposta: B” e não depende
    de rotular alternativas com letras (que exigiria mapear índice→letra).
  - Aberta:
    ```
    ### 1. <enunciado>

    **Gabarito:** <gabarito>
    ```

Escape de Markdown: os conteúdos são texto de estudo em pt-BR; **não** fazemos
escape agressivo de caracteres especiais (`*`, `_`, `#`) — decisão consciente de
manter o texto fiel ao original (o alvo é leitura humana, não um pipeline que
reprocesse o Markdown). O único cuidado é **não** quebrar a estrutura de lista:
rótulos/enunciados são escritos em uma linha lógica; quebras de linha internas do
conteúdo são preservadas como estão (parágrafos). Isto é explícito para o
implementador não “consertar” adicionando escape fora de escopo.

### 3.3 Documento inteiro

```ts
/** Ordem canônica das seções no documento exportado. */
export const ORDEM_ARTEFATOS: readonly TipoArtefato[] = [
  "resumo",
  "flashcards",
  "exercicios",
  "mapaMental",
  "quiz",
];

export function gerarMarkdownDocumento(doc: DocumentoExportavel): string;
```

`gerarMarkdownDocumento`:

1. Começa com `# <doc.nome>` e uma linha em branco.
2. Percorre `ORDEM_ARTEFATOS`; para cada artefato **presente** (regra de presença
   **idêntica à do storage**, verificada em `storage.ts` linhas 266-273):
   `resumo !== undefined`; `flashcards !== undefined && length > 0`;
   `exercicios !== undefined && length > 0`; `mapaMental !== undefined`;
   `quiz !== undefined` (o storage usa só `!== undefined` para o quiz — **não**
   `perguntas.length`). Concatena a seção correspondente (`## ...`) separada por
   **uma linha em branco** entre seções.
3. Se **nenhum** artefato estiver presente, acrescenta, após o título, a linha
   `_Nenhum artefato gerado ainda._` e retorna (CA8) — sem lançar.

A função de presença é extraída e exportada para reuso no renderer e no PDF:

```ts
/** Lista os tipos de artefato presentes em `doc`, na ordem canônica. */
export function artefatosPresentes(doc: DocumentoExportavel): TipoArtefato[];
```

Decisão: `artefatosPresentes` é a **única** fonte da regra de presença, usada por
(a) o Markdown de documento, (b) o PDF de documento e (c) o renderer para
habilitar/desabilitar o controle de documento inteiro (RF8/CA12). Evita três
cópias divergentes da mesma regra.

---

## 4. IPC, preload e API do renderer

### 4.1 Canais e assinaturas (`src/shared/ipc.ts`)

Adicionar ao `IPC_CHANNELS`:

```ts
/** Exporta um artefato ou o documento inteiro para Markdown (.md). */
exportarMarkdown: "export:markdown",
/** Exporta um artefato ou o documento inteiro para PDF (.pdf). */
exportarPdf: "export:pdf",
```

Adicionar ao `AppApi`:

```ts
/**
 * Exporta para Markdown o `alvo` (um artefato específico ou o documento
 * inteiro). Abre um seletor de destino; se o usuário cancelar, resolve com
 * `{ status: "cancelado" }` (sem gravar). Em sucesso resolve com o caminho
 * gravado. 100% local: não usa o Ollama.
 */
exportarMarkdown: (alvo: AlvoExportacao) => Promise<ResultadoExportacao>;
/** Igual a `exportarMarkdown`, mas gera um PDF (.pdf) via pdfmake. */
exportarPdf: (alvo: AlvoExportacao) => Promise<ResultadoExportacao>;
```

Imports de tipo em `ipc.ts` (lista `from "./types"` **não** muda; os novos tipos
vêm de `./export/types`): adicionar `import type { AlvoExportacao,
ResultadoExportacao } from "./export/types";`.

### 4.2 Decisão: passar os dados do alvo, não um id

Duas abordagens para o handler obter os artefatos: **(A)** o renderer manda só o
`documentoId` e o main relê do `storage`; **(B)** o renderer manda os **dados**
(`AlvoExportacao` com `DocumentoExportavel`).

**Decisão: (B), passar os dados.** Motivos: (1) a exportação deve refletir o que
o usuário **vê agora**, inclusive um artefato recém-gerado que ainda não
persistiu (as views mantêm o artefato em memória mesmo quando o save ao disco
falhou — ver `persistirArtefato` em `App.tsx`); reler o disco poderia exportar um
estado defasado ou vazio. (2) Mantém o serviço de export **puro quanto a I/O de
leitura** — ele só escreve o arquivo escolhido, sem depender de `carregarDocumento`,
o que simplifica o teste (sem `baseDir` temporário para a montagem do conteúdo).
(3) Os dados já estão no renderer; não há custo de round-trip. O IPC do Electron
serializa objetos estruturados sem problema para esses tamanhos.

### 4.3 Preload (`src/main/preload.ts`)

Adicionar ao objeto `api`, no mesmo estilo (sem lógica, só `invoke`):

```ts
exportarMarkdown: (alvo) =>
  ipcRenderer.invoke(IPC_CHANNELS.exportarMarkdown, alvo),
exportarPdf: (alvo) => ipcRenderer.invoke(IPC_CHANNELS.exportarPdf, alvo),
```

Nenhum import de tipo novo no preload: os métodos são tipados via `AppApi`.

### 4.4 API do renderer (`src/renderer/api.ts`)

Sem mudança em `api.ts`: `getApi()` já devolve `PreloadApi` tipado, que agora
inclui os novos métodos via `AppApi`. **Todas** as chamadas usam
`getApi().exportarMarkdown(...)` / `getApi().exportarPdf(...)` — nunca
`window.api?.` com optional chaining (regra fixa do projeto; ponte ausente →
`ERRO_API_INDISPONIVEL` capturado pelo `catch`).

---

## 5. Camada main: PDF, SVG do mapa e gravação

### 5.1 Dependência `pdfmake`

- Adicionar a **`dependencies`** (não devDependencies): `"pdfmake": "0.2.20"`
  (versão **exata**, pinada). Adicionar a **`devDependencies`**:
  `"@types/pdfmake": "0.2.11"` (exata).
- **Por que 0.2.20 e não 0.3.x:** a linha 0.2.x é madura e estável para uso
  **server-side no Node** via `pdfmake/js/pdfmake` + `createPdfKitDocument`, com
  suporte a SVG documentado e fontes virtuais (vfs) simples de embarcar. A 0.3.x
  reorganizou build/ESM e é mais arriscada sem ganho para o nosso caso. Pinamos a
  0.2.20 e deixamos 0.3.x como eventual migração futura (fora de escopo).
- **Por que fica no main:** `pdfmake` gera o PDF em Node (streams/Buffer), então
  o render vive no processo main. O `electron.vite.config.ts` usa
  `externalizeDepsPlugin()` no main/preload, que externaliza as `dependencies` de
  produção — logo `pdfmake` precisa estar em `dependencies` (não ser bundlado), e
  será resolvido de `node_modules` em runtime. Confirmar pós-implementação que o
  empacotamento (`electron-builder`) inclui `pdfmake` nos módulos de produção.
- **Entrypoints verificados na 0.2.20 (achado 2 — não "ajustar depois"):** o
  pacote publicado foi instalado e inspecionado neste worktree. Fatos **literais**
  confirmados contra `pdfmake@0.2.20` + `@types/pdfmake@0.2.11`:
  - `package.json` do pdfmake tem `"main": "src/printer.js"` e **não** tem campo
    `exports`. Portanto o construtor do printer é o **default export do próprio
    pacote**: `import PdfPrinter from "pdfmake";` (ESM default interop
    confirmado via `node --input-type=module`). **Não** usar
    `pdfmake/src/printer.js` nem `pdfmake/js/...` (o diretório `js/` não existe
    nesta build).
  - As fontes virtuais ficam em `pdfmake/build/vfs_fonts.js`, cujo **default
    export é diretamente o dicionário** `{ "Roboto-Regular.ttf": <base64>,
    "Roboto-Medium.ttf": <base64>, "Roboto-Italic.ttf": <base64>,
    "Roboto-MediumItalic.ttf": <base64> }` (NÃO é `pdfMake.vfs` aninhado nem um
    efeito colateral global nesta versão). Import: `import vfs from
    "pdfmake/build/vfs_fonts.js";` (default, ESM confirmado).
  - **Não há arquivos `.ttf` em disco** em `node_modules` (nem no pdfmake nem no
    `@foliojs-fork/pdfkit`): as fontes Roboto existem **só** como base64 no
    `vfs_fonts.js`. Logo registrar fontes por caminho de arquivo falha com
    `ENOENT`.
  - Os tipos: `import type { TDocumentDefinitions, Content } from
    "pdfmake/interfaces";` e `import type { TFontDictionary } from
    "pdfmake/interfaces";` existem no `@types/pdfmake@0.2.11`. `ContentSvg.svg`
    é do tipo `string` (confirma o nó `{ svg: string }` de CA9).
    `TFontFamilyTypes.normal` é `PDFKit.Mixins.PDFFontSource` — que **aceita
    `Buffer`**, base da estratégia de fonte abaixo.

### 5.2 Fontes e instanciação do printer no main (`export.ts`)

Decisão: usar a fonte **Roboto** que acompanha o pacote
(`pdfmake/build/vfs_fonts.js`), embarcada em base64, para não depender de fontes
do sistema (requisito offline) e manter o PDF idêntico em qualquer máquina.

**Estratégia de fonte verificada (resolve o achado 2):** como as fontes só
existem como base64 no vfs e **não** há `.ttf` em disco, passar os nomes de
arquivo ao `PdfPrinter` falha (`ENOENT`). A forma que funciona ponta a ponta — e
que foi **testada neste worktree renderizando um PDF real com texto Roboto + um
nó SVG** — é passar os **dados da fonte como `Buffer`** diretamente no dicionário
de descritores (`PDFFontSource` aceita `Buffer`). Isso dispensa qualquer registro
de vfs no pdfkit e é independente do layout interno da build:

```ts
import PdfPrinter from "pdfmake"; // default export = construtor do printer (0.2.20)
import vfs from "pdfmake/build/vfs_fonts.js"; // default export = dicionário base64
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

/** Monta o dicionário de fontes Roboto a partir do vfs base64 embarcado. */
function fontesRoboto(): TFontDictionary {
  const buf = (nome: string): Buffer => Buffer.from(vfs[nome], "base64");
  return {
    Roboto: {
      normal: buf("Roboto-Regular.ttf"),
      bold: buf("Roboto-Medium.ttf"),
      italics: buf("Roboto-Italic.ttf"),
      bolditalics: buf("Roboto-MediumItalic.ttf"),
    },
  };
}
```

**Instanciação preguiçosa (resolve o achado 1):** o `PdfPrinter` é criado
**dentro** da função de render, memoizado num singleton de módulo, **nunca** em
module scope. Assim, importar `export.ts` não dispara a stack pdfmake/pdfkit; só
chamar `renderizarPdf(...)` o faz. (As funções puras de montagem ficam noutro
módulo — ver 5.3.)

```ts
let printerSingleton: PdfPrinter | null = null;
function obterPrinter(): PdfPrinter {
  printerSingleton ??= new PdfPrinter(fontesRoboto());
  return printerSingleton;
}

/** Renderiza o document-definition num Buffer de PDF (efeito; só aqui carrega pdfmake). */
function renderizarPdf(def: TDocumentDefinitions): Promise<Buffer> {
  const doc = obterPrinter().createPdfKitDocument(def);
  return new Promise<Buffer>((resolve, reject) => {
    const partes: Buffer[] = [];
    doc.on("data", (c: Buffer) => partes.push(c));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    doc.end();
  });
}
```

> Regra fixa do design: **nenhum efeito de pdfmake em topo de módulo.** O
> construtor e `createPdfKitDocument` só são tocados dentro de `renderizarPdf`.
> A montagem do `docDefinition` (5.3) é pura e vive em `pdfDefinicao.ts`, que não
> importa `pdfmake` em runtime. O render real do binário continua sendo
> verificação manual (7.2); o que os testes asseguram é a **estrutura** do
> `docDefinition` e a verificação feita aqui de que o wiring de fonte renderiza.

### 5.3 Document-definition (funções puras de montagem, `src/main/services/pdfDefinicao.ts`)

As funções que montam o `docDefinition` são **puras** (recebem dados, devolvem um
objeto JS) e vivem em **`src/main/services/pdfDefinicao.ts`** — um módulo que
**só** faz `import type` de `pdfmake/interfaces` (apagado na compilação) e **não**
importa `pdfmake` em runtime. Importá-lo num teste `node` não puxa
pdfmake/pdfkit/fontkit. (Esta separação do render de `export.ts` resolve o
achado 1 — o teste de estrutura importa `pdfDefinicao.ts`, nunca `export.ts`.)

```ts
import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";

export function montarDefinicaoPdfArtefato(
  tipo: TipoArtefato,
  doc: DocumentoExportavel,
  agora?: Date,
): TDocumentDefinitions;

export function montarDefinicaoPdfDocumento(
  doc: DocumentoExportavel,
  agora?: Date,
): TDocumentDefinitions;
```

Blocos de conteúdo (um helper `Content[]` por artefato, reusado pelos dois
montadores):

- `conteudoResumo(resumo)`, `conteudoFlashcards(fc)`, `conteudoExercicios(ex)`,
  `conteudoMapaMental(mapa)`, `conteudoQuiz(quiz)` → cada um devolve `Content[]`.
- `montarDefinicaoPdfDocumento` prefixa um título do documento e concatena os
  blocos de `artefatosPresentes(doc)` na ordem canônica, com um espaçamento entre
  seções. Documento sem artefato → um parágrafo “Nenhum artefato gerado ainda.”.
- `montarDefinicaoPdfArtefato` monta um PDF com só o bloco do `tipo` pedido (mais
  um título do documento no topo).

**Estilo/tema (tokens de `styles.css`):** declarar `styles` e `defaultStyle` no
`docDefinition` reusando a paleta:

- `defaultStyle`: `font: "Roboto"`, `fontSize: 11`, `color: "#1f2937"` (texto
  escuro sobre página branca — um PDF é impresso/lido em claro, então usamos a
  **versão clara** coerente: fundo branco, texto escuro, e a cor de marca
  `--cor-primaria` `#6366f1` nos títulos). Decisão: **não** replicar o tema
  escuro do app (fundo escuro desperdiça tinta e lê mal impresso); usamos a
  **mesma cor de marca** (`#6366f1`/`#4f46e5`) nos títulos e acentos, mantendo a
  identidade visual sem o fundo escuro. Isto satisfaz “coerente com as
  cores/tipografia do app” de forma apropriada ao meio.
- `styles`: `tituloDocumento` (fontSize 22, bold, color `#4f46e5`),
  `tituloSecao` (16, bold, color `#6366f1`, `margin: [0, 12, 0, 6]`),
  `subtitulo` (13, bold), `rotuloForte` (bold), `meta` (italics, color
  `#6b7280`), `correta` (color `#15803d`, bold) para marcar a alternativa certa.
- Margens de página e `pageSize: "A4"`; rodapé com número de página e data de
  exportação (ver 5.4/7.1 sobre a data).

**Mapa mental no PDF (RF5):** `conteudoMapaMental` chama
`gerarSvgMapaMental(mapa)` (seção 5.5) e insere um nó `{ svg: <string>, width,
fit }`. pdfmake renderiza o SVG como vetor (`ContentSvg.svg: string` confirmado
nos tipos). Dimensionamos com `fit: [larguraUtil, alturaMax]` para caber na
página mantendo proporção. Além do SVG, incluímos **também** uma lista textual
aninhada **abaixo** do SVG, como fallback legível caso o SVG fique denso — o SVG
é o destaque pedido, a lista garante leitura mesmo em mapas grandes.

**Contrato da lista de apoio (resolve o achado 9):** a string de Markdown **não**
é insumo do PDF. O helper compartilhado puro é

```ts
// em src/shared/export/mapaArvore.ts
export interface ItemMapa { nivel: number; rotulo: string; } // nivel 0 = raiz
/** Achata a árvore em itens com profundidade (0=raiz), pré-ordem (DFS). */
export function itensMapa(mapa: MapaMental): ItemMapa[];
```

Dois adaptadores consomem `itensMapa`:
- **Markdown** (`gerarMarkdownMapaMental`): `"  ".repeat(item.nivel) + "- " +
  item.rotulo`, um por linha (§3.2).
- **PDF** (`conteudoMapaMental`): converte os `ItemMapa` numa estrutura `ul`
  aninhada nativa do pdfmake (`{ ul: [...] }`), reconstruindo o aninhamento a
  partir de `nivel` (uma pilha por nível). A string de Markdown **não** entra no
  pdfmake. Assim as duas representações partem da mesma fonte determinística sem
  compartilhar formato de saída.

### 5.4 Gravação com save dialog

O serviço `export.ts` expõe a gravação, mas o **save dialog** é aberto no
handler IPC (que tem acesso natural ao `BrowserWindow`/`dialog`). Fluxo no
handler:

1. Monta o conteúdo:
   - Markdown: `string` (via a camada shared `gerarMarkdown*`).
   - PDF: `montarDefinicaoPdf*(...)` (puro, de `pdfDefinicao.ts`) → `renderizarPdf
     (def)` (efeito, de `export.ts`) → `Buffer`.
2. Deriva o **nome sugerido** com `sugerirNomeArquivo(alvo, formato)` (puro,
   exportado — ver abaixo).
3. `dialog.showSaveDialog(janela, { title, defaultPath, filters })`:
   - `defaultPath` = `join(diretorioPadraoExport(), nomeSugerido)`.
   - `filters` = `[{ name: "Markdown", extensions: ["md"] }]` ou
     `[{ name: "PDF", extensions: ["pdf"] }]`.
4. Se `canceled` ou `filePath` vazio → resolve `{ status: "cancelado" }` (não
   grava).
5. Senão grava (`writeFile` para `.md`; stream do pdfmake para `.pdf`) e resolve
   `{ status: "salvo", caminho: filePath }`.

```ts
/** Diretório padrão sugerido para o save dialog. NUNCA a pasta Facul. */
export function diretorioPadraoExport(): string {
  // Documents do usuário é um destino neutro e esperado; se indisponível,
  // cai para o home. Jamais retorna um caminho sob .../Desktop/Facul.
  try {
    return app.getPath("documents");
  } catch {
    return app.getPath("home");
  }
}
```

Decisão sobre a pasta `Facul` (RNF4): o `defaultPath` usa a pasta **Documentos**
do usuário (`app.getPath("documents")`), um destino neutro, **nunca** um caminho
derivado de `Desktop/Facul`. Não lemos nem escrevemos nada em `Facul`. O usuário
pode, claro, navegar manualmente para onde quiser no diálogo — a regra é só sobre
o **default** que oferecemos e sobre não tocarmos nela programaticamente.

`sugerirNomeArquivo` (puro, em `export.ts`, testável):

```ts
/**
 * Nome de arquivo sugerido: "<doc> - <artefato>.<ext>" para artefato, ou
 * "<doc>.<ext>" para documento inteiro. Sanitiza removendo a extensão original
 * do nome do documento e os caracteres inválidos de nome de arquivo
 * (< > : " / \ | ? *) e espaços nas bordas; colapsa vazio para "export".
 */
export function sugerirNomeArquivo(
  alvo: AlvoExportacao,
  formato: FormatoExportacao,
): string;
```

Regras: extensão `.md` para `markdown`, `.pdf` para `pdf`. Para artefato, o
sufixo humano por tipo: `Resumo`, `Flashcards`, `Exercícios`, `Mapa mental`,
`Quiz`. Remove a extensão conhecida de `alvo.documento.nome` (`.txt`/`.md`/`.pdf`)
antes de compor — a **fonte única** do nome é `alvo.documento.nome` (achado 8).
Caracteres inválidos do Windows são removidos; nome vazio vira `"export"`.

### 5.5 SVG do mapa (`src/main/services/mapaSvg.ts`, puro)

```ts
export function gerarSvgMapaMental(mapa: MapaMental): string;
```

Decisão: **gerar o SVG no main a partir da árvore**, reusando `calcularLayout`
de `@shared/mapaLayout` — a **mesma** lógica de posicionamento que a view usa —
em vez de tentar capturar o DOM do renderer. Motivos: (1) a exportação roda no
main sem um renderer vivo; capturar o SVG da tela exigiria o documento estar
aberto na aba do mapa e um canal de captura — frágil e acoplado à UI. (2)
`calcularLayout` é pura e já testada; reusá-la garante que o PDF reflita o mesmo
layout sem duplicar o algoritmo. (3) Para a exportação, **expandimos a árvore
inteira** (todos os nós visíveis) — um documento estático deve mostrar o mapa
completo, não o estado de expand/collapse da sessão.

**Assinatura e expansão (resolve o achado 3):** `calcularLayout` tem a assinatura
real `calcularLayout(raiz: NoMapaMental, expandidos: Set<string>): LayoutMapa`
(verificado em `src/shared/mapaLayout.ts`). A exportação mostra a árvore inteira,
então constrói um `Set` com **todos** os ids por travessia e o passa como
`expandidos`:

```ts
function todosOsIds(raiz: NoMapaMental): Set<string> {
  const ids = new Set<string>();
  const pilha: NoMapaMental[] = [raiz];
  while (pilha.length > 0) {
    const no = pilha.pop()!;
    ids.add(no.id);
    pilha.push(...no.filhos);
  }
  return ids;
}
const expandidos = todosOsIds(mapa.raiz);
const layout = calcularLayout(mapa.raiz, expandidos); // Set<string>, nunca array
```

**Reuso do desenho — EXTRAIR, não replicar (resolve o achado 4):** decisão fixa:
mover de `src/renderer/views/MapaMental.tsx` para `src/shared/mapaLayout.ts`, de
forma **puramente aditiva** (sem alterar `calcularLayout`), as constantes e a
função de aresta hoje privadas da view:

```ts
// novos exports em src/shared/mapaLayout.ts (valores idênticos aos atuais da view)
export const NO_LARGURA = 168;
export const NO_ALTURA = 40;
export const MARGEM = 24;
export function caminhoAresta(pai: NoPosicionado, filho: NoPosicionado): string {
  const x1 = pai.x + NO_LARGURA / 2;
  const y1 = pai.y;
  const x2 = filho.x - NO_LARGURA / 2;
  const y2 = filho.y;
  const meio = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${meio} ${y1}, ${meio} ${y2}, ${x2} ${y2}`;
}
```

A view passa a **importar** `NO_LARGURA`/`NO_ALTURA`/`MARGEM`/`caminhoAresta` do
módulo compartilhado (removendo as cópias locais) e `mapaSvg.ts` consome os
mesmos símbolos — garantindo coordenadas idênticas às da tela. Isto é mudança
aditiva/refatoração sem alterar comportamento (os testes de layout existentes
seguem valendo).

**Sistema de coordenadas idêntico ao da view (resolve o achado 4):** o SVG
autônomo reproduz o mesmo viewBox e offset que `MapaMental.tsx` usa:

```ts
const larguraVb = layout.largura + NO_LARGURA + MARGEM * 2;
const alturaVb = layout.alturaConteudo + MARGEM * 2;
// <svg viewBox="0 0 {larguraVb} {alturaVb}">
//   <g transform="translate({MARGEM + NO_LARGURA / 2}, {MARGEM})"> ... </g>
```

Dentro do `<g>` com esse `translate`: para cada aresta, um `<path d={caminhoAresta
(pai, filho)}>`; para cada nó, um grupo `translate(no.x, no.y)` com um
`<rect x={-NO_LARGURA/2} y={-NO_ALTURA/2} width={NO_LARGURA} height={NO_ALTURA}
rx=10>` e um `<text>` centralizado (`text-anchor="middle"`) — espelhando o
desenho da view (verificado nas linhas de `MapaMental.tsx`).

**Cores por nível (paleta clara):** o mapa da view decide a cor por
`classeNivel(nivel)` (`nivel-1`/`nivel-2`/`nivel-3+`). O SVG do PDF **não** usa
classes CSS (é autônomo), então aplica `fill`/`stroke` inline **hard-coded na
paleta clara** coerente com a marca: raiz (nível 1) fundo `#6366f1` texto branco;
nível 2 borda `#4f46e5` fundo `#eef2ff` texto `#1f2937`; níveis 3+ borda
`#c7d2fe` fundo branco texto `#1f2937`. Decisão: o SVG do PDF usa paleta clara
(fundo branco de página), não os tokens escuros do app; os valores espelham a
identidade (cor primária `#6366f1`/`#4f46e5`). O texto do rótulo é **escapado
para XML** (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`), obrigatório — é o
**único** ponto da exportação que exige escape (um `&` cru quebra o SVG).

`gerarSvgMapaMental` é **pura e determinística** (dado o mapa, a mesma string), o
que a torna testável: asserir que a saída começa com `<svg`, contém um `<text>`
com o rótulo da raiz (escapado) e um número de nós coerente.

### 5.6 Erros e logging (`export.ts` + handlers)

Classe de erro no padrão do projeto:

```ts
export class ExportacaoFalhouError extends Error {
  readonly code = "EXPORTACAO_FALHOU" as const;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ExportacaoFalhouError";
  }
}
```

Tabela de falhas por operação:

| Operação | Condição de falha | Recuperável? | O que o chamador recebe | Log |
|---|---|---|---|---|
| Abrir save dialog | usuário cancela | — (não é erro) | `{ status: "cancelado" }` | nenhum |
| Montar Markdown/def PDF | sempre pura; não falha por entrada válida | — | — | nenhum |
| Render do PDF (pdfmake) | fonte/vfs ausente, SVG inválido | Sim (tentar de novo / artefato sem mapa) | rejeição → msg amigável | `console.warn` no main |
| `writeFile`/stream ao destino | permissão negada, disco cheio, caminho inválido | Sim (escolher outro destino) | rejeição → msg amigável | `console.warn` no main |

`mensagemAmigavelExportacao(erro)` no `ipc/index.ts`, no mesmo molde das irmãs:
`ExportacaoFalhouError` → `erro.message`; qualquer outro → `"Não foi possível
exportar o arquivo. Tente novamente."`. Cancelar **não** é erro: o handler não
lança, resolve com `{ status: "cancelado" }`.

Decisão de logging: seguir o projeto — o caminho feliz **não** loga. Só falhas de
I/O/render de PDF logam `console.warn` no main (análogo ao `migrarCadernos`), com
o erro técnico; a UI recebe só a frase amigável. Erros de entrada não existem aqui
(a montagem é pura sobre dados já validados na geração).

### 5.7 Handlers (`src/main/ipc/index.ts`)

```ts
ipcMain.handle(
  IPC_CHANNELS.exportarMarkdown,
  async (event, alvo: AlvoExportacao): Promise<ResultadoExportacao> => {
    try {
      return await exportarMarkdown(alvo, janelaDoEvento(event));
    } catch (erro) {
      throw new Error(mensagemAmigavelExportacao(erro));
    }
  },
);
ipcMain.handle(
  IPC_CHANNELS.exportarPdf,
  async (event, alvo: AlvoExportacao): Promise<ResultadoExportacao> => {
    try {
      return await exportarPdf(alvo, janelaDoEvento(event));
    } catch (erro) {
      throw new Error(mensagemAmigavelExportacao(erro));
    }
  },
);
```

`janelaDoEvento(event)` = `BrowserWindow.fromWebContents(event.sender) ??
undefined`, passado ao `dialog.showSaveDialog` para ancorar o diálogo à janela
(modal). `exportarMarkdown`/`exportarPdf` no `export.ts` recebem a janela como
parâmetro opcional, abrem o diálogo, gravam e resolvem — mantendo a lógica de
diálogo/gravação no serviço e o handler fino (como os demais). As funções de
**montagem** (puras) permanecem separadas das de **gravação** (efeito), para os
testes cobrirem a montagem sem tocar em disco/dialog.

Imports de tipo novos em `ipc/index.ts`: `AlvoExportacao`, `ResultadoExportacao`
de `@shared/export/types`; e os símbolos de `../services/export.js`
(`exportarMarkdown`, `exportarPdf`, `ExportacaoFalhouError`).

---

## 6. Renderer: controles de exportação

### 6.1 Componente reutilizável `ExportarControles`

Novo `src/renderer/components/ExportarControles.tsx`: dois botões
(“Exportar Markdown” / “Exportar PDF”) que recebem um `AlvoExportacao` pronto e
disparam a chamada, tratando feedback e erro localmente. Reutilizado por todas as
views de artefato e pelo controle de documento.

```ts
interface ExportarControlesProps {
  /** Alvo já montado (artefato específico ou documento inteiro). */
  alvo: AlvoExportacao;
  /** Desabilita ambos os botões (ex.: documento sem artefatos). */
  desabilitado?: boolean;
  /** Rótulo compacto opcional (ex.: "Exportar documento"). */
  variante?: "artefato" | "documento";
}
```

Comportamento:

- Estado local `exportando: FormatoExportacao | null` e `aviso: string | null`.
- Ao clicar, chama `getApi().exportarMarkdown(alvo)` / `exportarPdf(alvo)`.
  - `status: "salvo"` → aviso efêmero “Exportado.” (ou com o nome do arquivo).
  - `status: "cancelado"` → nenhum aviso (no-op silencioso).
  - erro → `aviso` de erro em `role="alert"`, com o texto amigável (mesmo helper
    `mensagemDeErro` das views, que remove o prefixo `Error:`).
- Botões com `disabled` durante a exportação em curso e quando `desabilitado`.
- Acessibilidade: `<button type="button">` com rótulo textual visível; o aviso de
  sucesso é `role="status"`, o de erro `role="alert"`.

### 6.2 Controle por artefato nas views

Em cada view, exibir `<ExportarControles alvo={...} />` **somente quando o
artefato existe** (RF8/CA12), montando o `AlvoExportacao` com `escopo:
"artefato"`. Como as views recebem o artefato (salvo e/ou recém-gerado) mas **não**
o `DocumentoExportavel` inteiro, e o alvo precisa do `documento` para o nome e
para o PDF do artefato, a solução: o App passa a cada view um prop extra
`exportarAlvo?: (tipo, artefato) => AlvoExportacao | null` **ou**, mais simples e
alinhado ao padrão existente, passa `nomeDocumento` e deixa a view montar um
`DocumentoExportavel` mínimo com só aquele artefato.

**Decisão:** a view monta um `DocumentoExportavel` **mínimo** contendo apenas o
artefato daquela tela (ex.: a tela de Resumo monta `{ nome: nomeDocumento,
resumo }`). Isso mantém cada view autossuficiente (só conhece seu próprio
artefato), evita vazar o `DocumentoSalvo` inteiro para todas as views, e o
serviço de export de artefato só lê o campo de `tipo` mesmo. O App passa a cada
view de geração um novo prop opcional `nomeDocumento?: string` (de
`documento?.nome`). Quando não há documento salvo (ex.: geração sem persistência),
`nomeDocumento` cai para `arquivo?.nome ?? "Documento"` dentro da view — a
exportação funciona mesmo sem documento persistido (coerente com a decisão 4.2).

Onde cada view insere os controles (no `header`, ao lado dos controles de
geração, visível só quando há artefato na tela):

- `Resumo.tsx` — quando `resumo !== null`.
- `Flashcards.tsx` — quando há flashcards na tela (`length > 0`).
- `Exercicios.tsx` — quando há exercícios na tela.
- `MapaMental.tsx` — quando `raiz !== null` (monta `MapaMental` com a `raiz`
  atual + `geradoEm`/`documentoId` do salvo ou agora).
- `Quiz.tsx` — quando há perguntas na tela (`length > 0`).

### 6.3 Controle de documento inteiro

**Decisão de local:** colocar “Exportar documento” no **cabeçalho do App**
(`App.tsx`), ao lado do indicador “Documento: <nome>”, visível **somente quando
há um `documento` ativo**. Motivo: o `DocumentoSalvo` completo (com todos os
artefatos) vive no `App` — é o único lugar que conhece o documento inteiro sem
reler disco. Pôr no Histórico exigiria carregar o documento lá e duplicar estado;
o cabeçalho já mostra o documento ativo e está sempre visível em qualquer aba.

No `App.tsx`:

- Montar `docExportavel: DocumentoExportavel` a partir do `documento` ativo com
  spread condicional dos artefatos presentes (só inclui chaves definidas).
- `const presentes = artefatosPresentes(docExportavel);`
- Renderizar `<ExportarControles variante="documento" alvo={{ escopo:
  "documento", documento: docExportavel }} desabilitado={presentes.length === 0}
  />` (o nome vem de `docExportavel.nome`; sem campo redundante — achado 8).
- Quando `presentes.length === 0`, os botões ficam desabilitados com `title`
  “Gere ao menos um artefato para exportar o documento.” (RF8 — orientação sem
  crash).

### 6.4 Estilos (`src/renderer/styles.css`)

Novas regras usando **apenas** os tokens existentes:

- `.exportar-controles` (flex, `gap`, alinhado aos controles de geração) e
  `.exportar-controles button` reusando o estilo global de `button`; um
  `.exportar-controles .secundario` com `background: transparent`, borda
  `--cor-borda-forte` e texto `--cor-texto` para diferenciar visualmente de um
  botão de ação primária (geração) sem introduzir cores novas.
- `.exportar-aviso` (sucesso) com `color: var(--cor-ok-texto)` e `.exportar-erro`
  com `color: var(--cor-erro-texto)`, fontes pequenas (`0.85rem`), coerentes com
  os avisos existentes.
- Controle no cabeçalho: `.app-header-export` posicionado junto a
  `.app-documento-ativo`, sem quebrar o layout `space-between` do header.

---

## 7. Casos de borda

- **Documento sem artefato algum:** controle de documento desabilitado (UI) +
  `gerarMarkdownDocumento`/`montarDefinicaoPdfDocumento` produzem só o cabeçalho
  e “Nenhum artefato gerado ainda.” (defesa em profundidade, sem crash). (CA8)
- **Artefato ausente na tela:** o controle por artefato não é renderizado (RF8).
- **Usuário cancela o save dialog:** `{ status: "cancelado" }`; nenhum arquivo é
  tocado; a UI não mostra erro.
- **Permissão negada / disco cheio ao gravar:** `writeFile`/stream rejeita →
  `ExportacaoFalhouError` → mensagem amigável; nenhum arquivo parcial deixado (o
  stream de PDF grava no destino escolhido; se falhar no meio, o arquivo pode
  ficar incompleto — mitigação: escrever em `<destino>.tmp` e `rename` ao final,
  espelhando a escrita atômica do `storage.ts`). **Decisão: usar o mesmo padrão
  `.tmp` + `rename`** tanto para `.md` quanto para `.pdf`, para nunca deixar um
  arquivo meio-escrito no caminho final que o usuário escolheu.
- **Flashcards/exercícios com array vazio:** tratados como **ausentes**
  (`length > 0`), coerente com `listarDocumentos`. O **quiz** segue a regra do
  storage (`!== undefined`); se um quiz existir com `perguntas` vazio (não
  esperado na geração), `gerarMarkdownQuiz`/`conteudoQuiz` produzem a seção com
  zero perguntas sem lançar — defesa trivial.
- **Mapa com um só nó (raiz sem filhos):** Markdown = uma linha; SVG = um nó.
  Ambos válidos.
- **Rótulos/enunciados com caracteres especiais:** no Markdown, preservados (sem
  escape agressivo — decisão 3.2); no SVG, **escapados para XML** (obrigatório,
  5.5); no PDF texto normal, o pdfmake trata.
- **Nome de documento com extensão ou caracteres inválidos:** `sugerirNomeArquivo`
  remove a extensão conhecida e os caracteres inválidos do Windows; vazio →
  `"export"`.
- **`app.getPath("documents")` indisponível (ambiente atípico):** cai para
  `home`; nunca para `Facul`.
- **Data no rodapé do PDF:** é o único valor não-determinístico. A montagem pura
  do `docDefinition` recebe a data como **parâmetro opcional** (default
  `new Date()`), para o teste injetar uma data fixa e asserir a estrutura sem
  flutuar. (ver 7.1)

### 7.1 Determinismo e a data de exportação

As funções puras de montagem (Markdown e PDF-def) são determinísticas **exceto**
pelo carimbo de data/hora no rodapé/meta do PDF. Para manter os testes estáveis,
`montarDefinicaoPdf*` aceitam um parâmetro opcional `agora?: Date` (default
`new Date()`); o teste passa uma data fixa. O **Markdown não inclui data** (fica
limpo e 100% determinístico). Decisão: só o PDF carrega a data (rodapé “Exportado
em dd/mm/aaaa”), porque é um documento “final” para impressão; o Markdown é um
formato de trabalho e fica sem carimbo para diffs limpos.

---

## 8. Testabilidade

Alinhado à estratégia do projeto (unidade em shared/serviços/parsing; UI e
gravação em disco = verificação manual). **Nenhum teste usa o Ollama nem depende
da pasta `Facul`** — tudo roda em memória sobre dados de fixture.

**Ambiente de teste (resolve o achado 7):** o `vitest.config.ts` tem
`environment: "node"` global, sem override por arquivo (confirmado — não há
`@vitest-environment` no projeto). **Nenhum teste novo roda em jsdom**; o
componente `ExportarControles.tsx` e os ajustes de view ficam em **verificação
manual** (§8.2), coerente com o ambiente `node`. Os módulos de teste importam
`pdfDefinicao.ts` (puro, só `import type` de pdfmake) e **nunca** `export.ts` no
caminho de estrutura, para não puxar a stack pdfmake/pdfkit (achado 1).

Novos testes (mantendo e ampliando a baseline de **434**):

### 8.1 Testes automatizados (unitários, puros)

- **`tests/shared/export-markdown.test.ts`** (puro, sem Node):
  - `gerarMarkdownResumo`: título `##`, linha de modo, conteúdo presente;
    cobrir **ambos** os valores de `ModoResumo` (`"curto"` e `"longo"`), achado
    11. (CA2)
  - `gerarMarkdownFlashcards`: um `###` numerado por card, pergunta + resposta;
    base-1; ordem preservada. (CA3)
  - `gerarMarkdownExercicios`: enunciado + `**Resposta:**`; modo em itálico quando
    homogêneo; sufixo por item quando misto. (CA4)
  - `gerarMarkdownMapaMental`: **lista aninhada** com indentação por nível (raiz
    nível 0; filhos `  - `; netos `    - `). (CA5)
  - `gerarMarkdownQuiz`: múltipla com `- [x]` na correta e `- [ ]` nas demais;
    aberta com `**Gabarito:**`. (CA6)
  - `gerarMarkdownDocumento`: só seções presentes, ordem canônica, título `#`;
    documento vazio → cabeçalho + “Nenhum artefato gerado ainda.”. (CA7, CA8)
  - `artefatosPresentes`: aplica `length > 0` para flashcards/exercícios,
    `!== undefined` para resumo/mapa/**quiz**; ordem canônica.
  - **Paridade com o storage (resolve o achado 10):** um teste fixa que
    `artefatosPresentes` concorda **exatamente** com a regra de
    `storage.ts` (linhas 266-273): `temResumo = resumo !== undefined`;
    `temFlashcards = flashcards !== undefined && length > 0`; `temExercicios =
    exercicios !== undefined && length > 0`; `temMapaMental = mapaMental !==
    undefined`; `temQuiz = quiz !== undefined`. Assim as duas regras não divergem.
- **`tests/main/export-pdf.test.ts`** (estrutura do docDefinition, **sem**
  renderizar o binário; importa de `src/main/services/pdfDefinicao.ts`, **nunca**
  de `export.ts`, para não carregar pdfmake — achado 1):
  - `montarDefinicaoPdfArtefato`: `content` é array; contém um nó de título do
    documento e o bloco do `tipo`; para `mapaMental`, há um nó `{ svg }` cujo
    valor começa com `<svg`. (CA9)
  - `montarDefinicaoPdfDocumento`: uma seção por artefato presente, ordem
    canônica, nenhuma para ausentes; documento vazio → nó de aviso. (CA10)
  - Determinismo com `agora` fixo: o rodapé/meta com data é estável. (7.1)
- **`tests/shared/export-mapaArvore.test.ts`** (puro): `itensMapa` devolve os nós
  em pré-ordem com `nivel` 0 na raiz e +1 por descida; é a fonte única consumida
  pelo Markdown (§3.2) e pelo `ul` do PDF (§5.3).
- **`tests/main/export-mapaSvg.test.ts`** (puro):
  - `gerarSvgMapaMental`: começa com `<svg`, declara `xmlns`/`viewBox`, contém o
    rótulo da raiz **escapado** (teste com `&`/`<` no rótulo), e um nº de `<text>`
    = nº de nós da árvore (árvore inteira expandida).
- **`tests/main/export-nome.test.ts`** (puro):
  - `sugerirNomeArquivo`: extensão por formato; sufixo humano por artefato;
    remoção da extensão do documento; caracteres inválidos removidos; vazio →
    `"export"`.
- **`tests/shared/ipc-export.test.ts`** (opcional, leve): o `AppApi` expõe
  `exportarMarkdown`/`exportarPdf` e os canais estão em `IPC_CHANNELS` (type-check
  + presença das chaves).
- **`tests/main/ipc-export.test.ts`** (handler, com `dialog` **mockado**).
  **Como evitar a render real do pdfmake (resolve o achado 6):**
  - **Markdown ponta a ponta:** mockar `electron.dialog.showSaveDialog` para
    confirmar com um caminho em `os.tmpdir()` (nunca `Facul`); o handler gera a
    string pura e grava → asserir o arquivo `.md` existe com o conteúdo esperado,
    resolve `{ status: "salvo", caminho }`; depois limpar o tmp. Este caminho
    **não** toca pdfmake.
  - **Cancelado (ambos os formatos):** `showSaveDialog` resolve
    `{ canceled: true }` → handler resolve `{ status: "cancelado" }`, **nenhum**
    `writeFile` chamado (asserir via spy). Vale para `export:markdown` e
    `export:pdf` — o cancelamento acontece **antes** de qualquer render, então o
    caso PDF-cancelado também não toca pdfmake.
  - **PDF salvo:** **não** renderiza o binário no teste. Como `renderizarPdf` vive
    em `export.ts` e é a única função que carrega pdfmake, o teste faz
    `vi.mock("../../src/main/services/export", ...)` (ou injeta um fake) para que
    `renderizarPdf` devolva um `Buffer` fixo; então asserir que o handler grava
    esse buffer no caminho do dialog e resolve `{ status: "salvo" }`. A render
    real de PDF é **verificação manual** (§8.2). (CA11)
  - **Falha de gravação:** `writeFile` rejeita (spy) → handler lança a **mensagem
    amigável** de `mensagemAmigavelExportacao`.
  Molde: reusa `vi.mock("electron", ...)` com `ipcMain.handle` capturado, como as
  demais `tests/main/ipc-*.test.ts` (confirmado no projeto).

### 8.2 Verificação manual (descrita)

O que **não** é coberto por teste automatizado e precisa ser verificado à mão
antes de concluir:

1. **Render real do PDF:** gerar um documento com os cinco artefatos, exportar
   PDF do documento inteiro e abrir o arquivo: conferir que (a) as fontes
   carregam (texto Roboto, sem “tofu”), (b) os títulos usam a cor de marca, (c) o
   **mapa aparece como vetor nítido** (ampliar o PDF sem perda), (d) a quebra de
   página é limpa, (e) o rodapé mostra a data.
2. **Save dialog:** confirmar que o diálogo abre ancorado à janela, sugere o nome
   correto (`"<doc> - <artefato>.<ext>"` / `"<doc>.<ext>"`), **abre em Documentos
   por padrão (nunca em Desktop/Facul)**, e que cancelar não cria arquivo.
3. **Markdown real:** abrir o `.md` exportado em um leitor (VS Code/GitHub):
   checklists do quiz renderizam, a lista do mapa indenta corretamente, e o
   documento inteiro traz só os artefatos gerados.
4. **Por artefato:** de cada aba, exportar só aquele artefato em MD e PDF;
   confirmar que o controle some quando o artefato não existe.
5. **Documento sem artefatos:** confirmar que o botão “Exportar documento” fica
   desabilitado com o `title` de orientação.

Antes de concluir a implementação: `npm run build` (inclui `tsc --noEmit`) e
`npm test` verdes, `npm run lint` limpo, baseline de **434** testes preservada e
ampliada.

---

## 9. Arquivos tocados (resumo para implementação)

**Novos:**

- `src/shared/export/types.ts` — `FormatoExportacao`, `TipoArtefato`,
  `AlvoExportacao`, `DocumentoExportavel`, `ResultadoExportacao`.
- `src/shared/export/markdown.ts` — funções puras de Markdown + `ORDEM_ARTEFATOS`
  + `artefatosPresentes` + `gerarMarkdownDocumento` (consome `itensMapa`).
- `src/shared/export/mapaArvore.ts` — `ItemMapa` + `itensMapa` (puro, fonte única
  do mapa achatado; consumido pelo Markdown e pelo `ul` do PDF — achado 9).
- `src/main/services/pdfDefinicao.ts` — **montagem PURA** do docDefinition
  (`montarDefinicaoPdfArtefato`/`montarDefinicaoPdfDocumento` + helpers
  `conteudo*`); só `import type` de `pdfmake/interfaces`, **sem** pdfmake em
  runtime (achado 1).
- `src/main/services/export.ts` — **camada de efeito**: `fontesRoboto`,
  `obterPrinter` (preguiçoso), `renderizarPdf`, `sugerirNomeArquivo`,
  `diretorioPadraoExport`, `exportarMarkdown`/`exportarPdf` (save dialog +
  escrita atômica), `ExportacaoFalhouError`. Único módulo que carrega `pdfmake`.
- `src/main/services/mapaSvg.ts` — `gerarSvgMapaMental` (puro, reusa
  `calcularLayout` com `Set<string>` e os símbolos extraídos de `mapaLayout`).
- `src/renderer/components/ExportarControles.tsx` — botões MD/PDF reutilizáveis.
- Testes: `tests/shared/export-markdown.test.ts`,
  `tests/shared/export-mapaArvore.test.ts`, `tests/main/export-pdf.test.ts`
  (importa `pdfDefinicao.ts`), `tests/main/export-mapaSvg.test.ts`,
  `tests/main/export-nome.test.ts`, `tests/main/ipc-export.test.ts` (e opcional
  `tests/shared/ipc-export.test.ts`).

**Modificados:**

- `package.json` — `pdfmake` (dep, exato) + `@types/pdfmake` (devDep, exato).
- `src/shared/ipc.ts` — canais `exportarMarkdown`/`exportarPdf` + métodos no
  `AppApi` + `import type` de `./export/types`.
- `src/main/preload.ts` — dois métodos `invoke`.
- `src/main/ipc/index.ts` — dois handlers + `mensagemAmigavelExportacao` +
  imports.
- `src/renderer/App.tsx` — controle “Exportar documento” no header; prop
  `nomeDocumento` para as views de geração; montagem do `DocumentoExportavel`.
- `src/renderer/views/Resumo.tsx`, `Flashcards.tsx`, `Exercicios.tsx`,
  `MapaMental.tsx`, `Quiz.tsx` — `<ExportarControles>` por artefato (visível só
  quando o artefato existe) + aceitar `nomeDocumento`.
- `src/renderer/styles.css` — estilos dos controles de exportação (só tokens
  existentes).
- `src/shared/mapaLayout.ts` — **aditivo (achado 4):** exportar
  `NO_LARGURA`/`NO_ALTURA`/`MARGEM`/`caminhoAresta` (valores idênticos aos atuais
  da view), **sem** alterar `calcularLayout`. Reusados por `MapaMental.tsx` e
  `mapaSvg.ts`.
- `src/renderer/views/MapaMental.tsx` — remover as cópias locais de
  `NO_LARGURA`/`NO_ALTURA`/`MARGEM`/`caminhoAresta` e **importá-las** de
  `@shared/mapaLayout` (refatoração sem mudança de comportamento).

**Não modificados (confirmado):** `src/shared/types.ts` (os tipos de domínio dos
artefatos já existem; os tipos de exportação ficam em `src/shared/export/`),
`src/main/services/storage.ts` (só reusamos o padrão de escrita atômica
`.tmp` + `rename`), `calcularLayout` em `mapaLayout.ts` (inalterado; só
acréscimo de novos exports ao módulo).

---

## 10. Resumo das decisões travadas

1. **Formatos:** Markdown + PDF. Anki/.docx/HTML/impressão/temas = fora de escopo.
2. **Alcance:** por artefato (controle em cada view, visível só se o artefato
   existe) **e** documento inteiro (controle no header do App, desabilitado se
   não há artefato).
3. **Dependência:** `pdfmake@0.2.20` (exato, em `dependencies`) + `@types/pdfmake@0.2.11`
   (exato, em `devDependencies`). Única dep nova. Roda no **main** (compatível com
   `externalizeDepsPlugin`). Import verificado: `import PdfPrinter from "pdfmake"`
   (default) e `import vfs from "pdfmake/build/vfs_fonts.js"` (default = dicionário
   base64); fontes Roboto passadas como `Buffer` nos descritores (não há `.ttf`
   em disco).
4. **Markdown:** puro em `src/shared/export/markdown.ts`; uma função por artefato
   + `gerarMarkdownDocumento` concatenando os presentes na ordem canônica; mapa =
   **lista aninhada** por indentação. Sem data (determinístico).
5. **PDF:** montagem **pura** do `docDefinition` em
   `src/main/services/pdfDefinicao.ts` (só `import type` de pdfmake — testável
   sem render); o **efeito** (printer preguiçoso, `renderizarPdf`, gravação) em
   `src/main/services/export.ts`, único módulo que carrega pdfmake, **sem efeito
   em module scope**. Fontes Roboto como `Buffer` do `vfs_fonts.js`
   (entrypoints `pdfmake` default + `pdfmake/build/vfs_fonts.js` default,
   verificados na 0.2.20). Tema **claro** coerente com a marca
   (`#6366f1`/`#4f46e5`), mapa como **SVG vetorial** `{ svg }` + lista `ul` de
   apoio (via `itensMapa`); data só no PDF via `agora?` injetável.
6. **SVG do mapa:** `src/main/services/mapaSvg.ts` puro, reusa
   `calcularLayout(raiz, Set<string>)` e os símbolos extraídos para
   `@shared/mapaLayout` (`caminhoAresta`/`NO_LARGURA`/`NO_ALTURA`/`MARGEM`),
   mesmo viewBox/offset da view; árvore inteira expandida; rótulos escapados
   para XML.
7. **IPC:** canais `export:markdown`/`export:pdf`; passam os **dados** do alvo
   (não um id) para refletir o estado em memória e manter o serviço sem leitura de
   disco; preload + `AppApi`; renderer só via `getApi()`.
8. **Gravação:** `dialog.showSaveDialog` ancorado à janela, nome sugerido, default
   em **Documentos** (**nunca** `Facul`), escrita atômica `.tmp` + `rename`;
   cancelar = `{ status: "cancelado" }` (no-op).
9. **Renderer:** componente reutilizável `ExportarControles`; cada view monta um
   `DocumentoExportavel` mínimo com seu artefato; o App monta o completo para o
   documento inteiro; `artefatosPresentes` é a fonte única da regra de presença.
10. **Testes:** unidades puras (Markdown, docDefinition em `pdfDefinicao.ts`,
    SVG, nome de arquivo, `itensMapa`, paridade de presença) + handler com
    `dialog` mockado em `tmpdir` (Markdown ponta a ponta; PDF com `renderizarPdf`
    mockado; cancelado para ambos); render real de PDF e save dialog =
    verificação manual. Nada usa Ollama nem a pasta `Facul`. Baseline 434
    preservada e ampliada.

---

## 11. Respostas à revisão de design (`design-review.json`, veredito CHANGES_REQUESTED)

Esta é uma revisão. Cada achado foi **endereçado** no corpo do documento; abaixo o
resumo da resposta. As escolhas respeitam os requisitos originais (Markdown + PDF;
mapa SVG vetorial no PDF e lista aninhada no Markdown; `pdfmake` pinado; gravação
só via save dialog, nunca na pasta `Facul`; nada de Ollama).

- **#1 (HIGH) — printer em module scope quebra testabilidade.** Endereçado.
  Separei a **montagem pura** do docDefinition em
  `src/main/services/pdfDefinicao.ts` (só `import type` de `pdfmake/interfaces`)
  e deixei o **efeito** (printer, render, gravação) em `export.ts` com
  instanciação **preguiçosa** (`obterPrinter` memoizado), nunca em module scope.
  O teste de estrutura importa `pdfDefinicao.ts`. Regra fixada: nenhum efeito de
  pdfmake em topo de módulo. (§2, §5.2, §5.3, §8.1, §9)
- **#2 (HIGH) — caminhos de import/vfs não verificados na 0.2.20.** Endereçado.
  Instalei `pdfmake@0.2.20` + `@types/pdfmake@0.2.11` neste worktree e **verifiquei
  renderizando um PDF real**. Fixei os entrypoints **literais**: `import PdfPrinter
  from "pdfmake"` (default; `main: src/printer.js`, sem `exports`) e `import vfs
  from "pdfmake/build/vfs_fonts.js"` (default = dicionário base64). Como não há
  `.ttf` em disco, a estratégia de fonte é passar os **`Buffer`** do vfs nos
  descritores (`PDFFontSource` aceita `Buffer`). (§5.1, §5.2, §10.3) *(a instalação
  foi apenas para verificação; o `package.json` do worktree não foi alterado — a
  adição pinada é tarefa da implementação, CA1.)*
- **#3 (MEDIUM) — assinatura de `calcularLayout` (Set vs array).** Endereçado.
  Fixei `calcularLayout(raiz, expandidos: Set<string>)` e um helper `todosOsIds`
  que constrói o `Set` completo; nunca um array. (§5.5)
- **#4 (MEDIUM) — `caminhoAresta`/constantes presas à view.** Endereçado.
  Decisão: **extrair** (não replicar) `caminhoAresta`/`NO_LARGURA`/`NO_ALTURA`/
  `MARGEM` para `@shared/mapaLayout.ts` de forma aditiva; view e `mapaSvg.ts`
  consomem os mesmos símbolos. Especifiquei viewBox/offset idênticos ao da view
  (`larguraVb = largura + NO_LARGURA + 2*MARGEM`; translate `MARGEM + NO_LARGURA/2,
  MARGEM`). (§5.5, §9)
- **#5 (MEDIUM) — "nível 0" do Markdown do mapa ambíguo.** Endereçado. Declarei a
  convenção: profundidade da **árvore de domínio** começa em 0 na raiz
  (independente do `nivel` 1-based do layout); a raiz é o primeiro `- ` sem
  indentação, +2 espaços por descida; o título `## Mapa mental` é genérico e não
  duplica o rótulo da raiz. (§3.2, CA5)
- **#6 (MEDIUM) — teste do handler evitando render real do pdfmake.** Endereçado.
  Fixei: Markdown ponta a ponta em `tmpdir`; cancelado para ambos os formatos
  (antes de qualquer render); PDF-salvo com `renderizarPdf` **mockado** (asserir
  gravação do buffer), render real = manual. (§8.1)
- **#7 (NIT) — ambiente de teste node / sem jsdom.** Endereçado. Declarei que
  nenhum teste novo roda em jsdom e que `ExportarControles` fica em verificação
  manual, coerente com `environment: node`. (§8 intro)
- **#8 (NIT) — `nomeDocumento` redundante.** Endereçado. Removi `nomeDocumento`
  de `AlvoExportacao`; fonte única é `alvo.documento.nome`. (§3.1, §5.4, §6.3)
- **#9 (NIT) — lista de apoio do mapa no PDF sem contrato.** Endereçado.
  Especifiquei o helper puro `itensMapa` (`{nivel, rotulo}[]`) em
  `src/shared/export/mapaArvore.ts` com dois adaptadores (string Markdown; `ul`
  aninhado do pdfmake); a string de Markdown **não** é insumo do PDF. (§3.2, §5.3)
- **#10 (NIT) — paridade de presença com o storage.** Endereçado. Ao verificar
  `storage.ts` (linhas 266-273) descobri que a regra real do **quiz** é
  `!== undefined` (não `perguntas.length > 0`, como a 1ª versão do design dizia);
  corrigi `artefatosPresentes` e os §3.3/§7 para **bater exatamente** com o
  storage, e adicionei o teste de paridade. (§3.3, §7, §8.1)
- **#11 (NIT) — ambos os valores de `ModoResumo` no teste de CA2.** Endereçado.
  O teste de `gerarMarkdownResumo` cobre `"curto"` e `"longo"`. (§8.1)
