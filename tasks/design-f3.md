# Requisitos + Design — Plano de estudo guiado, Fatia 3/4

> **Quiz diagnóstico (lacuna na base vs. dificuldade no tópico novo) + reordenação do plano.**
> Sub-fatia 3 de 4 da fatia-mãe **Plano de estudo guiado**. Worktree:
> `c:\Dev\.worktrees\plano-f3-diagnostico` (branch `feat/plano-f3-diagnostico`),
> base `master` @ `b4b6cc2`. Fonte de verdade de intent:
> `docs/intent/plano-estudo-guiado.md`. Decisões herdadas (NÃO reabrir):
> `tasks/roadmap-plano-estudo-guiado-f1.md` §5.3 e `tasks/design-f2.md`
> (régua piso/teto, largest-remainder, sequential-fill, `plano?` aditivo em
> `Prova`).
>
> **Fase de DESIGN: nada de código nesta fase.** Zero dependência nova.
> Baseline de testes a conferir rodando `npm test` no worktree ao implementar
> (AGENTS.md cita 673; a contagem real vale, não a de memória).
>
> **Estilo:** cada função pura é descrita como **CONTRATO** (assinatura +
> invariantes + tabela de casos com entradas e saídas) — não como prosa de
> algoritmo. Lição da fatia 2.

---

## 1. Resumo

A fatia 2 entregou um plano que já funciona sozinho (questionário → régua
base/novo → distribuição por dias). Esta fatia acrescenta um **diagnóstico
opcional**: um quiz curto, **só de múltipla escolha**, gerado pelo Ollama a
partir dos documentos dos tópicos do plano, que mede **de onde vem a dificuldade
do aluno**. Uma função pura classifica o resultado (`lacuna_base`,
`dificuldade_novo`, `sem_dificuldade`, `inconclusivo`) e esse veredito entra como
**insumo opcional** da régua já existente, deslocando a mistura base/novo de forma
contínua e limitada. **Sem diagnóstico (ou com veredito inconclusivo/sem
dificuldade/desatualizado) o plano é byte-a-byte o da fatia 2.**

A IA só **gera** perguntas. Ela não rotula base/novo, não classifica, não ordena,
não infere pré-requisitos e não distribui minutos. O rótulo de cada pergunta é
**herdado do tópico** de onde ela nasceu (`TopicoPlano.novo`, já decidido no
questionário).

### 1.1 Fluxo de dados

```
Prova.plano (questionário, fatia 2)
  → ordenarCronologicamente (fatia 1)  → tópicos base→novo
  → [main] carrega texto dos docs (tópicos NÃO manuais)
  → [puro] planejarDiagnostico()  → ≤3 tópicos base + ≤3 tópicos novo, ignorados[]
  → [main] gerarQuiz(modo "multipla", quantidade 5) por tópico (reuso), mantém 3
  → Prova.diagnostico (pendente)  ← persistido (atômico)
  → aluno responde (UI)           → Prova.diagnostico.respostas
  → [puro] classificarDiagnostico(respostas rotuladas) → ResultadoDiagnostico
  → [puro] diagnosticoAplicavel(plano, diagnostico)   → {veredito, intensidade}?
  → [main] montarPlanoCalculado → calcularPlano({... diagnostico?}) → régua ajustada
```

O resultado (`ResultadoDiagnostico`) **não é persistido**: é derivado de
`perguntas + respostas` por função pura, sempre que preciso (main e renderer
importam a mesma função de `src/shared/`). Um estado a menos para ficar
inconsistente.

### 1.2 Responsabilidades (vinculante)

| Responsabilidade | Dono | Como |
|---|---|---|
| Escolher quais tópicos entram e ignorar os sem texto | **puro** `planejarDiagnostico` | recebe a lista ordenada + `Set` dos ids com texto |
| Saber quais ids têm texto | main (`diagnostico.ts`) | `carregarDocumento(id)`; falha/vazio → sem texto |
| Gerar perguntas | main, `gerarQuiz` (reuso) | `modo:"multipla"`, `gerar` injetável |
| Rótulo base/novo da pergunta | main, **herdado** do `TopicoPlano.novo` | nunca inferido pela IA |
| Corrigir | **puro** `pontuarDiagnostico` | múltipla escolha, 100% mecânico |
| Classificar | **puro** `classificarDiagnostico` | limiares em `constants.ts` |
| Decidir se o diagnóstico vale para o plano | **puro** `diagnosticoAplicavel` | assinatura + completude |
| Ajustar a mistura | **puro** `calcularMisturaBaseNovo` (param opcional novo) | §6 |
| Persistir | main `provas.ts` | atômico, aditivo, leitura tolerante |
| Progresso/erros amigáveis | main `ipc/index.ts` | `empurrarProgresso`, `mensagemAmigavelDiagnostico` |

---

## 2. Requisitos funcionais

- **RF1** — O aluno inicia um diagnóstico para uma prova que já tem `plano`.
- **RF2** — O app gera perguntas de múltipla escolha, rotuladas base/novo pelo
  tópico de origem, e mostra progresso da geração.
- **RF3** — O aluno responde (cada pergunta tem a opção explícita "Não sei", que
  conta como erro) e vê o resultado em linguagem simples.
- **RF4** — O resultado ajusta o plano (mistura base/novo) e a UI mostra o plano
  ajustado.
- **RF5** — O diagnóstico é persistido em `Prova` (aditivo); reabrir a prova
  mostra o diagnóstico pendente (responder depois) ou concluído.
- **RF6** — O aluno pode refazer. O diagnóstico anterior só é substituído quando
  um novo foi gerado **com sucesso**.
- **RF7** — Sem diagnóstico, ou com diagnóstico inconclusivo/sem dificuldade/
  desatualizado, o plano é idêntico ao da fatia 2.

## 3. Requisitos não-funcionais

- 100% local; nenhuma dependência nova; renderer só via `getApi()`.
- Classificação e ajuste da distribuição são **puros**, determinísticos, testados
  com entradas fixas. Ollama sempre mockado nos testes.
- Prova/plano antigos (sem o bloco novo) carregam como hoje.
- pt-BR na UI; identificadores em inglês/português já usados no domínio
  (`diagnostico`, `camada`, `veredito`, como `plano`/`topico` na fatia 2).

---

## 4. As decisões pedidas (9 pontos)

### 4.1 Tópico sem documento (ponto 1)

**Decisão:** só tópicos **ligados a documento COM texto** entram. Tópico manual
(`id` começa com `manual:`) e tópico cujo documento sumiu/está vazio ficam de
fora, com aviso na UI e registro em `diagnostico.ignorados[]`. O plano segue
usando neles apenas a dificuldade autodeclarada (nada muda para eles).

**Por quê:** sem texto não há de onde gerar pergunta, e pedir à IA que "invente
perguntas sobre o tema X só pelo título" gera conteúdo não ancorado no material
do aluno (e o app promete orientar pelo material dele). Honestidade > cobertura.

**Caso extremo:** o diagnóstico exige **ao menos um tópico de BASE com texto**
(sem base medida não há como separar "lacuna" de "dificuldade no novo", §5.3).
Não havendo, `gerarDiagnostico` lança `DiagnosticoIndisponivelError` **antes de
chamar a IA**, e a UI já mostra o botão desabilitado com o motivo (pré-checagem
barata no renderer por `ehTopicoManual`, revalidada no main). Mensagem:
"O diagnóstico precisa de ao menos um assunto de base com material importado. Os
assuntos digitados à mão não têm texto para eu criar perguntas. O plano continua
valendo com a dificuldade que você informou." Nada quebra; nada é persistido.

**Só há tópicos novos com documento (base toda manual):** mesmo tratamento
(indisponível).

### 4.2 Orçamento e formato (ponto 2)

**Decisão: só múltipla escolha. Confirmada.** Abertas exigiriam `avaliarLote`
(IA corrigindo IA), e o próprio AGENTS.md registra que o `llama3.1` tende ao
binário e usa pouco o "parcial" — o veredito ficaria não-determinístico. Com
múltipla escolha a correção é `alternativas[escolha].correta`, reaproveitando
`calcularPontuacao` (`quizScore.ts`). `avaliacao.ts` **não é usado** nesta fatia.

**Orçamento fixo (constantes em `constants.ts`):**

| Constante | Valor | Papel |
|---|---|---|
| `DIAG_TOPICOS_POR_CAMADA` | 3 | máx. de tópicos amostrados por camada (base / novo) |
| `DIAG_PERGUNTAS_POR_TOPICO` | 3 | perguntas mantidas por tópico |
| `DIAG_PEDIDO_POR_TOPICO` | `QUANTIDADE_MINIMA` (=5, `types.ts`) | quantidade pedida a `gerarQuiz` |
| `DIAG_TEXTO_MAX` | `tamanhoMaximoChunkCaracteres` (12000) | corte do texto-base |

Máximo: 6 tópicos × 3 = **18 perguntas**, 6 chamadas ao modelo, **todas no
caminho curto** (`quantidade 5 ≤ GERACAO_LOTE_LIMIAR 20`: uma chamada + no máximo
uma corretiva; sem lotes). O texto de cada tópico é cortado em `DIAG_TEXTO_MAX`
(início do documento) — assim `dividirEmChunks` devolve 1 pedaço e `gerarQuiz`
**não** dispara condensação via `gerarResumo` (que adicionaria chamadas lentas).

**Por que pedir 5 e manter 3:** `normalizarQuantidade` (verificado em
`prompts.ts`) eleva qualquer pedido a ≥ 5 (`QUANTIDADE_MINIMA`). Pedir 5 e
descartar excedente é o custo de reusar `gerarQuiz` sem alterá-lo; manter 3
(as 3 primeiras válidas, ordem do modelo) mantém o questionário curto para o
aluno. Alternativas descartadas: reescrever um gerador próprio (viola "reusar,
não reescrever"); manter as 5 (18→30 perguntas; cansativo e não muda o
veredito de forma relevante).

**Tempo:** não medi a latência real do modelo local; o orçamento é o menor que
ainda dá ≥ 3 respostas por camada (§5.3). Se na prática for lento, os dois
números (`DIAG_TOPICOS_POR_CAMADA`, `DIAG_PERGUNTAS_POR_TOPICO`) são ajustáveis
sem mudar contratos.

### 4.3 Rótulo base/novo por pergunta (ponto 3)

**Decisão: herdado do tópico.** Confirmado contra o código:
`TopicoPlano.novo: boolean` já existe e é a verdade do plano (`sanearPlano`
força `false` na 1ª prova). A orquestração gera **por tópico** e carimba cada
pergunta resultante com `{ topicoId, camada: topico.novo ? "novo" : "base" }`.
A IA nunca vê nem devolve o rótulo; o campo não existe no prompt de
`montarPromptQuiz`.

**Orquestração nova por cima do `gerarQuiz`** (risco já mapeado no roadmap f1
§5.3/§5.5): o `Quiz` retornado por `gerarQuiz` tem `documentoId: ""` — é ignorado;
só `perguntas` é usado. O texto-base de um tópico é o `texto` do `Documento` cujo
`id === topico.id` (o questionário usa o id do documento como id do tópico —
verificado em `PlanoEstudo.tsx`: `id: d.id`). Sem coluna de "caderno inteiro":
um tópico = um documento.

### 4.4 Classificação (ponto 4) — ver §5.3 (contrato completo)

Saída tipada: `lacuna_base | dificuldade_novo | sem_dificuldade | inconclusivo`.

### 4.5 Como o diagnóstico entra na distribuição (ponto 5) — ver §6

Altera **apenas** `fracaoBase` da régua, via parâmetro opcional
`diagnostico?: { veredito: "lacuna_base" | "dificuldade_novo"; intensidade: number }`.
Nada mais em `calcularPlano` muda (orçamento, largest-remainder, piso de 15,
sequential-fill, "não cabe" permanecem).

### 4.6 Obrigatório ou opcional (ponto 6)

**Decisão: opcional e incentivado.** O plano da fatia 2 já funciona sem ele (RF7);
forçar um quiz lento de IA local antes de mostrar qualquer plano violaria o
princípio "o app decide, não trava o aluno" e a restrição vinculante do intent
("a distribuição NÃO pode depender do modelo"). Incentivo: card na Agenda, abaixo
do plano, com a frase "Quer um plano mais certeiro? Faça um diagnóstico rápido
(≈18 perguntas de múltipla escolha)". Sem pop-up, sem bloqueio.

### 4.7 Erros e honestidade do modelo local (ponto 7)

- **Modelo:** o handler usa `modeloParaGeracao()` (função interna de
  `ipc/index.ts`, reaproveitada como as demais) e injeta
  `gerar: (prompt, format) => generate({ prompt, model, format })`.
- **Classificação de erro:** igual às demais gerações — `OllamaIndisponivelError`
  (recusa de conexão) → mensagem "Ollama offline"; `GeracaoFalhouError`
  (abort/timeout/falha após conectar) → a mensagem honesta já existente; **nunca**
  "offline" para falha de geração. Tabela completa em §9.
- **Resultado parcial e validade:** o diagnóstico é **válido** se houver
  **≥ `MIN_RESPOSTAS_CAMADA` (3) perguntas de base** após a geração (condição
  necessária para qualquer veredito, §5.3). Se vierem menos perguntas que o
  pedido (`perguntas.length < pedido`), o diagnóstico vale e a UI mostra aviso de
  parcial. Se base < 3 → falha (nada persistido), mensagem honesta.
- **Desvio justificado de `avisoGeracaoParcial`:** o texto dele termina em "…ou
  reduza a quantidade", o que é falso aqui (quantidade fixa, o aluno não
  configura). Reusa-se o **mesmo critério** (`entregue < pedido`) com frase própria
  em `diagnostico.ts`: "Montei {n} de {p} perguntas. O resultado vale, mas é
  menos preciso. Você pode refazer o diagnóstico depois." (Registrado aqui por
  desviar do brief.)
- **Falha no meio:** `GeracaoFalhouError` com ≥1 tópico já gerado → para e usa o
  parcial (base é gerada primeiro, então o parcial tende a conter a base);
  `OllamaIndisponivelError` → sempre aborta tudo.

### 4.8 Refazer e validade (ponto 8)

- **Refazer:** sim, sempre (botão "Refazer diagnóstico", com confirmação inline se
  já há resultado). Gera um novo; **só substitui o anterior se a geração
  terminar com sucesso** (`salvarDiagnostico` é a última etapa). Falha deixa o
  diagnóstico anterior intacto.
- **Validade — regra única e mecânica:** o diagnóstico guarda uma `assinatura` do
  plano (`ordinal` + conjunto `id:novo` dos tópicos **não manuais**). Se a
  assinatura atual do plano ≠ a do diagnóstico, o estado é **`desatualizado`**:
  o diagnóstico **não é aplicado** ao plano (plano da fatia 2) e a UI diz
  "Você mudou os assuntos desde o diagnóstico. Refaça para ajustar o plano."
  Mudanças que **não** invalidam: horas/dia, dias/semana, dificuldade
  autodeclarada, checkpoint, ordem manual, data da prova, tópicos manuais
  (nenhum desses altera quais perguntas existem nem seu rótulo).
- **Sem expiração por tempo** (mais simples; o aluno vê "feito em DD/MM/AAAA").
- `salvarPlano` já faz `{...prova, plano}` — preserva `diagnostico` sem alteração
  (a invalidação é pela assinatura, não por apagar).

### 4.9 O que a IA NÃO faz (ponto 9)

Confirmado: a IA **não** ordena tópicos (`cronologia.ts`), **não** infere
pré-requisitos, **não** rotula base/novo (herdado), **não** classifica o
diagnóstico (`classificarDiagnostico`), **não** distribui minutos
(`calcularPlano`), **não** corrige (múltipla escolha mecânica). Só gera texto de
perguntas/alternativas.

---

## 5. Tipos e funções puras (CONTRATOS)

### 5.1 Tipos (aditivos)

Em `src/shared/types.ts`:

```ts
export type CamadaDiagnostico = "base" | "novo";

/** Pergunta de múltipla escolha rotulada pelo tópico de origem. */
export type PerguntaDiagnostico =
  Extract<PerguntaQuiz, { tipo: "multipla" }> & {
    topicoId: string;
    camada: CamadaDiagnostico;
  };

export type MotivoTopicoIgnorado = "manual" | "sem_texto" | "nao_gerou";
export interface TopicoIgnorado {
  id: string;
  titulo: string;
  motivo: MotivoTopicoIgnorado;
}

/** Bloco opcional e aditivo: ao lado de `plano` em `Prova`. */
export interface DiagnosticoPlano {
  /** Ver `assinaturaPlano` (§5.2). */
  assinatura: string;
  geradoEm: string; // ISO
  perguntas: PerguntaDiagnostico[]; // base primeiro
  /** Nº de perguntas planejadas (tópicos selecionados × DIAG_PERGUNTAS_POR_TOPICO). */
  pedido: number;
  ignorados: TopicoIgnorado[];
  /** Escolhas do aluno, alinhadas a `perguntas`; -1 = "Não sei". Ausente = pendente. */
  respostas?: number[];
  concluidoEm?: string; // ISO; presente sse `respostas` presente
}

export interface Prova {
  // ...existentes...
  diagnostico?: DiagnosticoPlano;
}
```

**Decisão de lar:** `Prova.diagnostico` (irmão de `plano`), **não** dentro de
`PlanoEstudo`. Motivo: `salvarPlano` substitui `plano` inteiro a cada salvar do
questionário; dentro dele o diagnóstico seria apagado por um simples ajuste de
horas/dia. Como irmão, `salvarPlano`/`editarProva` (que fazem `...prova`) o
preservam sem mudança, e a validade é tratada pela assinatura.

Em `src/shared/diagnostico.ts` (novo, **puro**: sem Node/Electron/IA; importa
só `./constants` e `import type ./types`):

```ts
export type VereditoDiagnostico =
  "lacuna_base" | "dificuldade_novo" | "sem_dificuldade" | "inconclusivo";

export interface RespostaDiagnostico {
  topicoId: string;
  camada: CamadaDiagnostico;
  acertou: boolean;
}

export interface ResumoCamada {
  acertos: number;
  total: number;
  /** acertos/total; 0 quando total=0. */
  taxa: number;
  /** total >= MIN_RESPOSTAS_CAMADA. */
  medida: boolean;
}

export interface ResultadoDiagnostico {
  veredito: VereditoDiagnostico;
  base: ResumoCamada;
  novo: ResumoCamada;
  /** 0 salvo em lacuna_base/dificuldade_novo; em [0,1]. */
  intensidade: number;
  /** ids de tópicos da camada problemática com taxa < LIMIAR (ordem da 1ª aparição). */
  topicosFracos: string[];
}
```

Constantes novas em `src/shared/constants.ts` (doc-comment cada, padrão atual):
`DIAG_TOPICOS_POR_CAMADA=3`, `DIAG_PERGUNTAS_POR_TOPICO=3`,
`DIAG_PEDIDO_POR_TOPICO`, `DIAG_TEXTO_MAX`, `MIN_RESPOSTAS_CAMADA=3`,
`LIMIAR_ACERTO_DIAGNOSTICO=0.6`, `PESO_DIAGNOSTICO=0.5`.

### 5.2 Contratos pequenos

**`ehTopicoManual(id: string): boolean`** — `id.startsWith("manual:")`.

**`assinaturaPlano(p: { ordinal: OrdinalProva; topicos: TopicoPlano[] }): string`**
Invariantes: determinística; independe da ordem dos tópicos; ignora tópicos
manuais; muda se mudar `ordinal`, o conjunto de ids não manuais ou o `novo` de
algum.
Formato: `` `${ordinal}|` + ids.map(t => `${t.id}:${t.novo ? 1 : 0}`).sort().join(",") ``.

| Entrada | Saída |
|---|---|
| `segunda`, `[{a,novo:false},{b,novo:true}]` | `"segunda|a:0,b:1"` |
| mesmos, ordem invertida | `"segunda|a:0,b:1"` (igual) |
| mesmos + `{manual:x-2}` | `"segunda|a:0,b:1"` (igual) |
| `b` vira `novo:false` | `"segunda|a:0,b:0"` (diferente) |
| ordinal `final` | `"final|a:0,b:1"` (diferente) |
| sem tópicos não manuais | `"segunda|"` |

**`selecionarTopicosDiagnostico<T extends {id:string}>(ordenados: T[], max: number): T[]`**
Amostra espaçada, determinística, preserva a ordem. Para `n = ordenados.length`:
`n ≤ max` → todos; senão índices `Math.round(i·(n−1)/(max−1))`, `i=0..max−1`
(inclui o primeiro e o último). `max < 1` → `[]`.

| n | max | índices escolhidos |
|---|---|---|
| 0 | 3 | `[]` |
| 2 | 3 | `[0,1]` |
| 3 | 3 | `[0,1,2]` |
| 4 | 3 | `[0,2,3]` (round(1.5)=2) |
| 5 | 3 | `[0,2,4]` |
| 10 | 3 | `[0,5,9]` (round(4.5)=5) |
| 5 | 1 | `[0]` (guarda `max−1=0`: devolve o primeiro) |

**`planejarDiagnostico(ordenados: TopicoPlano[], comTexto: ReadonlySet<string>): PlanoDiagnostico`**

```ts
interface PlanoDiagnostico {
  base: TopicoPlano[];     // amostrados (≤ DIAG_TOPICOS_POR_CAMADA)
  novo: TopicoPlano[];     // amostrados
  ignorados: TopicoIgnorado[];
  indisponivel: boolean;   // base.length === 0
}
```

Regras: manual → ignorado `"manual"`; não manual e `id ∉ comTexto` → ignorado
`"sem_texto"`; os demais (elegíveis) vão para base (`!novo`) ou novo (`novo`) e
cada camada passa por `selecionarTopicosDiagnostico`. Tópico elegível **não
amostrado** (n>3) **não** é "ignorado" — é amostra (a UI diz "amostra de N
assuntos"). `ignorados` na ordem de entrada.

| Caso | Saída |
|---|---|
| 2 base com texto + 1 novo com texto | base 2, novo 1, ignorados `[]`, indisponivel=false |
| 1 base manual + 1 base com texto + 1 novo manual | base 1, novo 0, ignorados `[manual,manual]` |
| só base manuais | base 0 → `indisponivel=true`, ignorados todos `"manual"` |
| base sem texto (doc removido) | ignorado `"sem_texto"`; se era a única base → `indisponivel=true` |
| só novo com texto, base vazia | `indisponivel=true` |
| 1ª prova (tudo `novo:false`) | novo 0, indisponivel=false se houver base elegível |
| 7 base elegíveis | base 3 (índices 0,3,6) |

**`pontuarDiagnostico(perguntas: PerguntaDiagnostico[], escolhas: number[]): RespostaDiagnostico[]`**
Para cada `i`: `acertou = calcularPontuacao([p], [{tipo:"multipla", escolhidaIndice: e}]).acertos === 1`
com `e = escolhas[i]`; `e === -1`, índice fora do intervalo ou ausente ⇒ `false`
(reuso de `quizScore.ts`). Comprimento da saída = `perguntas.length`.

| Entrada | Saída |
|---|---|
| escolha na alternativa `correta` | `acertou:true` |
| escolha em alternativa errada | `false` |
| `-1` ("Não sei") | `false` |
| índice 9 com 4 alternativas | `false` (sem lançar) |
| `escolhas` mais curto que `perguntas` | `false` nas faltantes |

### 5.3 Contrato — `classificarDiagnostico`

```ts
export function classificarDiagnostico(
  respostas: RespostaDiagnostico[],
): ResultadoDiagnostico;
```

**Regras (em ordem; a primeira que casa decide):**

1. Agrega por camada: `acertos`, `total`, `taxa = total>0 ? acertos/total : 0`,
   `medida = total >= MIN_RESPOSTAS_CAMADA`.
2. `!base.medida` → `inconclusivo` (sem base medida não se separa lacuna de
   dificuldade no novo — vale também quando só o novo foi medido).
3. `baseBaixa = base.taxa < LIMIAR_ACERTO_DIAGNOSTICO` (estrito: `taxa == 0.6` NÃO
   é baixa).
4. `baseBaixa` → `lacuna_base` (explica o resto; vale mesmo que o novo também
   esteja baixo ou não tenha sido medido).
5. `novo.medida && novo.taxa < LIMIAR` → `dificuldade_novo`.
6. Caso contrário → `sem_dificuldade` (inclui "base boa e novo não medido": a UI
   avisa que o novo não foi medido; o plano não muda).

`intensidade`: `lacuna_base` → `(L − base.taxa)/L`; `dificuldade_novo` →
`(L − novo.taxa)/L`; demais → `0` (`L = LIMIAR_ACERTO_DIAGNOSTICO`). Em `[0,1]`,
contínua no limiar (taxa→L ⇒ intensidade→0, sem salto para `sem_dificuldade`).
`topicosFracos`: só em `lacuna_base`/`dificuldade_novo`; tópicos da camada
decisiva com taxa do tópico `< L`, em ordem da 1ª aparição em `respostas`.

**Invariantes:** total e determinística (qualquer lista, inclusive `[]`, nunca
lança); não depende da ordem de `respostas` exceto na ordem de `topicosFracos`;
`intensidade ∈ [0,1]`; `veredito ∈ {lacuna_base,dificuldade_novo} ⇔ intensidade>0`
(taxa estritamente abaixo de L ⇒ intensidade estritamente positiva).

**Tabela de casos (notação `B a/t`, `N a/t`; L=0.6, MIN=3):**

| # | Entrada | veredito | intensidade | Observação |
|---|---|---|---|---|
| 1 | `[]` | inconclusivo | 0 | sem respostas |
| 2 | B 7/9, N 8/9 | sem_dificuldade | 0 | caso feliz |
| 3 | B 2/9, N 8/9 | lacuna_base | (0.6−0.2222)/0.6≈0.6296 | só a base cai |
| 4 | B 8/9, N 3/9 | dificuldade_novo | (0.6−0.3333)/0.6≈0.4444 | "só erra no recente" |
| 5 | B 2/9, N 2/9 | lacuna_base | ≈0.6296 | base baixa vence |
| 6 | B 0/9, N 0/9 (tudo errado) | lacuna_base | 1 | |
| 7 | B 9/9, N 9/9 (tudo certo) | sem_dificuldade | 0 | |
| 8 | B 3/5 (=0.6), N 9/9 | sem_dificuldade | 0 | limiar estrito |
| 9 | B 2/5 (=0.4), N 9/9 | lacuna_base | ≈0.3333 | |
| 10 | B 2/2, N 5/5 | inconclusivo | 0 | base com < 3 respostas |
| 11 | camada base sem perguntas; N 3/3 | inconclusivo | 0 | só novo medido |
| 12 | B 5/5, N sem perguntas (1ª prova) | sem_dificuldade | 0 | `novo.medida=false` |
| 13 | B 1/3 (mínimo), N sem perguntas | lacuna_base | ≈0.4444 | |
| 14 | B 5/5, N 1/2 | sem_dificuldade | 0 | novo com 2 respostas = não medido |
| 15 | B 6/9, N 3/6 (=0.5) | dificuldade_novo | ≈0.1667 | |
| 16 | B 5/9 (≈0.556), N 9/9 | lacuna_base | ≈0.0741 | borda baixa, intensidade pequena |
| 17 | B 3/9 com tópicos A 0/3, B 0/3, C 3/3 | lacuna_base | ≈0.4444 | `topicosFracos=[A,B]` |
| 18 | respostas embaralhadas do caso 3 | igual ao caso 3 | igual | ordem irrelevante |

### 5.4 Contrato — `diagnosticoAplicavel` e `estadoDiagnostico`

```ts
export type AjusteDiagnostico = {
  veredito: "lacuna_base" | "dificuldade_novo";
  intensidade: number; // (0,1]
};

export type EstadoDiagnostico =
  "nenhum" | "pendente" | "concluido" | "desatualizado";

export function estadoDiagnostico(
  plano: PlanoEstudo | undefined,
  d: DiagnosticoPlano | undefined,
): EstadoDiagnostico;

export function diagnosticoAplicavel(
  plano: PlanoEstudo | undefined,
  d: DiagnosticoPlano | undefined,
): AjusteDiagnostico | undefined;

export function resultadoDoDiagnostico(
  d: DiagnosticoPlano,
): ResultadoDiagnostico | undefined; // undefined se pendente
```

`estadoDiagnostico`: `d` ausente ou `plano` ausente → `nenhum`; assinatura ≠
`assinaturaPlano(plano)` → `desatualizado`; senão `respostas` ausente (ou
comprimento ≠ `perguntas.length`) → `pendente`; senão `concluido`.
`diagnosticoAplicavel`: `estado === "concluido"` **e** veredito ∈
{lacuna_base, dificuldade_novo} **e** `intensidade > 0` → `{veredito,
intensidade}`; qualquer outra coisa → `undefined`.
`resultadoDoDiagnostico` = `classificarDiagnostico(pontuarDiagnostico(d.perguntas, d.respostas))`.

| plano | diagnostico | estado | aplicável |
|---|---|---|---|
| ausente | qualquer | nenhum | undefined |
| presente | ausente | nenhum | undefined |
| presente | assinatura igual, sem respostas | pendente | undefined |
| presente | assinatura igual, respostas completas, lacuna_base | concluido | `{lacuna_base, i}` |
| presente | idem, sem_dificuldade | concluido | undefined |
| presente | idem, inconclusivo | concluido | undefined |
| presente | assinatura diferente (tópico virou novo) | desatualizado | undefined |
| presente | respostas com comprimento ≠ perguntas | pendente | undefined |

### 5.5 Textos puros para a UI (testáveis)

`fraseResultadoDiagnostico(r: ResultadoDiagnostico, titulos: ReadonlyMap<string,string>): string`
e `fraseDiagnosticoParcial(entregue, pedido): string | null`, e
`rotuloProgressoDiagnostico(p: ProgressoGeracao): string` ("Preparando as
perguntas: assunto {prontos} de {total}…"; `prontos`/`total` aqui contam
**tópicos**, não perguntas — por isso rótulo próprio, o `rotuloProgresso` diz
"Gerando 2 de 6" que seria ambíguo).

Frases (pt-BR, linguagem simples, sem prometer nada da prova):
- `lacuna_base`: "Sua dificuldade parece estar na base. Você acertou {a} de {t}
  perguntas dos conteúdos anteriores{; os pontos mais fracos: X, Y}. Por isso o
  plano dá mais tempo à base antes do conteúdo novo."
- `dificuldade_novo`: "A base está firme ({a} de {t}). A dificuldade parece
  estar no conteúdo novo ({a} de {t}). O plano reservou mais tempo para ele."
- `sem_dificuldade`: "Você foi bem nas perguntas. O plano continua como estava."
  (+ " Não deu para medir o conteúdo novo." se `!novo.medida` e havia/poderia
  haver novo — a UI passa a informação; o texto é neutro).
- `inconclusivo`: "Não deu para tirar uma conclusão (poucas perguntas sobre a
  base). O plano continua como estava."
Toda frase termina contextualizada como orientação de estudo (a UI mostra a nota
fixa "Isto é uma orientação de estudo, não uma previsão da prova.").

---

## 6. Integração com a régua e com `calcularPlano` (ponto 5)

### 6.1 Contrato da mudança em `calcularMisturaBaseNovo`

```ts
export interface MisturaBaseNovoParams {
  // ...existentes inalterados...
  /** Opcional. Ausente ⇒ resultado IDÊNTICO ao da fatia 2. */
  diagnostico?: AjusteDiagnostico;
}
```

Acréscimo ao final do **Passo 3** (depois de `baseAjustada`, antes do Passo 4),
somente se `diagnostico !== undefined`:

```
i = clamp(finito(diagnostico.intensidade) ? diagnostico.intensidade : 0, 0, 1)
lacuna_base      : baseFinal = baseAjustada + PESO_DIAGNOSTICO · i · (TETO_BASE − baseAjustada)
dificuldade_novo : baseFinal = baseAjustada − PESO_DIAGNOSTICO · i · (baseAjustada − PISO_BASE)
```

e o Passo 4 usa `baseFinal`. O Passo 0 (degenerações `totalBase==0`/`totalNovo==0`)
continua **antes** de tudo ⇒ diagnóstico não tem efeito sem os dois lados (1ª
prova, ou só um lado). `calcularPlano` ganha `diagnostico?: AjusteDiagnostico` em
`CalcularPlanoParams` e apenas o repassa à régua; **o restante do algoritmo
(orçamento, piso de 15, largest-remainder, sequential-fill, "não cabe",
terminação) não é tocado** — por construção, as invariantes da fatia 2 valem,
pois só muda `fracaoBase`, que já variava em `[PISO_BASE, TETO_BASE]`.

### 6.2 Propriedades (testáveis)

- **Identidade:** `diagnostico` ausente, ou `intensidade = 0` ⇒ resultado
  **idêntico** (`toEqual`) ao sem o parâmetro, para qualquer entrada.
- **Limites:** com ambos os lados > 0, `fracaoBase ∈ [PISO_BASE, TETO_BASE]` ⇒ o
  novo **nunca zera** (prova perto) e a base nunca toma tudo.
- **Monotonia em `intensidade`** (resto fixo): `lacuna_base` ⇒ `fracaoBase`
  não-decrescente; `dificuldade_novo` ⇒ não-crescente. Ordem entre vereditos:
  `fracaoBase(dificuldade_novo,i) ≤ fracaoBase(sem diag) ≤ fracaoBase(lacuna_base,i)`.
- **Continuidade:** função contínua em `intensidade` (e em `diasRestantes`, como
  já era). Sem saltos no limiar de classificação (intensidade →0 na borda).
- **Modulação pelo tempo (intent):** o efeito de `lacuna_base` é **menor perto da
  prova** em valor absoluto de base já alta (teto) e a base sobe **sem passar de
  `TETO_BASE`**; perto da prova o novo continua dominante (ver tabela).
- **Invariantes da fatia 2 (reexecutadas com diagnóstico):** conservação de minutos conforme o §7.3 da fatia 2 (nenhum minuto some em silêncio); nenhum
  dia excede `capacidadeDia`; todo bloco ≥ 15; terminação de `resolverCamada`.

### 6.3 Tabela de casos da régua (ambos os lados > 0; dificuldadeBase=0 salvo indicado)

| diasRestantes | diagnóstico | `fracaoBase` esperado |
|---|---|---|
| 15 | nenhum | 0.475 (fatia 2) |
| 15 | lacuna_base i=1 | 0.475+0.5·1·(0.8−0.475)=**0.6375** |
| 15 | lacuna_base i=0.4 | 0.475+0.5·0.4·0.325=**0.54** |
| 15 | lacuna_base i=0 | 0.475 (identidade) |
| 15 | dificuldade_novo i=1 | 0.475−0.5·1·(0.475−0.15)=**0.3125** |
| 0 (hoje) | lacuna_base i=1 | 0.15+0.5·0.65=**0.475** (novo ainda 0.525) |
| 0 (hoje) | dificuldade_novo i=1 | **0.15** (já no piso; sem efeito) |
| ≥30 | lacuna_base i=1 | **0.8** (já no teto; sem efeito) |
| ≥30 | dificuldade_novo i=1 | 0.8−0.5·0.65=**0.475** |
| 15, dificuldadeBase=1 (base ajustada 0.6375) | lacuna_base i=1 | 0.6375+0.5·0.1625=**≈0.7188** |
| 15, dificuldadeBase=1 | dificuldade_novo i=1 | 0.6375−0.5·0.4875=**≈0.3938** |
| qualquer, `totalNovo=0` | lacuna_base i=1 | `{1, 0}` (passo 0) |
| qualquer, `totalBase=0` | dificuldade_novo i=1 | `{0, 1}` (passo 0) |
| 15 | lacuna_base i=NaN | 0.475 (i tratado como 0) |
| 15 | lacuna_base i=2 | igual a i=1 (clamp) |

(Valores não exatos em binário devem ser comparados com `toBeCloseTo(x, 3)`.)

**"Adiar o novo" (intent):** a distribuição já preenche base antes de novo
(sequential-fill, fatia 2). Subir `fracaoBase` aumenta o orçamento da base, que
consome mais dias iniciais e empurra o início do novo para mais tarde — é
exatamente o "insere a base antes do novo, adiando o novo", sem novo mecanismo.

### 6.4 Wiring no main

`montarPlanoCalculado(prova, hoje)` (já em `planoCalculo.ts`): após montar
`params`, acrescenta
`...(ajuste ? { diagnostico: ajuste } : {})` onde
`ajuste = diagnosticoAplicavel(prova.plano, prova.diagnostico)`, e anexa ao
retorno `diagnosticoAplicado?: AjusteDiagnostico` em `PlanoCalculado` (spread
condicional; a UI usa para "plano ajustado pelo diagnóstico"). O ramo
`prova_passou` retorna antes e **não** aplica nem anexa. `calcularPlano`
(puro) não importa `diagnostico.ts`: `AjusteDiagnostico` é definido em `plano.ts`
e reexportado/importado por `diagnostico.ts` (sem ciclo).

---

## 7. Orquestração da geração (`src/main/services/diagnostico.ts`, novo)

### 7.1 Contrato

```ts
export interface GerarDiagnosticoParams {
  plano: PlanoEstudo;
  /** null = documento ausente ou sem texto. Injetável (testes). */
  carregarTexto: (documentoId: string) => Promise<string | null>;
  gerar?: GerarTexto;                    // injetável: mock do Ollama
  aoProgresso?: AoProgresso;             // (topicosProntos, topicosPlanejados)
  agora: string;                         // ISO, injetado (sem relógio)
}
export function gerarDiagnostico(p: GerarDiagnosticoParams): Promise<DiagnosticoPlano>;
```

Passos: (1) ordena `plano.topicos` com o **mesmo helper** de `planoCalculo.ts`
(extrair `ordenarTopicosDoPlano(plano)` exportado — refator pura sem mudar
comportamento, coberta pelos testes atuais de `planoCalculo`); (2) para cada
tópico **não manual**, `carregarTexto(id)` → monta `comTexto` (o texto é cortado
em `DIAG_TEXTO_MAX` e `trim`; vazio ⇒ sem texto); (3) `planejarDiagnostico`;
(4) `indisponivel` ⇒ `DiagnosticoIndisponivelError`; (5) para cada tópico
planejado, **base primeiro**, `gerarQuiz({texto, modo:"multipla", quantidade:
DIAG_PEDIDO_POR_TOPICO, gerar})`, mantém as `DIAG_PERGUNTAS_POR_TOPICO`
primeiras, carimba `{topicoId, camada}`, chama `aoProgresso(feitos, total)` após
cada tópico (sucesso **ou** ignorado); (6) valida `perguntas base ≥
MIN_RESPOSTAS_CAMADA`; (7) devolve `DiagnosticoPlano` pendente com
`assinatura = assinaturaPlano(plano)`, `pedido = nº de tópicos planejados ×
DIAG_PERGUNTAS_POR_TOPICO`, `ignorados` (planejamento + `nao_gerou`).

`gerarQuiz` **não é alterado**. Reuso confirmado: `format:"json"`, `parseQuiz`
tolerante, validação (≥2 alternativas, exatamente 1 correta), re-tentativa
corretiva, dedup irrelevante no caminho curto.

### 7.2 Persistência (`provas.ts`)

- `salvarDiagnostico(id, d, assinaturaUsada, baseDir?)`: recarrega a prova;
  se `prova.plano` ausente **ou** `assinaturaPlano(prova.plano) !==
  assinaturaUsada` ⇒ `DadosProvaInvalidosError("Os assuntos do plano mudaram
  enquanto eu preparava o diagnóstico. Tente de novo.")` (nada gravo). Senão
  grava `{...prova, diagnostico: d, atualizadoEm}` via `escreverProva` (`.tmp` +
  rename). **Substitui** o anterior (refazer).
- `registrarRespostasDiagnostico(id, escolhas, agora, baseDir?)`: exige
  `prova.diagnostico` e `escolhas` como array com `length === perguntas.length`,
  cada item inteiro em `[-1, alternativas.length−1]`; senão
  `DadosProvaInvalidosError("Responda todas as perguntas para ver o
  resultado.")`. Grava `respostas`/`concluidoEm` (spread; não recria o bloco).
  Responder de novo (diagnóstico já concluído) sobrescreve respostas — permitido.
- `sanearDiagnosticoPersistido(bruto: unknown): DiagnosticoPlano | undefined`
  (leitura tolerante), aplicada em `carregarProva` **somente se a chave
  `diagnostico` existir** (prova antiga sem a chave volta idêntica a hoje).
  Regras: não-objeto ⇒ `undefined`; `assinatura`/`geradoEm` strings; `perguntas`
  filtradas por validade (`topicoId` string, `camada ∈ {base,novo}`, enunciado
  não vazio, 2..6 alternativas, exatamente 1 correta); sem perguntas válidas ⇒
  `undefined`; se alguma pergunta foi descartada **ou** `respostas` não é array
  de inteiros em faixa com comprimento = `perguntas.length` ⇒ `respostas` e
  `concluidoEm` são **omitidas** (volta a pendente — nunca desalinha);
  `pedido` inteiro ≥ 1 senão `perguntas.length`; `ignorados` filtrado por
  forma/motivo. Nunca lança. Chaves opcionais por spread condicional (nunca
  `undefined` gravado).
- `salvarPlano`, `editarProva`, `salvarSessoes`, `regerarAgenda`: **sem mudança**
  (todos fazem `...prova`).

---

## 8. Contrato IPC (cadeia `ipc.ts` → `preload.ts` → `ipc/index.ts` → `api.ts`)

| Canal (`IPC_CHANNELS`) | Método em `window.api` | Entrada | Saída |
|---|---|---|---|
| `prova:gerar-diagnostico` | `gerarDiagnostico(id)` | id da prova | `Prova` (com `diagnostico` pendente) |
| `prova:responder-diagnostico` | `responderDiagnostico(id, escolhas)` | `number[]` | `Prova` (com respostas) |

Progresso: reusa o canal `geracao.progresso` com `artefato: "diagnostico"`
(extensão **aditiva** de `ArtefatoLote` em `geracaoLotes.ts`; Quiz/Exercícios
filtram por igualdade e não são afetados). Handler: `empurrarProgresso(event,
"diagnostico")`.

Handler `gerarDiagnostico`: guarda em memória `emGeracao: Set<string>` (segunda
chamada para a mesma prova durante a geração ⇒ erro "Já estou preparando o
diagnóstico desta prova."; sempre liberada em `finally`); `carregarProva`;
`plano` ausente ⇒ `DadosProvaInvalidosError("Monte o plano de estudo antes de
fazer o diagnóstico.")`; `model = await modeloParaGeracao()`;
`carregarTexto = async id => { try { const d = await carregarDocumento(id);
return d.texto } catch (DocumentoNaoEncontradoError) { return null } }`;
`gerarDiagnostico(...)`; `salvarDiagnostico(...)`. Qualquer erro →
`throw new Error(mensagemAmigavelDiagnostico(erro))`.

O renderer **nunca** recebe nem envia o rótulo/veredito: envia só `escolhas`;
corrigir/classificar acontece a partir do que está **persistido** (o cliente não
pode forjar rótulos). (As alternativas corretas vão ao renderer, como já ocorre no
Quiz atual — o diagnóstico é autoavaliação local, sem adversário.)

---

## 9. Erros — recuperável, mensagem, log

| Condição | Tipo | Recuperável? | O que o chamador recebe | Persiste? |
|---|---|---|---|---|
| Ollama recusou conexão | `OllamaIndisponivelError` (propagado) | sim (ligar Ollama) | mensagem "offline" existente | não |
| Timeout/abort/falha após conectar, **nada gerado ainda** | `GeracaoFalhouError` (propagado) | sim | mensagem honesta existente (nunca "offline") | não |
| `GeracaoFalhouError` após ≥1 tópico gerado | capturado | — | segue com o parcial; se base ≥ 3 ⇒ sucesso com aviso de parcial; senão relança o `GeracaoFalhouError` | só se válido |
| `QuizInvalidoError` num tópico | capturado | — | tópico vira `ignorados[{motivo:"nao_gerou"}]` | — |
| `SemTextoParaQuizError` num tópico | capturado | — | `ignorados[{motivo:"sem_texto"}]` | — |
| Base com < 3 perguntas ao fim (sem erro de infra) | `DiagnosticoInsuficienteError` | sim (tentar de novo) | "Não consegui montar perguntas suficientes sobre a base. Tente de novo em instantes." | não |
| Sem tópico de base com texto | `DiagnosticoIndisponivelError` | não (até importar/vincular) | mensagem do §4.1 | não |
| Prova sem `plano` | `DadosProvaInvalidosError` | sim | "Monte o plano de estudo antes de fazer o diagnóstico." | não |
| Plano mudou durante a geração | `DadosProvaInvalidosError` | sim | frase do §7.2 | não |
| `escolhas` inválidas | `DadosProvaInvalidosError` | sim | "Responda todas as perguntas para ver o resultado." | não |
| Prova inexistente | `ProvaNaoEncontradaError` | não | mensagem existente | — |
| Geração concorrente da mesma prova | `Error` | sim | "Já estou preparando o diagnóstico desta prova." | — |
| Qualquer outro erro inesperado | genérico | — | "Não foi possível preparar o diagnóstico. Tente novamente." | não |

Log: o projeto não tem logger estruturado nos serviços; seguir o padrão atual
(sem log extra). Erros de infra já carregam mensagem pronta. A UI mostra erros
com `role="alert"`.

**Validação de entradas externas:** `provaId` string (inexistente ⇒ erro acima);
`escolhas` array de inteiros em `[-1, nAlt−1]` com `length === perguntas.length`
(rejeita senão); nada vindo do renderer define rótulo, veredito ou perguntas.

---

## 10. UI (renderer)

Novo `src/renderer/views/Diagnostico.tsx`, montado em `Agenda.tsx` **abaixo** da
seção do plano, visível quando `provaSelecionada.plano !== undefined`, com props
`{ prova: Prova; aoAtualizar: (p: Prova) => void }`. Fala com o main só por
`getApi()`. Máquina de estados local:

| `estadoDiagnostico` / ação | O que o aluno vê |
|---|---|
| `nenhum` | Card "Quer um plano mais certeiro?" + botão **Fazer diagnóstico**. Se a pré-checagem falhar (nenhuma base não manual): botão desabilitado e texto do motivo (`aria-describedby`). Aviso "N assunto(s) digitado(s) à mão ficam de fora" quando houver. |
| gerando | `role="status"` `aria-live="polite"`: rótulo de progresso (`rotuloProgressoDiagnostico`); botão desabilitado. Assina `aoProgressoGeracao` ANTES do `await`, filtra `artefato==="diagnostico"`, cancela no `finally` (padrão de `Quiz.tsx`). |
| `pendente` | Perguntas em `<fieldset>/<legend>`, alternativas em `<input type="radio">` + opção **"Não sei"**; botão **Ver resultado** só habilita com todas respondidas. Aviso de parcial (se `perguntas.length < pedido`) e de ignorados. |
| `concluido` | `fraseResultadoDiagnostico`, nota "orientação de estudo, não previsão", "Feito em DD/MM/AAAA", e o **plano ajustado**: `PlanoPrevia` com `getApi().calcularPlano(id)` (mostra `diagnosticoAplicado` como "Plano ajustado pelo diagnóstico"). Botão **Refazer diagnóstico** (confirmação inline). |
| `desatualizado` | Aviso "Você mudou os assuntos desde o diagnóstico; o plano voltou ao cálculo normal. Refaça para ajustar." + **Refazer**. |
| erro | `<p className="agenda-erro" role="alert">` com a mensagem; diagnóstico anterior (se houver) permanece. |

**Refator mínimo para reuso:** extrair o JSX/helpers da prévia
(`PlanoEstudo.tsx` linhas da `<section className="plano-previa">`,
`fraseAviso`, `formatarMinutos`, `formatarData`) para `PlanoPrevia.tsx`,
presentacional; `PlanoEstudo.tsx` passa a usá-lo sem mudar comportamento. Só
mover, sem reescrever (renderer não tem testes automatizados de componente neste
projeto; a verificação é build + lint + manual — ver §13.5).

Estilo: classes e tokens existentes (`agenda-erro`, `app-meta`, `plano-previa*`);
radios com `:focus-visible` do tema; nenhum valor de cor literal. Tema
claro/escuro por tokens.

---

## 11. Tabela de casos de borda — COBERTO vs NÃO COBERTO

| Caso | Tratamento | Coberto? |
|---|---|---|
| Camada sem perguntas (novo, na 1ª prova) | classificação só pela base | ✅ |
| Camada base sem perguntas | `inconclusivo` | ✅ |
| Poucas respostas por camada (< 3) | camada "não medida"; base → inconclusivo; novo → ignorado | ✅ |
| Empate / taxa exatamente no limiar (0.6) | não é "baixa" (estrito) | ✅ |
| Tudo certo / tudo errado | `sem_dificuldade` / `lacuna_base` i=1 | ✅ |
| 1ª prova (tudo base) | régua passo 0 ⇒ diagnóstico não altera nada além do veredito exibido | ✅ |
| Tópico manual / documento removido / texto vazio | ignorado com motivo + aviso | ✅ |
| Nenhum tópico de base com texto | indisponível, antes de chamar a IA | ✅ |
| Geração parcial | válida se base ≥ 3 perguntas; aviso próprio | ✅ |
| Falha de geração vs. Ollama offline | mensagens distintas (§9) | ✅ |
| Falha no meio, com algo gerado | parcial se base ≥ 3 | ✅ |
| Plano mudou (assuntos) após diagnóstico | `desatualizado`, não aplica | ✅ |
| Plano mudou **durante** a geração | descarta, erro claro | ✅ |
| Duplo clique / geração concorrente | guard em memória + botão desabilitado | ✅ |
| Prova/plano antigos sem o bloco | carregam como hoje | ✅ |
| Bloco corrompido no JSON | `sanearDiagnosticoPersistido` descarta/volta a pendente | ✅ |
| Fechar o app no meio das respostas | diagnóstico pendente persistido; respostas só gravam ao concluir | ✅ (respostas parciais **não** são salvas) |
| Aluno pula pergunta | UI exige resposta; "Não sei" = erro explícito | ✅ |
| Prova já passou | `calcularPlano` não aplica/anexa diagnóstico | ✅ |
| Diagnóstico só mede o início do documento (corte 12000 chars) | — | ❌ NÃO coberto (amostra do começo) |
| Amostra de ≤3 tópicos por camada (não cobre todos os tópicos) | UI diz "amostra" | ❌ NÃO coberto (por desenho) |
| Pergunta ambígua / alternativa errada gerada pelo modelo | só valida forma (1 correta) | ❌ NÃO coberto (limitação do modelo local) |
| Viés de posição da alternativa correta | sem embaralhar | ❌ NÃO coberto |
| Chute (acerto ao acaso) | 3 respostas/camada mínimo, limiar 0.6 reduzem mas não eliminam | ❌ NÃO coberto (ruído estatístico) |
| Diagnóstico por tópico individual para o plano | só a mistura base/novo muda | ❌ NÃO coberto (fora do escopo) |
| Expiração por tempo | não existe | ❌ NÃO coberto |
| Perguntas abertas / correção por IA | fora do escopo | ❌ NÃO coberto |
| Corrida load→write entre `salvarPlano` e `salvarDiagnostico` | operações curtas num só processo; mitigada pela checagem de assinatura | ❌ NÃO coberta formalmente |
| Latência real do modelo local no orçamento escolhido | não medida | ❌ NÃO verificado (verificar manualmente na aceitação) |

---

## 12. Fora de escopo

- Checkpoints/exercícios e preferência automático vs. lembrete (**fatia 4**).
- Ajuste por tópico individual, ordem de estudo por diagnóstico, pré-requisitos.
- Perguntas abertas, `avaliarLote`, qualquer decisão de IA sobre estrutura.
- Lista curada ENEM/ENADE; internet.
- Histórico de múltiplos diagnósticos (só o último é mantido).
- Persistir resultado derivado (é recalculado).

## 13. Testes planejados

Todos com **Ollama mockado** (`gerar` injetado); disco em `tmpdir`.

### 13.1 `tests/shared/diagnostico.test.ts` (puro)

- `ehTopicoManual`, `assinaturaPlano` (tabela §5.2: ordem, manuais ignorados,
  `novo`/`ordinal` mudando).
- `selecionarTopicosDiagnostico` (tabela §5.2, incluindo `max<1`).
- `planejarDiagnostico` (tabela §5.2: manual, sem texto, só base manual ⇒
  indisponível, só novo, 1ª prova, amostra de 7).
- `pontuarDiagnostico` ("Não sei", índice fora, `escolhas` curto).
- `classificarDiagnostico`: **os 18 casos da tabela §5.3** (camada sem
  perguntas, empate/limiar, 1ª prova sem novo, poucas respostas, tudo certo, tudo
  errado, ordem embaralhada) + invariantes (`intensidade ∈ [0,1]`, veredito
  aplicável ⇔ intensidade>0, nunca lança com `[]`).
- `estadoDiagnostico` / `diagnosticoAplicavel` / `resultadoDoDiagnostico`
  (tabela §5.4).
- `fraseResultadoDiagnostico` por veredito (inclui lista de tópicos fracos),
  `fraseDiagnosticoParcial` (`null` quando completo), `rotuloProgressoDiagnostico`.

### 13.2 `tests/shared/plano.test.ts` (acrescentar; **não alterar os existentes**)

- **Regressão:** grade de entradas (dias {0,1,7,15,30,60} × dificuldade {0,0.5,1}
  × totais {(1,1),(3,2),(0,2),(2,0)}): `calcularMisturaBaseNovo` e `calcularPlano`
  com `diagnostico` ausente e com `{..., intensidade:0}` `toEqual` ao resultado
  sem o parâmetro; os testes atuais da fatia 2 passam sem edição.
- Tabela §6.3 inteira (`toBeCloseTo`).
- Monotonia em `intensidade` (varrer 0..1 passo 0.1) para os dois vereditos;
  ordenação `novo ≤ sem ≤ lacuna`.
- Limites: ambos > 0 ⇒ `fracaoBase ∈ [PISO,TETO]` e `fracaoNovo > 0` com prova
  hoje + `lacuna_base` i=1.
- Invariantes da fatia 2 com diagnóstico (grade): nenhum dia > `capacidadeDia`;
  todo bloco ≥ 15; conservação de minutos (soma dos blocos = soma esperada pelos
  orçamentos − resíduos declarados em `nao_cabe`); terminação (o teste conclui).
- `i=NaN`, `i=2`, `i=-1` (sanitização).

### 13.3 `tests/main/services/diagnostico.test.ts` (orquestração; `gerar` mock)

- Caminho feliz: 2 base + 1 novo com texto ⇒ perguntas rotuladas pelo tópico
  (verificar que o rótulo vem de `TopicoPlano.novo`, não do JSON da IA — o mock
  devolve JSON com campo `camada: "novo"` em pergunta de tópico base e o resultado
  continua `base`), 3 por tópico, base antes de novo, `assinatura` correta,
  `aoProgresso` chamado `(1,3),(2,3),(3,3)`.
- Tópico manual ignorado com `motivo:"manual"`; documento ausente ⇒ `sem_texto`.
- Nenhum tópico de base com texto ⇒ `DiagnosticoIndisponivelError` e **`gerar`
  nunca chamado**.
- Parcial: um tópico devolve 2 perguntas ⇒ válido, `pedido > perguntas.length`.
- Tópico cujo `gerar` devolve lixo duas vezes ⇒ ignorado `nao_gerou`, demais ok.
- Base < 3 perguntas ⇒ `DiagnosticoInsuficienteError`.
- `OllamaIndisponivelError` no 1º tópico ⇒ propaga (offline); idem no meio.
- `GeracaoFalhouError` no 1º ⇒ propaga (e a mensagem **não** é "offline");
  no 3º com base já ≥ 3 ⇒ parcial válido; no 2º com base < 3 ⇒ relança.
- Texto enorme é cortado em `DIAG_TEXTO_MAX` (assert: `gerar` nunca recebe prompt
  de condensação/resumo; nº de chamadas = 1 por tópico no caminho feliz).

### 13.4 `tests/main/services/provas.test.ts` (acrescentar) e `planoCalculo.test.ts`

- Round-trip: `salvarDiagnostico` → `carregarProva` ⇒ igual; `registrarRespostas…`
  → `respostas`/`concluidoEm` presentes; arquivo sem `.tmp` órfão.
- **Prova ANTIGA** (JSON sem `diagnostico`, sem `plano`; e com `plano` sem
  `diagnostico`) carrega idêntica e `montarPlanoCalculado` igual ao da fatia 2.
- Bloco corrompido (`diagnostico: "x"`, perguntas inválidas, `respostas`
  desalinhadas) ⇒ descartado/pendente, sem lançar; chaves `undefined` nunca
  gravadas.
- `salvarPlano` preserva `diagnostico`; mudar horas/dia **não** invalida; mudar
  `novo` de um tópico ⇒ `desatualizado`.
- `salvarDiagnostico` com assinatura divergente ⇒ erro e arquivo intacto.
- `registrarRespostas…` com `length` errado / índice fora ⇒ `DadosProvaInvalidos`.
- `montarPlanoCalculado`: com diagnóstico `lacuna_base` ⇒ `mistura.fracaoBase`
  maior que sem; `diagnosticoAplicado` presente; desatualizado/inconclusivo/
  pendente ⇒ resultado `toEqual` ao sem diagnóstico; prova passada ⇒ sem
  `diagnosticoAplicado`.
- Mensagens: `mensagemAmigavelDiagnostico` (se exportada para teste, ou testada
  via handler como as demais) distingue offline × falha × indisponível ×
  insuficiente.

### 13.5 Não automatizado (verificação manual na aceitação, dizer no relatório)

UI do `Diagnostico.tsx`/`PlanoPrevia.tsx` (build + lint verificam tipos; fluxo
visual, foco/teclado dos radios, tema claro/escuro e latência real do Ollama
local **não** são cobertos por teste). Usar a pasta `Facul` apenas como
leitura.

---

## 14. Arquivos a criar/modificar

**Novos:** `src/shared/diagnostico.ts`; `src/main/services/diagnostico.ts`;
`src/renderer/views/Diagnostico.tsx`; `src/renderer/views/PlanoPrevia.tsx`;
`tests/shared/diagnostico.test.ts`; `tests/main/services/diagnostico.test.ts`.

**Modificados:** `src/shared/types.ts` (tipos §5.1, `Prova.diagnostico?`);
`src/shared/constants.ts` (7 constantes); `src/shared/plano.ts`
(`AjusteDiagnostico`, param opcional na régua e em `calcularPlano`,
`PlanoCalculado.diagnosticoAplicado?`); `src/shared/geracaoLotes.ts`
(`ArtefatoLote` += `"diagnostico"`); `src/shared/ipc.ts`, `src/main/preload.ts`,
`src/main/ipc/index.ts`, `src/renderer/api.ts` (2 canais + handler + mensagens
amigáveis); `src/main/services/provas.ts` (`salvarDiagnostico`,
`registrarRespostasDiagnostico`, `sanearDiagnosticoPersistido` em
`carregarProva`); `src/main/services/planoCalculo.ts` (extrair
`ordenarTopicosDoPlano`; aplicar `diagnosticoAplicavel`);
`src/renderer/views/PlanoEstudo.tsx` (usar `PlanoPrevia`);
`src/renderer/views/Agenda.tsx` (montar `Diagnostico`); `src/renderer/styles.css`
(se faltar classe, só com tokens).

Estilo de testes conferir contra `tests/shared/plano.test.ts` e
`tests/main/services/planoCalculo.test.ts`.

**Ordem de implementação sugerida (4 commits, cada um verde):**
1. constantes + tipos + `shared/diagnostico.ts` + testes puros (§13.1).
2. régua/`calcularPlano` com `diagnostico?` + testes (§13.2) — regressão primeiro.
3. persistência + `services/diagnostico.ts` + `planoCalculo` + testes (§13.3–13.4).
4. IPC + UI (+ extração `PlanoPrevia`) + docs.

**Dependência nova:** nenhuma.

**Documentação (regra do projeto):** ao entregar, atualizar `tasks/PROGRESSO.md`,
`tasks/todo.md` e `README.md` (seção do usuário: "Diagnóstico rápido" no plano de
estudo), com HEAD e contagem de testes reais.

## 15. Resumo das decisões

1. Só tópicos **com documento e texto** entram; manuais ficam de fora com aviso; sem base com texto ⇒ indisponível antes de chamar a IA.
2. **Só múltipla escolha**, mecânica; ≤3 tópicos/camada × 3 perguntas = ≤18, pedido 5 por tópico (mínimo de `gerarQuiz`), sempre caminho curto, texto cortado em 12000 chars.
3. Rótulo **herdado** de `TopicoPlano.novo`; a IA não vê nem devolve rótulo.
4. `classificarDiagnostico` puro: limiar 0.6 estrito, ≥3 respostas por camada, base baixa ⇒ `lacuna_base`, senão novo baixo ⇒ `dificuldade_novo`, senão `sem_dificuldade`; base não medida ⇒ `inconclusivo`.
5. Entra na régua como `diagnostico?` que só desloca `fracaoBase` (±`PESO_DIAGNOSTICO`·intensidade da folga até teto/piso); ausente ou intensidade 0 ⇒ idêntico à fatia 2; novo nunca zera.
6. Diagnóstico **opcional e incentivado**.
7. Erros: offline × falha distintos; válido com base ≥ 3 perguntas; parcial avisado com frase própria (a de `avisoGeracaoParcial` fala em "reduzir quantidade", inaplicável).
8. Refazer sempre; só substitui após sucesso; validade por **assinatura do plano** (desatualizado ⇒ não aplica).
9. `Prova.diagnostico?` irmão de `plano` (sobrevive a `salvarPlano`); resultado derivado, não persistido; leitura tolerante.
10. A IA só gera perguntas; ordenar, rotular, classificar, corrigir e distribuir são mecânicos.
