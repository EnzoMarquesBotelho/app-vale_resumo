# Worklog — Fatia: Mapas Mentais

> Registro de implementação e verificação da fatia vertical "mapas mentais":
> tipos + prompts + contrato de IPC compartilhados; serviço de geração/parsing/
> validação tolerante com UMA re-tentativa corretiva e condensação via resumo
> para textos grandes; canal IPC `mapamental:gerar` resolvendo o modelo via
> `modeloParaGeracao()`; persistência `salvarMapaMental` espelhando `salvarResumo`;
> preload; e a aba "Mapa mental" com visualização SVG navegável (expandir/
> colapsar, zoom, pan), sem edição. Primeira iteração (não havia
> `review-mapas.json`): implementado do zero a partir de `plan-mapas.md` e
> `design-mapas.md`.

## O que foi implementado (por camada)

- **shared**
  - `src/shared/constants.ts`: `MAPA_PROFUNDIDADE_MAXIMA=4`, `MAPA_MAX_NOS=200`,
    `MAPA_ROTULO_MAX=120`, `MAPA_MAX_FILHOS_POR_NO=12`.
  - `src/shared/types.ts`: `NoMapaMental { id, rotulo, filhos[] }`,
    `MapaMental { documentoId, raiz, geradoEm }`; campo opcional `mapaMental?`
    em `DocumentoSalvo`; `temMapaMental: boolean` em `ResumoDocumentoSalvo`.
  - `src/shared/prompts.ts`: `montarPromptMapaMental` e
    `montarPromptCorrigirMapaMental` (JSON aninhado `{raiz:{rotulo,filhos}}`,
    sem ids, rótulos curtos, até 4 níveis).
  - `src/shared/mapaLayout.ts`: `calcularLayout(raiz, expandidos)` — layout
    horizontal determinístico (tidy-tree simplificado), lógica pura sem DOM.
  - `src/shared/ipc.ts`: canais `mapamental:gerar` e
    `documento:salvar-mapa-mental`; `AppApi.gerarMapaMental` (retorno não-nulo
    `NoMapaMental`) e `AppApi.salvarMapaMental`.
- **main**
  - `src/main/services/mapa.ts`: `SemTextoParaMapaMentalError`,
    `MapaMentalInvalidoError`, `parseMapaMental` (reusa `extrairBlocoJson`,
    normaliza raiz, sanitiza/valida recursivamente, atribui ids `n0..` em
    pré-ordem após poda) e `gerarMapaMental` (texto grande → `gerarResumo`
    com o mesmo `tamanhoChunk`; 1ª tentativa + 1 corretiva).
  - `src/main/services/storage.ts`: `salvarMapaMental` (espelha `salvarResumo`)
    e `temMapaMental: documento.mapaMental !== undefined` em `listarDocumentos`.
  - `src/main/ipc/index.ts`: `mensagemAmigavelMapaMental` + handlers
    `gerarMapaMental` (resolve o modelo via `modeloParaGeracao()`, devolve
    `mapa.raiz`) e `salvarMapaMental`.
  - `src/main/preload.ts`: métodos `gerarMapaMental`/`salvarMapaMental`.
- **renderer**
  - `src/renderer/views/MapaMental.tsx`: nova view com SVG próprio via
    `calcularLayout`; expandir/colapsar (clique no nó), zoom (`＋`/`−`/
    `Redefinir`), pan (arrastar o fundo); estado desabilitado/vazio sem texto;
    chamadas só por `getApi()`; `role="img"`+`aria-label`, resumo textual
    aninhado e `aria-label` nos botões de zoom.
  - `src/renderer/App.tsx`: aba `"mapa"` entre "exercicios" e "historico";
    incluída em `ehAbaGeracao`/`abaDesabilitada`; render com `key` por
    documento e handler `salvarMapaMental` via `persistirArtefato`.
  - `src/renderer/styles.css`: regras `.mapa*` usando só os tokens existentes
    (cores por nível: raiz `--cor-primaria`; nível 2 `--cor-superficie`;
    níveis 3–4 `--cor-superficie-2`; arestas `--cor-borda-forte`).
  - `src/renderer/views/Historico.tsx`: etiqueta "Mapa mental".

Nenhuma dependência adicionada (`package.json`/lock inalterados), conforme o
design (render SVG próprio).

## Comandos de verificação (executados em c:\Dev\.worktrees\mapas)

```
=== npm run build ===  -> exit 0  (tsc --noEmit + electron-vite build OK)
=== npm run lint  ===  -> exit 0  (eslint ., sem erros/avisos)
=== npm test      ===  -> exit 0  (20 arquivos, 213 testes, todos passando)
```

Baseline preservada e ampliada: **170 → 213** testes (43 novos). A suíte
automatizada mocka/injeta o Ollama e NÃO depende da pasta `Facul` (fixtures e
`baseDir` temporário). Arquivos de teste novos/estendidos:

```
tests/main/mapa.test.ts          (24)  <- parseMapaMental (bem-formado/malformado/
                                           truncado), sanitização (rótulo/trunca na
                                           fronteira de palavra/profundidade/leque/
                                           MAPA_MAX_NOS/ids densos), gerarMapaMental
                                           (texto vazio, sucesso 1 chamada, retry
                                           corretiva, MapaMentalInvalidoError, propaga
                                           erro do gerador, caminho de texto grande
                                           = 3 map + 1 reduce + 1 mapa)
tests/main/ipc-mapa.test.ts      (6)   <- canal registrado, happy path, resolução do
                                           modelo via modeloParaGeracao (reconcilia
                                           família), retry, erro inválido→amigável,
                                           erro genérico→amigável
tests/shared/mapaLayout.test.ts  (5)   <- raiz à esquerda/colunas por nível, folhas
                                           sem sobreposição de y, nó interno centrado,
                                           colapsado sai do layout, árvore de 1 nó
tests/shared/prompts.test.ts     (+3)  <- montarPromptMapaMental (conteúdo/formato/
                                           curto/4 níveis) e corretivo
tests/main/ipc-storage.test.ts   (+2)  <- salvarMapaMental wiring + erro amigável
tests/main/storage.test.ts       (+3)  <- round-trip de salvarMapaMental, lança p/ id
                                           inexistente, temMapaMental true/false
```

## Verificação manual com material real (SOMENTE LEITURA)

Fonte: `C:\Users\enzom\OneDrive\Desktop\Facul` (PDFs reais de faculdade). Nada
foi modificado, movido ou apagado nessa pasta — apenas leitura do arquivo. A
checagem foi feita por um teste temporário (`tests/_manual-mapa.test.ts`) que
chamou o fluxo real sem mocks (`importarArquivo` → `gerarMapaMental` →
`generate` do Ollama) e foi **removido em seguida** (não faz parte da suíte, que
continua 100% com Ollama mockado — confirmado: 213 testes após a remoção).

Ambiente: Ollama rodando (`GET /api/tags` → 200), modelo `llama3.1:latest`
instalado. Arquivo:
`Analise de Algoritimos/Pratica/Pr_atica1prblemascomputacionais.pdf`
(texto extraído: 5824 caracteres, `semTextoExtraivel: false`).

Árvore gerada (ids densos `n0..n24`, profundidade ≤ 4, rótulos curtos):

```
- [n0] Técnicas de Análise de Algoritmos
  - [n1] Complexidade
    - [n2] O(n)   [n3] O(log n)   [n4] O(n log n)   [n5] O(1)
  - [n6] Caso
    - [n7] Melhor Caso   [n8] Caso Médio   [n9] Pior Caso
  - [n10] Algoritmos
    - [n11] Crivo de Eratóstenes → [n12] Desenvolvimento
    - [n13] Métodos de Ordenação → [n14] Bubble Sort
    - [n15] Problema da Busca → [n16] Busca Linear  [n17] Busca Binária
    - [n18] Fibonacci → [n19] Recursivo  [n20] Listas (bottom-up)  [n21] Prog. Dinâmica
  - [n22] Conceitos de Algoritmos → [n23] Números Primos  [n24] Problemas de Decisão
```

Interpretação: o JSON aninhado foi extraído e validado com sucesso; a árvore é
coerente com o PDF, respeita profundidade (≤ 4), leque e tamanho, com ids
atribuídos no main (o modelo não os forneceu) e rótulos curtos. Não foi
necessária a re-tentativa corretiva neste caso; os caminhos de malformação/
retry/give-up são cobertos pelos testes automatizados.

### Verificação manual da UI (sem harness de componente)

A view SVG não é coberta por teste automatizado (convenção do projeto; o layout
testável foi extraído para `@shared/mapaLayout`). Com `npm run dev` e um
documento com texto importado, verificado na aba **Mapa mental**:

- **Estado vazio/desabilitado:** sem texto importado a aba fica desabilitada e
  cai de volta para "Importar"; com texto, "Gerar mapa mental" produz a árvore
  (ou erro amigável se o Ollama estiver offline/sem modelo).
- **Expandir/colapsar:** clicar num nó com filhos alterna a subárvore e o layout
  reflui; nós com subárvore oculta mostram o indicador `+N` (contagem de filhos).
- **Zoom:** `＋`/`−`/`Redefinir` escalam o grupo SVG (`transform: scale()`) sem
  recarregar; botões desabilitam nos limites (0,5×–2×).
- **Pan:** arrastar o fundo desloca o mapa; o cursor vira `grab`/`grabbing`;
  arrastar não move nós (navegável, não editável).
- **Design-tokens:** cores por nível (raiz em `--cor-primaria`, níveis mais
  profundos mais suaves em `--cor-superficie`/`--cor-superficie-2` com texto
  `--cor-texto-suave`), bordas/raios/fundo coerentes com o tema escuro de
  `styles.css`; rótulos longos chegam truncados com `…` e o `<title>` SVG repete
  o rótulo saneado no hover.
- **Persistência/Histórico:** gerar, reabrir o documento pelo Histórico e o mapa
  reaparece (`mapaMentalSalvo`); a etiqueta "Mapa mental" aparece no item.

## Fora de escopo (não implementado, por design)

Edição manual de nós (renomear/adicionar/remover, arrastar-reposicionar+persistir,
desfazer), exportação como imagem/arquivo e grafo livre multi-pai. Textos de
UI/IA em português; identificadores em inglês.
