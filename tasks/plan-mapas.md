# Implementation Plan — Fatia: Mapas Mentais

> Plano de implementação da fatia de **mapas mentais**, derivado do design
> aprovado `tasks/design-mapas.md` (fonte da verdade do COMO) e do roadmap
> confirmado `tasks/roadmap-mapas-mentais.md`. Não re-decide a arquitetura; apenas
> sequencia o trabalho por dependência.
>
> **Worktree:** todos os caminhos são relativos a `c:\Dev\.worktrees\mapas`.
> Trabalhe só neste worktree; nunca toque em `c:\Dev`. Git: `git -C c:\Dev\.worktrees\mapas`.
> Branch atual: `feat/mapas-mentais`.
>
> **Baseline a preservar:** `npm test` → 170 testes passando; `npm run build`
> (`tsc --noEmit && electron-vite build`) e `npm run lint` limpos. Cada item deixa
> o código em estado compilável; a suíte cresce, nunca regride.
>
> **Convenções obrigatórias observadas no código:** `verbatimModuleSyntax: true`
> e `noUnusedLocals: true` nos tsconfigs → todo tipo é `import type` e sem sobras;
> identificadores em inglês, textos de UI/IA em português; alias `@shared/*`
> resolve `src/shared/*`; serviços puros com a chamada ao modelo injetável
> (`gerar?: GerarTexto`); renderer chama o main **apenas** via `getApi()` (sem
> `window.api?.`); testes rodam em memória / `baseDir` temporário com o Ollama
> mockado e **não** dependem da pasta `Facul`.
>
> Ordem: itens 1→9 em sequência (cada um depende dos anteriores). Itens 10–14 são
> os testes, que dependem do código correspondente já existir. Itens 15–16 fecham
> a verificação integrada.

- [ ] 1. Adicionar os limites estruturais do mapa mental em `src/shared/constants.ts`.
      Acrescentar as constantes `MAPA_PROFUNDIDADE_MAXIMA = 4`, `MAPA_MAX_NOS = 200`,
      `MAPA_ROTULO_MAX = 120` e `MAPA_MAX_FILHOS_POR_NO = 12`, com JSDoc, no mesmo
      estilo de `tamanhoMaximoChunkCaracteres` (fonte única da verdade para prompt e
      validador). (design §1.3)
      Files: src/shared/constants.ts
      Verify: `npm run build` — `tsc --noEmit` passa (constantes referenciadas nos itens seguintes).

- [ ] 2. Adicionar os tipos de domínio do mapa mental em `src/shared/types.ts`.
      Criar as interfaces `NoMapaMental { id: string; rotulo: string; filhos: NoMapaMental[] }`
      e `MapaMental { documentoId: string; raiz: NoMapaMental; geradoEm: string }` ao
      lado de `Resumo`/`Flashcard`/`Exercicio`. Em `DocumentoSalvo` adicionar o campo
      opcional `mapaMental?: MapaMental`; em `ResumoDocumentoSalvo` adicionar
      `temMapaMental: boolean`. Campo aditivo e opcional — sem migração. (design §1.1, §1.2)
      Files: src/shared/types.ts
      Verify: `npm run build` — `tsc --noEmit` passa.

- [ ] 3. Adicionar os prompts do mapa mental em `src/shared/prompts.ts`.
      Criar `montarPromptMapaMental(texto: string): string` (instrui, em português,
      a devolver APENAS JSON no formato aninhado `{"raiz":{"rotulo":"...","filhos":[...]}}`,
      sem ids, com rótulos curtos, até `MAPA_PROFUNDIDADE_MAXIMA` níveis, sem texto fora
      do JSON) e `montarPromptCorrigirMapaMental(respostaAnterior: string): string`
      (reapresenta formato + resposta anterior pedindo só o JSON corrigido), no mesmo
      molde de `montarPromptFlashcards`/`montarPromptCorrigirFlashcards`. Importar
      `MAPA_PROFUNDIDADE_MAXIMA` de `@shared/constants`. (design §2.1)
      Files: src/shared/prompts.ts
      Verify: `npx vitest run tests/shared/prompts.test.ts` — suíte existente continua passando (asserções novas no item 13).

- [ ] 4. Criar a função pura de layout da árvore em `src/shared/mapaLayout.ts`.
      Exportar `NoPosicionado`, `LayoutMapa` e `calcularLayout(raiz: NoMapaMental,
      expandidos: Set<string>): LayoutMapa`, implementando o layout horizontal
      determinístico (tidy-tree simplificado): `x` por nível, `y` das folhas em passo
      fixo, `y` de nó interno = média dos filhos visíveis; nós colapsados (id fora de
      `expandidos`) não contribuem com filhos; arestas pai→filho. Lógica pura, sem
      DOM/React. Importar `NoMapaMental` como `import type` de `@shared/types`. (design §4.2)
      Files: src/shared/mapaLayout.ts
      Verify: `npm run build` — `tsc --noEmit` passa (teste no item 14).

- [ ] 5. Criar o serviço de geração/parsing/validação em `src/main/services/mapa.ts`.
      Espelhar `parse.ts`. Reusar `extrairBlocoJson` importado de `./parse.js` e
      `gerarResumo`/`GerarTexto` de `./resumo.js`; `generate` de `./ollama.js` como
      default do gerador. Implementar, numa única unidade:
      (a) classes de erro `SemTextoParaMapaMentalError` (code `SEM_TEXTO_PARA_MAPA_MENTAL`)
      e `MapaMentalInvalidoError` (code `MAPA_MENTAL_INVALIDO`), no molde dos erros de `parse.ts`;
      (b) `parseMapaMental(resposta: string): NoMapaMental | null` — extrai bloco, `JSON.parse`
      em try/catch, normaliza a raiz (aceita `{raiz:{...}}` ou nó solto; candidato que não
      seja objeto não-nulo → `null`), sanitiza/valida recursivamente e atribui ids;
      (c) sanitização recursiva (design §2.3): descarta nó sem rótulo string não-vazio (e
      sua subárvore), apara e trunca rótulo em `MAPA_ROTULO_MAX` com reticência na fronteira
      de palavra, poda profundidade além de `MAPA_PROFUNDIDADE_MAXIMA`, poda leque além de
      `MAPA_MAX_FILHOS_POR_NO`, respeita o teto `MAPA_MAX_NOS`, ids densos `n0,n1,…` em
      pré-ordem após a poda; raiz sem rótulo válido após sanear → `null`;
      (d) `GerarMapaMentalParams { texto; gerar?; tamanhoChunk? }` e
      `gerarMapaMental(params): Promise<MapaMental>` — texto vazio → `SemTextoParaMapaMentalError`;
      se `dividirEmChunks(texto, tamanhoChunk).length > 1`, condensar via
      `gerarResumo({ texto, modo: "longo", gerar, tamanhoChunk })` (mesmo `tamanhoChunk`
      repassado) e usar o resumo inteiro como base, sem re-chunk; 1ª tentativa
      `montarPromptMapaMental` → `parseMapaMental`; se `null`, 2ª tentativa corretiva
      `montarPromptCorrigirMapaMental` → `parseMapaMental`; se ainda `null`,
      `MapaMentalInvalidoError`; retorno `{ documentoId: "", raiz, geradoEm: new Date().toISOString() }`.
      Importar `MapaMental`/`NoMapaMental` como `import type` e as constantes de `@shared/constants`.
      (design §2.2–§2.5)
      Files: src/main/services/mapa.ts
      Verify: `npm run build` — `tsc --noEmit` passa (testes no item 10).

- [ ] 6. Adicionar o canal e o contrato de IPC em `src/shared/ipc.ts`.
      Em `IPC_CHANNELS` adicionar `gerarMapaMental: "mapamental:gerar"` e
      `salvarMapaMental: "documento:salvar-mapa-mental"`. Em `AppApi` adicionar
      `gerarMapaMental: (texto: string) => Promise<NoMapaMental>` (retorno **não-nulo**,
      nunca `| null`) e `salvarMapaMental: (id: string, mapa: MapaMental) => Promise<DocumentoSalvo>`,
      com JSDoc. Acrescentar `MapaMental` e `NoMapaMental` à lista `import type` de `./types`.
      (design §3.1)
      Files: src/shared/ipc.ts
      Verify: `npm run build` — `tsc --noEmit` passa.

- [ ] 7. Adicionar a persistência em `src/main/services/storage.ts`.
      Criar `salvarMapaMental(id, mapaMental: MapaMental, baseDir?): Promise<DocumentoSalvo>`
      espelhando `salvarResumo` (carrega, faz spread `{ ...documento, mapaMental }`, salva).
      Em `listarDocumentos`, incluir `temMapaMental: documento.mapaMental !== undefined`
      no objeto `ResumoDocumentoSalvo` (critério idêntico a `temResumo`). Acrescentar
      `MapaMental` à lista `import type` de `@shared/types`. (design §3.2)
      Files: src/main/services/storage.ts
      Verify: `npx vitest run tests/main/storage.test.ts` — suíte existente continua passando (round-trip no item 12).

- [ ] 8. Registrar os handlers de IPC em `src/main/ipc/index.ts`.
      Adicionar `mensagemAmigavelMapaMental(erro)` (trata `OllamaIndisponivelError`,
      `SemTextoParaMapaMentalError`, `MapaMentalInvalidoError` devolvendo `erro.message`;
      genérica "Não foi possível gerar o mapa mental. Tente novamente."). Registrar o
      handler `IPC_CHANNELS.gerarMapaMental` que resolve o modelo via `modeloParaGeracao()`,
      chama `gerarMapaMental({ texto, gerar: (prompt) => generate({ prompt, model }) })` e
      retorna `mapa.raiz`; registrar `IPC_CHANNELS.salvarMapaMental` espelhando `salvarResumo`
      (chama `storage.salvarMapaMental`, erro via `mensagemAmigavelPersistencia`). Adicionar
      os imports: `SemTextoParaMapaMentalError`, `MapaMentalInvalidoError`, `gerarMapaMental`
      de `../services/mapa.js`; `salvarMapaMental` de `../services/storage.js`; `MapaMental`,
      `NoMapaMental` à lista `import type` de `@shared/types`. (design §3.1)
      Files: src/main/ipc/index.ts
      Verify: `npx vitest run tests/main/ipc-flashcards.test.ts tests/main/ipc-resumo.test.ts` — suítes existentes continuam passando (novos testes de IPC nos itens 10/11).

- [ ] 9. Expor os métodos no preload em `src/main/preload.ts`.
      Adicionar ao objeto `api` `gerarMapaMental: (texto) => ipcRenderer.invoke(IPC_CHANNELS.gerarMapaMental, texto)`
      e `salvarMapaMental: (id, mapa) => ipcRenderer.invoke(IPC_CHANNELS.salvarMapaMental, id, mapa)`.
      Sem novos imports de tipo (tipagem vem de `AppApi`). (design §3.3)
      Files: src/main/preload.ts
      Verify: `npm run build` — `tsc --noEmit` passa; `npm run lint` limpo.

- [ ] 10. Testar `src/main/services/mapa.ts` (parsing, validação, geração) em `tests/main/mapa.test.ts`.
      Novo arquivo análogo a `tests/main/parse.test.ts`. Cobrir `parseMapaMental`
      (objeto `{raiz}` bem-formado; nó solto na raiz; cercado por texto/```json```;
      JSON truncado → `null`; JSON inválido → `null`; raiz sem rótulo → `null`;
      `{raiz: <não-objeto>}` e topo-array → `null`); sanitização (descarta nós sem
      rótulo e subárvore; apara/trunca em `MAPA_ROTULO_MAX` na fronteira de palavra;
      poda profundidade; poda leque; respeita `MAPA_MAX_NOS`; ids `n0,n1,…` densos);
      `gerarMapaMental` (texto vazio → `SemTextoParaMapaMentalError`; sucesso em 1 chamada;
      re-tentativa corretiva no 1º JSON malformado = 2 chamadas; `MapaMentalInvalidoError`
      após falha persistente; propaga erro do gerador; texto grande injetando
      `tamanhoChunk` pequeno e mockando `gerar` para asserir a sequência N map + 1 reduce
      do resumo, depois 1 prompt do mapa). (design §6)
      Files: tests/main/mapa.test.ts
      Verify: `npx vitest run tests/main/mapa.test.ts` — todos os novos testes passam.

- [ ] 11. Testar o handler de IPC do mapa mental em `tests/main/ipc-mapa.test.ts`.
      Novo arquivo análogo a `tests/main/ipc-flashcards.test.ts`. Registra o canal,
      gera com o Ollama mockado asserindo que o modelo foi resolvido via
      `modeloParaGeracao` (checar `params.model`); re-tentativa; `MapaMentalInvalidoError`
      → mensagem amigável; falha genérica → mensagem genérica. (design §6)
      Files: tests/main/ipc-mapa.test.ts
      Verify: `npx vitest run tests/main/ipc-mapa.test.ts` — todos os novos testes passam.

- [ ] 12. Estender os testes de persistência em `tests/main/ipc-storage.test.ts` (e/ou `tests/main/storage.test.ts`).
      Adicionar: `salvarMapaMental` round-trip (salvar → `carregarDocumento` traz o
      `mapaMental` igual); `listarDocumentos` reporta `temMapaMental` corretamente
      (true quando salvo, false quando ausente); documento inexistente →
      `DocumentoNaoEncontradoError` → mensagem amigável. Usar `baseDir` temporário,
      no padrão dos testes de storage existentes. (design §6)
      Files: tests/main/ipc-storage.test.ts
      Verify: `npx vitest run tests/main/ipc-storage.test.ts tests/main/storage.test.ts` — todos os testes passam.

- [ ] 13. Estender os testes de prompts em `tests/shared/prompts.test.ts`.
      Adicionar asserções: `montarPromptMapaMental` contém o texto fornecido e o
      formato JSON aninhado pedido; `montarPromptCorrigirMapaMental` reapresenta a
      resposta anterior e o formato. (design §6)
      Files: tests/shared/prompts.test.ts
      Verify: `npx vitest run tests/shared/prompts.test.ts` — todos os testes passam.

- [ ] 14. Testar a função pura de layout em `tests/shared/mapaLayout.test.ts`.
      Novo arquivo, teste puro (sem harness de componente). `calcularLayout` (de
      `@shared/mapaLayout`): raiz à esquerda e níveis em colunas crescentes; folhas sem
      sobreposição de `y`; nós colapsados saem do layout (não aparecem em `nos`/`arestas`);
      árvore de um único nó funciona. (design §4.2, §6)
      Files: tests/shared/mapaLayout.test.ts
      Verify: `npx vitest run tests/shared/mapaLayout.test.ts` — todos os novos testes passam.

- [ ] 15. Criar a view navegável do mapa mental em `src/renderer/views/MapaMental.tsx`.
      Componente no molde de `Resumo.tsx`, props `{ arquivo: ArquivoImportado | null;
      mapaMentalSalvo?: MapaMental | null; onGerado?: (mapa: MapaMental) => void }`.
      Estado: `raiz` (de `mapaMentalSalvo?.raiz` ou do gerado), `gerando`, `erro`,
      `expandidos: Set<string>` (default: raiz + filhos diretos), `zoom`, `pan`. Render
      SVG próprio usando `calcularLayout` de `@shared/mapaLayout` (sem dependência nova):
      nós `<g>` com `<rect rx>` + `<text>` + `<title>` (repete `no.rotulo`), arestas
      `<path>` curva de Bézier. Interações navegáveis, **sem edição**: clicar em nó
      com filhos alterna `expandidos`; botões `＋`/`－`/`Redefinir` ajustam `zoom`
      (via `transform: scale()`); pan por arrastar o fundo. Estado desabilitado/vazio
      quando `!temTexto` (mesma derivação das outras telas) com texto convidando a
      importar. Geração: `gerar()` chama `getApi().gerarMapaMental(arquivo.texto)`,
      `setRaiz(raizGerada ?? null)`, e `onGerado({ documentoId: "", raiz, geradoEm })`;
      helper local `mensagemDeErro` como nas telas irmãs. Acessibilidade: `<svg>`
      `role="img"` + `aria-label` ("Mapa mental: <tema>"), resumo textual `<ul>`
      aninhado abaixo do canvas, `aria-label` nos botões de zoom. Importar `MapaMental`,
      `NoMapaMental`, `ArquivoImportado` como `import type`. (design §4.3, §4.4)
      Files: src/renderer/views/MapaMental.tsx
      Verify: `npm run build` — `tsc --noEmit` + `electron-vite build` passam; `npm run lint` limpo.

- [ ] 16. Integrar a aba, os estilos e o Histórico; verificação integrada final.
      (a) `src/renderer/App.tsx`: adicionar `"mapa"` ao tipo `Aba` e à constante `ABAS`
      (`{ id: "mapa", rotulo: "Mapa mental", icone: "🗺️" }`) entre "exercicios" e
      "historico"; incluir `"mapa"` em `ehAbaGeracao` e `abaDesabilitada`; renderizar
      `<MapaMental key={`mapa-${chaveDocumento}`} arquivo={arquivo}
      mapaMentalSalvo={documento?.mapaMental ?? null} onGerado={temTexto ? (m) =>
      void salvarMapaMental(m) : undefined} />`; adicionar o handler `salvarMapaMental(mapa)`
      no padrão de `salvarResumo` usando `persistirArtefato("mapa mental", () =>
      getApi().salvarMapaMental(documento.id, { ...mapa, documentoId: documento.id }))`.
      (b) `src/renderer/styles.css`: regras `.mapa`, `.mapa-controles`, `.mapa-canvas`,
      nós/arestas, usando **apenas** os custom properties existentes (cores por nível:
      raiz `--cor-primaria`, nível 2 `--cor-superficie`+`--cor-borda-forte`, níveis 3–4
      `--cor-superficie-2`+`--cor-texto-suave`; arestas `--cor-borda-forte`). (c)
      `src/renderer/views/Historico.tsx`: em `etiquetas`, `if (resumo.temMapaMental)
      partes.push("Mapa mental");`. (design §4.4, §4.5, §4.6)
      Files: src/renderer/App.tsx, src/renderer/styles.css, src/renderer/views/Historico.tsx
      Verify: `npm run build` (tsc + build), `npm run lint` e `npm test` todos limpos,
      com a baseline de 170 testes preservada e ampliada pelos novos (itens 10–14).

## Verificação manual da UI (sem harness de componente)

Por convenção do projeto, a view SVG não é coberta por teste automatizado — o
layout testável foi extraído para `@shared/mapaLayout`. Com `npm run dev` e um
documento com texto importado, verificar manualmente na aba **Mapa mental**:

- **Geração/estado vazio:** sem texto importado, a aba fica desabilitada e cai de
  volta para "Importar"; com texto, "Gerar mapa mental" produz a árvore (ou erro
  amigável se o Ollama estiver offline/sem modelo).
- **Expandir/colapsar:** clicar num nó com filhos alterna a subárvore; o layout
  reflui; o indicador mostra que há subárvore oculta.
- **Zoom:** `＋`/`－`/`Redefinir` escalam o mapa sem recarregar.
- **Pan:** arrastar o fundo desloca o mapa; o cursor vira `grab`/`grabbing`;
  arrastar não move nós (navegável, não editável).
- **Consistência de design-tokens:** cores por nível (raiz destacada, níveis mais
  profundos mais suaves), bordas, raios e fundo coerentes com o tema escuro de
  `styles.css`; rótulos longos aparecem truncados com `…` e o `<title>` repete o
  rótulo no hover.
- **Persistência/Histórico:** gerar, reabrir o documento pelo Histórico e confirmar
  que o mapa reaparece; a etiqueta "Mapa mental" aparece no item do Histórico.

## Lacunas e suposições

- O design é a fonte da verdade e cobre todas as decisões (modelo, limites,
  geração, IPC, persistência, visualização, histórico); nenhuma decisão de
  arquitetura ficou em aberto para o implementador resolver.
- **Suposição:** os custom properties citados (`--cor-primaria`, `--cor-superficie`,
  `--cor-superficie-2`, `--cor-borda`, `--cor-borda-forte`, `--cor-texto`,
  `--cor-texto-suave`, `--raio-sm`/`--raio-md`) existem em `src/renderer/styles.css`.
  No item 16, antes de escrever o CSS, confirmar os nomes reais no arquivo e usar os
  equivalentes existentes caso algum difira — nunca introduzir cor hard-coded fora do
  padrão nem dependência nova (o design trava "nenhuma dependência adicionada").
- **Fora de escopo** (não implementar): edição manual de nós, exportação como
  imagem/arquivo, grafo livre multi-pai. Textos de UI/IA em português; identificadores
  em inglês.
