# Design — Plano de estudo guiado, FATIA 4 de 4: checkpoints "pré-provas"

> Base: master `bc81789` (781 testes). Fonte de verdade do produto:
> `docs/intent/plano-estudo-guiado.md` §"Checkpoints". Padrões seguidos:
> `tasks/design-f3.md` (persistência aditiva, saneamento, IPC com progresso, UI
> na Agenda) e `tasks/roadmap-plano-estudo-guiado-f3.md` §"Ajustes para a
> Fatia 4". Este documento NÃO implementa nada.

## 0. Visão geral

A Agenda ganha um card **"Checkpoints"** (depois do card do diagnóstico, antes
da Dica do dia). Ele mostra até 4 pontos ao longo do plano, cada um com a data,
o estado e os assuntos que a lista cobre. Em cada ponto o aluno obtém uma
**lista pequena de exercícios** (8, modo misto) gerada pelo Ollama local a
partir do material dos assuntos cobertos. Pode responder, usar o "Corrigir com
IA" que já existe e marcar a lista como concluída.

Tudo que decide *quando*, *onde*, *quais assuntos* e *em que estado* é **lógica
pura** em `src/shared/checkpoints.ts`, com o relógio injetado. A IA só gera os
exercícios (via `gerarExercicios`, reuso integral) e, se o aluno pedir,
corrige. O comportamento "automático" é, honestamente: **ao abrir uma prova na
Agenda, o app prepara no máximo UMA lista, e só se o checkpoint mais recente
que já venceu (data ≤ hoje) ainda não tem lista**, com um aviso de "preparando…" sem contagem (o caminho curto de
`gerarExercicios` só reporta progresso uma vez, no fim). Nada roda em segundo
plano.

**Stack travada (aprovada = fechada):** Electron + React + TypeScript, Vite
(`electron-vite`), IPC tipado via `contextBridge`, persistência em JSON atômico
(`Prova.checkpoints?`), Vitest com Ollama mockado. **Nenhuma dependência nova.**

### 0.1 Descoberta que muda o desenho (premissa do brief corrigida)

O brief diz "tópicos já estudados até aquele dia, segundo `PlanoCalculado.dias`".
Lendo `planoCalculo.ts`/`plano.ts`: `montarPlanoCalculado(prova, hoje)` monta
`datasDisponiveis` **de amanhã até a véspera** e **redistribui TODOS os tópicos
a cada cálculo** (o plano não guarda progresso). Consequências:

1. No dia de um checkpoint, o `PlanoCalculado` de hoje **não contém** os dias
   passados; "o que foi estudado até hoje" seria sempre vazio.
2. O plano de amanhã é uma nova projeção (as datas dos blocos andam todo dia),
   então "último dia de estudo do tópico" calculado sobre o plano de hoje é
   **instável**.

**Decisão:** os checkpoints são calculados sobre um **plano de referência**:
`montarPlanoCalculado(prova, dataBase)`, onde `dataBase` é a **data local em
que o questionário foi salvo** (`plano.atualizadoEm` convertido para data
local), limitada a `hoje` (`min(dataBase, hoje)`). Esse plano é **estável no
dia a dia** (não anda com o relógio), mas **não é imutável**: muda se o aluno
re-salvar o questionário, **concluir o diagnóstico depois da `dataBase`**
(`montarPlanoCalculado` aplica `diagnosticoAplicavel`, o que muda a mistura e o
último bloco de cada assunto) ou **editar a data da prova** (`editarProva` não
recarimba `plano.atualizadoEm`). Nesses dois últimos casos a assinatura NÃO
muda, então as datas/janelas dos pontos podem se deslocar sem invalidar o
bloco. Mitigação: para listas já geradas (`pronto`/`feito`) a UI mostra os
`topicos`/`ignorados` **persistidos** (a verdade do que a lista cobre), nunca o
planejado; o planejado só vale para `futuro`/`devido`/`atrasado`/`indisponivel`
(§7, §11). Ele traz o calendário completo da base até a véspera. "Já estudado até o dia D" =
"o plano de referência já terminou de agendar blocos desse tópico até D",
**assumindo que o aluno seguiu o plano** (o app não mede o que foi de fato
estudado; ver §11).

Por isso a preferência NÃO pode ser alterada reusando `salvarPlano` (§8): isso
recarimbaria `plano.atualizadoEm` e deslocaria a `dataBase`.

## 1. Decisões de produto (todas fechadas)

| # | Questão | Decisão | Por quê |
|---|---|---|---|
| D1 | Onde caem os checkpoints | Pontos fixos **a 28, 14, 7 e 3 dias da prova** (`CHECKPOINT_DIAS_ANTES`), mantidos só se a data cair **estritamente depois** de `dataBase` e se a janela tiver ≥ 1 tópico. Id estável `d<diasAntes>` (`d28`, `d14`, `d7`, `d3`). | Alinhado aos intervalos 7/3 da Agenda; o "faltam X dias" do intent vira texto direto; ids estáveis chaveiam a lista persistida; cadência cresce sozinha com a distância da prova (≤ 4) sem configuração. |
| D2 | Quais tópicos cada ponto cobre | Janela `(dataAnterior, data]`: tópico entra no ponto cuja janela contém a **data do seu ÚLTIMO bloco** no plano de referência. Cada tópico cai em no máximo um ponto. | Definição pura, sem ambiguidade; cobre o que já "terminou de ser estudado", sem repetir. |
| D3 | Texto-base e tamanho | Até **6 assuntos** por ponto (amostra espaçada), texto em seções `## Título` com orçamento igual por seção, total ≤ **12000** caracteres (`tamanhoMaximoChunkCaracteres`). **8 exercícios, modo `mista`**, caminho curto (8 ≤ limiar 20 → 1 chamada + 1 corretiva). | Quantidade pequena e fixa: 1–2 chamadas (≤ 10 min no pior caso com timeout de 300 s), sem lotes/dedup, sem a lentidão/parcial de listas grandes. **Confirmada** a recomendação do brief. |
| D4 | Modo automático | Ao **abrir a prova na Agenda** (e ao trocar para automático com a prova aberta): o **candidato** é o item de **maior `data ≤ hoje` entre os não `indisponivel`, tenha ou não lista**. Se o estado dele é `devido`/`atrasado` ⇒ gera essa lista (e só ela). Se é `pronto`/`feito` ⇒ **não gera nada**, mesmo que existam itens mais antigos `atrasado`. Os mais antigos **permanecem só manuais** (botão "Gerar lista") em qualquer abertura posterior. Sem retry automático na mesma sessão. | App desktop não roda em segundo plano; encadear as listas vencidas gastaria o modelo local à toa (até 4 gerações) e deixaria o aluno esperando. Uma lista, a mais relevante hoje, é previsível; o histórico fica à escolha do aluno. |
| D5 | Cancelar / timeout total | **Não há.** Uma lista = no máximo 2 chamadas, cada uma com o timeout de 300 s já existente. A geração em andamento termina e persiste mesmo se o aluno sair da tela. | Sem sequência longa, o botão cancelar não se paga (o Ollama não é abortável pelo renderer hoje). Registrado como NÃO coberto. |
| D6 | Preferência depois | Canal IPC **pequeno e dedicado** `definirPreferenciaCheckpoint(id, pref)`; **não** reusa `salvarPlano`. Efeito: lembrete→automático dispara a verificação imediatamente se a prova estiver aberta. | Preserva `plano.atualizadoEm` (âncora da `dataBase`); sem reenviar o plano inteiro. |
| D7 | Responder/corrigir | **Entra.** Extrai `ListaExercicios` de `Exercicios.tsx` (enunciado, resposta digitada, "Ver resposta", "Corrigir com IA" via `avaliarRespostas`). Respostas e correções são **efêmeras** (como em Exercicios). Persistido: a lista e `concluidoEm` ("Marcar como concluída"). | Reuso sem reescrever; coerente com o que o aluno já conhece. Nota/desempenho do checkpoint NÃO é guardado nem alimenta o plano (§11). |
| D8 | Lista regenerável | `pronto` pode ser regerado (substitui a lista); `feito` não. | Listas parciais ruins são recuperáveis sem novo canal; concluída é terminal. |

## 2. Tipos novos

### 2.1 `src/shared/types.ts` (aditivo)

```ts
/** Tópico coberto por um checkpoint (id do doc ou `manual:`; título do momento). */
export interface TopicoCheckpoint { id: string; titulo: string }

/** Por que um assunto da janela ficou fora da lista. */
export type MotivoCheckpointIgnorado = "manual" | "sem_texto" | "fora_da_amostra";

export interface TopicoCheckpointIgnorado extends TopicoCheckpoint {
  motivo: MotivoCheckpointIgnorado;
}

/** Uma lista de exercícios gerada para um checkpoint. */
export interface CheckpointGerado {
  /** "d<diasAntes>" (ex.: "d14"); regex /^d[1-9]\d{0,2}$/. */
  id: string;
  /** ISO 8601 da geração. */
  geradoEm: string;
  /** Assuntos EFETIVAMENTE usados no texto-base (>= 1). */
  topicos: TopicoCheckpoint[];
  /** Assuntos da janela que ficaram de fora, com motivo. */
  ignorados: TopicoCheckpointIgnorado[];
  /** Quantidade pedida (CHECKPOINT_QUANTIDADE no momento da geração). */
  pedido: number;
  /** >= CHECKPOINT_MINIMO_EXERCICIOS; modo sempre o gerado. */
  exercicios: Exercicio[];
  /** ISO 8601; presente = o aluno marcou como concluída. */
  concluidoEm?: string;
}

/** Bloco opcional e aditivo, IRMÃO de `plano` e `diagnostico` em `Prova`. */
export interface CheckpointsPlano {
  /** `assinaturaPlano(plano)` no momento da geração (reuso da fatia 3). */
  assinatura: string;
  /** Uma entrada por id, ordenadas por `diasAntes` decrescente (d28, d14, d7, d3). */
  itens: CheckpointGerado[];
}
// em Prova:  checkpoints?: CheckpointsPlano;
```

`PlanoEstudo` **não muda** (continua com `checkpoint: PreferenciaCheckpoint`).

### 2.2 `src/shared/checkpoints.ts` (tipos de lógica/visão)

```ts
export type EstadoCheckpoint =
  | "futuro" | "devido" | "atrasado" | "pronto" | "feito" | "indisponivel";

export type EstadoBlocoCheckpoints = "nenhum" | "atual" | "desatualizado";

export type MotivoSemCheckpoints =
  | "prova_encerrada"   // prova hoje ou já passou
  | "sem_topicos"       // plano de referência sem tópicos
  | "sem_dias"          // plano de referência sem dias de estudo
  | "curto_demais";     // há plano, mas nenhum ponto cai depois da dataBase com tópicos

export interface TopicoJanela { id: string; titulo: string; manual: boolean }

export interface CheckpointPlanejado {
  id: string;          // "d14"
  diasAntes: number;   // 14
  data: string;        // "YYYY-MM-DD" = dataProva - diasAntes
  topicos: TopicoJanela[]; // >= 1, ordem cronológica do último bloco
}

export interface PlanejamentoCheckpoints {
  checkpoints: CheckpointPlanejado[];
  motivoVazio?: MotivoSemCheckpoints; // presente SOMENTE se checkpoints = []
}

export interface CheckpointVisao extends CheckpointPlanejado {
  estado: EstadoCheckpoint;
}

/** O que o IPC `calcularCheckpoints` devolve ao renderer. */
export interface VisaoCheckpoints {
  hoje: string;
  diasRestantes: number;                // até a prova (negativo = passou)
  preferencia: PreferenciaCheckpoint;   // já efetiva (ausente => "lembrete")
  bloco: EstadoBlocoCheckpoints;
  itens: CheckpointVisao[];
  motivoVazio?: MotivoSemCheckpoints;
  /** id do checkpoint sendo gerado AGORA no main (guard em memória), se houver. */
  emGeracao?: string;
}
```

Constantes novas em `src/shared/constants.ts`:

```ts
export const CHECKPOINT_DIAS_ANTES = [28, 14, 7, 3] as const;
export const CHECKPOINT_QUANTIDADE = 8;                       // fixa, não configurável
export const CHECKPOINT_MODO = "mista" as const;
export const CHECKPOINT_TOPICOS_MAX = 6;
export const CHECKPOINT_TEXTO_MAX = tamanhoMaximoChunkCaracteres; // 12000
export const CHECKPOINT_MINIMO_EXERCICIOS = 3;
```

`ArtefatoLote` (`geracaoLotes.ts`) ganha `"checkpoint"` (aditivo, igual ao
`"diagnostico"`); o renderer filtra por igualdade.

## 3. Lógica pura — `src/shared/checkpoints.ts`

Regras do módulo (padrão de `agenda.ts`/`diagnostico.ts`): sem Node/Electron/
disco/IA; **nunca** lê o relógio (`hoje`/`dataBase` entram por parâmetro);
importa só `./constants`, `./agenda` (`diaParaNumero`, `numeroParaDia`,
`diferencaDias`), `./diagnostico` (`assinaturaPlano`, `ehTopicoManual`,
`selecionarTopicosDiagnostico`, `juntarTitulos`) e **tipos**. Datas inválidas
fazem `diaParaNumero` lançar `Error` (igual a `agenda.ts`): o main só passa
datas já validadas (`Prova.data` é saneada; `dataBase` vem de
`dataLocalDeIso`, §5.2).

### 3.1 `planejarCheckpoints`

```ts
export function planejarCheckpoints(p: {
  planoReferencia: PlanoCalculado; // = montarPlanoCalculado(prova, dataBase)
  dataProva: string;
  dataBase: string;                // data local do salvamento do questionário
  hoje: string;
}): PlanejamentoCheckpoints
```

**Invariantes**
- I1: total e determinística; não muta a entrada; mesma entrada ⇒ mesma saída.
- I2: ordem de `checkpoints` por `data` crescente (= `diasAntes` decrescente).
- I3: cada `topicoId` aparece em no máximo UM checkpoint.
- I4: `checkpoints[i].topicos.length >= 1`.
- I5: `data > dataBase` (estritamente) e `data < dataProva` para todo item.
- I6: `motivoVazio` presente ⇔ `checkpoints.length === 0`.
- I7: se `diferencaDias(dataProva, hoje) <= 0` ⇒ `[]` com `prova_encerrada` (prova hoje ou passada nunca tem checkpoints, independentemente do plano).

**Procedimento (contrato, não prosa):** (a) encerrada → vazio; (b) `aviso.tipo`
∈ {`sem_topicos`} → `sem_topicos`; ∈ {`sem_dias`,`prova_passou`} → `sem_dias`;
(c) para cada `d ∈ CHECKPOINT_DIAS_ANTES` calcula `data = dataProva − d`, descarta se
`diferencaDias(data, dataBase) < 1`; (d) para cada tópico, `ultimo` = `(data, ordem)` do último
bloco em `dias` (`ordem` = contador crescente na varredura `dias`→`blocos`);
(e) tópico entra no primeiro ponto (em ordem de data) tal que
`dataAnterior < ultimo.data <= data` (`dataAnterior` = `data` do ponto válido anterior, ou
`-∞`); (f) pontos com janela vazia são omitidos; (g) nenhum ponto restou ⇒
`curto_demais`. Dentro do ponto, tópicos ordenados por `(ultimo.data, ultimo.ordem)`.

**Fixture `P`** (usada nas tabelas): `dataProva=2026-06-20`, `dataBase=hoje=2026-06-01`,
`dias` de `06-02` a `06-19`; último bloco de A=`06-04`, B=`06-07`, C=`06-10`, D=`06-13`,
E=`06-15`, F=`06-18`.

| # | Entrada (variação sobre `P`) | Saída esperada |
|---|---|---|
| 1 | `P` | `d14:[A]` (data 06-06), `d7:[B,C,D]` (06-13), `d3:[E]` (06-17); F fica fora (último bloco depois do último ponto); `d28` descartado (05-23 ≤ base) |
| 2 | `hoje = 2026-06-20` (prova hoje) | `[]`, `prova_encerrada` |
| 3 | `hoje = 2026-06-25` (passou) | `[]`, `prova_encerrada` |
| 4 | `aviso: sem_topicos`, `dias: []` | `[]`, `sem_topicos` |
| 5 | `aviso: sem_dias` | `[]`, `sem_dias` |
| 6 | `aviso: prova_passou` (plano de referência vazio) | `[]`, `sem_dias` |
| 7 | `dataBase = 2026-03-01` (prova longe), blocos espalhados | até 4 pontos `d28,d14,d7,d3`, janelas `(−∞,05-23] (05-23,06-06] (06-06,06-13] (06-13,06-17]` |
| 8 | `dataBase = 2026-06-10` | `d14` descartado (06-06 ≤ base); `d7` janela `(−∞,06-13]` |
| 9 | `dataBase = 2026-06-06` (== data de `d14`) | `d14` descartado (precisa ser estritamente depois) |
| 10 | todos os últimos blocos depois de 06-13 | `d14` e `d7` omitidos (janela vazia), só `d3` |
| 11 | todos os últimos blocos ≤ 06-06 | só `d14:[todos]` |
| 12 | todos os blocos depois de 06-17 | `[]`, `curto_demais` |
| 13 | tópico X com blocos em 06-03, 06-05 e 06-12 | entra em `d7` (último bloco = 06-12), nunca em `d14` |
| 14 | A e B com último bloco no mesmo dia, A antes de B nos `blocos` | ordem `[A,B]` (desempate pela ordem de aparição) |
| 15 | tópico `manual:x-0` com último bloco em 06-04 | entra em `d14` com `manual: true` |
| 16 | `aviso: nao_cabe`, tópico G sem nenhum bloco | G não aparece em nenhum ponto (nunca "estudado") |
| 17 | `dataProva = 2026-06-02`, `dataBase = 2026-06-01` | `dias` vazio no plano ⇒ `sem_dias` |
| 18 | entrada chamada duas vezes | saídas iguais; entrada deep-equal ao original |
| 19 | `dataBase` com formato inválido | lança `Error` (contrato herdado de `agenda.ts`; coberto no main por `dataLocalDeIso`) |

### 3.2 `resolverEstadosCheckpoints`

```ts
export function resolverEstadosCheckpoints(p: {
  planejados: CheckpointPlanejado[];
  bloco: CheckpointsPlano | undefined;
  plano: { ordinal: OrdinalProva; topicos: TopicoPlano[] } | undefined;
  hoje: string;
}): { bloco: EstadoBlocoCheckpoints; itens: CheckpointVisao[] }
```

**Invariantes:** `itens` tem a mesma ordem e os mesmos ids de `planejados`;
`bloco` = `nenhum` se `bloco === undefined` ou `plano === undefined`;
`desatualizado` se `bloco.assinatura !== assinaturaPlano(plano)`; senão `atual`.
Listas só contam quando `bloco === "atual"` (desatualizado ⇒ estados calculados
como se não houvesse lista).

**Estado de um ponto** (primeira regra que casar):

| Ordem | Condição | Estado |
|---|---|---|
| 1 | bloco `atual` e há item com o mesmo `id` com `concluidoEm` | `feito` |
| 2 | bloco `atual` e há item com o mesmo `id` | `pronto` |
| 3 | nenhum tópico do ponto tem `manual === false` | `indisponivel` |
| 4 | `diferencaDias(data, hoje) > 0` | `futuro` |
| 5 | `diferencaDias(data, hoje) === 0` | `devido` |
| 6 | `diferencaDias(data, hoje) < 0` | `atrasado` |

| # | Caso | Saída |
|---|---|---|
| 1 | `d14` em 06-06, hoje 06-05, sem bloco | `futuro` |
| 2 | hoje 06-06 | `devido` |
| 3 | hoje 06-09 | `atrasado` |
| 4 | hoje 06-09, bloco atual com item `d14` | `pronto` |
| 5 | idem com `concluidoEm` | `feito` |
| 6 | item só com tópicos manuais, hoje 06-06 | `indisponivel` (vale também para `futuro`/`atrasado`) |
| 7 | bloco com assinatura diferente | `bloco: "desatualizado"`; `d14` volta a `devido`/`atrasado` por data (lista ignorada) |
| 8 | `plano` indefinido | `bloco: "nenhum"`, estados só por data |
| 9 | bloco com item de id que não está em `planejados` | ignorado (órfão oculto; §11) |
| 10 | ponto misto (1 manual + 1 com doc) | estado por data (não `indisponivel`) |
| 11 | `hoje` anterior à `dataBase` (relógio recuado) | `futuro` para tudo (só a data decide) |

**Tabela de transições** (quem dispara cada uma):

| De | Evento | Para | Persiste? |
|---|---|---|---|
| `futuro` | `hoje` chega à `data` | `devido` | não (derivado) |
| `devido` | passa 1 dia sem lista | `atrasado` | não |
| `devido`/`atrasado` | gerar ok (≥ 3 exercícios) | `pronto` | sim (`itens`) |
| `devido`/`atrasado` | falha (offline/geração/poucos exercícios) | inalterado | não; erro mostrado |
| `pronto` | gerar de novo | `pronto` (lista substituída) | sim |
| `pronto` | "Marcar como concluída" | `feito` | sim (`concluidoEm`) |
| `feito` | qualquer | `feito` (terminal; regerar rejeitado) | — |
| qualquer | plano muda (assinatura) | bloco `desatualizado` | não apaga nada; só a próxima geração manual substitui o bloco |
| qualquer | prova hoje/passada | card some (`prova_encerrada`) | não |
| `futuro`/`indisponivel` | pedido de geração | rejeitado | — |

### 3.3 `escolherCheckpointAutomatico`

```ts
export function escolherCheckpointAutomatico(p: {
  itens: CheckpointVisao[];
  preferencia: PreferenciaCheckpoint;
  bloco: EstadoBlocoCheckpoints;
  emGeracao: string | undefined;
  tentados: ReadonlySet<string>;   // ids já tentados nesta sessão
}): string | undefined
```

Contrato: o **candidato** é o item de **maior `data` com `diferencaDias(data,
hoje) <= 0`** (isto é, `data ≤ hoje`) entre os itens com estado ≠ `indisponivel`
(`indisponivel` não é elegível e não bloqueia), **independente de ter lista**.
Devolve o `id` do candidato **somente se** o estado dele é `devido` ou
`atrasado`; **nunca cai para um item mais antigo**. Devolve `undefined` se:
não há candidato; o candidato é `pronto`/`feito`; `preferencia !== "automatico"`;
`bloco === "desatualizado"` (nunca sobrescreve lista antiga sem pedido);
`emGeracao !== undefined`; ou o `id` do candidato está em `tentados` (evita laço
após falha). Consequência: com `d7 pronto` + `d14 atrasado` o app não gera
nada; o `d14` só por clique. Esse contrato é idempotente: depois que a lista
do candidato é gravada e a visão recarregada, a função devolve `undefined`.

`tentados` aqui contém **somente ids de checkpoint da prova atual** (`"d14"`).
A conversão a partir do Set global do renderer está em §7.

| # | Entrada | Saída |
|---|---|---|
| 1 | auto, `d14` devido | `"d14"` |
| 2 | auto, `d14` atrasado + `d7` atrasado | `"d7"` (o mais recente) |
| 3 | auto, `d14` atrasado + `d7` devido | `"d7"` |
| 4 | auto, `d7` atrasado em `tentados` (falhou), `d14` atrasado | `undefined` (não cai para o `d14`) |
| 10 | auto, `d7` `pronto`, `d14` `atrasado` | `undefined` (candidato é `d7`, que já tem lista) |
| 11 | auto, `d3` `indisponivel`, `d7` `pronto`, `d14` `atrasado` | `undefined` (indisponível ignorado; candidato `d7` pronto) |
| 12 | auto, `d7` `feito`, `d14` `atrasado` | `undefined` |
| 13 | auto, `d3` `futuro`, `d7` `atrasado` | `"d7"` (`futuro` tem `data > hoje`, não é candidato) |
| 14 | auto, `d14` `atrasado` apenas, `tentados = {"d7"}` (id de outro ponto) | `"d14"` (só o id do candidato conta) |
| 15 | auto, só `d14` `pronto` e `d7` `devido` | `"d7"` (candidato é o de maior data, `d7`) |
| 16 | auto, todos `futuro` | `undefined` |
| 5 | `lembrete` | `undefined` |
| 6 | auto, bloco `desatualizado` | `undefined` |
| 7 | auto, `emGeracao = "d14"` | `undefined` |
| 8 | auto, só `futuro`/`pronto`/`feito`/`indisponivel` | `undefined` |
| 9 | auto, `d3` `indisponivel` (data mais recente) e `d7` atrasado | `"d7"` (indisponível não é elegível, não bloqueia) |

### 3.4 Texto-base: `planejarTextoCheckpoint` e `montarTextoBaseCheckpoint`

```ts
export function planejarTextoCheckpoint(
  topicos: TopicoJanela[],           // do ponto, na ordem cronológica
  comTexto: ReadonlySet<string>,     // ids cujo texto foi lido e é não vazio
): {
  selecionados: TopicoJanela[];      // <= CHECKPOINT_TOPICOS_MAX, ordem preservada
  ignorados: TopicoCheckpointIgnorado[];
  indisponivel: boolean;             // selecionados.length === 0
}

export function montarTextoBaseCheckpoint(
  secoes: Array<{ titulo: string; texto: string }>,
  max: number,                       // CHECKPOINT_TEXTO_MAX
): string
```

`planejar`: manual → `manual`; sem texto → `sem_texto`; elegíveis são amostrados
com `selecionarTopicosDiagnostico(elegiveis, CHECKPOINT_TOPICOS_MAX)` (inclui
primeiro e último; determinístico); os elegíveis não escolhidos → `fora_da_amostra`.
`ignorados` na ordem original dos tópicos.

`montar`: seção `## ${titulo.trim()}\n${trecho}`; orçamento por seção
`floor((max − 2·(n−1)) / n)`; `trecho = texto.trim().slice(0, max(0, orcamento −
len(cabeçalho)))`; seção com trecho vazio é omitida; seções unidas por `"\n\n"`;
resultado final com `.slice(0, max)` por segurança. **Invariante: `length ≤ max`**;
`[]` ⇒ `""`.

| # | Entrada | Saída |
|---|---|---|
| 1 | 3 tópicos com doc, ≤ 6 | `selecionados` = os 3, `ignorados = []` |
| 2 | 1 manual + 2 com doc | manual em `ignorados` (`manual`), 2 selecionados |
| 3 | 1 sem texto + 1 com doc | `sem_texto` + 1 selecionado |
| 4 | só manuais / nada com texto | `selecionados = []`, `indisponivel: true` |
| 5 | 9 elegíveis | 6 selecionados (índices `round(i·8/5)`), 3 `fora_da_amostra`, ordem original |
| 6 | 7 elegíveis + 1 manual | `ignorados` contém o manual e os `fora_da_amostra`, na ordem original |
| 7 | `montar`: 2 seções curtas | `"## A\ntxtA\n\n## B\ntxtB"` |
| 8 | `montar`: 6 seções de 50 000 caracteres | `length ≤ 12000`; cada seção ≤ 1998 caracteres (orçamento `floor((12000 − 10)/6)`, cabeçalho incluso) |
| 9 | `montar`: seção com texto só de espaços | omitida |
| 10 | `montar([], 12000)` | `""` |
| 11 | `montar`: título de 200 caracteres, `max` apertado | `length ≤ max` |

### 3.5 Funções de texto (pt-BR), todas puras e exportadas

| Função | Contrato |
|---|---|
| `preferenciaEfetiva(plano)` | `plano?.checkpoint === "automatico" ? "automatico" : "lembrete"` (ausente/inválido ⇒ lembrete) |
| `estadoBlocoCheckpoints(plano, bloco)` | `nenhum`/`atual`/`desatualizado` (usada por `resolver…`) |
| `fraseLembreteCheckpoint(item, diasRestantes)` | `"Faltam 7 dias para a prova. Que tal uma lista de exercícios sobre A e B?"`; `1` ⇒ `"Falta 1 dia…"`; só títulos não manuais; se não houver, `""` |
| `rotuloEstadoCheckpoint(estado)` | `futuro`⇒"Em breve", `devido`⇒"Hoje", `atrasado`⇒"Atrasado", `pronto`⇒"Lista pronta", `feito`⇒"Concluído", `indisponivel`⇒"Sem material" |
| `fraseCheckpointParcial(entregue, pedido)` | `null` se `entregue >= pedido`; senão `"Montei 5 de 8 exercícios. A lista vale, mas é menor que o previsto. Você pode gerar outra."` (**frase própria**: a quantidade não é do aluno, então NÃO usa `avisoGeracaoParcial`) |
| `fraseCheckpointIgnorados(ig)` | `null` se vazio; `"Ficaram de fora, por não terem material importado: X."` (manual/sem_texto) e `"Ficaram de fora desta lista (limite de assuntos): Y."` (fora_da_amostra) |
| `rotuloPreparandoCheckpoint()` | constante estável `"Preparando a lista de exercícios… isso pode levar alguns minutos."` (sem contagem: `gerarExercicios` no caminho curto chama `aoProgresso` uma única vez, no fim) |
| `fraseSemCheckpoints(motivo)` | `curto_demais`⇒"O plano é curto demais para ter checkpoints."; `sem_topicos`/`sem_dias`/`prova_encerrada`⇒`null` (o card some; os avisos do plano já falam) |

Exporta-se `juntarTitulos` de `diagnostico.ts` (hoje privada; mudança de
visibilidade, sem alterar comportamento).

## 4. Persistência — `Prova.checkpoints?`

**Forma:** §2.1. Irmão de `plano`/`diagnostico`; **nunca aninhado em
`PlanoEstudo`** (um `salvarPlano` o apagaria — `salvarPlano` faz `...prova`, que
preserva o irmão). `editarProva`, `salvarSessoes`, `regerarAgenda` já fazem
`...prova` (confirmado em `provas.ts`): o bloco sobrevive.

**Leitura tolerante** — `sanearCheckpointsPersistido(bruto: unknown):
CheckpointsPlano | undefined` em `provas.ts`, chamada em `carregarProva` pelo
mesmo ramo condicional do diagnóstico (`"checkpoints" in prova`; inválido ⇒
`delete prova.checkpoints`; prova antiga sem a chave volta byte a byte
idêntica). Regras:

| Campo | Regra | Falha |
|---|---|---|
| bloco | objeto não-array | `undefined` |
| `assinatura` | string não vazia | `undefined` |
| `itens` | array; cada item objeto | item inválido descartado |
| `id` | `/^d[1-9]\d{0,2}$/`, único (mantém o 1º) | item descartado |
| `geradoEm` | string não vazia | item descartado |
| `exercicios` | array; cada um `{enunciado,resposta}` strings não vazias (trim) e `modo ∈ teorica|pratica|mista`; inválidos descartados | `< CHECKPOINT_MINIMO_EXERCICIOS` válidos ⇒ item descartado |
| `topicos` | array de `{id,titulo}` strings, `id` não vazio, dedup por id, `titulo` cortado em 200 | vazio ⇒ item descartado |
| `ignorados` | `{id,titulo,motivo}` com motivo no conjunto; inválidos descartados | vira `[]` |
| `pedido` | inteiro ≥ 1 | `exercicios.length` |
| `concluidoEm` | string não vazia | omitido (chave ausente por spread condicional) |
| `itens` final | ordenado por número de `id` decrescente; no máx. `CHECKPOINT_DIAS_ANTES.length` | vazio ⇒ bloco `undefined` |

Nunca lança. Chaves opcionais por spread condicional (nunca `undefined`
gravado).

**Escrita** (todas via `escreverProva`, atômica `.tmp`+rename; todas recarregam
a prova antes de gravar):

- `salvarCheckpoint(id, assinaturaDaGeracao, item, baseDir?)`: exige `plano`
  e `assinaturaDaGeracao === assinaturaPlano(prova.plano)`, senão
  `DadosProvaInvalidosError("Os assuntos do plano mudaram enquanto eu preparava a lista. Tente de novo.")`.
  Se o bloco atual tem a mesma assinatura: substitui/insere o item pelo `id`;
  se tem outra assinatura (ou não existe): **cria bloco novo só com o item**.
  Carimba `atualizadoEm = item.geradoEm`.
- `concluirCheckpoint(id, checkpointId, agora, baseDir?)`: exige bloco com a
  assinatura atual e o item; define `concluidoEm = agora` (idempotente: já
  concluído ⇒ mantém o carimbo original e não regrava) e **carimba
  `Prova.atualizadoEm = agora` na 1ª conclusão** (é o que faz o card recarregar a
  visão, §7). Senão `DadosProvaInvalidosError("Não encontrei essa lista para marcar como concluída.")`.
- `definirPreferenciaCheckpoint(id, preferenciaBruta, agora, baseDir?)`: exige
  `plano`; `preferenciaBruta ∈ {"automatico","lembrete"}` senão
  `DadosProvaInvalidosError("Escolha automático ou lembrete.")`; grava
  `plano: { ...plano, checkpoint }` **sem tocar `plano.atualizadoEm`**;
  `Prova.atualizadoEm = agora`.

**Validação por camada (quem é dono de cada invariante):**

| Invariante | Dono | Por quê |
|---|---|---|
| Datas dos pontos, janelas, estados | `shared/checkpoints.ts` (puro) | testável sem I/O |
| "Só gera `devido`/`atrasado`/`pronto`" e "id existe" | serviço main (`checkpoints.ts`), recomputando com `hojeLocal()` | o renderer pode estar desatualizado (virou a meia-noite) |
| Forma do que é gravado/lido | `provas.ts` (saneamento) | único ponto de disco |
| Plano não mudou durante a geração | `salvarCheckpoint` (assinatura) | a corrida acontece entre gerar e gravar |
| Nenhum conteúdo sai da máquina | arquitetura (só Ollama local) | — |

## 5. Orquestração no main — `src/main/services/checkpoints.ts`

### 5.1 `montarVisaoCheckpoints(prova, hoje, emGeracao?)` (síncrona, sem IA)

1. `plano === undefined` ⇒ `{ hoje, diasRestantes, preferencia: "lembrete", bloco: "nenhum", itens: [], motivoVazio: "sem_topicos" }`.
2. `dataBase = min(dataLocalDeIso(plano.atualizadoEm) ?? hoje, hoje)`.
3. `planoReferencia = montarPlanoCalculado(prova, dataBase)` (reuso integral,
   inclusive o ajuste do diagnóstico atual).
4. `planejarCheckpoints` → `resolverEstadosCheckpoints` → monta a
   `VisaoCheckpoints` com `preferenciaEfetiva(plano)` e `emGeracao`.

### 5.2 `dataLocalDeIso(iso: string): string | null`

`new Date(iso)`; inválido ⇒ `null`; senão `AAAA-MM-DD` com
`getFullYear/getMonth/getDate` (data **local**, igual a `hojeLocal`). Teste usa
`new Date(2026, 5, 1, 12).toISOString()` ⇒ `"2026-06-01"` em qualquer fuso.

### 5.3 `gerarListaCheckpoint`

```ts
export async function gerarListaCheckpoint(p: {
  checkpoint: CheckpointPlanejado;
  carregarTexto: (documentoId: string) => Promise<string | null>; // null = ausente/ilegível
  gerar?: GerarTexto;        // mock do Ollama nos testes
  aoProgresso?: AoProgresso; // repassado a gerarExercicios; chamado 1x no fim (caminho curto); a UI NÃO usa para contagem
  agora: string;             // ISO injetado
}): Promise<CheckpointGerado>
```

Fluxo: (1) para cada tópico **não manual** do ponto, `carregarTexto` (qualquer
exceção ⇒ sem texto); texto `trim` vazio ⇒ sem texto; (2)
`planejarTextoCheckpoint`; `indisponivel` ⇒ lança `CheckpointIndisponivelError`
**antes** de chamar a IA; (3) `montarTextoBaseCheckpoint` com o texto de cada
selecionado; **se o resultado `.trim()` for `""` ⇒ lança
`CheckpointIndisponivelError` antes da IA** (assim `SemTextoParaExerciciosError`
nunca é alcançada neste fluxo; por segurança o mapeamento de erros também a
trata como `CheckpointIndisponivelError`, §5.4); (4) `gerarExercicios({ texto, modo: CHECKPOINT_MODO, quantidade:
CHECKPOINT_QUANTIDADE, gerar, aoProgresso })`; (5) `< CHECKPOINT_MINIMO_EXERCICIOS`
exercícios ⇒ `CheckpointInsuficienteError`; (6) devolve `CheckpointGerado`
(`topicos` = selecionados, `ignorados`, `pedido = CHECKPOINT_QUANTIDADE`).

### 5.4 Erros (tabela concreta)

| Condição | Classe / `code` | Recuperável? | Mensagem ao chamador | Log |
|---|---|---|---|---|
| Ollama recusou conexão | `OllamaIndisponivelError` (existente) | sim | a mensagem existente ("Ollama offline…") | sem log (padrão da casa) |
| Geração falhou/timeout após conectar | `GeracaoFalhouError` (existente) | sim | `"A geração da lista de exercícios falhou ou demorou demais. Tente novamente ou use um modelo mais leve."` (**não** repassa a mensagem original "reduza a quantidade") | sem log |
| JSON inválido mesmo após a corretiva | `ExerciciosInvalidosError` (existente) | sim | `"Não consegui montar a lista de exercícios agora. Tente novamente."` | sem log |
| Nenhum assunto com material, ou texto-base vazio (inclui `SemTextoParaExerciciosError` do `parse.ts`, mapeado para esta classe) | `CheckpointIndisponivelError` `CHECKPOINT_INDISPONIVEL` | não até o aluno importar material | `"Esta lista precisa de ao menos um assunto com material importado. Os assuntos digitados à mão não têm texto para eu criar exercícios."` | sem log |
| < 3 exercícios | `CheckpointInsuficienteError` `CHECKPOINT_INSUFICIENTE` | sim | `"Só consegui montar N exercícios, poucos para uma lista. Tente novamente em instantes."` | sem log |
| Estado não permite gerar (`futuro`/`indisponivel`/`feito`) ou id desconhecido | `CheckpointNaoDisponivelError` `CHECKPOINT_NAO_DISPONIVEL` | sim (mudar de estado) | por estado: futuro ⇒ `"Esta lista só fica disponível em DD/MM."`; feito ⇒ `"Esta lista já foi concluída."`; indisponível ⇒ mensagem de `CheckpointIndisponivelError`; id desconhecido ⇒ `"Não encontrei esse checkpoint no plano atual."` | sem log |
| Já gerando para a prova | `CheckpointEmAndamentoError` `CHECKPOINT_EM_ANDAMENTO` | sim | `"Já estou preparando uma lista desta prova."` | sem log |
| Prova inexistente / plano ausente / plano mudou | `ProvaNaoEncontradaError` / `DadosProvaInvalidosError` (existentes) | — | mensagem do próprio erro | sem log |
| Qualquer outro | — | — | `"Não foi possível preparar a lista. Tente novamente."` | sem log |

`mensagemAmigavelCheckpoint(erro: unknown): string` — **pura, total (nunca
lança), exportada**; só `OllamaIndisponivelError` fala em "offline"; classifica
por `instanceof` (mesmo molde de `mensagemAmigavelDiagnostico`). Nada de
`GeracaoFalhouError.message` (a quantidade não é do aluno). Não há logging novo:
o projeto não loga erros esperados de geração (igual à fatia 3); nada é engolido,
tudo chega ao renderer como mensagem.

## 6. IPC (cadeia `ipc.ts` → `preload.ts` → `ipc/index.ts` → `getApi()`)

| Canal (`IPC_CHANNELS`) | Assinatura em `ApiDesenrola` | Efeito |
|---|---|---|
| `calcularCheckpoints: "prova:calcular-checkpoints"` | `calcularCheckpoints(id): Promise<VisaoCheckpoints>` | só leitura: `carregarProva` + `montarVisaoCheckpoints(prova, hojeLocal(), checkpointsEmGeracao.get(id))` |
| `gerarCheckpoint: "prova:gerar-checkpoint"` | `gerarCheckpoint(id, checkpointId): Promise<Prova>` | gera 1 lista e persiste; devolve a prova |
| `concluirCheckpoint: "prova:concluir-checkpoint"` | `concluirCheckpoint(id, checkpointId): Promise<Prova>` | marca concluída |
| `definirPreferenciaCheckpoint: "prova:definir-preferencia-checkpoint"` | `definirPreferenciaCheckpoint(id, pref): Promise<Prova>` | troca lembrete⇄automático |

Validação de entrada em `gerarCheckpoint` / `concluirCheckpoint`:
`checkpointId` deve ser `string` casando `/^d[1-9]\d{0,2}$/` (senão
`CheckpointNaoDisponivelError` "id desconhecido"); `id` de prova segue o padrão
dos demais handlers (inexistente ⇒ `ProvaNaoEncontradaError`).

**Handler `gerarCheckpoint`** (molde de `gerarDiagnostico`):

1. guard `checkpointsEmGeracao: Map<string, string>` (prova → checkpointId):
   se já há entrada ⇒ `CheckpointEmAndamentoError`; senão registra;
2. `prova = carregarProva(id)`; `visao = montarVisaoCheckpoints(prova, hojeLocal())`;
   `item = visao.itens.find(id)`; estado ∈ {`devido`,`atrasado`,`pronto`} senão
   `CheckpointNaoDisponivelError`;
3. `assinatura = assinaturaPlano(prova.plano)` capturada **antes** da IA;
4. `const model = await modeloParaGeracao()` (com `await`, como no molde de
   `ipc/index.ts`); `carregarTexto = async (docId) => { try { return
   carregarDocumento(docId).texto } catch { return null } }` (qualquer erro ⇒
   `null`, igual ao handler do diagnóstico); `gerarListaCheckpoint({... gerar: (prompt, format) => generate({ prompt, model, format }), aoProgresso: empurrarProgresso(event, "checkpoint"), agora })`;
5. `salvarCheckpoint(id, assinatura, item)` → devolve a prova;
6. `catch` ⇒ `throw new Error(mensagemAmigavelCheckpoint(erro))`; `finally` ⇒ remove do Map.

O handler continua e persiste mesmo se o renderer sair da tela (a promessa do
`invoke` simplesmente não é consumida). `ProgressoGeracao` é o mesmo do
diagnóstico, com `artefato: "checkpoint"`.

## 7. Modo automático e lembrete (renderer)

Componente novo `src/renderer/views/Checkpoints.tsx`, montado em `Agenda.tsx`
**depois de `<Diagnostico>` e antes da Região 4 (Dica)**, com as mesmas
condições do diagnóstico (`plano !== undefined`, `!montandoPlano`, prova não
`passada`). `key={prova.id}`. Assinatura (mesmo molde de `Diagnostico`, cuja prop é
`aoAtualizar`): `Checkpoints({ prova, aoAtualizar }: { prova: Prova;
aoAtualizar: (p: Prova) => void })`; `Agenda` passa `aoAtualizar={setProvaSelecionada}`.
Toda ação que devolve `Prova` (`gerarCheckpoint`, `concluirCheckpoint`,
`definirPreferenciaCheckpoint`) chama `aoAtualizar(provaNova)`; como as três
carimbam `Prova.atualizadoEm`, o `useEffect` da carga dispara e a visão é
recarregada. Falha de `gerarCheckpoint` não devolve prova: nesse caso o
componente chama `calcularCheckpoints` explicitamente (para limpar `emGeracao`).

**Carga:** `useEffect` em `[prova.id, prova.atualizadoEm]` chama
`getApi().calcularCheckpoints(prova.id)`; guarda o resultado. Erro ⇒ mensagem
(`role="alert"`) e card sem itens. O card **não recalcula ao virar o dia** (só
ao reabrir a prova; §11).

**Render (sem duplicar prévias):** nenhum `PlanoPrevia`. Estrutura:

- `visao.itens.length === 0`: mostra `fraseSemCheckpoints(motivoVazio)` se não for
  `null`; senão `return null`.
- Seletor "Quando preparar as listas": dois rádios (`Lembrar-me` / `Preparar
  automaticamente`) + dica de uma linha. Troca ⇒ `definirPreferenciaCheckpoint`.
- Lembrete (preferência `lembrete`): para o **item acionável mais recente**
  (`devido`/`atrasado` de maior `data`), um destaque com `fraseLembreteCheckpoint`
  e o botão "Gerar lista". **Nada é gerado sem clique.**
- Lista de itens (≤ 4): data `dd/mm`, "a N dias da prova", `rotuloEstadoCheckpoint`,
  "Cobre: A, B" (manuais marcados "(sem material)"), e a ação do estado:

| Estado | Ação exibida |
|---|---|
| `futuro` | texto "Disponível em dd/mm" (sem botão) |
| `devido` / `atrasado` | botão "Gerar lista" |
| `pronto` | "Abrir lista", "Gerar outra lista" |
| `feito` | "Abrir lista" |
| `indisponivel` | texto da `CheckpointIndisponivelError` (sem botão) |

- **Fonte do "Cobre:"**: para `pronto`/`feito` mostra `topicos` e `ignorados`
  **persistidos** do item gerado (o que a lista realmente cobre, mesmo que o
  plano de referência tenha se deslocado, §0.1); para `futuro`/`devido`/
  `atrasado`/`indisponivel` mostra os `topicos` do planejado.
- Lista aberta: `<ListaExercicios exercicios={…} />` + `fraseCheckpointParcial` +
  `fraseCheckpointIgnorados` (do item persistido) + botão "Marcar como concluída"
  (estado `pronto`).
- `bloco === "desatualizado"`: aviso "O plano mudou depois que preparei estas
  listas; elas não valem mais. Gerar uma lista nova descarta as antigas." e as
  listas antigas **não** são abertas.

**Gatilho automático** (um `useEffect` em `[visao]`): calcula
`escolherCheckpointAutomatico({ itens, preferencia, bloco, emGeracao,
tentados })`. O registro de tentativas é um `Set<string>` **de módulo**
(`tentadosGlobal`, vive até reiniciar o app, chave `${provaId}:${checkpointId}`,
**adicionada antes** do `await` e mantida após sucesso ou falha). **Conversão
obrigatória antes da chamada pura** (helper puro exportado de
`shared/checkpoints.ts`, testado):

```ts
export function tentadosDaProva(
  global: ReadonlySet<string>, provaId: string,
): Set<string>  // filtra chaves que começam com `${provaId}:` e remove o prefixo
```

A **troca explícita de preferência** (qualquer direção) remove de `tentadosGlobal`
todas as chaves da prova (o aluno acabou de consentir de novo), antes de
chamar `definirPreferenciaCheckpoint`; assim lembrete→automático após uma falha
na sessão volta a disparar. Se houver id: mostra `rotuloPreparandoCheckpoint()`
(sem contagem; não assina `aoProgressoGeracao`, que no caminho curto só reporta
no fim) no item,
chama `gerarCheckpoint`; em `finally` recarrega a visão.
Falha ⇒ mensagem no item + botão "Tentar de novo" (clique manual, fora do Set).
Se `visao.emGeracao` vier preenchido (reabriu a prova durante a geração), o card
só mostra "Preparando…" e **não** dispara outra.

**O que isso garante:** a prova aberta no dia → lista pronta na próxima
visualização; vários dias sem abrir → 1 lista (a do checkpoint mais recente, e
nenhuma se esse já tem lista; os mais antigos só por clique); Ollama offline
→ 1 tentativa por sessão, com mensagem; lembrete → zero chamadas ao modelo.

## 8. Alterar a preferência depois

UI no card (rádios). `definirPreferenciaCheckpoint` (§4) atualiza só
`plano.checkpoint`; o card recarrega a visão com a prova devolvida.

| Troca | Efeito |
|---|---|
| lembrete → automático | o renderer limpa as chaves da prova em `tentadosGlobal` (§7) e chama `definirPreferenciaCheckpoint`; com a prova aberta, se o **candidato** (D4: maior `data ≤ hoje`) for `devido`/`atrasado`, o gatilho da §7 dispara após a recarga da visão (a escolha explícita do aluno é o consentimento); se o candidato já está `pronto`/`feito`, nada é gerado |
| automático → lembrete | nenhuma geração nova; geração em andamento termina e persiste (não cancelável) |
| questionário re-salvo | volta a valer o que o questionário disser (`salvarPlano` sobrescreve `checkpoint`), e a `dataBase` é recarimbada para hoje |

Rejeitado: reusar `salvarPlano` (reenvia o plano inteiro, corre contra edições
e recarimba `atualizadoEm`, o que mudaria os pontos).

## 9. Responder e corrigir (extração de componente)

Cria `src/renderer/components/ListaExercicios.tsx` com a parte da lista de
`Exercicios.tsx`: `<ol>` de exercícios, `textarea` "Sua resposta", `details`
"Ver resposta", selo e comentário de correção, botão "Corrigir com IA" (usa
`getApi().avaliarRespostas`, `todasVazias`, `avaliando`, `erroAvaliacao`).
Props: `{ exercicios: Exercicio[] }`. Os estados `respostas`, `avaliacoes`,
`avaliando`, `erroAvaliacao` migram para dentro dele. `Exercicios.tsx` passa a
renderizar `<ListaExercicios exercicios={exercicios} />` dentro de
`exercicios-resultado`, mantendo geração, contador, `ExportarControles` e aviso
parcial; o reset ao regerar é garantido porque `exercicios` vai a `null` durante
`gerar()` (o componente desmonta/remonta). Mesmos nomes de classes CSS: sem mudar
`styles.css`. **Estado inicial** (verificado em `Exercicios.tsx`): `respostas`
e `avaliacoes` iniciam por inicializador de `useState` a partir de
`respostasVaziasEx(exercicios)`/`avaliacoesVazias(exercicios.length)`, alinhados por
índice; o componente extraído mantém isso e **não** sincroniza por efeito. Em
`Checkpoints.tsx` ele é montado com `key={`${item.id}:${item.geradoEm}`}`, de modo
que regerar a lista (novo `geradoEm`) zera respostas/correções. No teste manual
conferir: abrir exercícios já salvos de um documento, responder, corrigir, regerar.

Risco: não há testes de componente no repo (só `resumo-lote.test.ts`). Mitigação:
extração mecânica sem mudar textos; verificação por `npm run build` + `lint` +
checagem manual em `npm run dev` (Exercicios do documento continua gerando,
respondendo e corrigindo). O comportamento do selo/rótulos fica em constantes
movidas junto.

## 10. O que a IA faz e NÃO faz

| A IA faz | A IA NÃO faz |
|---|---|
| Gerar 8 exercícios a partir do texto-base (`gerarExercicios`: `format:"json"`, parser tolerante, corretiva única, `modeloParaGeracao()`) | Decidir **se** há checkpoint, **quando** cai ou **em que estado** está |
| Corrigir as respostas do aluno, se ele clicar "Corrigir com IA" (`avaliarRespostas`) | Escolher **quais assuntos** a lista cobre (janela por data, amostra espaçada) |
| | Reordenar, ajustar ou recalcular o plano a partir do resultado da lista |
| | Gerar qualquer coisa sem o aluno pedir (lembrete) ou sem a prova estar aberta (automático) |

## 11. Casos de borda — cobertos × NÃO cobertos

| Caso | Tratamento | Coberto? |
|---|---|---|
| Prova hoje / passada | sem checkpoints; card some; nada gerado | ✅ |
| Prova muito próxima (plano curto) | pontos descartados por `data ≤ dataBase`; `curto_demais` com frase honesta | ✅ |
| Prova longe (> 28 dias) | até 4 pontos; janela do 1º ponto pode ser grande ⇒ amostra de 6 assuntos, restantes `fora_da_amostra` (dito na UI) | ✅ |
| Plano sem tópicos / sem dias | `sem_topicos` / `sem_dias` ⇒ card some | ✅ |
| Vários checkpoints vencidos (dias sem abrir) | automático gera só o mais recente; os outros ficam `atrasado` com botão | ✅ |
| Tópico digitado à mão | fora da geração, com aviso; ponto só de manuais ⇒ `indisponivel` | ✅ |
| Documento ausente/ilegível/sem texto | `sem_texto` com aviso; nenhum com texto ⇒ `CheckpointIndisponivelError` antes da IA | ✅ |
| Geração parcial (ex.: 5 de 8) | lista válida se ≥ 3, com `fraseCheckpointParcial` | ✅ |
| < 3 exercícios / JSON inválido | erro, nada persistido | ✅ |
| Offline × falha de geração | mensagens distintas; "offline" só para recusa de conexão | ✅ |
| Plano mudou durante a geração | `salvarCheckpoint` rejeita; depois da geração, bloco `desatualizado` | ✅ |
| Duplo clique / reabrir durante a geração | guard em memória + `emGeracao` na visão | ✅ |
| Prova antiga sem o bloco; bloco corrompido | carregam como hoje; bloco descartado | ✅ |
| Preferência ausente | tratada como `lembrete` | ✅ |
| Relógio do sistema recuado | `dataBase = min(dataBase, hoje)`; tudo `futuro` | ✅ |
| Cancelar geração / timeout total | o aluno só espera (≤ 2 chamadas de 300 s) | ❌ NÃO coberto |
| O app não mede o que foi **de fato** estudado | "já estudado" = o que o plano de referência já agendou, assumindo que o aluno seguiu | ❌ NÃO coberto |
| Tópicos cujo último bloco cai depois do último ponto (últimos ~3 dias) | sem lista (são dias de revisão) | ❌ NÃO coberto |
| Tópicos sem bloco por `nao_cabe` | nunca "estudados" ⇒ nunca cobertos | ❌ NÃO coberto |
| Cobertura uniforme dos assuntos na lista | o prompt de `gerarExercicios` recebe um texto; não garante distribuição entre as seções | ❌ NÃO coberto |
| Nota/desempenho da lista não é salvo e não ajusta o plano; respostas somem ao sair da tela | por desenho (como Exercicios) | ❌ NÃO coberto |
| Re-salvar o questionário (mesmos assuntos) desloca a `dataBase` e pode orfanar uma lista cujo ponto deixou de existir (fica no disco, oculta) | aceito | ❌ NÃO coberto |
| Diagnóstico concluído DEPOIS da `dataBase` muda a mistura e desloca pontos/janelas sem mudar a assinatura | listas já geradas continuam mostrando `topicos`/`ignorados` persistidos; pontos ainda sem lista usam o planejado novo | ❌ NÃO coberto (deslocamento aceito) |
| Editar a data da prova (`editarProva` não recarimba `plano.atualizadoEm`) desloca os pontos | idem; ids `d<N>` são relativos à prova, então uma lista pode ficar ligada a uma data nova | ❌ NÃO coberto (deslocamento aceito) |
| Checkpoints mais antigos com lista ausente depois de um mais recente pronto | nunca gerados automaticamente; só por clique | ✅ (por desenho, D4) |
| Virada do dia com o card aberto | só atualiza ao reabrir a prova | ❌ NÃO coberto |
| Gerar em todas as provas ao abrir o app / "iniciar com o computador" | só a prova aberta | ❌ NÃO coberto (fora de escopo) |
| Corrida `salvarPlano` × `salvarCheckpoint` em milissegundos | mitigada pela assinatura | ❌ NÃO coberta formalmente |
| Exportar a lista (Markdown/PDF) | fora desta fatia | ❌ NÃO coberto |
| Latência e qualidade reais do `llama3.1` | não medidas | ❌ NÃO verificado (manual) |

## 12. Testes a adicionar (Vitest; Ollama sempre mockado)

**`tests/shared/checkpoints.test.ts`** (relógio fixo, sem `Date.now()`):
- `planejarCheckpoints`: as 19 linhas da tabela §3.1 (incluindo prova hoje/passada/
  longe/perto, plano sem dias/tópicos, janela vazia, último bloco, manual,
  desempate, imutabilidade, data inválida lança).
- `resolverEstadosCheckpoints`: as 11 linhas da §3.2 + cada linha da tabela de
  transições (futuro→devido→atrasado por avanço de `hoje`; pronto; feito;
  desatualizado; indisponível).
- `escolherCheckpointAutomatico`: as 16 linhas da §3.3 (inclui `pronto`+`atrasado`
  mais antigo ⇒ `undefined` e idempotência após a geração).
- `tentadosDaProva`: filtra só a prova pedida, remove o prefixo, ignora outras
  provas e chaves sem o prefixo; prefixo parecido (`p1` × `p10`) não vaza; Set
  vazio ⇒ vazio.
- `planejarTextoCheckpoint` / `montarTextoBaseCheckpoint`: as 11 linhas da §3.4 +
  propriedade `length ≤ max` para vários tamanhos.
- `preferenciaEfetiva`, `estadoBlocoCheckpoints`, `fraseLembreteCheckpoint`
  (singular/plural, só não manuais, vazio), `rotuloEstadoCheckpoint`,
  `fraseCheckpointParcial` (null/valores), `fraseCheckpointIgnorados`,
  `rotuloPreparandoCheckpoint` (constante), `fraseSemCheckpoints`.

**`tests/main/services/checkpoints.test.ts`**:
- `dataLocalDeIso` (válida, inválida ⇒ `null`, fuso via `new Date(y,m,d,12)`).
- `montarVisaoCheckpoints`: prova sem plano; com plano e `atualizadoEm` antigo
  (usa plano de referência); `dataBase` futura limitada a `hoje`; bloco
  desatualizado; `emGeracao` repassado.
- `gerarListaCheckpoint` com `gerar` mockado: caminho feliz (1 chamada, 8
  exercícios, tópicos/ignorados corretos); **tópico manual ignorado com aviso**;
  sem texto; **todos manuais/sem texto ⇒ `CheckpointIndisponivelError` e `gerar`
  não chamado**; **texto-base vazio após montagem ⇒ `CheckpointIndisponivelError`,
  `gerar` não chamado**; `SemTextoParaExerciciosError` ⇒ mensagem de indisponível
  em `mensagemAmigavelCheckpoint`; **geração parcial** (5 de 8 ⇒ persistível, `pedido = 8`); < 3
  ⇒ `CheckpointInsuficienteError`; JSON ruim 2× ⇒ `ExerciciosInvalidosError`;
  corretiva funciona; `carregarTexto` lançando ⇒ sem texto; texto-base ≤ 12000
  e contém as seções esperadas (inspeciona o prompt recebido por `gerar`);
  `aoProgresso` repassado.
- `mensagemAmigavelCheckpoint`: **offline × falha** (só `OllamaIndisponivelError`
  diz "offline"; `GeracaoFalhouError` não contém "reduza a quantidade" nem
  "offline"), cada classe tipada, desconhecido ⇒ frase genérica, total (não lança
  com `undefined`/string).

**`tests/main/provas-checkpoints.test.ts`** (`tmpdir`):
- round-trip `salvarCheckpoint` → `carregarProva` (igualdade profunda);
  substituir item de mesmo id; inserir outro id; ordenação `d28..d3`.
- **prova antiga sem `checkpoints`** carrega idêntica (sem a chave); prova com
  `plano` e `diagnostico` sem `checkpoints` idem.
- bloco corrompido (string, array, itens inválidos, exercícios inválidos, <3
  válidos, ids duplicados/inválidos, `concluidoEm` inválido) ⇒ saneamento conforme
  tabela §4; arquivo JSON corrompido continua tratado como antes.
- `salvarCheckpoint` com assinatura divergente rejeita; assinatura nova substitui
  bloco antigo; `salvarPlano`/`editarProva`/`salvarSessoes` preservam o bloco.
- `concluirCheckpoint` (ok, **carimba `Prova.atualizadoEm`**, idempotente sem
  regravar nem mudar carimbos, sem item, bloco desatualizado).
- `definirPreferenciaCheckpoint`: troca, **não altera `plano.atualizadoEm`**,
  altera `Prova.atualizadoEm`, valor inválido rejeita, prova sem plano rejeita.
- escrita atômica: nenhum `.tmp` sobra.

**`tests/main/ipc-checkpoints.test.ts`** (molde de `ipc-diagnostico.test.ts`):
canais registrados; `calcularCheckpoints` devolve a visão; `gerarCheckpoint`
(progresso com `artefato: "checkpoint"`, persiste, **guard de duplo clique**,
estado `futuro` rejeitado, id inválido rejeitado, erro vira mensagem amigável,
guard liberado em `finally`); **vários vencidos**: dois `gerarCheckpoint`
sequenciais gravam os dois itens; `concluirCheckpoint`;
`definirPreferenciaCheckpoint`.

**`tests/shared/geracaoLotes.test.ts`**: `ArtefatoLote` aceita `"checkpoint"` (teste de tipo/valor existente estendido).

Renderer: sem testes de componente (não há infraestrutura); `rotuloEstadoCheckpoint` e
as frases são testadas no shared. Estimativa: ~85–110 testes novos (781 → ~870–890).
Contagem final **conferida por `npm test`**, não estimada, nos docs.

## 13. Plano de implementação (ordem)

1. **Tipos e constantes**: `types.ts` (§2.1, `Prova.checkpoints?`), `constants.ts`
   (§2.2), `ArtefatoLote += "checkpoint"`; export de `juntarTitulos` em
   `diagnostico.ts`. `npm run build`.
2. **Lógica pura** `shared/checkpoints.ts` + `tests/shared/checkpoints.test.ts`
   (TDD: tabelas §3 primeiro). Build/lint/test.
3. **Persistência** em `provas.ts` (`sanearCheckpointsPersistido`, ramo em
   `carregarProva`, `salvarCheckpoint`, `concluirCheckpoint`,
   `definirPreferenciaCheckpoint`) + `tests/main/provas-checkpoints.test.ts`.
4. **Serviço main** `services/checkpoints.ts` (`dataLocalDeIso`,
   `montarVisaoCheckpoints`, `gerarListaCheckpoint`, erros,
   `mensagemAmigavelCheckpoint`) + `tests/main/services/checkpoints.test.ts`.
5. **IPC**: `ipc.ts` (4 canais + `ApiDesenrola`), `preload.ts`,
   `ipc/index.ts` (4 handlers + guard `checkpointsEmGeracao`) +
   `tests/main/ipc-checkpoints.test.ts`.
6. **Extrair `ListaExercicios`** de `Exercicios.tsx` (sem mudança visual);
   build + lint + teste manual da tela de Exercícios.
7. **UI** `views/Checkpoints.tsx` + encaixe em `Agenda.tsx` (depois de
   `<Diagnostico>`, antes da Dica); estilos reaproveitando as classes `plano-*`/
   `agenda-*` existentes (só o mínimo novo em `styles.css`).
8. **Verificação**: `npm run build`, `npm run lint`, `npm test` verdes; checagem
   manual em `npm run dev` com Ollama (lembrete: botão; automático: lista aparece
   ao abrir; troca de preferência; lista parcial; Ollama parado) — dizendo o que
   NÃO foi verificado (latência/qualidade do modelo real).
9. **Docs** (regra do repositório): `tasks/PROGRESSO.md`, `tasks/todo.md` (marcar
   a fatia 4 entregue, HEAD e contagem reais via `git log`/`npm test`),
   `README.md` (o que o aluno vê: checkpoints, lembrete × automático, responder e
   corrigir), `tasks/roadmap-plano-estudo-guiado-f4.md` com as decisões D1–D8.
