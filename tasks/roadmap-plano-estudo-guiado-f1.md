# Roadmap — Plano de estudo guiado, Fatia 1/4

> **Captura da data do arquivo + ordenação cronológica (base → novo).**
> Sub-fatia 1 de 4 (fundação) da fatia-mãe **Plano de estudo guiado**.
> 100% mecânica/lógica pura, **SEM IA**. Worktree:
> `c:\Dev\.worktrees\plano-f1-cronologia` (branch `feat/plano-f1-cronologia`).
> Fonte de intent: `docs/intent/plano-estudo-guiado.md`. Design completo (com
> revisão endereçada): `.agents/tasks/design.md`.
>
> **Referência estável da fatia:** fatia `d4df16b` (commit de implementação) +
> este commit de docs. **Testes depois da fatia: 614** (47 arquivos), antes 579.
> Build/lint verdes. Zero dependência nova.

---

## 1. Objetivo

O plano de estudo guiado precisa ordenar os conteúdos do mais antigo (base) ao
mais recente (novo) de forma **mecânica e previsível**, sem pedir nada à IA
(decisão vinculante do intent: "a IA não ordena nem infere a estrutura"). Esta
fatia entrega a **fundação dessa ordenação**: capturar uma data por documento na
importação e uma função pura testável que ordena documentos por essa data, já
pronta para receber, no futuro, uma sobreposição manual do usuário.

A ordenação é **interna** nesta fatia — não há UI nova obrigatória, nada
perceptível ao usuário ainda. O valor entregue é o **contrato de dados + a
lógica pura testada** que as fatias 2–4 consomem.

---

## 2. Decisões confirmadas

### 2.1 Campo novo de data (aditivo, retrocompatível)

- Campo **opcional** `dataArquivo?: string` (ISO 8601) adicionado a quatro tipos
  em `src/shared/types.ts`: `Documento`, `DocumentoSalvo`, `ArquivoImportado` e
  `ResumoDocumentoSalvo` (este último para o Histórico poder exibir/ordenar sem
  carregar o documento inteiro).
- Nome escolhido por descrever a semântica ("a data do arquivo em si", distinta
  de `importadoEm`, que é quando o usuário importou) e seguir o padrão existente
  (`importadoEm`, `atualizadoEm`, `caminhoOrigem`).
- **Descartados:** `dataConteudo` (ambíguo, sugere data extraída do texto);
  `mtime`/`modifiedAt` (vaza a fonte — nem sempre é o mtime); guardar a
  proveniência junto (`{ data, origem }`) — YAGNI nesta fatia, adicionável
  depois se as fatias 2–4 precisarem distinguir "data confiável vs. fallback".
- **Retrocompatibilidade:** campo opcional, gravado via **spread condicional**
  (nunca grava `dataArquivo: undefined`), como `caminhoOrigem` já faz.
  `carregarDocumento` faz `JSON.parse` direto — a ausência da chave vira
  `undefined` naturalmente, sem mudança no parsing. Documentos antigos carregam
  normalmente e aparecem como "data indefinida" (vão ao final na ordenação).
  **Sem backfill retroativo** de mtime para documentos já importados (o
  `caminhoOrigem` salvo pode não existir mais; o mtime atual pode já ter mudado,
  o que traria uma data pior que ausente).

### 2.2 Fonte da data (hierarquia)

Decidida no intent e no design, aplicada no processo **main** (nunca no
renderer):

1. **Data interna do PDF** — `getMetadata().info.CreationDate`, com fallback
   para `ModDate`, via o `pdfjs-dist@6.4.299` que o projeto **já usa** (sem dep
   nova; `getMetadata()` confirmado nos type defs instalados). Extraída na mesma
   abertura do documento que já extrai o texto (uma única função `extrairPdf`
   que devolve `{ texto, dataInterna? }`, para não parsear o PDF duas vezes).
   Acesso sob TS estrito por cast: `(info ?? {}) as Record<string, unknown>`.
2. **`mtime` do disco** (`fs.stat().mtime`) — fallback universal, reaproveitando
   o `stat` que `importarArquivo` **já** faz para a guarda de tamanho (sem
   syscall extra). Convertido com `.toISOString()`.
3. **Indefinida** — se nada for obtível (o campo fica ausente).

Para `.txt`/`.md` **não** se tenta metadado interno (não há Info dictionary
confiável; e procurar data no corpo do texto seria a inferência frágil que o
intent manda evitar) — vai direto ao mtime.

- **Parsing tolerante** da data do PDF: função pura `parsearDataPdf(bruto)` em
  `src/shared/pdfDate.ts`. Formato PDF (`D:YYYYMMDDHHmmSSOHH'mm'`, partes
  opcionais) → instante ISO 8601 UTC, ou `undefined`. Nunca lança.
  - Exige ao menos ano+mês+dia; hora/min/seg/fuso opcionais.
  - Sem fuso → interpretado como **UTC** (determinístico; trade-off assumido: a
    spec PDF diria "local indeterminado" — pode deslocar o instante em até ±14h,
    mas só afeta a ordenação relativa, e a sobreposição manual corrige).
  - Caso degenerado `Z` + dígitos de offset → offset ignorado (0) quando o sinal
    é `Z`; aplicado quando é `+`/`-`.
  - Validação por **round-trip** (mês 13, dia 32 etc. → `undefined`).
- **Invariante:** toda `dataArquivo` persistida é ISO 8601 canônica em **UTC**
  (`...Z`), porque `toISOString()` sempre emite UTC — tanto do parse do PDF
  quanto do `mtime`. Isso faz a comparação lexicográfica da ordenação ser
  cronologicamente correta.

### 2.3 Propagação pelo IPC (main é o dono da verdade)

- No fluxo de **arquivo único**, a data é originada no main (`importarArquivo`),
  transportada pelo renderer e **apenas repassada** ao handler `criarDocumento`
  (novo parâmetro opcional `dataArquivo?` em `ipc.ts` / `preload.ts` / `AppApi`).
  O renderer não calcula nada.
- O handler trata o valor como **dica opcional**: valida com a guarda pura
  `ehIsoPlausivel(s)`; se inválida/ausente, grava **sem** data (não re-deriva,
  não lança).
- No fluxo de **pasta** (`importarPasta`/`pasta.ts`) não há gap: a data é
  capturada e repassada a `criarDocumento` na mesma operação do main (spread
  condicional, como `caminhoOrigem`).
- `ehIsoPlausivel` é **estrito**: só `true` se `s` for exatamente a forma
  canônica que `toISOString()` emite (round-trip). Strings que o `Date` só
  "consegue parsear" (ex.: `"2020"`, `"01/15/2023"`) são rejeitadas.

### 2.4 Contrato da função pura de ordenação

Em `src/shared/cronologia.ts` (segue o padrão de `agenda.ts`: importa só tipos;
sem Node/Electron/IA; funções totais; não lê o relógio):

```ts
export interface ItemCronologico {
  id: string;
  dataArquivo?: string; // ISO 8601, ou ausente
}

export interface OrdenarCronologicamenteParams<T extends ItemCronologico> {
  itens: T[];
  /** id → posição desejada (menor = mais à base). Omitido/vazio = 100% por data. */
  ordemManual?: ReadonlyMap<string, number>;
}

export function ordenarCronologicamente<T extends ItemCronologico>(
  params: OrdenarCronologicamenteParams<T>,
): T[];
```

Regras (determinísticas):

1. **Grupo manual é a chave primária** — `grupoManual(x) = ordemManual.has(x.id)
   ? 0 : 1`. Todos os itens com índice manual formam um **bloco à frente**
   (semântica de **prefixo**): dentro do grupo 0, ordena pelo **valor** de
   `ordemManual` (menor primeiro), desempate por data e depois `id`; dentro do
   grupo 1, aplicam-se as regras 2–4. Quando `ordemManual` é omitido/vazio, a
   ordenação é 100% por data (regra padrão automática).
2. **Ambos com data:** mais antiga primeiro (comparação lexicográfica de ISO
   8601, válida porque tudo é UTC); desempate por `id.localeCompare`.
3. **Um com data, outro sem:** o **com data vem antes** (sem data vai ao final).
4. **Ambos sem data:** desempate estável por `id.localeCompare`.

- **Pureza garantida:** ordena uma cópia (`itens.slice()`), não muta a entrada,
  não lê `Date.now()`. O desempate final por `id` torna a ordem totalmente
  determinística, independentemente da estabilidade do `sort` da engine.
- **Por que a ordem manual entra por parâmetro, não por campo no documento:**
  mantém a função agnóstica de onde a ordem manual é persistida (decisão da
  fatia 2) e permite ordens manuais **por contexto** (ex.: por prova). **Nesta
  fatia nada persiste nem edita a ordem manual** — só o contrato está pronto.

### 2.5 Fora de escopo desta fatia

- UI de edição manual da ordem cronológica (contrato pronto; tela vem na fatia 2).
- Questionário, distribuição por dias, quiz diagnóstico, checkpoints (fatias 2–4).
- Backfill de mtime para documentos já importados.
- Validação de data contra "hoje" / rejeição de datas futuras (regra de negócio
  da fatia 2); nesta fatia a data é só um instante para ordenar documentos entre
  si.

---

## 3. Arquivos (resumo)

**Criados:** `src/shared/pdfDate.ts`, `src/shared/cronologia.ts`,
`tests/shared/pdfDate.test.ts`, `tests/shared/cronologia.test.ts`, fixture
`com-data.pdf` (PDF com `CreationDate`).

**Modificados:** `src/shared/types.ts`, `src/main/services/files.ts`
(`extrairPdf`, mtime do `stat` existente, hierarquia de data),
`src/main/services/storage.ts` (`NovoDocumento.dataArquivo?`, gravação
condicional, bloco condicional no literal de `listarDocumentos`),
`src/main/services/pasta.ts`, `src/main/ipc/index.ts` (handler valida com
`ehIsoPlausivel`), `src/shared/ipc.ts`, `src/main/preload.ts`,
`src/renderer/api.ts`, e os testes de `files`/`pasta`/`storage`.

---

## 4. Verificação

- **Verificado de fato:** `npm run build`, `npm run lint`, `npm test` verdes no
  worktree — **614 testes** (47 arquivos), antes 579. Núcleo em duas funções
  puras totalmente testadas (`parsearDataPdf`, `ordenarCronologicamente`),
  captura best-effort que nunca derruba a importação, campo opcional com leitura
  tolerante, desempate determinístico por `id`. A fixture `com-data.pdf` teve o
  `CreationDate` confirmado legível via `getMetadata`.
- **Verificação manual do usuário (não coberto por teste):** a extração de data
  de um PDF **real** end-to-end — os testes usam a fixture `com-data.pdf`, não
  PDFs reais variados do usuário.

---

## 5. Plano de decomposição validado (fatias 2–4)

> Validação do recorte das próximas três sub-fatias **contra o código real**
> (quiz.ts, parse.ts/gerarExercicios, provas.ts, agenda.ts, geracaoLotes.ts).
> Consolidado da seção §13 do design. Confirma que o recorte é coerente,
> sequenciável e reaproveita a infra existente.

### 5.1 Veredito geral

A ordem sequencial **1 → 2 → 3 → 4 é coerente** e cada fatia reaproveita infra
existente. As fatias 2–4 encaixam na Agenda/Provas já prontas (`provas.ts`,
`agenda.ts`) e nas gerações já prontas (`quiz.ts`, `gerarExercicios`). A única
dependência cruzada forte é "3 precisa do rótulo base/novo que 1+2 produzem", já
respeitada pela ordem.

**Fronteira vinculante (todas 2–4):** a distribuição NÃO pode depender do
modelo; só a geração de texto/perguntas/exercícios usa Ollama. Toda a aritmética
de datas e a montagem de agenda já são puras (`agenda.ts`); as gerações já
isolam o modelo atrás de um `gerar` injetável.

### 5.2 Fatia 2/4 — Questionário + distribuição por dias (pura)

- Consome `src/shared/cronologia.ts` **desta fatia** (ordem base→novo).
- Encaixa na `Prova` existente (`provas.ts`: já tem `data`, `vinculo`,
  `intervalos`, `sessoes: SessaoRevisao[]` via `gerarAgenda` puro). A
  distribuição por dias é a evolução natural: uma nova função pura (ex.:
  `src/shared/plano.ts`) que, dados os tópicos ordenados, o tempo até a prova, as
  dificuldades declaradas e o diagnóstico, produz a alocação por dia.
  Reaproveita `diaParaNumero`/`diferencaDias`/`numeroParaDia` de `agenda.ts`.
- **Novo/risco:** a régua contínua "tempo até a prova → mistura base/novo" é uma
  fórmula determinística nova (pura e testável, baixo risco, mas é trabalho
  novo, não reuso).
- **Lar da persistência do plano:** recomendado estender `Prova` com um bloco
  opcional `plano?`/`questionario?` (aditivo, retrocompat, mesmo padrão desta
  fatia), para não criar um segundo domínio de persistência.
- **Lar da persistência + UI da ordem cronológica manual:** o contrato puro da
  fatia 1 (`ordemManual` por parâmetro) está pronto, mas nada o persiste/edita
  ainda. Entra aqui: a ordem manual é um dado 1:1 com a prova (array de ids ou
  mapa `id → posição`, serializável no bloco `plano?`), reconstruído como
  `ReadonlyMap` para alimentar a função pura. A UI de reordenar pode ser
  sub-item da fatia 2 ou escorregar para uma fatia dedicada se o volume crescer.
- **Recorte interno recomendado:** dois commits/módulos distintos — (a)
  persistência do questionário primeiro; (b) a fórmula de distribuição depois
  (peça mais arriscada, com seus próprios testes puros isolados) — sem quebrar
  em duas fatias.

### 5.3 Fatia 3/4 — Quiz diagnóstico (reusa infra de quiz)

- Consome `gerarQuiz`/`parseQuiz` (`quiz.ts`) e a correção `avaliarLote`
  (`avaliacao.ts`), já com o padrão tolerante (`format:"json"`, re-tentativa,
  dedup em lotes). **Reuso real, confirmado.**
- **Parte nova e pura** (alinhada ao "a IA não ordena"): classificar o resultado
  em **"lacuna na base" vs. "dificuldade no novo"** a partir dos acertos por
  tópico/camada — função pura (recebe as respostas + o rótulo base/novo de cada
  pergunta, devolve o diagnóstico). O modelo só gera e corrige as perguntas.
- **Dependência dura:** precisa saber, por pergunta, se é conteúdo **base** ou
  **novo** — rótulo que nasce da ordenação da fatia 1 + do insumo "qual prova /
  o que é novo" da fatia 2. Por isso 3 depende de 1 e 2.
- **Risco:** `gerarQuiz` hoje produz um `Quiz` por documento. Um diagnóstico
  cobre vários tópicos/documentos → orquestração nova por cima do `gerarQuiz`
  existente (reuso da geração; a seleção de "o que perguntar" é nova).

### 5.4 Fatia 4/4 — Checkpoints "pré-provas" (reusa infra de exercícios)

- Consome `gerarExercicios` (`parse.ts`: `{ texto, modo, quantidade, gerar,
  aoProgresso } → Exercicio[]`), já com lotes/dedup/progresso. **Reuso real.**
- Encaixa na Agenda: um checkpoint é um ponto na agenda apontando **quais
  conteúdos** a lista cobre. Gancho natural: a `SessaoRevisao` existente —
  marcar uma sessão como "checkpoint" é um campo aditivo opcional. A preferência
  **automático vs. lembrete** (alterável depois) é config do plano/prova
  (aditivo).
- **Risco honesto (já no intent):** no modo automático, gerar a lista "no dia"
  usa o modelo local, lento e possivelmente parcial — `geracaoLotes.ts` já tem
  `avisoGeracaoParcial` para comunicar isso (a fatia 4 reaproveita). O **gatilho
  temporal** ("faltam X dias → agir") é a novidade: lógica pura sobre as datas
  (reusa `diferencaDias`/`diasRestantes` de `agenda.ts`).

### 5.5 Riscos transversais

- **Persistência do plano:** três fatias querem gravar dados ligados à prova
  (questionário, diagnóstico, checkpoints). A fatia 2 deve fixar **um** lugar
  (recomendado: campos opcionais aditivos em `Prova`, via `provas.ts`, com o
  saneamento/validação já praticado lá). Decidir cedo evita retrabalho em 3 e 4.
- **`documentoId` nas gerações:** `gerarQuiz`/`gerarExercicios` assumem "um
  documento de origem"; o plano opera em tópicos/cadernos (vários documentos). As
  fatias 3–4 precisam de uma camada fina que escolhe o texto-base por tópico e
  chama a geração existente — reuso da geração, orquestração nova por cima.
