# Plano de implementação — Fatia Exportação (Markdown + PDF)

> Plano ordenado e verificável para a fatia de **exportação** (Markdown + PDF, por
> artefato e documento inteiro), derivado do design aprovado
> `tasks/design-exportacao.md` e da revisão `tasks/design-review.md`
> (CHANGES_REQUESTED: 3 achados bloqueantes embutidos abaixo como passos
> obrigatórios — itens 1, 11 e 12).
>
> **Worktree:** todo o trabalho acontece em `c:\Dev\.worktrees\export`. Caminhos
> relativos resolvem a partir dessa raiz. Git nesta fatia: sempre
> `git -C c:\Dev\.worktrees\export ...` (branch `feat/exportacao`).
>
> **Baseline verificada (rodando a suíte, não de memória):** `npm test` →
> **434 testes passando, 32 arquivos** (confirmado neste worktree; a contagem
> estática de ~431 do roadmap ignorava a expansão de um bloco `.each`). `npm run
> build` (`tsc --noEmit && electron-vite build`) e `npm run lint` limpos. Nada
> pode regredir isso; os novos testes somam acima de 434.
>
> **Comandos reais do projeto** (de `package.json`):
> - Build: `npm run build`  (= `tsc --noEmit && electron-vite build`)
> - Testes: `npm test`       (= `vitest run`) — `vitest.config.ts`:
>   `environment: "node"`, `include: ["tests/**/*.test.ts"]` (só `.ts`).
> - Lint: `npm run lint`     (= `eslint .`)
> - Teste de um arquivo: `npx vitest run tests/shared/export-markdown.test.ts`
>
> **Regras fixas (não violar):** exportação 100% local/offline (nunca Ollama);
> gravar só via `dialog.showSaveDialog`, default em `app.getPath("documents")`,
> **nunca** `C:\Users\enzom\OneDrive\Desktop\Facul`; renderer chama o main **só**
> via `getApi()` (nunca `window.api?.`); dependência nova pinada em versão exata.
> **NÃO** editar `tasks/PROGRESSO.md`, `tasks/todo.md`, `README.md` neste worktree
> (o orquestrador atualiza na master após o merge).

---

## Ordem e dependências

A fatia é **uma feature coesa** (camadas acopladas pela mesma dependência e pelo
mesmo contrato). A ordem abaixo respeita as dependências: a dependência pdfmake e
a verificação de entrypoints vêm primeiro (destravam todo o PDF); os tipos e os
helpers puros (shared) vêm antes de quem os consome (PDF-def, SVG, IPC, renderer);
o IPC vem antes dos controles do renderer; os testes de cada camada acompanham a
camada. Cada item deixa o repositório **buildável** (`npm run build` limpo) e com a
suíte verde.

---

- [ ] 1. **(HIGH — destrava todo o PDF) Adicionar pdfmake pinado, instalar e RECONFIRMAR os entrypoints no worktree.**
      Adicionar em `dependencies` `"pdfmake": "0.2.20"` (versão exata, sem `^`/`~`)
      e em `devDependencies` `"@types/pdfmake": "0.2.11"` (exata). Rodar
      `npm install` no worktree. Então reconfirmar, com um script efêmero
      `node --input-type=module` (NÃO versionar o script), os três fatos de que o
      PDF depende: (a) `import PdfPrinter from "pdfmake"` devolve o construtor do
      printer (o `package.json` do pacote tem `main: src/printer.js` e sem campo
      `exports`); (b) `import vfs from "pdfmake/build/vfs_fonts.js"` é um
      dicionário base64 plano com as chaves `Roboto-Regular.ttf`,
      `Roboto-Medium.ttf`, `Roboto-Italic.ttf`, `Roboto-MediumItalic.ttf`;
      (c) `new PdfPrinter({ Roboto: { normal: Buffer.from(vfs["Roboto-Regular.ttf"], "base64"), ... } }).createPdfKitDocument({...}).end()`
      emite um `Buffer` de PDF (renderizar um PDF real com uma linha de texto +
      um nó `{ svg }`). Se qualquer um dos três divergir do design, PARAR e
      reportar antes de prosseguir (o resto do PDF repousa nesses fatos).
      Files: `package.json`, `package-lock.json`
      Verify: `npm install` conclui; o script efêmero grava um `.pdf` não vazio e
      imprime `typeof PdfPrinter === "function"` e as 4 chaves do vfs; em seguida
      `npm run build` e `npm run lint` seguem limpos (apagar o script e o `.pdf`
      antes de prosseguir).

- [ ] 2. **(HIGH — tipagem do import de vfs) Garantir o `declare module` do vfs se o build exigir.**
      Após o item 1, rodar `npm run build`. Se o import
      `pdfmake/build/vfs_fonts.js` não for tipado por `@types/pdfmake@0.2.11` sob
      `strict`/`verbatimModuleSyntax` (erro de "módulo sem declaração"), criar
      `src/main/services/vfs-fonts.d.ts` com
      `declare module "pdfmake/build/vfs_fonts.js" { const vfs: Record<string, string>; export default vfs; }`.
      Se `@types/pdfmake` já cobrir o caminho, registrar isso num comentário no
      topo de `export.ts` (quando for criado no item 7) e NÃO criar o `.d.ts`.
      Esta decisão é tomada pelo resultado real do `tsc`, não por suposição.
      Files: `src/main/services/vfs-fonts.d.ts` (condicional)
      Verify: `npm run build` limpo (`tsc --noEmit` sem erro no import do vfs).

- [ ] 3. **Criar os tipos de exportação em `src/shared/export/types.ts`.**
      Definir `FormatoExportacao` (`"markdown" | "pdf"`), `TipoArtefato`
      (`"resumo" | "flashcards" | "exercicios" | "mapaMental" | "quiz"`),
      `DocumentoExportavel` (`{ nome; resumo?; flashcards?; exercicios?;
      mapaMental?; quiz? }`), `AlvoExportacao` (união discriminada por `escopo`:
      `"artefato"` com `tipo` + `documento`, ou `"documento"` com `documento`;
      **sem** `nomeDocumento` redundante — fonte única é `documento.nome`) e
      `ResultadoExportacao` (`{ status: "salvo"; caminho } | { status:
      "cancelado" }`). Todos os imports de domínio via `import type` de
      `../types` (respeita `verbatimModuleSyntax`/`noUnusedLocals`).
      Files: `src/shared/export/types.ts`
      Verify: `npm run build` limpo (type-check do novo módulo).

- [ ] 4. **Criar o helper puro do mapa achatado em `src/shared/export/mapaArvore.ts`.**
      `interface ItemMapa { nivel: number; rotulo: string }` (nivel 0 = raiz) e
      `itensMapa(mapa: MapaMental): ItemMapa[]` que achata a árvore em pré-ordem
      (DFS) com `nivel` começando em 0 na raiz e +1 por descida. Fonte única
      consumida pelo Markdown (item 5) e pelo `ul` do PDF (item 8). Puro, só
      `import type` de `../types`.
      Files: `src/shared/export/mapaArvore.ts`, `tests/shared/export-mapaArvore.test.ts`
      Verify: `npx vitest run tests/shared/export-mapaArvore.test.ts` — novos
      testes passam (pré-ordem; nivel 0 na raiz, +1 por descida; raiz sem filhos
      vira um único item).

- [ ] 5. **Criar a camada de Markdown pura em `src/shared/export/markdown.ts`.**
      Implementar as funções puras por artefato, cada uma devolvendo `string` com
      título de seção `##`, sem título de documento, usando `\n` (nunca `\r\n`) e
      sem `\n` final sobrando: `gerarMarkdownResumo` (`## Resumo` + `*Modo:
      curto|longo*` + conteúdo), `gerarMarkdownFlashcards` (`## Flashcards` +
      blocos `### N. pergunta` / resposta, base-1), `gerarMarkdownExercicios`
      (`## Exercícios` + `### N. enunciado` / `**Resposta:**`; modo em itálico se
      homogêneo, sufixo por item se misto), `gerarMarkdownMapaMental` (`## Mapa
      mental` + lista aninhada via `itensMapa`: `"  ".repeat(item.nivel) + "- " +
      item.rotulo`, raiz sem indentação, título não duplica a raiz),
      `gerarMarkdownQuiz` (`## Quiz` + por pergunta: múltipla com `- [x]` na
      correta e `- [ ]` nas demais usando `alternativa.texto`; aberta com
      `**Gabarito:**`). Adicionar `ORDEM_ARTEFATOS` (resumo → flashcards →
      exercicios → mapaMental → quiz), `artefatosPresentes(doc)` (regra de
      presença **idêntica ao `storage.ts` linhas ~266-273**: `resumo !==
      undefined`; `flashcards !== undefined && length > 0`; `exercicios !==
      undefined && length > 0`; `mapaMental !== undefined`; `quiz !== undefined`)
      e `gerarMarkdownDocumento(doc)` (`# nome` + seções presentes na ordem
      canônica separadas por linha em branco; sem nenhum artefato → cabeçalho +
      `_Nenhum artefato gerado ainda._`, sem lançar). Sem escape agressivo de
      Markdown (decisão §3.2). Puro: só `import type` e o import de `itensMapa`.
      Files: `src/shared/export/markdown.ts`, `tests/shared/export-markdown.test.ts`
      Verify: `npx vitest run tests/shared/export-markdown.test.ts` — cobre
      CA2 (resumo nos modos `curto` **e** `longo`), CA3, CA4 (homogêneo e misto),
      CA5 (indentação raiz/filho/neto), CA6 (múltipla e aberta), CA7, CA8
      (documento vazio), e a **paridade de presença** com a regra do storage.

- [ ] 6. **Extrair (aditivo) as constantes e `caminhoAresta` para `@shared/mapaLayout` e reusá-las na view.**
      Em `src/shared/mapaLayout.ts`, adicionar os exports `NO_LARGURA = 168`,
      `NO_ALTURA = 40`, `MARGEM = 24` e `caminhoAresta(pai: NoPosicionado, filho:
      NoPosicionado): string` (corpo idêntico ao atual da view — Bézier
      horizontal), **sem** alterar `calcularLayout` (que continua usando seu
      `LARGURA_COLUNA`/`ALTURA_LINHA` internos; são conceitos distintos: coluna de
      layout vs. caixa do nó). Em `src/renderer/views/MapaMental.tsx`, remover as
      cópias locais dessas quatro definições e importá-las de `@shared/mapaLayout`
      (refatoração sem mudança de comportamento). Reusados por `mapaSvg.ts` (item
      7).
      Files: `src/shared/mapaLayout.ts`, `src/renderer/views/MapaMental.tsx`
      Verify: `npm run build` limpo e `npm test` segue verde (os testes de layout
      existentes continuam passando; a view compila importando os símbolos).

- [ ] 7. **Criar o SVG puro do mapa em `src/main/services/mapaSvg.ts`.**
      `gerarSvgMapaMental(mapa: MapaMental): string` que: constrói `expandidos`
      com **todos** os ids da árvore (helper `todosOsIds` por travessia) e chama
      `calcularLayout(mapa.raiz, expandidos)` (assinatura real:
      `(raiz, expandidos: Set<string>)`); monta uma string SVG autônoma com o
      **mesmo** viewBox e offset da view (`larguraVb = layout.largura +
      NO_LARGURA + MARGEM*2`; `<g transform="translate(MARGEM + NO_LARGURA/2,
      MARGEM)">`), uma `<path d={caminhoAresta(pai, filho)}>` por aresta e, por
      nó, um grupo `translate(x, y)` com `<rect x={-NO_LARGURA/2}
      y={-NO_ALTURA/2} width height rx=10>` e `<text text-anchor="middle">`;
      aplica `fill`/`stroke` inline da **paleta clara** (raiz `#6366f1`/texto
      branco; nível 2 borda `#4f46e5` fundo `#eef2ff`; níveis 3+ borda `#c7d2fe`
      fundo branco; texto `#1f2937`); **escapa os rótulos para XML** (`&`→`&amp;`,
      `<`→`&lt;`, `>`→`&gt;`, `"`→`&quot;`) — único ponto de escape da fatia.
      Puro/determinístico; não importa pdfmake.
      Files: `src/main/services/mapaSvg.ts`, `tests/main/export-mapaSvg.test.ts`
      Verify: `npx vitest run tests/main/export-mapaSvg.test.ts` — a saída começa
      com `<svg`, declara `xmlns`/`viewBox`, contém o rótulo da raiz **escapado**
      (fixture com `&`/`<` no rótulo) e um nº de `<text>` igual ao nº de nós da
      árvore inteira (inclui o caso raiz sem filhos).

- [ ] 8. **(resolve review #3) Criar o nome sugerido PURO em `src/shared/export/nome.ts`.**
      Mover `sugerirNomeArquivo(alvo: AlvoExportacao, formato: FormatoExportacao):
      string` para a camada **shared** (não `export.ts`, que importa `electron`),
      para ser testável sem mockar electron. Regras: extensão `.md`/`.pdf` por
      formato; para artefato, sufixo humano (`Resumo`/`Flashcards`/`Exercícios`/
      `Mapa mental`/`Quiz`) → `"<doc> - <sufixo>.<ext>"`; para documento,
      `"<doc>.<ext>"`; o nome vem **só** de `alvo.documento.nome`; remover a
      extensão conhecida do nome (`.txt`/`.md`/`.pdf`) e os caracteres inválidos
      do Windows (`< > : " / \ | ? *`) e bordas; nome vazio → `"export"`. Puro, só
      `import type`.
      Files: `src/shared/export/nome.ts`, `tests/shared/export-nome.test.ts`
      Verify: `npx vitest run tests/shared/export-nome.test.ts` — extensão por
      formato; sufixo humano por artefato; remoção de extensão do documento;
      caracteres inválidos removidos; vazio → `"export"`. O teste **não** importa
      `electron`.

- [ ] 9. **Criar a montagem PURA do document-definition em `src/main/services/pdfDefinicao.ts`.**
      Só `import type` de `pdfmake/interfaces` (`TDocumentDefinitions`, `Content`)
      — **sem** importar `pdfmake` em runtime, para que o teste de estrutura não
      puxe a stack pdfmake/pdfkit. Helpers `Content[]` por artefato
      (`conteudoResumo`, `conteudoFlashcards`, `conteudoExercicios`,
      `conteudoMapaMental`, `conteudoQuiz`); `conteudoMapaMental` insere um nó
      `{ svg: gerarSvgMapaMental(mapa), width/fit }` **mais** uma lista `ul`
      aninhada reconstruída a partir de `itensMapa` (fallback legível). Montadores
      `montarDefinicaoPdfArtefato(tipo, doc, agora?: Date)` e
      `montarDefinicaoPdfDocumento(doc, agora?: Date)`: título do documento no
      topo; o de documento concatena `artefatosPresentes(doc)` na ordem canônica
      (vazio → parágrafo "Nenhum artefato gerado ainda."). Declarar `defaultStyle`
      (`font: "Roboto"`, `fontSize: 11`, `color: "#1f2937"`) e `styles`
      (`tituloDocumento`, `tituloSecao` com cor de marca `#6366f1`/`#4f46e5`,
      `meta` itálico, `correta` verde), `pageSize: "A4"`, rodapé com data derivada
      de `agora` (default `new Date()`; injetável para teste determinístico).
      Files: `src/main/services/pdfDefinicao.ts`, `tests/main/export-pdf.test.ts`
      Verify: `npx vitest run tests/main/export-pdf.test.ts` — CA9 (`content` é
      array; há nó de título; para `mapaMental` há um nó `{ svg }` que começa com
      `<svg`), CA10 (uma seção por presente na ordem canônica, nenhuma para
      ausentes; vazio → nó de aviso), e rodapé estável com `agora` fixo. O teste
      importa `pdfDefinicao.ts`, **nunca** `export.ts`.

- [ ] 10. **Criar a camada de efeito em `src/main/services/export.ts`.**
      Único módulo que carrega pdfmake em runtime. `fontesRoboto()` monta o
      `TFontDictionary` com `Buffer.from(vfs[nome], "base64")` (default imports
      `PdfPrinter` de `"pdfmake"` e `vfs` de `"pdfmake/build/vfs_fonts.js"`,
      conforme item 1/2); `obterPrinter()` memoiza o `PdfPrinter` num singleton
      de módulo (instanciação **preguiçosa**, nunca em module scope);
      `renderizarPdf(def): Promise<Buffer>` via
      `createPdfKitDocument(def)` + coleta de chunks. `diretorioPadraoExport()`
      retorna `app.getPath("documents")` com fallback `app.getPath("home")`,
      **nunca** um caminho sob `Desktop/Facul`. `exportarMarkdown(alvo, janela?)`
      e `exportarPdf(alvo, janela?)`: derivam o nome com `sugerirNomeArquivo`
      (item 8), montam o conteúdo (Markdown via item 5; PDF via `montarDefinicaoPdf*`
      do item 9 + `renderizarPdf`), abrem `dialog.showSaveDialog(janela, { title,
      defaultPath: join(diretorioPadraoExport(), nome), filters })`, e — se não
      cancelado — gravam com escrita atômica `.tmp` + `rename` (espelhando
      `storage.ts`) resolvendo `{ status: "salvo", caminho }`; cancelado →
      `{ status: "cancelado" }` (sem gravar). `class ExportacaoFalhouError extends
      Error` (`code = "EXPORTACAO_FALHOU"`). Nenhum efeito de pdfmake/dialog em
      topo de módulo.
      Files: `src/main/services/export.ts`
      Verify: `npm run build` limpo (import de pdfmake/vfs resolvido; `app`/dialog
      só usados dentro de funções). `npm test` segue verde (nenhum teste importa
      `export.ts` no caminho puro).

- [ ] 11. **Fiar o IPC: canais, `AppApi`, preload e handlers.**
      Em `src/shared/ipc.ts`: adicionar `exportarMarkdown: "export:markdown"` e
      `exportarPdf: "export:pdf"` a `IPC_CHANNELS`; adicionar os métodos
      `exportarMarkdown(alvo): Promise<ResultadoExportacao>` e `exportarPdf(alvo)`
      a `AppApi`; `import type { AlvoExportacao, ResultadoExportacao } from
      "./export/types"`. Em `src/main/preload.ts`: adicionar as duas linhas
      `invoke` no mesmo estilo (sem lógica). Em `src/main/ipc/index.ts`: importar
      `BrowserWindow` de `electron` (hoje só `dialog, ipcMain`), os símbolos de
      `../services/export.js` e os tipos de `@shared/export/types`; adicionar
      `mensagemAmigavelExportacao(erro)` (`ExportacaoFalhouError` → `erro.message`;
      senão "Não foi possível exportar o arquivo. Tente novamente.") e
      `janelaDoEvento(event) = BrowserWindow.fromWebContents(event.sender) ??
      undefined`; registrar os dois handlers em `registerIpcHandlers` (try/catch
      que re-lança a mensagem amigável; cancelar não lança). O renderer só chamará
      via `getApi()` — sem mudança em `api.ts` (já tipado por `AppApi`).
      Files: `src/shared/ipc.ts`, `src/main/preload.ts`, `src/main/ipc/index.ts`,
      `tests/main/ipc-export.test.ts`, `tests/shared/ipc-export.test.ts`
      Verify: `npx vitest run tests/main/ipc-export.test.ts tests/shared/ipc-export.test.ts`
      — CA11: os canais existem em `IPC_CHANNELS`, o `AppApi` expõe os métodos, e
      os handlers estão registrados; ver o mock estendido no item 12.

- [ ] 12. **(resolve review #2) Testes de handler com mock de electron ESTENDIDO.**
      Em `tests/main/ipc-export.test.ts`, o `vi.mock("electron", ...)` NÃO pode
      ser o molde das fatias irmãs (que só expõe `ipcMain.handle` +
      `dialog.showOpenDialog`). Precisa de: `ipcMain.handle` (captura em um Map),
      `dialog: { showSaveDialog: vi.fn() }`, `BrowserWindow: { fromWebContents:
      vi.fn(() => undefined) }`, `app: { getPath: vi.fn(() => os.tmpdir()) }`
      (**nunca** a pasta Facul). Cobrir: (a) **Markdown ponta a ponta** —
      `showSaveDialog` confirma com um caminho em `os.tmpdir()`; asserir que o
      `.md` foi gravado com o conteúdo esperado e o resultado é `{ status:
      "salvo", caminho }`; limpar o tmp depois (não toca pdfmake); (b)
      **cancelado para ambos os formatos** — `showSaveDialog` → `{ canceled:
      true }`; resultado `{ status: "cancelado" }` e nenhum `writeFile` (spy),
      inclusive para `export:pdf` (cancela antes de qualquer render); (c) **PDF
      salvo** — mockar `renderizarPdf` (via `vi.mock` de
      `../../src/main/services/export`) para devolver um `Buffer` fixo; asserir
      que o handler grava esse buffer e resolve `{ status: "salvo" }` (render real
      é verificação manual); (d) **falha de gravação** — `writeFile` rejeita →
      handler lança a mensagem amigável de `mensagemAmigavelExportacao`.
      Files: `tests/main/ipc-export.test.ts`
      Verify: `npx vitest run tests/main/ipc-export.test.ts` — os quatro casos
      passam; nenhum caminho renderiza o PDF binário real; nada escreve em `Facul`.

- [ ] 13. **Criar o componente reutilizável `ExportarControles` no renderer.**
      `src/renderer/components/ExportarControles.tsx` com props `{ alvo:
      AlvoExportacao; desabilitado?: boolean; variante?: "artefato" |
      "documento" }`: dois `<button type="button">` ("Exportar Markdown" /
      "Exportar PDF") que chamam `getApi().exportarMarkdown(alvo)` /
      `exportarPdf(alvo)`; estado local `exportando: FormatoExportacao | null` e
      `aviso`; `salvo` → aviso efêmero "Exportado." (`role="status"`); `cancelado`
      → no-op silencioso; erro → aviso em `role="alert"` com o texto amigável
      (reusar o padrão `mensagemDeErro` que remove o prefixo `Error:`); botões
      `disabled` durante a exportação e quando `desabilitado`. Acessível. Sem
      teste automatizado (ambiente `node`; é verificação manual §8.2).
      Files: `src/renderer/components/ExportarControles.tsx`
      Verify: `npm run build` limpo (componente type-checa e compila).

- [ ] 14. **Inserir os controles por artefato nas views e o "Exportar documento" no App.**
      Em `App.tsx`: passar um novo prop opcional `nomeDocumento?: string`
      (de `documento?.nome`) às cinco views de geração; montar `docExportavel:
      DocumentoExportavel` a partir do `documento` ativo (spread condicional dos
      artefatos presentes) e renderizar, ao lado de `.app-documento-ativo` (guarda
      `documento !== null`), `<ExportarControles variante="documento" alvo={{
      escopo: "documento", documento: docExportavel }} desabilitado={artefatosPresentes
      (docExportavel).length === 0} />` com `title` de orientação quando vazio.
      Em cada view (`Resumo`/`Flashcards`/`Exercicios`/`MapaMental`/`Quiz`):
      aceitar `nomeDocumento?` (fallback `arquivo?.nome ?? "Documento"`) e
      renderizar `<ExportarControles alvo={...} />` no header **somente quando o
      artefato existe na tela** (resumo `!== null`; flashcards/exercícios/quiz
      `length > 0`; mapa `raiz !== null`), montando um `DocumentoExportavel`
      mínimo com só aquele artefato (RF8/CA12).
      Files: `src/renderer/App.tsx`, `src/renderer/views/Resumo.tsx`,
      `src/renderer/views/Flashcards.tsx`, `src/renderer/views/Exercicios.tsx`,
      `src/renderer/views/MapaMental.tsx`, `src/renderer/views/Quiz.tsx`
      Verify: `npm run build` limpo; `npm test` segue verde (as views compilam e
      os testes existentes não quebram).

- [ ] 15. **Adicionar os estilos de exportação em `src/renderer/styles.css` (só tokens existentes).**
      `.exportar-controles` (flex, `gap`, alinhado aos controles de geração);
      `.exportar-controles .secundario` (`background: transparent`, borda
      `--cor-borda-forte`, texto `--cor-texto`) para diferenciar de ação primária;
      `.exportar-aviso` (`color: var(--cor-ok-texto)`, `0.85rem`) e
      `.exportar-erro` (`color: var(--cor-erro-texto)`); `.app-header-export`
      junto a `.app-documento-ativo` sem quebrar o `space-between` do header.
      **Nenhuma** cor nova — só os tokens já definidos no `:root`.
      Files: `src/renderer/styles.css`
      Verify: `npm run build` limpo; `npm run lint` limpo.

- [ ] 16. **Verificação final da fatia (build + lint + suíte) e verificação manual descrita.**
      Rodar `npm run build`, `npm run lint` e `npm test`. Confirmar a suíte
      **acima de 434** (baseline + os novos testes dos itens 4,5,7,8,9,11,12),
      sem usar Ollama e sem tocar/ler a pasta `Facul`. Registrar no worklog o
      número real de testes (rodando, não de memória). Deixar anotada a
      verificação manual pendente (§8.2 do design): render real do PDF (fontes
      Roboto sem "tofu", títulos na cor de marca, mapa vetorial nítido, quebra de
      página, rodapé com data), save dialog ancorado com nome sugerido e default
      em Documentos (nunca Facul), `.md` real em um leitor, controles sumindo
      quando o artefato não existe, e "Exportar documento" desabilitado sem
      artefatos. Apagar quaisquer arquivos temporários criados na verificação.
      Files: (nenhum novo — só execução e worklog)
      Verify: `npm run build` + `npm run lint` limpos e `npm test` verde com
      contagem > 434; nenhum arquivo temporário ou `.pdf`/script de verificação
      deixado no worktree.

---

## Lacunas e suposições

- **Constantes do mapa (NO_LARGURA=168 vs. LARGURA_COLUNA=220):** verifiquei que
  são conceitos distintos e coexistentes — `NO_LARGURA/NO_ALTURA/MARGEM` dimensionam
  a caixa/offset do nó na view; `LARGURA_COLUNA/ALTURA_LINHA` são internos de
  `calcularLayout`. A extração do item 6 é aditiva e não altera `calcularLayout`,
  então os testes de layout existentes continuam válidos. Suposição de baixo risco.
- **Tipagem do import de vfs (item 2):** é condicional ao que o `tsc` real
  acusar; o passo instrui a criar o `.d.ts` só se o build exigir, evitando um
  arquivo morto se `@types/pdfmake` já cobrir o caminho.
- **`width/fit` do nó SVG no PDF (item 9):** dimensionar para a largura útil da
  página A4 mantendo proporção; valor exato ajustado na verificação manual do
  render real (§8.2) — não bloqueia os testes de estrutura.
- Baseline confirmada rodando a suíte: **434** (não ~431). Os itens novos elevam
  esse número; o item 16 registra o valor real final.
