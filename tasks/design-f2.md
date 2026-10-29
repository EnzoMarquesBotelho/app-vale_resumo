# Requisitos + Design — Plano de estudo guiado, Fatia 2/4

> **Questionário + distribuição por dias (pura) + régua base/novo.**
> Sub-fatia 2 de 4 da fatia-mãe **Plano de estudo guiado**. Worktree:
> `c:\Dev\.worktrees\plano-f2-questionario` (branch `feat/plano-f2-questionario`).
> Fonte de verdade de intent: `docs/intent/plano-estudo-guiado.md`.
> Decisões herdadas (não reabrir): `tasks/roadmap-plano-estudo-guiado-f1.md`
> §5.2.
>
> **Base verificada:** worktree na fatia 1 mergeada. **Zero dependência nova**
> nesta fatia (§10, §13). **Baseline de testes:** a ser fixado rodando
> `npm test` no worktree ao implementar (ver §14 — a regra
> `manter-docs-atualizados` exige a contagem real, não de memória; o número
> anterior citado neste documento foi removido para não propagar um valor não
> conferido).
>
> **Revisões endereçadas:** 1ª rodada (2 HIGH, 7 MEDIUM, 6 NIT) — respostas em
> §17. **2ª rodada** (`tasks/design-review-f2.json` / `.md`: 0 HIGH, 2 MEDIUM,
> 6 NIT) — respostas em **§18**. Este documento é a **3ª versão**.
>
> **NOTA DO ORQUESTRADOR (ler antes de implementar §7.3):** o design-loop foi
> encerrado por decisão do usuário com 2 MEDIUM + 4 NIT abertos na 3ª revisão
> (`tasks/design-review-f2.json`), TODOS isolados no algoritmo de distribuição
> de minutos por dia (§7.3). A arquitetura, a régua base/novo e a persistência
> estão aprovadas e verificadas — NÃO reabrir. Os dois MEDIUM são detalhe de
> algoritmo que DEVE ser resolvido na implementação como função PURA com testes,
> seguindo exatamente os fixes do `design-review-f2.json`:
> - **MEDIUM-1 (predicado de "cabe tudo"):** resíduo de um tópico
>   `< MINUTOS_BLOCO_MIN` (15) ao fim do passo 7 NÃO marca o tópico como "fora"
>   (folga aceita). `nao_cabe` ⇔ (algum tópico removido no passo 4/5) OU (algum
>   resíduo `>= 15` ao fim do passo 7). Caso contrário, "cabe tudo" (sem aviso).
>   Escrever um teste que construa cada lado desse predicado.
> - **MEDIUM-2 (terminação do laço de reconciliação do piso de 15):** após o
>   largest-remainder, remover EXATAMENTE o(s) tópico(s) com `minutosTopico < 15`
>   (não "o de menor prioridade"), recomputar e repetir. Cada volta remove ≥1
>   tópico `<15` e nunca o reintroduz ⇒ termina em ≤ (nº de tópicos da camada)
>   voltas. Escrever um teste de terminação e um de conservação de minutos
>   (nenhum minuto some em silêncio; nenhum dia estoura `capacidadeDia`).
> Os 4 NIT da 3ª revisão (aproximação contínuo→baldes nomeada; dois consumos de
> `nivelParaPeso`; efeito de `dataArquivo` omitida na ordenação; sequência
> salvar→prévia na UI) também devem ser aplicados conforme o JSON.

---

## 1. Resumo

A fatia 1 entregou a fundação de dados: cada documento tem `dataArquivo?` e há
uma função pura `ordenarCronologicamente` (base → novo) que já aceita uma
`ordemManual` por parâmetro. Esta fatia transforma isso num **plano de estudo
dia-a-dia** que o app decide pelo aluno, a partir de um **questionário** curto, e
o persiste junto da `Prova`.

A entrega tem três peças, na ordem recomendada pela fatia 1 (§5.2) — dois
commits, **uma** fatia:

1. **Modelo + persistência** de um bloco opcional e aditivo `plano?` em `Prova`,
   saneado/validado no padrão de `provas.ts`, guardando as respostas do
   questionário e a ordem cronológica manual (serializável, reconstruída como
   `ReadonlyMap` para alimentar `cronologia.ts`). Fixa o lar da persistência para
   as fatias 3 e 4.
2. **UI do questionário**, encaixada na tela de Agenda existente como um fluxo
   "Montar plano de estudo" a partir de uma `Prova` já selecionada.
3. **Lógica pura nova** em `src/shared/plano.ts`: a **régua base/novo** (fórmula
   contínua determinística — a peça mais arriscada, com testes de borda próprios)
   e a **distribuição por dias** (aloca os tópicos ordenados pelos dias
   disponíveis). 100% pura: sem Electron, sem disco, sem IA.

O princípio-guia do usuário manda: **o app decide, não configura o aluno**; o
plano é "honestamente simples que funciona", e é **honesto quando o tempo não
cabe**. Nada nesta fatia usa o Ollama.

### 1.1 Como as peças se conectam (fluxo de dados)

```
Questionário (UI)                       cronologia.ts (fatia 1)
  → respostas saneadas no main            → ordenarCronologicamente(itens, ordemManual)
  → gravadas em Prova.plano  ─────┐          ↓ tópicos em ordem base→novo
                                  │
Prova.data + agenda.ts ──────┐    │       plano.ts (NOVO, puro)
  diasRestantes/datasEntre   │    └──────→  calcularPlano({ topicos, datasDisponiveis,
                             └───────────→    diasRestantes, horasPorDia, ordinal })
                                               ↓ usa internamente calcularMisturaBaseNovo()
                                             PlanoCalculado { dias[], mistura, aviso? }
                                               ↓ (não persistido nesta fatia — recalculado sob demanda)
                                             UI mostra "o que estudar hoje"
```

A agenda dia-a-dia (`PlanoCalculado.dias`) é **derivada** (função das respostas +
datas). Persistimos as **respostas** (entrada estável) e recalculamos a alocação
sob demanda — não guardamos o resultado, que mudaria sozinho quando "hoje"
avança. Isso espelha como `ResumoProva.diasRestantes` já é calculado no handler
com o `hoje` injetado, nunca persistido.

### 1.2 Responsabilidades: handler (main) vs. função pura (shared)

Esta tabela é **vinculante** e resolve a ambiguidade de quem faz o quê (todos os
cálculos abaixo foram conferidos contra as funções reais de `agenda.ts`):

| Responsabilidade | Dono | Como |
|---|---|---|
| Obter `hoje` | handler (`ipc/index.ts`) | `hojeLocal()` (já existe em `provas.ts`, exportado) |
| `diasRestantes` (tempo de calendário, p/ a régua) | handler | `diferencaDias(prova.data, hoje)` (`agenda.ts`) |
| Montar `datasDisponiveis` (dias de estudo) | serviço main (`src/main/services/plano.ts`) | `datasEntre(hoje, prova.data)` + filtro de dias úteis por `diasPorSemana` (§7.2) |
| Ordenar tópicos base→novo | serviço main | `ordenarCronologicamente(itens, ordemManual)` (`cronologia.ts`), `ordemManual` reconstruída em `ReadonlyMap` |
| Converter `NivelDificuldade?` → peso `number` em [0,1] | serviço main (`src/main/services/planoCalculo.ts`) | `nivelParaPeso(n?)` (NIT-2): `facil→0`, `media→0.5`, `dificil→1`, `undefined→0.5`; aplicado ao montar cada `TopicoDistribuivel.dificuldade` e a `dificuldadeBase` |
| Régua base/novo (proporção) | **puro** (`src/shared/plano.ts`) | `calcularMisturaBaseNovo(...)` (§6) |
| Distribuir minutos por dia + "não cabe" | **puro** (`src/shared/plano.ts`) | `calcularPlano(...)` (§7) |

A fronteira: **o main conhece o relógio e o disco e prepara as entradas; o puro
só faz aritmética sobre o que recebe.** `calcularPlano` nunca lê `Date.now()`,
nunca reaplica `diasPorSemana` (recebe `datasDisponiveis` já filtradas).

---

## 2. Requisitos funcionais

- **RF1 — Persistir o questionário.** `Prova` ganha um bloco **opcional** `plano?`
  com as respostas do questionário. Prova antiga (sem o bloco) carrega normalmente
  (leitura tolerante). Gravação por **spread condicional** (nunca grava
  `plano: undefined`), no padrão já usado em `provas.ts` — `...(prova.vinculo.tipo
  === "caderno" ? { cadernoNome: ... } : {})` em `listarProvas` e
  `...(s.concluida === true ? { concluida: true } : {})` em `salvarSessoes`.
- **RF2 — Insumos do questionário** (do intent): ordinal da prova (1ª/2ª/final →
  base vs novo), tempo disponível (horas/dia, dias/semana), assuntos que caem
  (tópicos "novos"), dificuldade autodeclarada por tópico, preferência de
  checkpoint (`automatico`|`lembrete` — **só persistida** nesta fatia; o
  comportamento é a fatia 4). A data da prova **reusa** `Prova.data` (não duplica).
- **RF3 — UI do questionário** encaixada na Agenda: a partir de uma `Prova`
  selecionada, um botão "Montar plano de estudo" abre o formulário; salvar grava
  `Prova.plano` via `getApi()`. pt-BR, acessível, tokens de tema.
- **RF4 — Ordem cronológica manual persistida.** O bloco `plano` guarda a ordem
  manual como **array de ids** (serializável); o main a reconstrói como
  `ReadonlyMap<string, number>` para `ordenarCronologicamente`. A **UI de
  reordenar** fica **fora desta fatia** (ver §9 — recomendação).
- **RF5 — Distribuição por dias (pura).** `calcularPlano(...)` em
  `src/shared/plano.ts`: dados os tópicos ordenados, as datas de estudo
  disponíveis, os dias restantes (via `agenda.ts`), o tempo/dia e o ordinal →
  produz a alocação por dia (o quê, em que ordem, quanto tempo). Determinística,
  total.
- **RF6 — Régua base/novo (pura).** `calcularMisturaBaseNovo(...)` em
  `src/shared/plano.ts`: dados os dias restantes, as contagens de tópicos base vs
  novo e a dificuldade → proporção de tempo/dias para base vs novo. Contínua
  (não liga-desliga), determinística, com casos de borda explícitos (§6.4).
- **RF7 — "Não cabe".** Quando há mais conteúdo que dias/tempo, o plano **prioriza
  o difícil**, **não inventa dias** e **avisa honestamente** (campo `aviso?` no
  resultado). Nunca silencia a insuficiência (§7).
- **RF8 — Ler o plano de volta.** `carregarProva` devolve `Prova.plano` quando
  existe; a UI o usa para pré-preencher o questionário na reedição.

## 3. Requisitos não-funcionais

- **RNF1 — Pureza.** `plano.ts` não importa Node/Electron/IA; só `import type` de
  `./types` e (se preciso) constantes de `./constants`. Recebe `diasRestantes` e
  `datasDisponiveis` por parâmetro; nunca lê o relógio. Padrão idêntico ao de
  `agenda.ts`/`cronologia.ts`.
- **RNF2 — Sem IA.** Nenhuma chamada ao Ollama. Confirmado em §10.
- **RNF3 — Sem dependência nova.** Nada é adicionado a `package.json`.
- **RNF4 — Retrocompatibilidade.** `Prova` sem `plano` continua válida e editável;
  nenhum handler existente muda de assinatura.
- **RNF5 — Acessibilidade.** Formulário com `<label>` associado a cada controle,
  `<fieldset>/<legend>` para grupos, foco visível (tokens existentes),
  mensagens de erro com `role="alert"`, contraste AA via tokens de tema.
- **RNF6 — Determinismo testável.** Régua e distribuição testadas com entradas
  fixas; todo empate resolve por `id.localeCompare` (como `cronologia.ts`).

## 4. Fora de escopo (confirmado)

- Quiz diagnóstico e a reordenação do plano por diagnóstico (**fatia 3**). Nesta
  fatia a régua opera sobre **dificuldade autodeclarada + ordinal**, não sobre quiz.
- Geração/lembrete de checkpoints e o comportamento automático vs lembrete
  (**fatia 4**). Nesta fatia **só a preferência é persistida**.
- Frases de orientação por IA por dia (polimento posterior; o núcleo não depende).
- UI de **reordenar** manualmente a cronologia (§9 — fatia dedicada recomendada).
  O **contrato** (persistir/ler o array de ids) entra; a tela de arrastar não.
- Lista curada ENEM/ENADE; qualquer acesso à internet.

---

## 5. Decisão 1 — Forma exata do bloco de persistência em `Prova`

### 5.1 Tipos (em `src/shared/types.ts`, aditivos)

```ts
/** Qual prova é — define o recorte base vs novo (intent). */
export type OrdinalProva = "primeira" | "segunda" | "final";

/** Preferência de checkpoint (comportamento fica na fatia 4; aqui só persiste). */
export type PreferenciaCheckpoint = "automatico" | "lembrete";

/** Nível de dificuldade autodeclarada de um tópico pelo aluno. */
export type NivelDificuldade = "facil" | "media" | "dificil";

/**
 * Um tópico declarado no questionário. `id` é estável e 1:1 com o documento
 * de origem quando houver (para casar com a ordenação cronológica da fatia 1);
 * quando o tópico é digitado à mão, o id é derivado do título com o prefixo
 * `manual:` (`manual:<slug>-<índice>`), garantindo que os espaços de id "veio
 * de doc" (um `randomUUID`) e "digitado à mão" sejam **disjuntos** (NIT-5).
 */
export interface TopicoPlano {
  /** Id estável do tópico (casa com `ItemCronologico.id` quando vem de doc; `manual:<slug>-<i>` quando digitado à mão). */
  id: string;
  /** Rótulo em português exibido ao aluno (ex.: "Limites"). */
  titulo: string;
  /** `true` se é conteúdo que CAI na prova (o "novo"); `false` = base. */
  novo: boolean;
  /** Dificuldade autodeclarada. Ausente = tratada como "media". */
  dificuldade?: NivelDificuldade;
  /** Data do arquivo de origem (ISO canônica UTC), quando o tópico vem de doc. */
  dataArquivo?: string;
}

/**
 * Respostas do questionário do plano de estudo, persistidas junto da Prova.
 * Bloco OPCIONAL e ADITIVO: prova sem plano continua válida. A `Prova.data`
 * NÃO é duplicada aqui (já existe); a agenda dia-a-dia é DERIVADA destes
 * campos + da data, recalculada sob demanda (não persistida).
 */
export interface PlanoEstudo {
  /** Qual prova é (define base vs novo). */
  ordinal: OrdinalProva;
  /** Horas de estudo disponíveis por dia (inteiro 1–24, saneado). */
  horasPorDia: number;
  /** Dias de estudo disponíveis por semana (inteiro 1–7, saneado). */
  diasPorSemana: number;
  /** Tópicos declarados (base e novo), já na ordem em que foram informados. */
  topicos: TopicoPlano[];
  /**
   * Ordem cronológica manual OPCIONAL: ids de tópicos na ordem desejada
   * (menor índice = mais à base). Serializável; reconstruída como
   * ReadonlyMap no main para alimentar `ordenarCronologicamente`. Ausente/
   * vazio = ordenação 100% automática por data.
   */
  ordemManual?: string[];
  /** Preferência de checkpoint (só persistida nesta fatia; fatia 4 age). */
  checkpoint: PreferenciaCheckpoint;
  /** Carimbo ISO 8601 da última vez que o QUESTIONÁRIO foi salvo (ver §5.5). */
  atualizadoEm: string;
}
```

E, em `Prova`:

```ts
export interface Prova {
  // ...campos existentes...
  /** Plano de estudo guiado (questionário), quando o aluno o montou. */
  plano?: PlanoEstudo;
}
```

### 5.2 Representação da 1ª prova vs 2ª/final

Regra única e mecânica, derivada do intent ("1ª prova → tudo é base"):

- Ao sanear, se `ordinal === "primeira"`, **todo** tópico é forçado a
  `novo: false` (toda base, zero novo), independentemente do que o renderer
  mandou. A UI nem mostra a coluna "cai na prova?" quando o ordinal é
  `primeira` — não há decisão a tomar.
- Se `ordinal === "segunda" | "final"`, o flag `novo` por tópico vale como
  informado. Semântica (intent): o que já caiu vira base (`novo: false`); o
  conteúdo recente é o novo (`novo: true`).

Isso mantém a invariante "o ordinal é a fonte da verdade do recorte"; a régua
(§6) e a distribuição (§7) tratam `base` = tópicos `novo:false`, `novo` =
tópicos `novo:true` sem casos especiais adicionais.

### 5.3 Saneamento (no padrão de `provas.ts`, no main)

Novo helper `sanearPlano(bruto: unknown, ordinalJaValidado?): PlanoEstudo` em
`provas.ts`, chamado pelo handler novo (§8). Regras (silenciosas, nunca lançam
exceto campos essenciais ausentes → `DadosProvaInvalidosError` com frase pronta,
convertida por `mensagemAmigavelProva` no handler — verificado existir em
`ipc/index.ts`):

| Campo | Regra de saneamento |
|---|---|
| `ordinal` | Aceita só `"primeira"\|"segunda"\|"final"`; qualquer outro → erro `DadosProvaInvalidosError("Informe qual prova é.")`. |
| `horasPorDia` | `Math.round`; **clamp** a 1–24; não-finito/ausente → `2` (default honesto). |
| `diasPorSemana` | `Math.round`; **clamp** a 1–7; não-finito/ausente → `5`. |
| `topicos` | `Array.isArray` senão `[]`. Cada item: `titulo` trim 1–200 (vazio → item descartado, não erro); `id` trim não-vazio **E não começando com `manual:`** (reservado) é aceito como veio do doc, senão derivado como **`"manual:" + slugTopico(titulo) + "-" + índice`** (NIT-5: prefixo que ids de documento `randomUUID` nunca têm → espaços de id disjuntos); `novo` coerção booleana, **forçado `false` se `ordinal==="primeira"`**; `dificuldade` só se ∈ níveis, senão omitido; `dataArquivo` só se `ehIsoPlausivel` (importado de `@shared/cronologia` — ver NIT-3 da 1ª rodada/§16), senão omitido. Dedup por `id` mantendo o 1º. **Vazio após sanear → erro** `DadosProvaInvalidosError("Informe ao menos um assunto.")`. |
| `ordemManual` | `Array.isArray` de strings; descarta ids que não existem em `topicos`; dedup mantendo a 1ª ocorrência. Vazio → chave **omitida** (spread condicional). |
| `checkpoint` | `"automatico"\|"lembrete"`; outro/ausente → `"lembrete"` (ver §5.6 — default de design, não do intent). |
| `atualizadoEm` | Sempre recarimbado server-side (`new Date().toISOString()`); o valor do renderer é ignorado (ver §5.5). |

Por que **clamp** e não **rejeição** em horas/dias: alinha ao princípio "o app
decide, não trava o aluno iniciante". Um valor absurdo vira um valor sensato,
não um erro. Títulos e ordinal são a exceção (sem eles não há plano).

A gravação segue o padrão de spread condicional **confirmado no código real de
`provas.ts`** (NIT-3): `listarProvas` faz `...(prova.vinculo.tipo === "caderno" ?
{ cadernoNome: prova.vinculo.cadernoNome } : {})` e `salvarSessoes` faz
`...(s.concluida === true ? { concluida: true } : {})`. (A citação anterior a
`caminhoOrigem` estava errada — esse campo é de `storage.ts`, domínio de
documentos, não de `provas.ts`.) Dentro do novo handler/serviço, o literal da
prova usa `...(plano ? { plano } : {})`. `escreverProva` (atômico `.tmp`+rename)
e `carregarProva` (`JSON.parse` tolerante) **não mudam** — o campo opcional cai
naturalmente.

### 5.4 `slug` para ids de tópico digitado à mão — lar do helper

> **Resolve MEDIUM-7.** `slugTopico` NÃO vive em `plano.ts` (puro da régua): é
> uma util de string de saneamento, não de cálculo. Mistura de preocupações.

Decisão: `slugTopico` fica em **`src/shared/slug.ts`** (novo, util puro genérico,
sem dependência), importável tanto por `provas.ts` (saneamento, no main) quanto
por qualquer outro ponto futuro. Assim:
- `src/shared/plano.ts` fica **só** com a matemática (régua + distribuição).
- `src/main/services/provas.ts` importa `slugTopico` de `@shared/slug` dentro de
  `sanearPlano`.

Implementação (pura, determinística): minúsculas, `normalize("NFD")` + strip de
diacríticos (sem dependência), troca não-alfanumérico por `-`, colapsa hífens,
trim de hífens das pontas. Vazio após normalizar → `"topico"`. Em `sanearPlano`,
o id final de um tópico digitado à mão é **`"manual:" + slugTopico(titulo) + "-"
+ i`** (NIT-5): o prefixo `manual:` garante disjunção com os ids de documento
(`randomUUID`), e o sufixo de índice garante unicidade dentro do plano. `slugTopico`
em si **não** inclui o prefixo (continua uma util de string genérica); o prefixo
é aplicado por `sanearPlano`.

Para evitar **dois arquivos `plano.ts`** com papéis diferentes (shared=matemática,
main=orquestração — confusão de import), o serviço do main é nomeado
**`src/main/services/planoCalculo.ts`** (não `plano.ts`). Ver §13.

### 5.5 Por que `PlanoEstudo.atualizadoEm` além de `Prova.atualizadoEm`

> **Resolve NIT-5.** Mantido, com justificativa: `Prova.atualizadoEm` muda em
> **qualquer** edição da prova (mover uma sessão, renomear, mudar data).
> `PlanoEstudo.atualizadoEm` marca especificamente **quando o questionário foi
> re-respondido** — informação que a UI usa para dizer "plano montado em
> {data}" sem confundir com uma edição de agenda que não tocou o plano. É
> barato (uma string) e evita que a fatia 3 (que lerá o plano) precise inferir
> isso. Trade-off aceito.

### 5.6 Default de checkpoint = `"lembrete"` (decisão desta fatia)

> **Resolve NIT-6.** O intent lista os dois perfis (automático/lembrete) **sem
> default**. Escolho `"lembrete"` como default quando ausente/inválido porque é
> o comportamento **conservador**: não gera nada sozinho, só avisaria (e a
> geração/aviso é a fatia 4). Assim nenhuma prova herda "gerar automaticamente"
> sem o aluno ter optado. **Nota para a fatia 4:** tratar `checkpoint` ausente
> como "lembrete" (não-automático) — não gerar nada sem opt-in explícito.

---

## 6. Decisão 2 — A régua base/novo como contrato de função pura

A peça **mais arriscada**. Isolada, pequena, totalmente testável. Esta seção foi
reescrita para resolver **HIGH-1** e **NIT-4** (ver §16).

### 6.1 Assinatura

```ts
/** Entrada da régua base/novo (tudo já saneado pelo chamador). */
export interface MisturaBaseNovoParams {
  /** Dias de hoje até a prova (0 = hoje; negativo = já passou). */
  diasRestantes: number;
  /** Quantos tópicos de BASE existem (>= 0). */
  totalBase: number;
  /** Quantos tópicos NOVOS existem (>= 0). */
  totalNovo: number;
  /**
   * Peso médio de dificuldade da BASE, em [0,1] (0 = tudo fácil, 1 = tudo
   * difícil). Derivado das dificuldades autodeclaradas pelo chamador via
   * `nivelParaPeso` (NIT-2: `facil→0`, `media→0.5`, `dificil→1`,
   * `undefined→0.5`), tirando a média dos tópicos base. Base vazia → 0.
   */
  dificuldadeBase: number;
}

/** Saída: proporção de ESFORÇO (tempo/dias) dedicada a base vs novo. */
export interface MisturaBaseNovo {
  /** Fração do esforço para a base, em [0,1]. */
  fracaoBase: number;
  /** Fração do esforço para o novo, em [0,1]. `fracaoBase + fracaoNovo === 1`. */
  fracaoNovo: number;
}

export function calcularMisturaBaseNovo(
  p: MisturaBaseNovoParams,
): MisturaBaseNovo;
```

### 6.2 A fórmula (contínua, determinística) — CORRIGIDA

A ideia do usuário, verbatim: "prova muito longe → foco a mais na base; prova
bem próxima → foco pesado no novo com alguns toques na base". Logo a mistura é
uma função **monótona** do tempo restante: quanto mais longe a prova, maior
`fracaoBase`; quanto mais perto, menor — mas **nunca 0** ("alguns toques na
base") e **nunca 1** quando existe conteúdo novo (foco "pesado" na base ≠ 100%
base; o novo continua a cair na prova). Esse é exatamente o erro corrigido do
HIGH-1: a versão anterior zerava o novo em `prox = 0`.

Escolho a **Opção A da revisão (teto de base)**: uma rampa linear **entre um piso
e um teto**, simétrica, sem termo oculto. Passos (todos puros, sem ramos
escondidos; **as degenerações são checadas PRIMEIRO**):

**Passo 0 — degenerações por ausência de um lado** (determinísticas,
prioritárias, encerram a função):
- `totalBase === 0 && totalNovo === 0` → `{ fracaoBase: 0, fracaoNovo: 0 }`
  (soma 0; **único** caso que relaxa a invariante de soma — ver §6.4). Só
  alcançável em teste unitário direto; `calcularPlano` nunca chega aqui (§7.2
  retorna `sem_topicos` antes — resolve MEDIUM-4).
- `totalNovo === 0` (ex.: 1ª prova, tudo base) → `{ fracaoBase: 1, fracaoNovo: 0 }`.
  Não há novo para estudar.
- `totalBase === 0` (nenhuma base; só conteúdo novo declarado) →
  `{ fracaoBase: 0, fracaoNovo: 1 }`. Não há base para tocar.

**Passo 1 — proximidade normalizada** `prox ∈ [0,1]`: `0` = prova distante, `1` =
prova hoje. Horizonte fixo `HORIZONTE_DIAS = 30` (constante nova):
`prox = 1 - clamp(diasRestantes, 0, HORIZONTE_DIAS) / HORIZONTE_DIAS`.
- `diasRestantes >= 30` → `prox = 0` (prova longe).
- `diasRestantes = 0` → `prox = 1` (prova hoje).
- `diasRestantes < 0` (passou) → `clamp` a 0 dias → `prox = 1` (ver §6.4).

**Passo 2 — base bruta pela proximidade, ENTRE piso e teto.** (Este é o passo que
corrige o HIGH-1: em vez de ir de `PISO_BASE` até `1.0`, vai de `PISO_BASE` até
`TETO_BASE < 1`, deixando **sempre** esforço para o novo quando ambos os lados
têm tópicos.)
`baseBruta = PISO_BASE + (TETO_BASE - PISO_BASE) * (1 - prox)`.
- `PISO_BASE = 0.15`: os "alguns toques na base" quando a prova está em cima.
- `TETO_BASE = 0.80`: o foco **pesado** (não total) na base quando a prova está
  longe. Longe (`prox=0`) → `baseBruta = 0.80`; perto (`prox=1`) →
  `baseBruta = 0.15`.

**Passo 3 — ajuste por dificuldade da base.** Base difícil merece mais dias
(intent: "mais dias ao que é difícil / tem lacuna de base"). Empurra a base para
cima proporcional à dificuldade, **sem nunca chegar a 1** (preserva o espaço do
novo): fecha parte da folga que ainda resta **até o próprio `TETO_BASE`**, não
até 1:
`baseAjustada = baseBruta + PESO_DIFICULDADE * dificuldadeBase * (TETO_BASE - baseBruta)`,
com `PESO_DIFICULDADE = 0.5`. Dificuldade 0 não muda nada; dificuldade 1 fecha
metade da folga entre `baseBruta` e `TETO_BASE`. Logo `baseAjustada ∈ [PISO_BASE,
TETO_BASE]` sempre que ambos os lados têm tópicos — o novo nunca zera.

**Passo 4 — resultado.** Fora das degenerações do passo 0:
`fracaoBase = arredondar4(baseAjustada)`, `fracaoNovo = 1 - fracaoBase`
(derivado, **não** arredondado de forma independente — resolve NIT-4, garante
soma exata). `arredondar4(x) = Math.round(x * 1e4) / 1e4`.

**Invariantes (checáveis em teste):**
- `fracaoBase, fracaoNovo ∈ [0,1]`.
- `fracaoBase + fracaoNovo === 1`, **exceto** `totalBase===0 && totalNovo===0`
  (soma 0).
- Com **ambos os lados > 0**: `fracaoBase ∈ [PISO_BASE, TETO_BASE]` → **o novo
  nunca zera e a base nunca toma tudo** (corrige HIGH-1).
- Monótona não-decrescente em `diasRestantes` (tudo o mais igual, ambos > 0):
  mais dias ⇒ `fracaoBase` maior-ou-igual.
- Monótona não-decrescente em `dificuldadeBase` (ambos > 0): mais difícil ⇒
  `fracaoBase` maior-ou-igual.

### 6.3 Por que esta fórmula (e não alternativas)

Consideradas três opções:

- **(A) Liga-desliga por limiar** (ex.: "> 14 dias → base; senão → novo"). O
  intent pede **régua contínua** explicitamente ("não liga-desliga"). Descartada.
- **(B) Curva contínua linear piso↔teto** (a escolhida). Monótona, uma só
  expressão, quatro constantes nomeadas e justificadas, trivial de testar em
  pontos de borda. Casa 1:1 com as palavras do usuário e nunca zera o lado que
  existe.
- **(C) Curva não-linear (sigmoide/exponencial).** "Esperta", mas o usuário pediu
  "honestamente simples que funciona" a "esperto que pode surpreender". O extra de
  realismo não justifica a opacidade. Descartada.

Entre as duas sub-opções do review para corrigir o HIGH-1 — (A) teto de base vs.
(B) ponderar por `totalNovo` — escolho o **teto de base**. Razão: é uma constante
nomeada e visível na fórmula (fácil de testar e ajustar), enquanto ponderar por
`totalNovo/(totalBase+totalNovo)` faria a proporção de **esforço** depender da
**contagem** de tópicos, misturando dois eixos (quanto tempo dar a uma camada vs.
quantos tópicos ela tem) — a distribuição (§7) já cuida da contagem ao repartir o
orçamento de cada camada pelos seus tópicos. Manter a régua só sobre tempo×
dificuldade a mantém pequena e sem acoplamento.

`HORIZONTE_DIAS = 30` é o ponto a partir do qual "longe" satura (um mês é o
horizonte típico de preparação de prova de faculdade). `PISO_BASE`/`TETO_BASE`/
`PESO_DIFICULDADE` idem. Todas vão para `constants.ts` com doc-comment (padrão já
usado lá: `INTERVALOS_REVISAO_PADRAO`, `DIAS_ANTES_MAX`, etc.).

### 6.4 Tabela de casos de borda — COBERTO vs NÃO COBERTO

Valores calculados com `PISO_BASE=0.15`, `TETO_BASE=0.80`, `HORIZONTE_DIAS=30`,
`PESO_DIFICULDADE=0.5`, ambos os lados com tópicos e `dificuldadeBase=0` salvo
indicado:

| Caso de borda | Entrada | `fracaoBase` / `fracaoNovo` | Coberto? |
|---|---|---|---|
| Prova HOJE | `diasRestantes=0`, dif 0 | `0.15` / `0.85` — foco no novo, toque na base | ✅ Coberto |
| Prova AMANHÃ | `diasRestantes=1`, dif 0 | `prox≈0.9667` → `≈0.1717` / `≈0.8283` | ✅ Coberto |
| Prova em 15 dias | `diasRestantes=15`, dif 0 | `prox=0.5` → `0.475` / `0.525` (meio-termo) | ✅ Coberto |
| Prova a MUITOS MESES | `diasRestantes>=30`, dif 0 | `prox=0` → `0.80` / `0.20` — foco pesado (não total) na base; **o novo nunca zera** | ✅ Coberto (corrige HIGH-1) |
| Prova longe, base difícil | `diasRestantes>=30`, dif 1 | `0.80 + 0.5·1·(0.80−0.80)=0.80` → `0.80` / `0.20` (já no teto) | ✅ Coberto |
| Prova em 15 dias, base difícil | `diasRestantes=15`, dif 1 | `0.475 + 0.5·1·(0.80−0.475)=0.6375` → `0.6375` / `0.3625` | ✅ Coberto |
| Prova no PASSADO | `diasRestantes<0` | `clamp`→0 dias → `prox=1` → trata como "hoje" | ✅ Coberto (normaliza; §7.2 e a UI mostram "já passou") |
| Zero tópicos de base (1ª prova / só novo) | `totalBase=0` | `0` / `1` (degeneração, passo 0) | ✅ Coberto |
| Zero tópicos novos (toda base) | `totalNovo=0` | `1` / `0` (degeneração, passo 0) | ✅ Coberto |
| Ambos zero | `totalBase=0, totalNovo=0` | `0` / `0` (soma 0); inalcançável via `calcularPlano` (§7.2 retorna `sem_topicos` antes) | ✅ Coberto (só teste unitário direto) |
| Dificuldade ausente | chamador passa `0` | sem empurrão; régua age só pelo tempo | ✅ Coberto |
| `diasRestantes` não inteiro/NaN | — | contrato: entrada já inteira (`diferencaDias` só produz inteiros) | ❌ Não coberto (responsabilidade do chamador) |
| Zero tempo disponível | — | a régua não vê tempo; clamp em §5.3 garante `horasPorDia>=1`, `diasPorSemana>=1` | ❌ Não coberto (fora do escopo da régua) |
| Mais tópicos que dias | — | é a distribuição (§7), não a régua | ❌ Não coberto (fora do escopo da régua) |

A régua é **só a proporção base↔novo**. Quem traduz proporção em dias/minutos, e
quem decide "não cabe", é a distribuição (§7). Essa separação mantém cada função
pequena e testável isoladamente.

---

## 7. Decisão 3 — Distribuição por dias e o comportamento "não cabe"

Esta seção foi reescrita para resolver **HIGH-2**, **MEDIUM-1/2/3/4/6** (ver §16).
Há **uma só** assinatura vinculante; o algoritmo é um só, passo a passo e
determinístico.

### 7.1 Assinatura (ÚNICA e vinculante)

```ts
/** Um tópico já pronto para distribuir (ordenado base→novo pelo chamador). */
export interface TopicoDistribuivel {
  id: string;
  titulo: string;
  novo: boolean;
  /** Peso de dificuldade em [0,1] (facil=0, media=0.5, dificil=1). */
  dificuldade: number;
}

export interface CalcularPlanoParams {
  /** Tópicos já ordenados base→novo pelo chamador (via cronologia.ts). */
  topicos: TopicoDistribuivel[];
  /**
   * Datas de estudo "YYYY-MM-DD" JÁ FILTRADAS por dias úteis, crescentes,
   * de amanhã até a véspera da prova. O handler/serviço main as monta (§7.2);
   * o puro NÃO reaplica diasPorSemana. Vazio → aviso `sem_dias`.
   */
  datasDisponiveis: string[];
  /** Horas de estudo por dia (saneado 1–24). Capacidade de cada dia. */
  horasPorDia: number;
  /**
   * Dias de hoje até a prova (tempo de CALENDÁRIO), para a régua. PODE diferir
   * de `datasDisponiveis.length` (capacidade), que já descontou folgas. A régua
   * usa este; a capacidade usa `datasDisponiveis.length`. São eixos distintos.
   */
  diasRestantes: number;
  /** Ordinal (define, com `topicos[].novo`, a partição base/novo). */
  ordinal: OrdinalProva;
}

/** Um bloco de estudo de um tópico, em um dia. */
export interface BlocoEstudo {
  topicoId: string;
  titulo: string;
  novo: boolean;
  /** Minutos sugeridos para o bloco (inteiro >= MINUTOS_BLOCO_MIN). */
  minutos: number;
}

/** Um dia do plano: a data e os blocos de estudo daquele dia. */
export interface DiaPlano {
  /** Data "YYYY-MM-DD". */
  data: string;
  /** Blocos do dia, em ordem (base antes de novo; depois por prioridade). */
  blocos: BlocoEstudo[];
}

export type AvisoPlano =
  | { tipo: "prova_passou" }
  | { tipo: "sem_topicos" }
  | { tipo: "sem_dias" }
  | { tipo: "nao_cabe"; topicosForaDoPlano: number };

export interface PlanoCalculado {
  /** Dias de estudo, do mais próximo de hoje até a véspera da prova. */
  dias: DiaPlano[];
  /**
   * Mistura base/novo efetivamente usada (da régua), para a UI explicar.
   * **Opcional** e presente SOMENTE quando há um plano de verdade (`aviso`
   * ausente OU `aviso.tipo === "nao_cabe"`). Nos casos em que não há plano
   * nenhum — `aviso.tipo ∈ { "prova_passou", "sem_topicos", "sem_dias" }` —
   * `mistura` é **omitida** (ver §7.1.1): não há mistura porque não há
   * distribuição, e a UI não deve exibi-la. Resolve MEDIUM-1 escolhendo a
   * opção (b) do review (omitir), não o sentinela `{0,0}`.
   */
  mistura?: MisturaBaseNovo;
  /** Aviso honesto; ausente = tudo coube e há o que planejar. */
  aviso?: AvisoPlano;
}

export function calcularPlano(p: CalcularPlanoParams): PlanoCalculado;
```

> A assinatura acima é a **única** válida. (A versão anterior apresentava duas —
> corrigido.)

### 7.1.1 Quando `mistura` está presente vs. ausente (MEDIUM-1 — decisão única)

Regra **vinculante**, sem "ou", válida para o puro e para o serviço main:

| Situação | `dias` | `mistura` | `aviso` |
|---|---|---|---|
| Plano montado, tudo coube | preenchido | **presente** | ausente |
| Plano montado, parte não coube | preenchido | **presente** | `nao_cabe` |
| Prova já passou | `[]` | **ausente (omitida)** | `prova_passou` |
| Sem tópicos | `[]` | **ausente (omitida)** | `sem_topicos` |
| Sem dias de estudo | `[]` | **ausente (omitida)** | `sem_dias` |

Racional: `MisturaBaseNovo` só tem significado quando existe esforço a repartir.
Nos três casos sem plano, não há esforço, logo **não há mistura** — omiti-la é
mais honesto que carimbar `{0,0}` (que, pela §6.2, é o estado reservado a "ambos
os lados sem tópicos" e sobrecarregaria o significado). Como `mistura?` passa a
ser opcional, o serviço main **não calcula a régua** nos ramos de retorno-cedo
(`prova_passou`), e o puro **não a inclui** nos ramos `sem_topicos`/`sem_dias`.
A UI só lê `mistura` quando `aviso` é ausente ou `nao_cabe`.

### 7.2 Dias de estudo disponíveis — quem monta e como (reuso de `agenda.ts`)

Montados pelo **serviço main** (`planoCalculo.ts`), NÃO pelo puro. Passos:

1. `diasRestantes = diferencaDias(prova.data, hoje)` (`agenda.ts`).
2. Se `diasRestantes <= 0` → o serviço devolve, **sem chamar o puro e sem
   calcular a régua**, `{ dias: [], aviso: { tipo: "prova_passou" } }`
   (`mistura` **omitida**, §7.1.1: não há distribuição, logo não há mistura).
3. Enumera as datas corridas de **amanhã** até a **véspera** da prova com o
   helper novo `datasEntre(hoje, prova.data)` (§7.6).
4. **Filtra dias úteis** por `diasPorSemana` com **âncora explícita**:
   indexando de 0 a partir do **primeiro dia corrido** (amanhã), o dia de índice
   `i` é útil se `i % 7 < diasPorSemana`. Exemplo: `diasPorSemana=5` → úteis os
   índices 0,1,2,3,4; folga 5,6; depois 7,8,9,10,11 úteis; etc. (ancorado em
   "amanhã", não no calendário — determinístico e independente do dia-da-semana
   real). Como `diasPorSemana` é clampado a **1–7** (§5.3), o índice 0 (amanhã)
   satisfaz sempre `0 < diasPorSemana`: **havendo ≥1 dia corrido, há sempre ≥1
   dia útil** (não existe o caso "0 dias úteis com ≥1 dia corrido" — resolve
   NIT-1; a antiga salvaguarda era código morto e foi removida).
5. A **única** guarda real de "sem dias": se `datasEntre(hoje, prova.data)` já
   vier **vazio** (prova é amanhã — não há nenhum dia corrido entre hoje e a
   prova), então `datasDisponiveis = []` e o puro retornará `sem_dias` (abaixo).
6. Passa `datasDisponiveis` (já filtradas) ao puro.

O **puro** (`calcularPlano`), na ordem (resolve MEDIUM-4 — guardas ANTES da
régua/divisões), honrando a regra de presença de `mistura` da §7.1.1:
- Se `topicos.length === 0` → `{ dias: [], aviso: sem_topicos }`
  (`mistura` omitida — sem tópicos, não há régua a calcular).
- Se `datasDisponiveis.length === 0` → `{ dias: [], aviso: sem_dias }`
  (`mistura` omitida — sem dias, não há distribuição).
- Caso contrário segue §7.3 (aqui, e só aqui, `mistura` é calculada e **sempre
  presente** no retorno).

### 7.3 Algoritmo de alocação — ÚNICO, passo a passo (resolve MEDIUM-2/3)

Determinístico. `D = datasDisponiveis.length`,
`capacidadeDia = horasPorDia * 60` minutos,
`capacidadeTotal = D * capacidadeDia` minutos. Partição: `base` = tópicos
`!novo`, `novo` = tópicos `novo` (já na ordem base→novo recebida). O passo-chave
que o MEDIUM-2 obriga: **nenhum minuto fica sem lar e nenhuma insuficiência é
silenciada** — todo minuto ou entra num dia, ou é contado explicitamente como
"não coube".

1. **Régua:** `mistura = calcularMisturaBaseNovo({ diasRestantes, totalBase,
   totalNovo, dificuldadeBase })` (média das dificuldades dos tópicos base; base
   vazia → 0). Guardas: se `totalBase===0` toda a capacidade vai ao novo e
   vice-versa (coincide com as degenerações da régua).

2. **Orçamento por camada (minutos):**
   `orcBase = round(capacidadeTotal * fracaoBase)`,
   `orcNovo = capacidadeTotal - orcBase` (derivado, soma exata =
   `capacidadeTotal`).

3. **Minutos-alvo por tópico, por peso dentro da camada.** Peso do tópico
   `w = 1 + dificuldade` (difícil pesa o dobro do fácil). Para cada camada com
   `somaPesos = Σ w` (guarda: camada vazia ⇒ pular, sem divisão):
   `alvo(t) = orcCamada * w(t) / somaPesos` (ainda fracionário).

4. **Piso por tópico: remover (adiar) os que não cabem com qualidade.** (A
   **prioridade** referida aqui e no passo 5 é a do passo 6 —
   `(1+dificuldade)·fracaoDaCamada`, maior primeiro, desempate `id`; definida ali
   e reusada nestes dois passos.) Um tópico cujo
   `alvo < MINUTOS_BLOCO_MIN (=15)` **não cabe com qualidade** e é
   **removido** do plano (não comprimido abaixo do piso, não inflado roubando de
   outros). Remoção em ordem de **menor prioridade primeiro** (critério do passo
   6), recomputando `somaPesos`/`alvo` da camada após cada remoção, até todos os
   remanescentes terem `alvo >= MINUTOS_BLOCO_MIN`. Os removidos contam em
   `topicosForaDoPlano` (passo 8).

5. **Minutos inteiros por tópico — arredondamento reconciliado (sem minutos
   órfãos).** (Resolve o "arredondamento" do MEDIUM-2.) Converter `alvo` em
   inteiros de modo que **a soma por camada seja EXATAMENTE `orcCamada`**, não
   `Σ round(alvo)` (que poderia divergir em até ~nº-de-tópicos minutos e deixar
   minutos sem lar): usa-se o método do **maior resto (largest-remainder)** por
   camada — `piso(t) = Math.floor(alvo(t))`; distribui-se o resíduo
   `orcCamada − Σ piso(t)` (inteiro, ≥ 0) somando **1 minuto** aos tópicos de
   maior parte fracionária `alvo(t) − piso(t)`, desempate por **prioridade desc**
   e depois `id.localeCompare`. Resultado: `minutosTopico(t)` inteiro,
   `Σ minutosTopico = orcBase + orcNovo = capacidadeTotal`, e cada
   `minutosTopico >= 15` (o piso de 15 já foi garantido no passo 4; floor de um
   alvo ≥ 15 pode cair a 14 só se `alvo ∈ [15,16)` — por isso, após o
   largest-remainder, **re-verifica-se** o piso: se algum `minutosTopico < 15`,
   remove-se o de menor prioridade e repete-se do passo 4; converge porque cada
   iteração reduz o nº de tópicos). Invariante de saída deste passo:
   `Σ minutosTopico === capacidadeTotal` e todo `minutosTopico >= 15`.

6. **Ordem/prioridade (um único critério — resolve MEDIUM-3):**
   `prioridade(t) = (1 + dificuldade(t)) * fracaoDaCamada(t)`, onde
   `fracaoDaCamada = fracaoBase` se `!novo`, `fracaoNovo` se `novo`. Maior
   prioridade primeiro; **desempate por `id.localeCompare`**. Este é o critério
   tanto para **o que remover no "não cabe"** (remove os de menor prioridade)
   quanto para **a ordem de preenchimento dos dias**. A descrição lexicográfica
   anterior (dificuldade→camada) foi removida.

7. **Preenchimento dos dias — UM único algoritmo (sequential-fill por tópico;
   NÃO round-robin).** (Resolve a "descrição conflitante" do MEDIUM-2: o termo
   "round-robin" foi **removido** — o algoritmo é sequential-fill.) Itera os
   tópicos remanescentes **na ordem base→novo** (a ordem recebida; dentro de
   empates de posição, por prioridade desc e depois `id.localeCompare`), e os
   dias na ordem crescente de `datasDisponiveis` com um **cursor de dia**
   compartilhado que só avança. Para cada tópico:
   - Enquanto restar `>= 15` min do tópico E existir um dia atual:
     - `folga = capacidadeDia − minutosJaNoDia`.
     - Se `folga < 15` → **avança o cursor** para o próximo dia (os `folga`
       minutos daquele dia ficam ociosos; é capacidade morta aceita, nunca vira
       bloco < 15).
     - Senão (`folga >= 15`) → seja `aColocar`:
       - Se `restanteDoTopico <= folga`: cabe tudo neste dia → `aColocar =
         restanteDoTopico` (bloco final do tópico; pode ser qualquer valor
         `>= 15`, nunca abaixo), encerrando o tópico.
       - Se `restanteDoTopico > folga`: o que resta não cabe neste dia → coloca
         `aColocar = folga` **somente se** o resíduo `restanteDoTopico − folga >=
         15`; caso contrário (resíduo `> 0 && < 15`, que ficaria órfão)
         reduz-se o bloco para `aColocar = restanteDoTopico − 15`, deixando
         exatamente 15 min para formar um último bloco válido no próximo dia.
         (Garante que **nenhum bloco futuro** fique abaixo de 15 e que o atual
         nunca exceda `folga`.)
       Coloca o bloco de `aColocar` no dia atual e subtrai do `restanteDoTopico`.
       Como `aColocar <= folga` em todos os ramos, **o dia nunca estoura**.
   - O cursor **não volta**: um dia já preenchido antes não recebe tópicos
     posteriores (mantém "base antes de novo" visível no calendário e torna o
     preenchimento determinístico e O(dias+tópicos)).
   - **Minutos que não couberam (lacuna de viabilidade — resolve o "minutos
     órfãos" do MEDIUM-2):** se o cursor chegar ao fim de `datasDisponiveis`
     ainda restando `>= 15` min de algum tópico, **esse(s) tópico(s) não
     couberam**: o que já foi colocado permanece no plano, e cada tópico com
     resíduo conta em `topicosForaDoPlano` (passo 8). Minutos residuais **nunca
     somem em silêncio** — ou viraram blocos, ou o tópico é reportado como fora.

   **Invariante de dia:** a soma dos blocos de um dia é sempre `<= capacidadeDia`
   (nunca estoura), porque todo `aColocar <= folga` e nunca se adiciona bloco
   quando `folga < 15`. **Invariante de bloco:** nenhum bloco fica abaixo de 15
   min (o ramo que deixaria resíduo `<15` é ajustado para `restante − 15`).
   **Invariante de reforço:** um tópico com mais minutos ocupa mais dias
   consecutivos — o reforço do difícil que o intent pede.
   Dentro de um dia, os blocos ficam na ordem em que foram colocados (base antes
   de novo, depois por prioridade) — a UI mostra "comece por isto".

8. **Aviso "não cabe".** Seja `K` o número de tópicos **removidos no passo 4/5**
   mais os **com resíduo ao fim do passo 7**. Se `K > 0` →
   `aviso: { tipo: "nao_cabe", topicosForaDoPlano: K }`. Senão, sem `aviso`
   (e `mistura` presente — §7.1.1).

Tudo é inteiro (minutos) e determinístico; todo desempate termina em
`id.localeCompare` (como `cronologia.ts`). Não há `Date.now()` nem disco.

### 7.4 Comportamento "não cabe" (honesto, o app decide)

Princípio: **priorizar o difícil/relevante, nunca inventar tempo, avisar.**
Decorre direto do algoritmo. Há **duas** fontes de "não cabe", ambas contadas em
`topicosForaDoPlano` (passo 8), nunca silenciadas:
1. **Orçamento insuficiente por tópico** (passo 4/5): o alvo de um tópico cai
   abaixo de 15 min; ele é **removido** (menor prioridade primeiro) até os
   remanescentes caberem com ≥15 min cada.
2. **Dias esgotados** (passo 7): mesmo com alvo ≥15, os dias disponíveis acabam
   antes de alocar todos os minutos de um tópico; o resíduo (≥15) marca o tópico
   como fora. Isso cobre o caso de **arredondamento/fragmentação** (folga <15
   vira capacidade morta) sem que nenhum minuto suma.

A UI mostra uma frase honesta em pt-BR, ex.: _"Com {horas}h/dia em {dias} dias
não dá para cobrir tudo com qualidade. Priorizei os {M} assuntos mais críticos;
{K} ficaram de fora — considere mais tempo por dia ou comece antes."_

**Nunca** comprime abaixo do piso, **nunca** cria dias que não existem, **nunca**
estoura `capacidadeDia`, e **nenhum minuto residual some em silêncio** — ou vira
bloco, ou o tópico é reportado. Honestidade > falsa completude (alinhado ao
intent e ao recado do usuário sobre bugs).

### 7.5 Tabela de casos de borda da distribuição

| Caso | Comportamento | `mistura` | Aviso |
|---|---|---|---|
| Prova passou (`diasRestantes <= 0`) | serviço retorna cedo, `dias: []` | omitida | `prova_passou` |
| Sem tópicos (`topicos.length===0`) | guarda ANTES da régua, `dias: []` | omitida | `sem_topicos` |
| `datasDisponiveis` vazio (prova amanhã) | guarda, `dias: []` | omitida | `sem_dias` |
| Cabe tudo (todos `alvo >= 15` e minutos couberam nos dias) | distribui, sem remoção | presente | — (ausente) |
| Não cabe por orçamento (algum `alvo < 15`) | remove os de menor prioridade até caber | presente | `nao_cabe` com `K` |
| Não cabe por dias esgotados (passo 7: resíduo ≥15 após o último dia) | aloca o que coube; resíduo marca o tópico como fora | presente | `nao_cabe` com `K` |
| 1 tópico, muitos dias | mesmo tópico em vários dias (reforço) | presente | — |
| 1ª prova (tudo base, `totalNovo=0`) | régua `1/0` → orçamento todo na base | presente | — (se couber) |
| Só novo (`totalBase=0`) | régua `0/1` → orçamento todo no novo | presente | — (se couber) |

### 7.6 Helper de datas — assinatura exata (resolve MEDIUM-1 da 1ª rodada)

Função **nova** em `src/shared/agenda.ts` (mantém `agenda.ts` como o único dono
da aritmética de datas; reusa `diaParaNumero`/`numeroParaDia` já existentes e
verificados):

```ts
/**
 * Datas-calendário "YYYY-MM-DD" ESTRITAMENTE entre `inicioExclusivo` e
 * `fimExclusivo` (ambas as pontas excluídas), em ordem crescente. Pura.
 * Ex.: datasEntre("2026-03-01", "2026-03-05") = ["2026-03-02","2026-03-03","2026-03-04"].
 * Se `fim <= inicio+1` → []. Reusa diaParaNumero/numeroParaDia (valida formato).
 */
export function datasEntre(inicioExclusivo: string, fimExclusivo: string): string[];
```

Chamada como `datasEntre(hoje, prova.data)`: produz de **amanhã** (`hoje+1`,
exclusivo de hoje) até a **véspera** (`prova.data−1`, exclusivo da prova) —
casando "amanhã → véspera" com a semântica "ambas exclusivas". A seleção de dias
úteis por `diasPorSemana` (âncora `i % 7 < diasPorSemana`) é aplicada **depois**,
no serviço main (§7.2 passo 4), não dentro de `datasEntre` (que é só enumeração
de calendário). Teste puro próprio em `tests/shared/agenda.test.ts`.

---

## 8. Decisão 4 — Onde a UI vive e como dispara a montagem

### 8.1 Escolha

Duas opções do enunciado:

- **(A)** Questionário como passo embutido no formulário de criar/editar Prova.
- **(B)** Fluxo separado "Montar plano de estudo" a partir de uma Prova existente.

Escolho **(B)**. Razões:
- Criar prova já funciona e é enxuto; embutir o questionário incharia esse
  formulário e misturaria dois conceitos (agendar revisão ≠ montar plano guiado).
- O plano **depende de tópicos**, que vêm dos documentos/cadernos — faz sentido
  montar o plano depois de a prova existir e os cadernos estarem importados.
- É reeditável: o botão abre o questionário pré-preenchido com `Prova.plano`.
- Menor risco: não toca o caminho de criação de prova já testado.

### 8.2 Encaixe na `Agenda.tsx`

No **header do bloco "Regiões 3/4"** (o bloco `provaSelecionada !== null`,
ao lado do botão "Editar prova" — verificado em `Agenda.tsx`; resolve NIT-2),
adiciona-se um botão **"Montar plano de estudo"** (ou "Editar plano" se
`provaSelecionada.plano` existe). O botão abre um novo componente em
`src/renderer/views/PlanoEstudo.tsx` (importado pela Agenda) que:

- Lê os cadernos/documentos via `getApi().listarDocumentos(cadernoId?)`
  (verificado em `AppApi`: devolve `ResumoDocumentoSalvo[]`) para **sugerir
  tópicos** a partir dos documentos do caderno vinculado (quando a prova é
  `vinculo.tipo:"caderno"`) ou de todos (abrangente). Cada documento vira um
  `TopicoPlano` sugerido com:
  - `id` = `ResumoDocumentoSalvo.id` (casa com `ItemCronologico.id` da fatia 1);
  - `titulo` = **`ResumoDocumentoSalvo.nome`** (campo **confirmado** em
    `types.ts`: o nome do arquivo original, ex.: "Capítulo 1.pdf" — resolve
    MEDIUM-5; o tipo tem `nome`, `cadernoNome`, `dataArquivo?`, não um `titulo`);
  - `dataArquivo` = `ResumoDocumentoSalvo.dataArquivo` (quando presente).
  O aluno marca quais caem (novo) e a dificuldade; pode adicionar tópicos à mão.
- Campos: ordinal (radio 1ª/2ª/final), horas/dia (number 1–24), dias/semana
  (number 1–7), lista de tópicos (título + checkbox "cai na prova" + select de
  dificuldade), preferência de checkpoint (radio automático/lembrete).
- Salva via um método novo `getApi().salvarPlano(provaId, plano)` (§8.3),
  recebendo a `Prova` atualizada e fechando o formulário.
- Após salvar, mostra uma **pré-visualização** chamando
  `getApi().calcularPlano(provaId)` (o handler recalcula sob demanda com `hoje`
  injetado) — o aluno vê "o que estudar" sem persistir a agenda derivada; se vier
  `aviso`, a UI mostra a frase honesta correspondente (§7.4).
- Acessível: `<label>`/`<fieldset>`/`<legend>`, `role="alert"` nos erros, tokens
  de tema (classes novas em `styles.css`, sem cor fora de token).
- Renderer fala com o main **só via `getApi()`** (sem `window.api?.`).

### 8.3 Cadeia IPC nova (tipada, padrão existente)

Dois canais novos, no padrão dos de prova:

| Canal (const) | String | Handler | Retorno |
|---|---|---|---|
| `salvarPlano` | `"prova:salvar-plano"` | sanea via `sanearPlano`, grava `Prova.plano`, recarimba **ambos** os `atualizadoEm` (ver abaixo) | `Prova` |
| `calcularPlano` | `"prova:calcular-plano"` | carrega a prova; monta `datasDisponiveis` (`hoje` injetado + `agenda.ts`); ordena tópicos via `cronologia.ts`; chama `calcularPlano` puro | `PlanoCalculado` |

**Comportamento quando a prova não tem `plano` (resolve MEDIUM-6):** o handler
`calcularPlano`, ao carregar uma prova com `prova.plano === undefined` (prova
reaberta sem questionário montado), **lança**
`DadosProvaInvalidosError("Monte o plano de estudo antes de ver a prévia.")`. A
função `mensagemAmigavelProva` (verificada em `ipc/index.ts`, já trata
`DadosProvaInvalidosError`) converte isso numa mensagem amigável ao renderer.
Escolho lançar (não devolver `PlanoCalculado` vazio) porque "sem plano" é um
estado de **uso inválido do canal**, distinto dos avisos de negócio
(`sem_topicos`/`sem_dias`/`nao_cabe`) que pressupõem um plano existente.

Alterações espelhando o que a fatia 1 já fez para `criarDocumento`:
- `src/shared/ipc.ts`: duas entradas em `IPC_CHANNELS`; dois métodos em `AppApi`
  (`salvarPlano(id, plano)`, `calcularPlano(id)`), com os novos tipos importados.
- `src/main/preload.ts`: dois wrappers `ipcRenderer.invoke`.
- `src/main/ipc/index.ts`: dois `ipcMain.handle` usando `hojeLocal()` e o
  `mensagemAmigavelProva` existente nos `catch`.
- `src/main/services/provas.ts`: `salvarPlano(id, planoBruto, baseDir?)` (grava)
  e `sanearPlano(...)` (valida/sanea). Importa `slugTopico` de `@shared/slug` e
  `ehIsoPlausivel` de `@shared/cronologia`.

**Carimbos de `atualizadoEm` em `salvarPlano` (resolve NIT-4):** a operação gera
**um único** `agora = new Date().toISOString()` e o grava em **ambos** os
carimbos na mesma escrita atômica — `PlanoEstudo.atualizadoEm` (dentro do bloco
`plano`, setado por `sanearPlano`) **e** `Prova.atualizadoEm` (o carimbo da prova,
como `editarProva`/`salvarSessoes` já fazem). Assim os dois ficam idênticos nesta
operação, mas divergem depois quando o usuário edita só a agenda (aí só
`Prova.atualizadoEm` muda). A UI que exibe **"plano montado em {data}"** lê
**`PlanoEstudo.atualizadoEm`** (não o da prova), para refletir a última vez que o
questionário foi respondido, não qualquer edição de agenda (ver §5.5).
- `src/main/services/planoCalculo.ts` (**novo** — nome distinto de `plano.ts`
  para evitar dois `plano.ts`; resolve MEDIUM-7): orquestração fina —
  `montarPlanoCalculado(prova, hoje, docsPorId?)` que valida presença do plano,
  monta `datasDisponiveis`, ordena os tópicos via `cronologia.ts` (reconstruindo
  o `ReadonlyMap` a partir de `plano.ordemManual`), converte cada
  `TopicoPlano.dificuldade?` para o peso numérico via **`nivelParaPeso(n?)`**
  (NIT-2: `facil→0`, `media→0.5`, `dificil→1`, `undefined→0.5`), ao montar os
  `TopicoDistribuivel` e a `dificuldadeBase`, e chama o puro `calcularPlano`.
  `nivelParaPeso` vive **aqui** (não no puro `plano.ts`): é a tradução do
  vocabulário de persistência (`NivelDificuldade`) para o número que a
  matemática consome — responsabilidade de fronteira, não de cálculo. Sem IA,
  sem disco além do que recebe.

O handler `salvarPlano` recebe o `plano` cru do renderer (as respostas), **nunca**
a agenda derivada. `calcularPlano` nunca persiste.

---

## 9. Decisão 5 — Ordem cronológica manual: persistir aqui, UI depois

- **Persistência/leitura do contrato:** **entra nesta fatia.** `PlanoEstudo`
  guarda `ordemManual?: string[]` (array de ids). `sanearPlano` o valida
  (descarta ids inexistentes, dedup). O serviço `planoCalculo.ts` reconstrói o
  `ReadonlyMap<string, number>` (id → índice no array) e o passa a
  `ordenarCronologicamente` (verificado: aceita `ordemManual?: ReadonlyMap<...>`
  e desempata por `id.localeCompare`). Cumpre o que a fatia 1 deixou pronto
  (contrato por parâmetro) sem reabrir nada.
- **UI de reordenar (arrastar/mover tópicos):** **RECOMENDO deixar FORA desta
  fatia**, numa fatia dedicada (ou sub-item posterior), por três razões:
  1. A ordenação automática por `dataArquivo` já cobre o caso comum ("o app
     decide"); o manual é, nas palavras do intent, só "reforço opcional".
  2. Uma UI de reordenação acessível (teclado + arrastar, com anúncio de
     mudanças) é trabalho não-trivial e ortogonal ao núcleo "questionário +
     distribuição".
  3. Mantém esta fatia pequena e verificável — exatamente a estratégia que o
     usuário endossou para conter bugs.
  O contrato persistido permite adicionar a UI depois **sem migração** (o campo
  já existe e é opcional).

---

## 10. Decisão 6 — Nada usa o Ollama (confirmação)

Confirmado. Todas as peças desta fatia são mecânicas/puras:

- `sanearPlano` / `salvarPlano`: só disco (atômico) + validação. Sem rede.
- `calcularMisturaBaseNovo` / `calcularPlano` / `datasEntre` / `slugTopico`:
  aritmética/string pura em `shared/`.
- `ordenarCronologicamente`: já puro (fatia 1).
- UI: só `getApi()` para os canais acima (nenhum é de geração).

As "frases de orientação por IA por dia" citadas no intent ficam para polimento
posterior; o núcleo (o que/ordem/quanto tempo) **não depende** do modelo. Honra a
constraint vinculante do intent ("a distribuição NÃO pode depender do modelo").

---

## 11. Validação de entradas externas (resumo)

Cada entrada externa (respostas do renderer) é saneada no main antes de gravar:

| Entrada | Obrig.? | Tipo | Limites | Falha |
|---|---|---|---|---|
| `ordinal` | sim | enum | 3 valores | `DadosProvaInvalidosError` |
| `horasPorDia` | não | number | clamp 1–24 | default 2 |
| `diasPorSemana` | não | number | clamp 1–7 | default 5 |
| `topicos` | sim (≥1 válido) | array | título 1–200 | vazio → erro; item inválido → descartado |
| `topicos[].novo` | não | bool | — | coerção; forçado false se 1ª prova |
| `topicos[].dificuldade` | não | enum | 3 níveis | omitido se inválido (= media no cálculo) |
| `topicos[].dataArquivo` | não | ISO | `ehIsoPlausivel` (`@shared/cronologia`) | omitido se inválido |
| `ordemManual` | não | string[] | ids existentes | filtrado/dedup; vazio → omitido |
| `checkpoint` | não | enum | 2 valores | default lembrete |

Invariantes e seus donos:
- "1ª prova ⇒ tudo base": dono **`sanearPlano`** (força `novo:false`), regra de
  negócio de persistência.
- "`fracaoBase + fracaoNovo === 1` (salvo ambos zero)"; "com ambos > 0,
  `fracaoBase ∈ [PISO_BASE, TETO_BASE]`": dono **`calcularMisturaBaseNovo`**.
- "nenhum bloco < piso; nada inventa dias; nenhum dia estoura `capacidadeDia`":
  dono **`calcularPlano`**.
- "guardas de caso vazio ANTES da régua/divisões": dono **`calcularPlano`**
  (§7.2); o serviço main trata `prova_passou`/plano ausente antes.
- "`dataArquivo` sempre ISO canônica UTC": dono herdado da fatia 1
  (`ehIsoPlausivel`), reusado aqui.

---

## 12. Testabilidade

- **Unit (puro, Vitest, sem mocks):**
  - `tests/shared/plano.test.ts`: `calcularMisturaBaseNovo` — cada linha da
    tabela §6.4 (prova hoje/amanhã/15d/passado/longe; base/novo vazios; ambos
    vazios; dificuldade 0/0.5/1; monotonia em dias e dificuldade; invariante de
    soma; `fracaoBase ∈ [PISO,TETO]` com ambos > 0 — **o teste-chave do HIGH-1**:
    `fracaoNovo > 0` quando `totalNovo > 0`, mesmo longe). `calcularPlano` —
    tabela §7.5 (cabe → `mistura` **presente**, sem aviso; **não cabe por
    orçamento** `alvo<15` com `K`; **não cabe por dias esgotados** — resíduo ≥15
    após o último dia entra em `K`, MEDIUM-2; 1 tópico muitos dias;
    `datasDisponiveis` vazio → `sem_dias` com `mistura` **ausente**; `topicos`
    vazio → `sem_topicos` com `mistura` ausente; **nenhum dia estoura
    `capacidadeDia`**; **`Σ minutos nos blocos + minutos residuais ===
    capacidadeTotal` — nenhum minuto órfão**, MEDIUM-2; largest-remainder soma
    exata por camada; determinismo com `id`).
  - `tests/shared/slug.test.ts`: `slugTopico` — acentos, vazio→"topico", colisão
    de slugs iguais resolvida pelo sufixo de índice (o prefixo `manual:` é
    aplicado por `sanearPlano`, testado em `provas.test.ts` — NIT-5).
  - `tests/shared/agenda.test.ts` (estender): `datasEntre` — pontas exclusivas,
    intervalo curto → `[]`, ordem crescente, data inválida lança.
- **Unit (main, com `tmpdir`, padrão de `provas.ts`):**
  - `tests/main/services/provas.test.ts` (estender): `sanearPlano` (cada regra da
    §5.3; 1ª prova força base; clamps; dedup; **id de tópico à mão vira
    `manual:<slug>-<i>` e nunca colide com id de doc** — NIT-5), `salvarPlano`
    grava bloco aditivo **e recarimba ambos os `atualizadoEm` com o mesmo
    timestamp** (NIT-4), prova antiga sem `plano` carrega, reler devolve o bloco.
  - `tests/main/services/planoCalculo.test.ts` (novo): orquestração — monta
    `datasDisponiveis` com âncora de dias úteis (`i % 7 < diasPorSemana`);
    `nivelParaPeso` mapeia `facil/media/dificil/undefined → 0/0.5/1/0.5` (NIT-2);
    `ordemManual` reconstruída corretamente em `ReadonlyMap`; plano ausente → erro.
- **IPC:** estender os testes de handler de prova para `salvarPlano`/
  `calcularPlano` (erro amigável quando a prova não existe e quando não tem plano,
  via `mensagemAmigavelProva`).
- **UI:** não há teste de componente no projeto hoje (a Agenda é verificada
  manualmente); manter o padrão. A lógica fica no puro/handler, que **tem** teste.
- **Não coberto por teste (honesto):** a aparência/acessibilidade real do
  formulário e o encaixe visual na Agenda — verificação manual do usuário.

---

## 13. Arquivos a tocar

**Criados:**
- `src/shared/plano.ts` — puro: `calcularMisturaBaseNovo`, `calcularPlano`, e os
  tipos de cálculo (`MisturaBaseNovo*`, `TopicoDistribuivel`, `DiaPlano`,
  `BlocoEstudo`, `PlanoCalculado`, `AvisoPlano`). **Sem** `slugTopico` (ver §5.4).
- `src/shared/slug.ts` — puro: `slugTopico` (util de string de saneamento).
- `src/main/services/planoCalculo.ts` — orquestração fina do main (monta
  `datasDisponiveis`, ordena via `cronologia`, reconstrói `ReadonlyMap`, converte
  dificuldade via `nivelParaPeso` — NIT-2, chama o puro; valida presença do
  plano). Sem IA. **Nome distinto de `plano.ts`.**
- `src/renderer/views/PlanoEstudo.tsx` — formulário do questionário + preview.
- `tests/shared/plano.test.ts`, `tests/shared/slug.test.ts`,
  `tests/main/services/planoCalculo.test.ts`.

**Modificados:**
- `src/shared/types.ts` — `OrdinalProva`, `PreferenciaCheckpoint`,
  `NivelDificuldade`, `TopicoPlano`, `PlanoEstudo`; campo `plano?` em `Prova`.
- `src/shared/constants.ts` — `HORIZONTE_DIAS=30`, `PISO_BASE=0.15`,
  `TETO_BASE=0.80`, `PESO_DIFICULDADE=0.5`, `MINUTOS_BLOCO_MIN=15` (todas com
  doc-comment, padrão do arquivo).
- `src/shared/agenda.ts` — helper puro `datasEntre` (§7.6).
- `src/main/services/provas.ts` — `sanearPlano`, `salvarPlano`; gravação por
  spread condicional do bloco `plano`; importa `slugTopico`/`ehIsoPlausivel`.
- `src/shared/ipc.ts` — canais `salvarPlano`/`calcularPlano`; métodos em `AppApi`.
- `src/main/preload.ts` — wrappers dos dois canais.
- `src/main/ipc/index.ts` — dois handlers (`hojeLocal()` + `mensagemAmigavelProva`).
- `src/renderer/views/Agenda.tsx` — botão "Montar/Editar plano" no header do
  bloco `provaSelecionada !== null`; monta `PlanoEstudo.tsx`.
- `src/renderer/styles.css` — classes do formulário/preview (só tokens de tema).
- `tests/main/services/provas.test.ts`, `tests/shared/agenda.test.ts`,
  `tests/main/ipc/*` — casos novos.

**Não muda:** `cronologia.ts` (consumido como está), `escreverProva`/
`carregarProva` (campo opcional cai naturalmente), nenhuma assinatura de handler
existente.

### 13.1 Ordem de implementação (dois commits, uma fatia)

1. **Commit A — persistência:** tipos + `slug.ts` + `sanearPlano`/`salvarPlano` +
   IPC `salvarPlano` + testes de persistência. UI mínima para salvar/reeditar.
2. **Commit B — distribuição:** `plano.ts` puro (régua + distribuição) +
   `datasEntre` + `planoCalculo.ts` + IPC `calcularPlano` + preview na UI +
   testes puros isolados.

Build/lint/testes verdes ao fim de cada commit. A **régua** (peça mais arriscada)
nasce com seus testes de borda próprios (§6.4) no commit B, incluindo o teste que
prova o HIGH-1 corrigido (`fracaoNovo > 0` longe da prova).

---

## 14. Verificação e baseline de testes (resolve NIT-1)

- Ao implementar, rodar `npm run build`, `npm run lint`, `npm test` no worktree e
  **fixar a contagem real de testes** no PROGRESSO/todo/README (regra
  `manter-docs-atualizados`). O design não afirma um número de memória.
- **Reconciliar a divergência de baseline (NIT-6):** as duas fontes de baseline
  do repositório **divergem** — `AGENTS.md` diz **514 testes** e
  `tasks/roadmap-plano-estudo-guiado-f1.md` §4 diz **614 testes** (após a fatia 1).
  Ao fixar a contagem pós-implementação, usar o resultado de `npm test` como
  **única fonte de verdade** e **reconciliar** os dois documentos para o número
  real (provavelmente `AGENTS.md` está desatualizado em relação à fatia 1). Não
  propagar nenhum dos dois números de memória.
- Verificado de fato **neste documento** (lendo o código do worktree):
  `agenda.ts` (`diaParaNumero`/`numeroParaDia`/`diferencaDias`/`diasRestantes`),
  `constants.ts` (padrão de constantes), `types.ts` (`Prova` sem `plano?`;
  `ResumoDocumentoSalvo.nome` existe), e as suposições do review marcadas ✔.
- **Não verificável por teste automatizado:** o encaixe visual/acessibilidade do
  formulário na Agenda e a "sensação" do plano com dados reais do usuário —
  verificação manual.

---

## 15. Riscos e mitigação

- **Régua "surpreendente":** mitigado por fórmula linear piso↔teto, quatro
  constantes nomeadas, a tabela de borda testada ponto a ponto, e o invariante
  explícito "o novo nunca zera com `totalNovo>0`".
- **"Não cabe" mascarado:** mitigado por nunca comprimir abaixo do piso e sempre
  emitir `aviso` — a UI é obrigada a mostrar a frase honesta.
- **Vazamento de relógio no puro:** mitigado por `calcularPlano` receber
  `datasDisponiveis` prontas; `agenda.ts` continua o único dono do relógio-via-
  parâmetro; o serviço main injeta `hoje`.
- **Dois `plano.ts` confundindo imports:** mitigado nomeando o do main
  `planoCalculo.ts`.
- **Retrocompat:** campo `plano?` opcional + spread condicional + leitura
  tolerante — prova antiga nunca quebra (padrão já verificado na fatia 1).

---

## 16. Conformidade com AGENTS.md

- pt-BR na UI/conteúdo; identificadores em inglês. ✅
- Sem dependência nova. ✅ (§10, §13)
- Renderer só via `getApi()`. ✅ (§8.2)
- Lógica pura em `src/shared/` (`plano.ts`, `slug.ts`, `datasEntre`), disco só no
  main. ✅
- Persistência atômica + leitura tolerante, padrão de `provas.ts`. ✅ (§5.3)
- Saneamento/validação no estilo `provas.ts` (`DadosProvaInvalidosError`,
  mensagens prontas; `mensagemAmigavelProva` no handler). ✅
- Sem Ollama em nenhuma peça. ✅

---

## 17. Respostas às findings da 1ª rodada de review

| Finding | Severidade | Resposta | Onde |
|---|---|---|---|
| HIGH-1 | HIGH | **Endereçada.** Adotada a Opção A (teto de base). `baseBruta` vai de `PISO_BASE=0.15` a `TETO_BASE=0.80` (não a 1.0); o ajuste por dificuldade fecha folga **até o teto**, não até 1. Removida a frase falsa "puxada por totalNovo"; `totalNovo` só entra nas degenerações (passo 0). Novo invariante testável: com ambos > 0, `fracaoBase ∈ [0.15,0.80]` ⇒ o novo nunca zera. Tabela §6.4 recalculada. | §6.2, §6.3, §6.4, §12 |
| HIGH-2 | HIGH | **Endereçada.** Assinatura única de `calcularPlano` (§7.1); a antiga 2ª assinatura foi removida. Tabela de responsabilidades handler×puro (§1.2). `datasDisponiveis` vazio → `sem_dias` (§7.2). `diasRestantes` (régua) ≠ `datasDisponiveis.length` (capacidade) declarado explicitamente. `diasPorSemana` **removido** de `CalcularPlanoParams` (vira responsabilidade só do serviço main). | §1.2, §7.1, §7.2 |
| MEDIUM-1 | MEDIUM | **Endereçada.** `datasEntre(inicioExclusivo, fimExclusivo): string[]` em `agenda.ts`, pontas exclusivas, crescente, com exemplo. Dias úteis por âncora explícita `i % 7 < diasPorSemana` contando de amanhã, com exemplo numérico. | §7.6, §7.2 |
| MEDIUM-2 (1ª rodada) | MEDIUM | **Endereçada.** Um único algoritmo passo a passo (§7.3): régua→orçamento por camada→minutos por tópico por peso `(1+dificuldade)`→**piso = remover** (escolha única, não "elevar ou")→distribuição por dia respeitando `capacidadeDia`. Nenhum "ou" restante. (A 2ª rodada refinou ainda mais o passo de preenchimento — ver §18.) | §7.3 |
| MEDIUM-3 | MEDIUM | **Endereçada.** Critério único: `prioridade = (1+dificuldade)·fracaoDaCamada`, desc, desempate `id.localeCompare` — usado tanto para remover no "não cabe" quanto para a ordem. Descrição lexicográfica removida. | §7.3 passo 5 |
| MEDIUM-4 | MEDIUM | **Endereçada.** `calcularPlano` retorna `sem_topicos`/(serviço)`prova_passou` **antes** da régua; régua mantém o caso 0/0 só p/ teste; guardas contra divisão por `somaPesos`/fração de camada vazia. | §6.2 passo 0, §7.2, §7.3 |
| MEDIUM-5 | MEDIUM | **Endereçada.** Campo-fonte confirmado lendo `types.ts`: `ResumoDocumentoSalvo.nome` (não existe `titulo`). `TopicoPlano.titulo = ResumoDocumentoSalvo.nome`; `id = .id`; `dataArquivo = .dataArquivo`. | §8.2 |
| MEDIUM-6 | MEDIUM | **Endereçada.** Handler `calcularPlano` com `prova.plano===undefined` lança `DadosProvaInvalidosError("Monte o plano de estudo antes de ver a prévia.")` (convertida por `mensagemAmigavelProva`). Justificativa: é uso inválido do canal, distinto dos avisos de negócio. | §8.3 |
| MEDIUM-7 | MEDIUM | **Endereçada.** `slugTopico` movido para `src/shared/slug.ts` (util puro genérico), fora de `plano.ts`. Serviço do main renomeado `planoCalculo.ts` para não haver dois `plano.ts`. | §5.4, §13 |
| NIT-1 | NIT | **Endereçada.** Removido o número de baseline não conferido; §14 manda rodar `npm test` e fixar a contagem real. | §14 |
| NIT-2 | NIT | **Endereçada.** Corrigido para "header do bloco `provaSelecionada !== null` (Regiões 3/4), ao lado do botão Editar prova". | §8.2 |
| NIT-3 | NIT | **Endereçada.** Especificado: `ehIsoPlausivel` importado de `@shared/cronologia`. | §5.3, §11 |
| NIT-4 | NIT | **Endereçada.** Arredonda só `fracaoBase`; `fracaoNovo = 1 - fracaoBase`. Soma exata. | §6.2 passo 4 |
| NIT-5 | NIT | **Endereçada.** Justificado por que `PlanoEstudo.atualizadoEm` existe (marca "questionário re-respondido" vs. qualquer edição da prova). | §5.5 |
| NIT-6 | NIT | **Endereçada.** Registrado que `"lembrete"` é default de design (não do intent), conservador, e nota para a fatia 4 não gerar sem opt-in. | §5.6 |

---

## 18. Respostas às findings da 2ª rodada de review (`design-review-f2.json`)

Veredito da 2ª rodada: **CHANGES_REQUESTED** — 0 HIGH, 2 MEDIUM, 6 NIT. Todas
endereçadas abaixo. A régua base/novo e o contrato de persistência foram
**confirmados corretos** pela própria revisão; as mudanças concentram-se em §7
(distribuição por dias) e em notas de clareza.

| Finding | Severidade | Resposta | Onde |
|---|---|---|---|
| MEDIUM-1 | MEDIUM | **Endereçada — escolha única, sem "ou".** Adotada a opção (b) do review: `PlanoCalculado.mistura` passou a **opcional** e é **omitida** nos três casos sem plano (`prova_passou`/`sem_topicos`/`sem_dias`); presente só quando há distribuição (sem aviso ou `nao_cabe`). O serviço **não calcula a régua** no ramo `prova_passou`. Tabela de presença/ausência fixada. | §7.1, §7.1.1, §7.2, §7.5 |
| MEDIUM-2 | MEDIUM | **Endereçada — minutos órfãos + algoritmo único.** (1) **Sem minutos órfãos:** os minutos inteiros por tópico agora usam **largest-remainder por camada** (soma exata = `orcCamada`, invariante `Σ minutos = capacidadeTotal`), e o fim-dos-dias com resíduo ≥15 vira caso **"não cabe"** contado em `topicosForaDoPlano` — nenhum minuto some. (2) **Um só algoritmo:** o termo "round-robin" foi **removido**; o preenchimento é **sequential-fill por tópico** com cursor de dia que só avança, descrito passo a passo, com invariante "nenhum dia estoura `capacidadeDia`". Tabela §7.5 ganhou a linha "não cabe por dias esgotados". | §7.3 (passos 4–8), §7.4, §7.5, §12 |
| NIT-1 | NIT | **Endereçada.** Removida a salvaguarda inalcançável do antigo passo 5. Documentado que, com `diasPorSemana ∈ [1,7]`, o índice 0 (amanhã) é sempre útil ⇒ "0 dias úteis com ≥1 dia corrido" nunca ocorre; a única guarda real é `datasEntre` vazio → `sem_dias`. | §7.2 (passos 4–5) |
| NIT-2 | NIT | **Endereçada.** Nomeado o ponto de conversão `NivelDificuldade?→número`: **`nivelParaPeso(n?)`** em `planoCalculo.ts` (`facil→0`, `media→0.5`, `dificil→1`, `undefined→0.5`), citado na tabela de responsabilidades (§1.2), no doc de `dificuldadeBase` (§6.1), na descrição do serviço (§8.3) e nos testes (§12). | §1.2, §6.1, §8.3, §12, §13 |
| NIT-3 | NIT | **Endereçada.** Trocado o exemplo errado (`caminhoOrigem`/`concluida` "em `provas.ts`") pelos reais, conferidos no código: `...(prova.vinculo.tipo === "caderno" ? { cadernoNome } : {})` em `listarProvas` e `...(s.concluida === true ? { concluida: true } : {})` em `salvarSessoes`. Notado que `caminhoOrigem` é de `storage.ts`. | RF1, §5.3 |
| NIT-4 | NIT | **Endereçada.** Explicitado que `salvarPlano` gera **um** timestamp e recarimba **ambos** — `PlanoEstudo.atualizadoEm` e `Prova.atualizadoEm`; a UI "plano montado em {data}" lê o do `PlanoEstudo`. | §8.3 |
| NIT-5 | NIT | **Endereçada.** Ids de tópico digitado à mão passam a ter o prefixo **`manual:`** (`manual:<slug>-<i>`), disjunto do espaço de ids de documento (`randomUUID`); `id` vindo do renderer começando com `manual:` é tratado como reservado e re-derivado. Teste correspondente adicionado. | §5.1, §5.3, §5.4, §12 |
| NIT-6 | NIT | **Endereçada.** Adicionada nota em §14: ao fixar a contagem pós-implementação, usar `npm test` como fonte de verdade e **reconciliar** a divergência AGENTS.md (514) × roadmap-f1 (614). | §14 |

---

> **Próximo passo do pipeline:** nova revisão (ou implementação, se aprovado).
> Esta é a **3ª versão** do design — 1ª rodada (15 findings) em §17 e 2ª rodada
> (8 findings) em §18, todas endereçadas.
