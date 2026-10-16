# Revisão de Design — Fatia: Mapas Mentais (2ª rodada)

Documento revisado: `tasks/design-mapas.md`.
Fontes de verdade cruzadas: `tasks/roadmap-mapas-mentais.md` (decisões
confirmadas) e o código real da worktree `feat/mapas-mentais`.

Esta é uma revisão **fresca** do design — não presumo que os 7 findings da
rodada anterior estejam resolvidos só porque a seção "Respostas às conclusões da
revisão" afirma isso; cada um foi reavaliado contra o texto atual e contra o
código. Também busquei problemas novos. Verifiquei no disco cada afirmação sobre
o código existente (ver "Suposições verificadas").

## Veredito

Nenhum finding HIGH ou MEDIUM permanece. Os 7 findings da rodada anterior estão
efetivamente endereçados no texto atual, e os problemas remanescentes que
encontrei são de baixa severidade (NIT: completude de checklist e uma
ambiguidade trivial de origem de import). **APPROVED.**

---

## Findings

### 1. [NIT] O checklist de imports (1.2.1) só cobre imports de tipo; os imports de valor que `mapa.ts` precisa (`gerarResumo`, `dividirEmChunks`, `extrairBlocoJson`) não estão enumerados

**Onde:** Seção 1.2.1 (tabela "Imports de tipo a adicionar") e seção 2.4.

**Problema:** A seção 1.2.1 é explicitamente só de `import type`. Mas `mapa.ts`
depende de três **imports de valor** que o design menciona em prosa sem listar:
`gerarResumo` (de `./resumo.js`, usado em 2.4), `dividirEmChunks` (de
`./resumo.js`, usado no gate `dividirEmChunks(texto, tamanhoChunk).length <= 1`)
e `extrairBlocoJson` (de `./parse.js`, usado em 2.2). Todos existem e são
exportados (verificado), então não é um risco de inviabilidade — mas um checklist
que se vende como "exato" deveria nomeá-los para o coder não descobrir o gate de
chunking depende de um símbolo não citado na lista.

**Fix concreto:** Acrescentar uma linha na seção 2 (ou uma mini-tabela de imports
de valor) nomeando:
```ts
// em src/main/services/mapa.ts
import { dividirEmChunks, gerarResumo, type GerarTexto } from "./resumo.js";
import { extrairBlocoJson } from "./parse.js";
```

### 2. [NIT] A origem do tipo `GerarTexto` é ambígua — ele é exportado tanto por `resumo.ts` quanto por `parse.ts`

**Onde:** Seção 2 (serviço `mapa.ts`), `GerarMapaMentalParams.gerar?: GerarTexto`.

**Problema:** O design usa `GerarTexto` mas não diz de onde importá-lo. O código
atual **duplica** essa definição: `export type GerarTexto` aparece idêntica em
`src/main/services/resumo.ts` e em `src/main/services/parse.ts`. Qualquer uma
compila, mas deixar em aberto espalha a microdecisão para o coder e pode gerar
inconsistência com telas futuras.

**Fix concreto:** Fixar a origem numa frase. Como `mapa.ts` já importará
`gerarResumo`/`dividirEmChunks` de `./resumo.js`, importar `GerarTexto` do mesmo
módulo (`import { ..., type GerarTexto } from "./resumo.js";`) evita um segundo
import só para o tipo.

---

## Reavaliação dos 7 findings da rodada anterior (todos endereçados)

- **#1 [era HIGH] `tamanhoChunk` + caminho de texto grande** — RESOLVIDO. A seção
  2.4 agora fixa uma regra única: o mesmo `tamanhoChunk` rege o gate do mapa E é
  repassado explicitamente a `gerarResumo({ texto, modo: "longo", gerar,
  tamanhoChunk })`; e declara que o texto-base do mapa é o resumo como está
  (passo único, sem re-chunk), herdando o limite "reduce de passo único" já
  documentado em `resumo.ts` (verificado no cabeçalho de `resumo.ts`). A
  sequência determinística de prompts (N map + 1 reduce + 1 mapa) está escrita e
  casa com `gerarResumo` real (map chama `gerar` por chunk, reduce 1x).
- **#2 [era MEDIUM] retorno não-nulo vs guard `?? null`** — RESOLVIDO. A seção
  3.1 adiciona um "Contrato de nulidade" explícito: `Promise<NoMapaMental>`,
  nunca `| null`; o serviço só lança em falha. A seção 4.3 marca o `?? null`/
  `!= null` como defesa simétrica com `Resumo.tsx` (verificado: `Resumo.tsx` faz
  `setResumo(resultado ?? null)` e `if (resultado != null ...)` exatamente
  assim), que nunca dispara, e instrui a não trocar o tipo para `| null`.
- **#3 [era MEDIUM] imports de tipo não enumerados** — RESOLVIDO para os tipos. A
  tabela 1.2.1 nomeia `MapaMental`/`NoMapaMental` por arquivo e nota
  `verbatimModuleSyntax`/`noUnusedLocals` (ambos confirmados ligados em
  `tsconfig.web.json` e `tsconfig.node.json`) e que `DocumentoSalvo` já está
  importado em `ipc.ts`/`storage.ts`/`ipc/index.ts` (verificado). A lacuna
  remanescente é só dos imports de *valor* — rebaixada ao Finding 1 (NIT).
- **#4 [era MEDIUM] critério de `temMapaMental`** — RESOLVIDO. Agora é
  `documento.mapaMental !== undefined`, idêntico a `temResumo` (verificado:
  `storage.ts` usa `documento.resumo !== undefined`), com justificativa de que a
  invariante "mapa salvo ⇒ raiz válida" vive na camada de geração.
- **#5 [era NIT] localização de `layout.ts`** — RESOLVIDO. Cravado
  `src/shared/mapaLayout.ts` (função pura, sem DOM). Verifiquei que
  `tsconfig.web.json` inclui `src/shared/**` e `tests/**` e que o alias `@shared`
  existe em `vitest.config.ts`, então `tests/shared/mapaLayout.test.ts`
  importando `@shared/mapaLayout` type-checa e roda sem configuração nova.
- **#6 [era NIT] truncamento no meio da palavra** — RESOLVIDO. A seção 2.3 define
  truncamento com recuo à última fronteira de palavra, fallback `MAX-1` para
  palavra única, e `…`, com comprimento final ≤ `MAPA_ROTULO_MAX`. A seção 4.4
  foi alinhada: o `<title>` repete o rótulo saneado (não promete mais um original
  não persistido).
- **#7 [era NIT] normalização de raiz não-objeto / topo-array** — RESOLVIDO. O
  passo 3 de 2.2 agora enumera os casos (`{raiz: "texto"}`, `{raiz: null}`,
  `{raiz: 42}`, topo array/string/number/null) → inválido → `null` → re-tentativa.

---

## Avaliação dos critérios obrigatórios do escopo da revisão

- **Modelo de dados da árvore totalmente especificado?** SIM. `NoMapaMental { id,
  rotulo, filhos[] }` + `MapaMental { documentoId, raiz, geradoEm }`, árvore
  aninhada, ids atribuídos no main por travessia em pré-ordem. Campo opcional
  `mapaMental` em `DocumentoSalvo` e `temMapaMental` em `ResumoDocumentoSalvo`,
  aditivo, sem migração — consistente com os artefatos irmãos reais.
- **Contrato de geração/parsing/validação sem ambiguidade?** SIM.
  Ciclo/profundidade/tamanho/leque/rótulo-vazio e o caminho de re-tentativa
  corretiva única estão todos especificados em 2.2–2.4, espelhando o fluxo real
  de `gerarFlashcards`/`parseFlashcards` (1ª tentativa → prompt corretivo → erro
  tipado), que verifiquei em `parse.ts`.
- **IPC + resolução de modelo via `modeloParaGeracao()` fixados?** SIM. Canais
  `mapamental:gerar` e `documento:salvar-mapa-mental`; handler resolve o modelo
  via `modeloParaGeracao()` e injeta `gerar: (prompt) => generate({ prompt,
  model })` — padrão idêntico aos handlers reais de resumo/flashcards/exercícios
  em `ipc/index.ts` (verificado, incluindo que `modeloParaGeracao` existe e é a
  defesa contra "model not found").
- **Persistência análoga aos artefatos existentes?** SIM.
  `storage.salvarMapaMental` espelha `salvarResumo` 1:1 (verificado:
  `carregarDocumento` + `salvarDocumento({ ...documento, mapaMental })`); escrita
  atômica `.tmp`+`rename` e spread condicional já cobrem o campo novo.
- **Visualização DECIDIDA (lib-vs-SVG resolvido, dependência pinada/justificada)?**
  SIM. Decisão explícita: render SVG próprio, **nenhuma dependência nova**
  (`package.json`/lock inalterados — verifiquei que o `package.json` atual só tem
  `pdfjs-dist` em dependencies, então "zero deps novas" é concreto e checável).
  Layout horizontal determinístico em `src/shared/mapaLayout.ts`, cores por nível
  via tokens existentes de `styles.css` (verifiquei que `--cor-primaria`,
  `--cor-superficie`/`-2`, `--cor-borda-forte`, `--cor-texto-suave`, `--raio-sm`/
  `-md` existem). O roadmap deixava "lib OU SVG" em aberto e exigia pinar+
  justificar se adicionasse dep; o design fecha isso escolhendo SVG e não
  adicionando nada — dentro do escopo.
- **Integração na casca e Histórico?** SIM, e consistentes com o código real:
  nova aba em `ABAS`, inclusão em `ehAbaGeracao`/`abaDesabilitada` (ambas existem
  em `App.tsx`), `key={`mapa-${chaveDocumento}`}`, `onGerado` via
  `persistirArtefato` (padrão real), e etiqueta no `etiquetas` de `Historico.tsx`
  (função verificada). A reabertura é coberta pelo caminho existente
  (`carregarDocumento` → `aoReabrir` → prop `mapaMentalSalvo`).

---

## Suposições verificadas (lidas no código, não aceitas no texto)

- `src/main/services/parse.ts`: `extrairBlocoJson` é exportada e tolerante
  (cercas/texto ao redor; JSON truncado → `null`). O fluxo de re-tentativa única
  (`gerarFlashcards`/`gerarExercicios`) é exatamente o descrito. **Confere.**
- `src/main/services/resumo.ts`: `gerarResumo` aceita `tamanhoChunk?`
  (default `tamanhoMaximoChunkCaracteres`), faz map→reduce de passo único, e o
  limite conhecido está documentado no cabeçalho. `dividirEmChunks` e
  `GerarTexto` são exportados. **Confere.**
- `src/main/services/storage.ts`: `salvarResumo` = `carregarDocumento` +
  `salvarDocumento({ ...documento, resumo })`; `temResumo: documento.resumo !==
  undefined`; escrita atômica `.tmp`+`rename`; sem lógica de migração para campos
  aditivos. **Confere** com o que o design propõe copiar.
- `src/main/ipc/index.ts`: `modeloParaGeracao()` existe e reconcilia modelo;
  handlers de geração usam `generate({ prompt, model })`; há
  `mensagemAmigavel*` por artefato caindo em frase genérica no `else`.
  `DocumentoSalvo` já importado. **Confere.**
- `src/shared/ipc.ts`: `IPC_CHANNELS` e `AppApi` com listas explícitas de import
  de `./types`; `DocumentoSalvo` já presente; `MapaMental`/`NoMapaMental`
  ausentes (precisam entrar, como a 1.2.1 diz). **Confere.**
- `src/shared/types.ts`: `DocumentoSalvo`/`ResumoDocumentoSalvo` têm os artefatos
  opcionais no padrão descrito; `ModoResumo` inclui `"longo"` (usado em 2.4).
  `QUANTIDADE_*` moram em `types.ts` (não em `constants.ts`). **Confere.**
- `src/shared/constants.ts`: `tamanhoMaximoChunkCaracteres = 12000` existe; é o
  default herdado por `GerarMapaMentalParams.tamanhoChunk`. **Confere.**
- `src/shared/prompts.ts`: builders `montarPrompt*` e `montarPromptCorrigir*`
  existem no estilo que `montarPromptMapaMental`/`...Corrigir...` devem seguir.
  **Confere.**
- `src/main/preload.ts`: objeto `api: AppApi` com métodos `invoke`-only; os dois
  novos entram no mesmo molde. **Confere.**
- `src/renderer/api.ts`: `getApi()` lança `ERRO_API_INDISPONIVEL` se a ponte
  faltar; nenhuma mudança necessária em `api.ts`. **Confere.**
- `src/renderer/views/Resumo.tsx`: usa `resultado ?? null` e `resultado != null`
  — a "defesa simétrica" que o design cita é literal. **Confere.**
- `src/renderer/App.tsx`: `ABAS`, tipo `Aba`, `ehAbaGeracao`, `abaDesabilitada`,
  `persistirArtefato`, `chaveDocumento`, `onGerado` existem como o design assume.
  **Confere.**
- `src/renderer/views/Historico.tsx`: `etiquetas(resumo)` monta a lista de
  artefatos — a adição de "Mapa mental" encaixa. **Confere.**
- `tsconfig.web.json` inclui `src/renderer/**`, `src/shared/**` e `tests/**`, com
  `verbatimModuleSyntax`/`noUnusedLocals` ligados; `tsconfig.node.json` cobre
  `src/main/**` e `src/shared/**`. `vitest.config.ts` alia `@shared`. O build é
  `tsc --noEmit && electron-vite build`; teste é `vitest run`. Testes em
  `tests/main/*` já importam módulos de `src/main` e type-checam sob o projeto
  web via `moduleResolution: Bundler` (confirmado por `ipc-flashcards.test.ts`).
  Logo, pôr o layout em `src/shared` e o teste em `tests/shared` é viável sem
  config nova. **Confere.**
- Baseline: `package.json` tem exatamente uma dependência de runtime
  (`pdfjs-dist`); "nenhuma dependência nova" é concreto. **Confere.**

## Suposições não verificadas / incorretas

- Nenhuma suposição do design foi encontrada **incorreta**.
- **Não verificado (não bloqueante):** a contagem exata "170 testes" não foi
  reexecutada (`npm test` não rodado nesta revisão); é um alvo de baseline, não
  uma afirmação sobre o código a ser revisada aqui.
- **Não verificado:** a afirmação da seção 3.1 de que a divisão de
  responsabilidade de validação está "documentada em `Exercicios.tsx` (clamp de
  quantidade)" — não li `Exercicios.tsx` nesta revisão. É uma referência de apoio
  à prosa, não um contrato do qual a implementação do mapa dependa (a invariante
  de texto vazio vive em `mapa.ts`), então não afeta o veredito.
