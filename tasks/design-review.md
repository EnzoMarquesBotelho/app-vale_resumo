# Revisão de design — Fatia Exportação (Markdown + PDF)

Documento revisado: `tasks/design-exportacao.md` (2ª passada, que afirma endereçar
11 achados anteriores de `design-review.json`).
Revisor: subagente de revisão de design, com contexto fresco, verificando as
afirmações concretas contra o código-fonte real do worktree
`c:\Dev\.worktrees\export`.

Veredito: **CHANGES_REQUESTED** (1 HIGH + 2 MEDIUM; NITs não bloqueiam, mas estão
listados).

O design é maduro, bem estruturado e a maioria das decisões concretas foi
**verificada contra o código real** (ver "Suposições verificadas"). Os pontos
abaixo são os que ainda não se sustentam sozinhos para a implementação.

---

## Achados

### 1. HIGH — As afirmações centrais de pdfmake (entrypoint, vfs, fonte-Buffer) não são reproduzíveis a partir do estado versionado

Local: §5.1, §5.2, §10.3, §11 (#2).

O design baseia TODA a geração de PDF em três fatos "literais" sobre
`pdfmake@0.2.20` + `@types/pdfmake@0.2.11`:

1. `import PdfPrinter from "pdfmake"` (default export = construtor; `main:
   src/printer.js`, sem campo `exports`);
2. `import vfs from "pdfmake/build/vfs_fonts.js"` (default export = dicionário
   base64 plano `{ "Roboto-Regular.ttf": <base64>, ... }`);
3. fontes passadas como `Buffer` nos descritores porque não há `.ttf` em disco.

Verifiquei o worktree: **`pdfmake` NÃO está em `package.json`** (só `pdfjs-dist`)
e **NÃO está em `node_modules`** (`node_modules/pdfmake` e
`node_modules/pdfmake/build/vfs_fonts.js` ausentes). O próprio design admite que
instalou o pacote "apenas para verificação" e não alterou o `package.json`.
Portanto, no estado atual, **nenhuma dessas três afirmações pode ser
re-verificada**, e elas são exatamente o eixo em que o PDF inteiro quebra ou
funciona. Um `exports` no `package.json` do pacote, um `vfs` aninhado em vez de
plano, ou um default export diferente invalidam §5.2 inteiro em runtime (o
`tsc --noEmit` do CI **não** pega isso, pois o pacote é externalizado e os
caminhos são resolvidos só em runtime).

Risco adicional concreto: `import vfs from "pdfmake/build/vfs_fonts.js"` e
`vfs[nome]` são tipados? O `@types/pdfmake` normalmente **não** declara o módulo
`pdfmake/build/vfs_fonts.js`. Com `verbatimModuleSyntax`/strict do projeto, esse
import pode exigir uma declaração de módulo (`declare module`) ou `// @ts-expect-error`
— o design não especifica isso, e isso afeta `npm run build` (CA1).

Correção concreta (escolher uma e deixá-la fixa no design):
- **Preferida:** tornar a adição pinada parte da tarefa ANTES de qualquer outra
  coisa (`"pdfmake": "0.2.20"` em `dependencies`, `"@types/pdfmake": "0.2.11"` em
  `devDependencies`), instalar, e então a implementação reconfirma os três fatos
  no próprio worktree com um script mínimo (`node --input-type=module`) cujo
  resultado é colado no design. O design já descreve o teste manual de render
  (§8.2 item 1) — eleve a reprodução dos entrypoints a um passo **bloqueante** da
  implementação, não a uma nota.
- Especificar o tratamento de tipos do import de vfs: adicionar
  `src/main/services/vfs-fonts.d.ts` com
  `declare module "pdfmake/build/vfs_fonts.js" { const vfs: Record<string,string>; export default vfs; }`
  (ou documentar que `@types/pdfmake@0.2.11` já cobre esse caminho — verificar e
  registrar qual é o caso). Sem isso, o build pode falhar e CA1 não é atingível.

Enquanto os entrypoints/fontes só existirem como "verificado numa instalação
efêmera que não está no repo", a feature de PDF repousa sobre uma suposição que o
próximo agente não consegue confirmar — é o que esta revisão existe para pegar.

### 2. MEDIUM — O mock de `electron` dos testes existentes não cobre o que o handler de exportação precisa; o design não especifica como estendê-lo

Local: §8.1 ("Molde: reusa `vi.mock(\"electron\", ...)` ... como as demais
`tests/main/ipc-*.test.ts` (confirmado no projeto)"), §5.7.

Verifiquei o molde real (`tests/main/ipc-mapa.test.ts`): o `vi.mock("electron",
...)` existente expõe **apenas** `ipcMain.handle` e `dialog: { showOpenDialog }`.
O handler de exportação precisa, em runtime de teste, de:
- `dialog.showSaveDialog` (não `showOpenDialog`);
- `BrowserWindow.fromWebContents` (usado por `janelaDoEvento`, §5.7) — ausente do
  mock;
- `app.getPath("documents")` (via `diretorioPadraoExport`, §5.4) — `app` **não**
  está no mock atual e, importado em escopo de módulo em `export.ts`, será
  `undefined` no ambiente `node` sem mock, quebrando a importação do módulo.

"Reusa o molde das irmãs" é, portanto, **insuficiente** — o molde precisa de
objetos novos. Como escrito, o teste de handler não roda.

Correção concreta: especificar no design o mock estendido, por exemplo:
```ts
vi.mock("electron", () => ({
  ipcMain: { handle: (c, h) => registered.set(c, h) },
  dialog: { showSaveDialog: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => undefined) },
  app: { getPath: vi.fn(() => os.tmpdir()) }, // nunca Facul
}));
```
E fixar que `app.getPath` no mock devolve `os.tmpdir()` (coerente com RNF4). Sem
isso, nem o caminho feliz de Markdown ponta a ponta (§8.1) nem o cancelado rodam.

### 3. MEDIUM — `diretorioPadraoExport` chama `app.getPath` mas o design o posiciona em `export.ts` com funções "puras"; acoplamento a `electron` em escopo de módulo não está resolvido

Local: §5.4, §9.

`diretorioPadraoExport()` chama `app.getPath("documents")` — `app` vem de
`electron`. O design declara `export.ts` como "a camada de efeito" e, em §5.2,
fixa a regra "nenhum efeito de pdfmake em topo de módulo" com instanciação
preguiçosa. Mas o design **não aplica a mesma disciplina a `electron`**:
`import { app } from "electron"` em `export.ts` é carregado assim que o módulo é
importado, e o teste de `sugerirNomeArquivo` (§8.1, `tests/main/export-nome.test.ts`,
declarado "puro") importa `export.ts` — que importa `electron`. No ambiente
`node` do vitest sem mock de `electron`, isso quebra a importação (o pacote
`electron` não resolve para um objeto utilizável fora do runtime Electron).

Ou seja: há uma contradição entre "`sugerirNomeArquivo`/`diretorioPadraoExport`
são puros e testáveis em `export.ts`" (§5.4, §8.1) e "o teste puro importa
`export.ts`" quando `export.ts` importa `electron` no topo.

Correção concreta (escolher uma):
- Mover `sugerirNomeArquivo` (que é genuinamente puro — só string) para a camada
  **shared** (`src/shared/export/nome.ts`) ou para `pdfDefinicao.ts`-style puro,
  para que `tests/main/export-nome.test.ts` **não** importe `electron`. Manter
  `diretorioPadraoExport` (que precisa de `app`) em `export.ts` e cobri-lo só via
  o teste de handler com `electron` mockado.
- OU declarar explicitamente que `tests/main/export-nome.test.ts` também carrega o
  `vi.mock("electron", ...)` (então não é "puro", é "node com electron mockado"),
  e aplicar o mesmo cuidado ao import de `app`. O design precisa dizer qual.

Isto é o mesmo tipo de armadilha que o achado #1 da revisão anterior (efeito em
escopo de módulo) — resolvido para pdfmake, mas deixado em aberto para `electron`.

---

## NITs (não bloqueiam)

### N1. NIT — Baseline "434 testes" não confere com a contagem estática

Local: cabeçalho, §1.4 (CA13), §8, §10.
Medi o worktree: 431 chamadas `it(`/`test(` + 1 bloco `.each` (que expande para
N casos). O número real só é confirmável rodando a suíte (fora de escopo desta
revisão). O design repete "434" como fato "não de memória" — mas a contagem
estática não bate exatamente. Correção: a implementação deve rodar `npm test` e
corrigir o número de baseline no design/docs para o valor real antes de concluir,
em vez de citar 434 de memória.

### N2. NIT — `BrowserWindow` não está nos imports de `ipc/index.ts`

Local: §5.7. `janelaDoEvento` usa `BrowserWindow.fromWebContents`, mas o
`ipc/index.ts` atual importa só `{ dialog, ipcMain }` de `electron` (verificado).
Correção: listar `BrowserWindow` na lista de imports novos de §5.7/§9.

### N3. NIT — Convenção de nome de arquivo de teste `.ts` (não `.tsx`)

Local: §8, §9. O `vitest.config.ts` tem `include: ["tests/**/*.test.ts"]`
(verificado) — só `.ts`. O design já coloca todos os testes novos como `.ts` e
deixa o componente React em verificação manual, então está coerente; registro só
para o implementador não criar um `.test.tsx` esperando que rode.

### N4. NIT — `conteudoQuiz`/`gerarMarkdownQuiz` e o rótulo das alternativas

Local: §3.2. Verifiquei `PerguntaQuiz`: a união é `multipla` (com
`alternativas: AlternativaQuiz[]`, cada uma `{ texto, correta }`) ou `aberta`
(com `gabarito`). O design usa `- [x]`/`- [ ]` e decide não rotular por letra —
coerente com o tipo. OK; registro apenas que o texto "Alternativa A"/"Alternativa
correta" nos exemplos de §3.2 é ilustrativo e o conteúdo real vem de
`alternativa.texto` (o design diz isso em prosa, mas o exemplo pode confundir).

---

## Suposições verificadas (conferidas contra o código real)

- **`calcularLayout(raiz: NoMapaMental, expandidos: Set<string>)`** — assinatura
  confirmada em `src/shared/mapaLayout.ts`. O design usa `Set<string>` e um
  helper `todosOsIds`. ✔ (achado #3 da revisão anterior está corretamente
  endereçado).
- **Constantes da view `NO_LARGURA=168`, `NO_ALTURA=40`, `MARGEM=24` e
  `caminhoAresta`** — confirmadas literalmente em
  `src/renderer/views/MapaMental.tsx`, com o mesmo corpo de `caminhoAresta` e o
  mesmo viewBox (`largura + NO_LARGURA + MARGEM*2`) e offset
  (`translate(MARGEM + NO_LARGURA/2, MARGEM)`). A extração aditiva para
  `mapaLayout.ts` é factível. ✔ (achado #4 endereçado corretamente).
- **`NoPosicionado`** expõe `x`, `y`, `nivel`, `rotulo`, `filhosIds` — confirmado;
  `caminhoAresta(pai, filho)` usa campos existentes. ✔
- **Regra de presença do storage** (`listarDocumentos`, linhas ~265-272):
  `temResumo = resumo !== undefined`; `temFlashcards = flashcards !== undefined &&
  length > 0`; `temExercicios = exercicios !== undefined && length > 0`;
  `temMapaMental = mapaMental !== undefined`; **`temQuiz = quiz !== undefined`**
  (sem `perguntas.length`). Bate exatamente com `artefatosPresentes` em §3.3. ✔
  (achado #10 endereçado corretamente, inclusive a correção do quiz).
- **Tipos de domínio** `Resumo{conteudo,modo}`, `Flashcard{pergunta,resposta}`,
  `Exercicio{enunciado,resposta,modo}`, `MapaMental{raiz}`, `Quiz{perguntas}`,
  `PerguntaQuiz` (união `multipla`/`aberta`), `ModoResumo = "curto"|"longo"` —
  confirmados em `src/shared/types.ts`. ✔
- **`vitest.config.ts`** `environment: "node"` global, sem override por arquivo,
  `include: ["tests/**/*.test.ts"]`. ✔ (achado #7 endereçado).
- **Escrita atômica `.tmp` + `rename`** — confirmada em `storage.ts`
  (`gravarCru`/`salvarDocumento`), e o filtro `.json.tmp` órfão existe. O design
  reusa o padrão corretamente. ✔
- **Padrão de teste IPC** — `vi.mock("electron", ...)` capturando
  `ipcMain.handle`, `registerIpcHandlers` importado de
  `../../src/main/ipc/index.js`, Ollama mockado no nível do serviço. Confirmado em
  `tests/main/ipc-mapa.test.ts` (com a ressalva do achado #2 sobre o conteúdo do
  mock). ✔
- **`getApi()`** em `src/renderer/api.ts` devolve `PreloadApi` e lança
  `ERRO_API_INDISPONIVEL` se a ponte faltar — confirmado; o design respeita a
  regra "sem `window.api?.`". ✔
- **`preload.ts`** segue o estilo `(args) => ipcRenderer.invoke(CANAL, args)`
  sem lógica — confirmado; as duas linhas novas encaixam. ✔
- **`ipc.ts`** tem `IPC_CHANNELS` (objeto `as const`) e `AppApi` (interface) —
  confirmado; a adição de `exportarMarkdown`/`exportarPdf` e o
  `import type ... from "./export/types"` são coerentes. ✔
- **`App.tsx`**: `persistirArtefato` existe (artefato fica em memória mesmo se o
  save falhar, sustentando a decisão 4.2); `.app-documento-ativo` no header com
  guarda `documento !== null`; views recebem `arquivo`/`*Salvo`/`onGerado`.
  Confirmado — a colocação do controle de documento no header e o prop
  `nomeDocumento` são factíveis. ✔
- **Pinagem de dependências** — todas as deps atuais usam versão exata (sem
  `^`/`~`); `jsdom` está em devDeps. A exigência de pinar `pdfmake`/`@types/pdfmake`
  é coerente com o projeto. ✔ (a execução do pin está no achado #1).
- **Decisões de produto respeitadas** — Markdown + PDF apenas; Anki/.docx/HTML/
  temas fora de escopo (§1.5, §10.1); mapa como SVG vetorial no PDF e lista
  aninhada no Markdown (RF5/RF6, §5.3, §5.5); gravação só via `showSaveDialog`,
  default em Documentos e **nunca** `C:\Users\enzom\OneDrive\Desktop\Facul`
  (RNF4, §5.4); nada de Ollama (RNF1, §8). Tudo coerente com o pedido original do
  usuário. ✔

---

## Suposições não verificadas / em risco

- **Entrypoints e vfs do `pdfmake@0.2.20`** (`import PdfPrinter from "pdfmake"`;
  `import vfs from "pdfmake/build/vfs_fonts.js"` como dicionário base64 plano;
  fontes como `Buffer`; `ContentSvg.svg: string`; `PDFFontSource` aceita
  `Buffer`): **NÃO verificáveis** no estado atual — o pacote não está em
  `package.json` nem em `node_modules`. Esta é a base do achado #1 (HIGH).
- **Tipagem do import `pdfmake/build/vfs_fonts.js`** sob strict/`verbatimModuleSyntax`:
  não confirmado que `@types/pdfmake@0.2.11` declara esse caminho de módulo; pode
  exigir `declare module`. Afeta `npm run build` (CA1). Ver achado #1.
- **Contagem exata da baseline (434)**: não verificável sem rodar a suíte; a
  contagem estática deu 431 `it/test` + 1 `.each`. Ver N1.
- **Render real do PDF (fontes carregam, SVG nítido, quebra de página, rodapé)**:
  por natureza é verificação manual (§8.2) — não verificável nesta revisão
  estática; depende da resolução do achado #1.
