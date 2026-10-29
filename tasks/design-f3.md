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
>
> **DECISÃO DO USUÁRIO (ciclo 3 do design, vinculante — não reabrir):** para o
> MEDIUM 2 da 2ª revisão (limiar 3/5 com `MIN_RESPOSTAS_CAMADA=3`), vale a
> opção **(a)**: **encolher a intensidade pela amostra**, multiplicando por
> `min(1, total/9)`, e MANTER `MIN_RESPOSTAS_CAMADA = 3`. NÃO subir o mínimo
> para 5 (isso exigiria gerar mais perguntas por camada, e o Ollama local é
> lento e entrega parcial). Atualizar a coluna `intensidade` da tabela §5.3
> com os valores recalculados à mão e trocar a frase de mitigação do §11 por
> texto que NÃO afirme redução de ruído do chute (a amostra pequena apenas
> reduz a CONFIANÇA, não o ruído). O MEDIUM 1 (frase "máximo de foco" falsa
> quando `calcularPlano` retorna antes da régua) segue o fix do
> `design-review.json`: campo `planoDistribuido` em `ContextoFrase`, mensagem
> alternativa "Ainda não há dias de estudo no plano para ajustar" e teste. Os
> 3 NIT também devem ser aplicados conforme o JSON.

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
do plano. Texto do card (decidido pela UI com um booleano simples
`temNovoNoPlano = plano.topicos.some(t => t.novo)`; não há promessa que o main não
possa cumprir):
- `temNovoNoPlano`: "Quer um plano mais certeiro? Faça um diagnóstico rápido
  (até 18 perguntas de múltipla escolha)."
- `!temNovoNoPlano` (1ª prova: tudo é base, a régua não tem o que reequilibrar):
  "Descubra onde estão suas dificuldades. Faça um diagnóstico rápido (até 18
  perguntas de múltipla escolha). Ele mostra os pontos fracos, mas não muda a
  distribuição do plano."
Sem pop-up, sem bloqueio. O texto do resultado nunca promete ajuste que não
aconteceu (ver `efeitoNoPlano`, §5.5/§6.1).

### 4.7 Erros e honestidade do modelo local (ponto 7)

- **Modelo:** o handler usa `modeloParaGeracao()` (função interna de
  `ipc/index.ts`, reaproveitada como as demais) e injeta
  `gerar: (prompt, format) => generate({ prompt, model, format })`.
- **Classificação de erro:** igual às demais gerações — `OllamaIndisponivelError`
  (recusa de conexão) → mensagem "Ollama offline"; `GeracaoFalhouError`
  (abort/timeout/falha após conectar) → **texto próprio do diagnóstico**; **nunca**
  "offline" para falha de geração. Verificado em `ollama.ts`: a mensagem de
  `GeracaoFalhouError` contém "…reduza a quantidade…", falsa aqui (quantidade
  fixa); por isso o handler **não** repassa `erro.message` dessa classe e usa
  `mensagemAmigavelDiagnostico` (tabela exata em §9.1). `OllamaIndisponivelError`
  mantém `erro.message` (já é a mensagem de offline).
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
- **Falha no meio — definição de "gerado":** "já gerado" ⇔ a lista de
  perguntas acumuladas (todas as camadas) tem `length > 0`. Um tópico que caiu em
  `QuizInvalidoError`/`SemTextoParaQuizError` **não** conta (não acumulou
  nada). `GeracaoFalhouError` com acumulado `> 0` → para e usa o parcial (base é
  gerada primeiro, então o parcial tende a conter a base); **todo tópico
  planejado ainda não processado** entra em `ignorados` com `motivo:"nao_gerou"`
  (o aviso da UI diz quais assuntos ficaram sem perguntas, inclusive "o conteúdo
  novo não foi testado" quando a camada nova ficou vazia). Com acumulado `= 0` →
  relança (nada persistido). `OllamaIndisponivelError` → sempre aborta tudo,
  mesmo com acumulado.
- **`pedido`:** permanece `tópicos planejados × DIAG_PERGUNTAS_POR_TOPICO` (não
  encolhe na interrupção), assim `perguntas.length < pedido` dispara o aviso de
  parcial de forma honesta.

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
`LIMIAR_ACERTO_NUM=3`, `LIMIAR_ACERTO_DEN=5` (limiar 3/5 por inteiros, §5.3),
`LIMIAR_ACERTO_DIAGNOSTICO = NUM/DEN` (0.6; só para a intensidade),
`PESO_DIAGNOSTICO=0.5`, `DIAG_AMOSTRA_REFERENCIA = DIAG_PERGUNTAS_POR_TOPICO *
DIAG_TOPICOS_POR_CAMADA` (=9; denominador do fator de encolhimento da
intensidade pela amostra, §5.3).

### 5.2 Contratos pequenos

**`ehTopicoManual(id: string): boolean`** — `id.startsWith("manual:")`.

**`assinaturaPlano(p: { ordinal: OrdinalProva; topicos: TopicoPlano[] }): string`**
Invariantes: determinística; independe da ordem dos tópicos; ignora tópicos
manuais; muda se mudar `ordinal`, o conjunto de ids não manuais ou o `novo` de
algum.
Formato (sem premissa sobre o conteúdo dos ids; `JSON.stringify` escapa
qualquer `,` `:` `|` `"`):
`JSON.stringify([ordinal, pares])`, onde `pares` = tópicos não manuais mapeados
para `[id, novo ? 1 : 0]`, ordenados por `id` com comparação de strings por
code unit (`a.id < b.id ? -1 : a.id > b.id ? 1 : 0`, **não** `localeCompare`,
para ser independente de locale).

| Entrada | Saída |
|---|---|
| `segunda`, `[{a,novo:false},{b,novo:true}]` | `'["segunda",[["a",0],["b",1]]]'` |
| mesmos, ordem invertida | igual à anterior |
| mesmos + `{manual:x-2}` | igual à anterior |
| `b` vira `novo:false` | `'["segunda",[["a",0],["b",0]]]'` (diferente) |
| ordinal `final` | `'["final",[["a",0],["b",1]]]'` (diferente) |
| sem tópicos não manuais | `'["segunda",[]]'` |
| ids `"a,b:1"` (novo:false) vs ids `"a"` (novo:false) + `"b"` (novo:true) | **diferentes** (sem colisão por separador) |

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
3. `baseBaixa = abaixoDoLimiar(base)` (estrito: `taxa == 0.6` NÃO é baixa).
   **Comparação por inteiros, nunca por `taxa` em ponto flutuante:** o limiar é
   expresso como fração `LIMIAR_ACERTO_NUM / LIMIAR_ACERTO_DEN` = `3 / 5`
   (constantes inteiras; `LIMIAR_ACERTO_DIAGNOSTICO = NUM/DEN` existe só para
   exibição/intensidade) e `abaixoDoLimiar(c) = c.total > 0 && c.acertos *
   DEN < c.total * NUM`. Mudar o limiar exige mudar as duas constantes e os
   casos 8/9/16 da tabela (7/10 com NUM=7, DEN=10 é o exemplo de teste de
   mutação do limiar).
4. `baseBaixa` → `lacuna_base` (explica o resto; vale mesmo que o novo também
   esteja baixo ou não tenha sido medido).
5. `novo.medida && abaixoDoLimiar(novo)` → `dificuldade_novo`.
6. Caso contrário → `sem_dificuldade` (inclui "base boa e novo não medido": a UI
   avisa que o novo não foi medido; o plano não muda).

`intensidade` **(encolhida pela amostra; decisão do usuário, ciclo 3)**:
`lacuna_base` → `((L − base.taxa)/L) · fator(base.total)`; `dificuldade_novo` →
`((L − novo.taxa)/L) · fator(novo.total)`; demais → `0`
(`L = LIMIAR_ACERTO_DIAGNOSTICO`), com
`fator(total) = min(1, total / DIAG_AMOSTRA_REFERENCIA)` e
`DIAG_AMOSTRA_REFERENCIA = 9`. `MIN_RESPOSTAS_CAMADA` **permanece 3**. Em
`[0,1]`, contínua no limiar (taxa→L ⇒ intensidade→0, sem salto para
`sem_dificuldade`). **Por quê:** amostra pequena não reduz o ruído do chute;
reduz a CONFIANÇA. Com 3 respostas o fator é 1/3, então 1 acerto em 3 não
empurra o plano como 3 em 9 empurraria: o efeito no plano cresce com a
quantidade de evidência.
`topicosFracos`: só em `lacuna_base`/`dificuldade_novo`; tópicos da camada
decisiva em que `abaixoDoLimiar({acertos, total})` do próprio tópico (mesma
comparação por inteiros), em ordem da 1ª aparição em `respostas`. Se, por
arredondamento de amostra, nenhum tópico individual ficar abaixo do limiar,
`topicosFracos = []` (a frase omite a lista).
`intensidade` usa `taxa` em float (valor contínuo, não decisão); a **decisão** de
veredito nunca usa float.

**Invariantes:** total e determinística (qualquer lista, inclusive `[]`, nunca
lança); não depende da ordem de `respostas` exceto na ordem de `topicosFracos`;
`intensidade ∈ [0,1]`; `veredito ∈ {lacuna_base,dificuldade_novo} ⇔ intensidade>0`
(taxa estritamente abaixo de L e `total ≥ MIN_RESPOSTAS_CAMADA=3` ⇒ fator ≥ 1/3
> 0 ⇒ intensidade estritamente positiva; vale com o encolhimento pela amostra).
**Monotonia na amostra:** com a mesma taxa, mais respostas ⇒ intensidade
não-menor (fator não-decrescente em `total`).

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
| 9 | B 2/5 (=0.4), N 9/9 | lacuna_base | ≈0.1852 (bruta 0.3333 · 5/9) | amostra pequena encolhe |
| 10 | B 2/2, N 5/5 | inconclusivo | 0 | base com < 3 respostas |
| 11 | camada base sem perguntas; N 3/3 | inconclusivo | 0 | só novo medido |
| 12 | B 5/5, N sem perguntas (1ª prova) | sem_dificuldade | 0 | `novo.medida=false` |
| 13 | B 1/3 (mínimo), N sem perguntas | lacuna_base | ≈0.1481 (bruta 0.4444 · 3/9) | amostra mínima: efeito pequeno |
| 14 | B 5/5, N 1/2 | sem_dificuldade | 0 | novo com 2 respostas = não medido |
| 15 | B 6/9, N 3/6 (=0.5) | dificuldade_novo | ≈0.1111 (bruta 0.1667 · 6/9) | |
| 16 | B 5/9 (≈0.556), N 9/9 | lacuna_base | ≈0.0741 (total 9 ⇒ fator 1) | borda baixa, intensidade pequena |
| 17 | B 3/9 com tópicos A 0/3, B 0/3, C 3/3 | lacuna_base | ≈0.4444 (total 9 ⇒ fator 1) | `topicosFracos=[A,B]` |
| 18 | respostas embaralhadas do caso 3 | igual ao caso 3 | igual | ordem irrelevante |

### 5.4 Contrato — `diagnosticoAplicavel` e `estadoDiagnostico`

```ts
// definido em plano.ts (§6.1); aqui só importado (um único lar, sem duplicar):
import type { AjusteDiagnostico } from "./plano";
// AjusteDiagnostico = { veredito: "lacuna_base" | "dificuldade_novo"; intensidade: number /* (0,1] */ }

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

### 5.5 Textos puros para a UI (CONTRATOS testáveis)

Todos em `src/shared/diagnostico.ts`, puros, saída **exata** (pt-BR).

```ts
export interface ContextoFrase {
  /** `plano.topicos.some(t => t.novo)`: existe conteúdo novo no plano
   *  (mesmo que o tópico seja manual/sem texto e por isso não foi medido). */
  novoPlanejado: boolean;
  /** `PlanoCalculado.diagnosticoAplicado !== undefined` (§6.1): o diagnóstico
   *  MUDOU a mistura. Vem do main; a frase nunca promete o que não ocorreu. */
  efeitoNoPlano: boolean;
  /** `PlanoCalculado.mistura !== undefined`: `calcularPlano` chegou à régua e
   *  distribuiu dias. `false` em `sem_dias` (ex.: prova amanhã), `sem_topicos`
   *  e `prova_passou` (retornos antes da régua). */
  planoDistribuido: boolean;
}
export function fraseResultadoDiagnostico(
  r: ResultadoDiagnostico,
  titulos: ReadonlyMap<string, string>,
  ctx: ContextoFrase,
): string;
export function fraseDiagnosticoParcial(entregue: number, pedido: number): string | null;
export function fraseTopicosIgnorados(ig: TopicoIgnorado[]): string | null;
export function rotuloProgressoDiagnostico(p: ProgressoGeracao): string;
```

**Lista de pontos fracos (helper interno `listaFracos`):** mapeia
`r.topicosFracos` por `titulos.get(id)`, **omite** ids sem título (nunca imprime
id cru) e títulos vazios; com `n` títulos restantes: 0 → cláusula omitida;
1 → `A`; 2 → `A e B`; 3 → `A, B e C`; ≥ 4 → `A, B, C e mais {n−3}`.
Cláusula = `; os pontos mais fracos: {lista}` (inserida antes do ponto final da
1ª frase).

**Texto por veredito** (`{a}/{t}` = acertos/total da camada decisiva):

- `lacuna_base`: `Sua dificuldade parece estar na base. Você acertou {a} de {t}
  perguntas dos conteúdos anteriores{cláusula}.` + final:
  `!efeitoNoPlano && !planoDistribuido` → ` Ainda não há dias de estudo no plano para ajustar.` (avaliado primeiro);
  `efeitoNoPlano` → ` Por isso o plano dá mais tempo à base antes do conteúdo novo.`;
  `!efeitoNoPlano && planoDistribuido && novoPlanejado` → ` O plano já dá o máximo de foco à base que a distância da prova permite.`;
  `!efeitoNoPlano && planoDistribuido && !novoPlanejado` → ` Como todo o conteúdo do plano é base, não há conteúdo novo para reequilibrar.`
- `dificuldade_novo`: `A base está firme ({ba} de {bt}). A dificuldade parece
  estar no conteúdo novo ({na} de {nt}){cláusula}.` + final:
  `!efeitoNoPlano && !planoDistribuido` → ` Ainda não há dias de estudo no plano para ajustar.` (avaliado primeiro);
  `efeitoNoPlano` → ` O plano reservou mais tempo para ele.`;
  `!efeitoNoPlano && planoDistribuido` → ` O plano já dá o máximo de foco possível ao conteúdo novo.`
- `sem_dificuldade`: `Você foi bem nas perguntas. O plano continua como estava.`
  + (` Não deu para medir o conteúdo novo.` somente se `ctx.novoPlanejado &&
  !r.novo.medida`). `efeitoNoPlano` e `planoDistribuido` são ignorados neste veredito.
- `inconclusivo`: `Não deu para tirar uma conclusão (poucas perguntas sobre a
  base). O plano continua como estava.`

A UI mostra sempre, fora da frase, a nota fixa "Isto é uma orientação de
estudo, não uma previsão da prova."

**Tabela de casos (16 saídas; títulos: a=Limites, b=Derivadas, c=Integrais, d=Séries;
`zzz` ∉ `titulos`). Saída exata:**

| # | Entrada | Saída |
|---|---|---|
| 1 | lacuna_base, B 2/9, fracos `[a]`, efeito=true | `Sua dificuldade parece estar na base. Você acertou 2 de 9 perguntas dos conteúdos anteriores; os pontos mais fracos: Limites. Por isso o plano dá mais tempo à base antes do conteúdo novo.` |
| 2 | idem, fracos `[a,b]` | `…anteriores; os pontos mais fracos: Limites e Derivadas. Por isso o plano dá mais tempo à base antes do conteúdo novo.` |
| 3 | idem, fracos `[a,b,c]` | `…fracos: Limites, Derivadas e Integrais. Por isso…` |
| 4 | idem, fracos `[a,b,c,d]` | `…fracos: Limites, Derivadas, Integrais e mais 1. Por isso…` |
| 5 | idem, fracos `[a,zzz]` | `…fracos: Limites. Por isso…` (id ausente omitido) |
| 6 | idem, fracos `[zzz]` ou `[]` | `Sua dificuldade parece estar na base. Você acertou 2 de 9 perguntas dos conteúdos anteriores. Por isso o plano dá mais tempo à base antes do conteúdo novo.` |
| 7 | lacuna_base, fracos `[]`, efeito=false, novoPlanejado=true | `Sua dificuldade parece estar na base. Você acertou 2 de 9 perguntas dos conteúdos anteriores. O plano já dá o máximo de foco à base que a distância da prova permite.` |
| 8 | lacuna_base, fracos `[]`, efeito=false, novoPlanejado=false (1ª prova) | `Sua dificuldade parece estar na base. Você acertou 2 de 9 perguntas dos conteúdos anteriores. Como todo o conteúdo do plano é base, não há conteúdo novo para reequilibrar.` |
| 9 | dificuldade_novo, B 8/9, N 3/9, fracos `[c]`, efeito=true | `A base está firme (8 de 9). A dificuldade parece estar no conteúdo novo (3 de 9); os pontos mais fracos: Integrais. O plano reservou mais tempo para ele.` |
| 10 | dificuldade_novo, B 8/9, N 3/9, fracos `[]`, efeito=false | `A base está firme (8 de 9). A dificuldade parece estar no conteúdo novo (3 de 9). O plano já dá o máximo de foco possível ao conteúdo novo.` |
| 11 | sem_dificuldade, `novo.medida=true` | `Você foi bem nas perguntas. O plano continua como estava.` |
| 12 | sem_dificuldade, `novo.medida=false`, novoPlanejado=true | `Você foi bem nas perguntas. O plano continua como estava. Não deu para medir o conteúdo novo.` |
| 13 | sem_dificuldade, `novo.medida=false`, novoPlanejado=false (1ª prova) | `Você foi bem nas perguntas. O plano continua como estava.` |
| 14 | inconclusivo | `Não deu para tirar uma conclusão (poucas perguntas sobre a base). O plano continua como estava.` |
| 15 | lacuna_base, B 2/9, fracos `[]`, efeito=false, **planoDistribuido=false**, novoPlanejado=true (prova amanhã: `sem_dias`) | `Sua dificuldade parece estar na base. Você acertou 2 de 9 perguntas dos conteúdos anteriores. Ainda não há dias de estudo no plano para ajustar.` |
| 16 | dificuldade_novo, B 8/9, N 3/9, fracos `[]`, efeito=false, **planoDistribuido=false** | `A base está firme (8 de 9). A dificuldade parece estar no conteúdo novo (3 de 9). Ainda não há dias de estudo no plano para ajustar.` |

Nos casos 1–14 `planoDistribuido=true`. Invariante: `efeitoNoPlano=true` ⇒
`planoDistribuido=true` (`diagnosticoAplicado` só existe com `mistura`).

**`fraseDiagnosticoParcial`:** `entregue >= pedido` (ou `pedido <= 0`) → `null`;
senão `Montei {entregue} de {pedido} perguntas. O resultado vale, mas é menos
preciso. Você pode refazer o diagnóstico depois.` (Ex.: `(12,18)` → `Montei 12 de
18 perguntas. O resultado vale, mas é menos preciso. Você pode refazer o
diagnóstico depois.`; `(18,18)` → `null`; `(20,18)` → `null`.)

**`fraseTopicosIgnorados`:** vazio → `null`. Agrupa por motivo, na ordem
`manual`+`sem_texto` (juntos), depois `nao_gerou`; lista de títulos pela mesma
regra de `listaFracos` (mas sem omitir: aqui o título vem em `TopicoIgnorado`).
Frases: `Ficaram de fora, por não terem material importado: {lista}.` e
`Não consegui montar perguntas sobre: {lista}.`, separadas por um espaço.
Ex.: `[{Limites,manual},{Séries,nao_gerou}]` → `Ficaram de fora, por não terem
material importado: Limites. Não consegui montar perguntas sobre: Séries.`;
só `[{Limites,sem_texto},{Derivadas,manual}]` → `Ficaram de fora, por não terem
material importado: Limites e Derivadas.`

**`rotuloProgressoDiagnostico`:** `p.total > 0` → `Preparando as perguntas:
assunto {prontos} de {total}…` (aqui `prontos/total` contam **tópicos**, não
perguntas, por isso rótulo próprio; o `rotuloProgresso` genérico diria "Gerando
2 de 6", ambíguo); `p.total <= 0` → `Preparando as perguntas…`.

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
`CalcularPlanoParams` e o repassa à régua. **Efeito real (finding de review):**
`calcularPlano` calcula também `semDiag = calcularMisturaBaseNovo({mesmos
campos, sem diagnostico})` e anexa ao retorno, por spread condicional,
`diagnosticoAplicado: p.diagnostico` **somente se** `p.diagnostico !==
undefined && mistura.fracaoBase !== semDiag.fracaoBase` (ambos já passaram por
`arredondar4`, então a comparação é entre valores estáveis). Ou seja: 1ª prova,
um lado vazio, base já no teto (≥ 30 dias) com `lacuna_base`, ou prova hoje com
`dificuldade_novo` ⇒ **sem** `diagnosticoAplicado` ⇒ a UI não diz "plano
ajustado". `PlanoCalculado` (em `plano.ts`) ganha o campo opcional
`diagnosticoAplicado?: AjusteDiagnostico`. Sem `diagnostico` no param, o objeto
retornado não ganha chave nova (regressão `toEqual`). **O restante do algoritmo
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
- **Modulação pelo tempo (propriedade testável):** a modulação do intent ("prova
  longe = foco pesado na base; prova perto = foco no novo com toques na base")
  **vem da régua da fatia 2** (`baseBruta` cai quando `diasRestantes` cai); o
  diagnóstico só desloca em torno dela. Para `lacuna_base` com `i = 1`,
  `dificuldadeBase = 0`, `totalBase, totalNovo > 0`, e
  `baseAjustada(dias)` = `fracaoBase` sem diagnóstico:
  (a) `fracaoBase(dias) ∈ [baseAjustada(dias), TETO_BASE]`;
  (b) o ganho `Δ(dias) = PESO_DIAGNOSTICO · (TETO_BASE − baseAjustada(dias))`
  é **não-crescente em `diasRestantes`** (prova mais longe ⇒ Δ menor, pois a base
  já está mais perto do teto) e **vale 0 com `diasRestantes ≥ HORIZONTE_DIAS`
  (30, `constants.ts` L124)**, onde `baseAjustada = TETO_BASE`;
  (c) `fracaoNovo ≥ 1 − TETO_BASE = 0.2` em todos os casos.
  Em outras palavras: perto da prova o diagnóstico tem **mais** margem para
  subir a base (ex.: hoje +0.325 em valor absoluto), mas a base resultante
  (0.475) continua abaixo da metade, e o novo segue dominante; longe da prova a
  base já está no teto e o diagnóstico não muda nada. O teste varre
  `diasRestantes ∈ {0,1,7,15,29,30,60}` e verifica (a), (b) e (c).
- **Invariantes da fatia 2 (reexecutadas com diagnóstico):** nenhum dia excede
  `capacidadeDia`; todo bloco ≥ 15; terminação de `resolverCamada`; e
  **conservação de minutos com oráculo computável pela API pública** (o `aviso`
  só traz contagem, não minutos): com `D` = nº de dias do plano e
  `capacidadeTotal = D · capacidadeDia`, (i) sempre
  `Σ minutos dos blocos ≤ capacidadeTotal`; (ii) **sem `aviso`**,
  `Σ minutos dos blocos ≥ capacidadeTotal − 14 · (nº de dias cuja folga final < 15)`
  (a folga residual de um dia é < 15, senão caberia mais um bloco). O teste de
  conservação **exato** já existente da fatia 2 é **reexecutado** com
  `diagnostico` acrescentado à grade de entradas, sem reescrevê-lo.

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
`ajuste = diagnosticoAplicavel(prova.plano, prova.diagnostico)`. **Quem anexa
`diagnosticoAplicado` é `calcularPlano`** (§6.1), e só quando o diagnóstico
realmente mudou a `fracaoBase`; o wiring do main apenas repassa `ajuste`. A UI
usa a presença de `diagnosticoAplicado` como `ctx.efeitoNoPlano` (§5.5) e para
exibir "Plano ajustado pelo diagnóstico". O ramo
`prova_passou` retorna antes e **não** aplica nem anexa. `calcularPlano`
(puro) não importa `diagnostico.ts`: `AjusteDiagnostico` é definido em `plano.ts`
e reexportado/importado por `diagnostico.ts` (sem ciclo).

---

## 7. Orquestração da geração (`src/main/services/diagnostico.ts`, novo)

### 7.1 Contrato

```ts
export interface GerarDiagnosticoParams {
  plano: PlanoEstudo;
  /** null = documento ausente, ilegível ou sem texto. Injetável (testes).
   *  CONTRATO: nunca rejeita para o orquestrador; o handler (§8) captura QUALQUER
   *  erro de `carregarDocumento` (não só `DocumentoNaoEncontradoError`) e devolve
   *  null. Defesa em profundidade: o orquestrador também envolve a chamada em
   *  try/catch e trata rejeição como null. */
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
DIAG_PEDIDO_POR_TOPICO, gerar})`; **narrowing explícito:** `gerarQuiz` devolve
`PerguntaQuiz[]` (união com `aberta`), então as perguntas passam por
`.filter((p): p is PerguntaMultipla => p.tipo === "multipla")` (type guard;
defensivo, pois `parseQuiz` já filtra por modo) antes de manter as
`DIAG_PERGUNTAS_POR_TOPICO` primeiras e carimbar `{topicoId, camada}`; chama
`aoProgresso(feitos, total)` após cada tópico (sucesso **ou** ignorado);
(6) valida `perguntas base ≥ MIN_RESPOSTAS_CAMADA`; (7) devolve
`DiagnosticoPlano` pendente com `assinatura = assinaturaPlano(plano)`,
`pedido = nº de tópicos planejados × DIAG_PERGUNTAS_POR_TOPICO`, `ignorados`
(planejamento + `nao_gerou`).

**Estado acumulado e interrupção (contrato do laço do passo 5):**
`acumuladas: PerguntaDiagnostico[]`; "gerado" ⇔ `acumuladas.length > 0` (§4.7).
Para cada tópico `t` na ordem base→novo:

| Resultado de `gerarQuiz(t)` | Efeito |
|---|---|
| devolve ≥ 1 pergunta de múltipla | acumula (até 3), progresso `+1` |
| devolve 0 perguntas de múltipla, `QuizInvalidoError` ou `SemTextoParaQuizError` | `ignorados += {t, "nao_gerou"}`, progresso `+1`, segue |
| `OllamaIndisponivelError` | relança imediatamente (qualquer acumulado) |
| `GeracaoFalhouError`, `acumuladas.length === 0` | relança imediatamente |
| `GeracaoFalhouError`, `acumuladas.length > 0` | `ignorados += {t, "nao_gerou"}` **e todos os tópicos planejados ainda não processados** (`nao_gerou`); encerra o laço (sem relançar); segue para o passo 6 |

**Aborto antecipado da camada base (finding 5):** ao terminar o processamento
da camada **base** com `acumuladas.length < MIN_RESPOSTAS_CAMADA`, o laço
lança `DiagnosticoInsuficienteError` **sem processar nenhum tópico novo**
(a base inviável já reprova o passo 6; não gastar até 3 chamadas lentas à toa).
Exceção: se a base terminou por `GeracaoFalhouError` (encerramento do laço
abaixo), vale o relançar do erro original descrito a seguir.

Se o laço foi encerrado por `GeracaoFalhouError` e o passo 6 reprova (base < 3),
relança-se o **`GeracaoFalhouError` original** (causa real), não
`DiagnosticoInsuficienteError`. Garantia: todo tópico planejado termina em **exatamente um** de {contribuiu com
perguntas, está em `ignorados`}. Teste obrigatório: "falha no 3º de 4 tópicos ⇒ o
3º e o 4º aparecem em `ignorados` como `nao_gerou`" (§13.3).

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
return d.texto } catch { return null } }` (**qualquer** erro de leitura —
documento ausente, JSON corrompido, `EACCES` — vira `null` ⇒ tópico `sem_texto`;
nunca derruba o diagnóstico inteiro);
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
| Timeout/abort/falha após conectar, **nada gerado ainda** (`acumuladas.length === 0`) | `GeracaoFalhouError` (propagado) | sim | texto próprio do §9.1 (**sem** "reduza a quantidade", nunca "offline") | não |
| `GeracaoFalhouError` com `acumuladas.length > 0` | capturado | — | encerra o laço; tópicos restantes viram `ignorados[nao_gerou]`; se base ≥ 3 ⇒ sucesso com aviso de parcial; senão relança o `GeracaoFalhouError` original (texto do §9.1) | só se válido |
| `QuizInvalidoError` / `SemTextoParaQuizError` / 0 perguntas de múltipla num tópico | capturado | — | tópico vira `ignorados[{motivo:"nao_gerou"}]` | — |
| Leitura do documento falha (ausente, corrompido, `EACCES`) | capturado no `carregarTexto` | — | tópico `ignorados[{motivo:"sem_texto"}]` | — |
| Base com < 3 perguntas ao fim (sem erro de infra) | `DiagnosticoInsuficienteError` | sim (tentar de novo) | "Não consegui montar perguntas suficientes sobre a base. Tente de novo em instantes." | não |
| Sem tópico de base com texto | `DiagnosticoIndisponivelError` | não (até importar/vincular) | mensagem do §4.1 | não |
| Prova sem `plano` | `DadosProvaInvalidosError` | sim | "Monte o plano de estudo antes de fazer o diagnóstico." | não |
| Plano mudou durante a geração | `DadosProvaInvalidosError` | sim | frase do §7.2 | não |
| `escolhas` inválidas | `DadosProvaInvalidosError` | sim | "Responda todas as perguntas para ver o resultado." | não |
| Prova inexistente | `ProvaNaoEncontradaError` | não | mensagem existente | — |
| Geração concorrente da mesma prova | `DiagnosticoEmAndamentoError` | sim | "Já estou preparando o diagnóstico desta prova." | — |
| Qualquer outro erro inesperado | genérico | — | "Não foi possível preparar o diagnóstico. Tente novamente." | não |

### 9.1 `mensagemAmigavelDiagnostico(erro: unknown): string` (CONTRATO, texto exato)

Função **pura e exportada** (em `src/main/services/diagnostico.ts`, para ser
testada sem Electron; `ipc/index.ts` apenas a chama). **Não** repassa
`erro.message` para `GeracaoFalhouError` (a mensagem real em `ollama.ts` contém
"reduza a quantidade"). Ordem de verificação = ordem da tabela (`instanceof`).

| Entrada | Saída exata |
|---|---|
| `OllamaIndisponivelError` | `erro.message` (texto de offline existente) |
| `GeracaoFalhouError` | `A geração das perguntas falhou ou demorou demais. Tente novamente ou use um modelo mais leve.` |
| `DiagnosticoIndisponivelError` | `erro.message` (texto do §4.1) |
| `DiagnosticoInsuficienteError` | `erro.message` (`Não consegui montar perguntas suficientes sobre a base. Tente de novo em instantes.`) |
| `DiagnosticoEmAndamentoError` | `erro.message` (`Já estou preparando o diagnóstico desta prova.`) |
| `DadosProvaInvalidosError` | `erro.message` |
| `ProvaNaoEncontradaError` | `erro.message` |
| qualquer outro (`Error` genérico, string, `undefined`) | `Não foi possível preparar o diagnóstico. Tente novamente.` |

Invariantes testáveis: nenhuma saída para `GeracaoFalhouError` contém
"offline" nem "quantidade"; a saída para `OllamaIndisponivelError` é a única que
menciona offline; a função nunca lança.

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
| `nenhum` | Card com o texto do §4.6 (varia com `temNovoNoPlano`; na 1ª prova **não** promete ajuste) + botão **Fazer diagnóstico**. Se a pré-checagem falhar (nenhuma base não manual): botão desabilitado e texto do motivo (`aria-describedby`). Aviso "N assunto(s) digitado(s) à mão ficam de fora" quando houver. |
| gerando | `role="status"` `aria-live="polite"`: rótulo de progresso (`rotuloProgressoDiagnostico`); botão desabilitado. Assina `aoProgressoGeracao` ANTES do `await`, filtra `artefato==="diagnostico"`, cancela no `finally` (padrão de `Quiz.tsx`). |
| `pendente` | Perguntas em `<fieldset>/<legend>`, alternativas em `<input type="radio">` + opção **"Não sei"**; botão **Ver resultado** só habilita com todas respondidas. Aviso de parcial (se `perguntas.length < pedido`) e de ignorados. |
| `concluido` | Primeiro `getApi().calcularPlano(id)`; depois `fraseResultadoDiagnostico(r, titulos, {novoPlanejado: plano.topicos.some(t => t.novo), efeitoNoPlano: calculado.diagnosticoAplicado !== undefined, planoDistribuido: calculado.mistura !== undefined})`, nota "orientação de estudo, não previsão", "Feito em DD/MM/AAAA", `fraseTopicosIgnorados` e `fraseDiagnosticoParcial` quando não `null`, e o **plano**: `PlanoPrevia`. O selo "Plano ajustado pelo diagnóstico" aparece **somente** se `diagnosticoAplicado` estiver presente (nunca em `sem_dificuldade`/`inconclusivo`, nem na 1ª prova, nem com base no teto/piso). Botão **Refazer diagnóstico** (confirmação inline). |
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
| 1ª prova (tudo base) | régua passo 0 ⇒ plano inalterado; sem `diagnosticoAplicado`; card e frase **não** prometem ajuste (`efeitoNoPlano=false`) | ✅ |
| Diagnóstico sem efeito na mistura (base já no teto ≥ 30 dias com `lacuna_base`; prova hoje com `dificuldade_novo`; um lado vazio) | `diagnosticoAplicado` ausente ⇒ frase "já dá o máximo de foco…", sem selo "ajustado" | ✅ |
| Documento ilegível (JSON corrompido, `EACCES`) | `carregarTexto` → `null` ⇒ `sem_texto` | ✅ |
| Geração interrompida no meio com algo gerado | tópicos restantes em `ignorados[nao_gerou]`; aviso de parcial; "novo não testado" visível | ✅ |
| Cancelar uma geração em andamento (até 6 chamadas sequenciais + corretivas) | — | ❌ NÃO coberto (o aluno só espera; sem botão cancelar nem timeout total) |
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
| Chute (acerto ao acaso) | ruído estatístico de amostra pequena (3 perguntas por tópico; mínimo de 3 respostas por camada). Não é reduzido, só **ponderado**: a intensidade é encolhida por `min(1, total/9)` (§5.3), então amostra mínima move o plano pouco. A UI diz "parece" e "orientação" | ❌ NÃO coberto (o ruído existe; só o efeito no plano é atenuado) |
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
- `fraseResultadoDiagnostico`: **os 16 casos da tabela §5.5 com `toBe` na string
  exata** (join de 1/2/3/4 fracos, id ausente omitido, `efeitoNoPlano`
  true/false, `planoDistribuido` true/false (casos 15–16: `sem_dias`),
  `novoPlanejado` true/false, `novo.medida`).
  **`planoDistribuido=false`** (casos 15–16 da tabela §5.5) nunca emite "máximo de foco".
  `fraseDiagnosticoParcial` (`(12,18)`, `(18,18)`, `(20,18)`, `(0,0)`),
  `fraseTopicosIgnorados` (os 2 exemplos + vazio), `rotuloProgressoDiagnostico`
  (`total>0` e `total<=0`).
- `classificarDiagnostico`: caso de **limiar por inteiros** (3/5 não é baixa;
  2/5 é; 6/10 não é; 5/9 é) e teste de que a decisão não muda com ruído de
  float; mutação do limiar documentada (§5.3 regra 3).
- `assinaturaPlano`: caso sem colisão por separador (id `"a,b:1"`).

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
- **Modulação pelo tempo (§6.2):** para `diasRestantes ∈ {0,1,7,15,29,30,60}`,
  `lacuna_base` i=1: (a) `fracaoBase ∈ [sem diag, TETO_BASE]`; (b) o ganho
  `Δ = fracaoBase − semDiag` é não-crescente em `diasRestantes` e `Δ = 0` em
  `≥ 30`; (c) `fracaoNovo ≥ 0.2`.
- **`diagnosticoAplicado`:** presente com `lacuna_base` i=1 aos 15 dias;
  **ausente** com `lacuna_base` aos 30 dias (teto), com `dificuldade_novo` aos 0
  dias (piso), com `totalNovo=0` (1ª prova), com `totalBase=0`, com
  `intensidade=0`, e quando `diagnostico` é omitido (objeto retornado sem a
  chave).
- Invariantes da fatia 2 com diagnóstico (grade): nenhum dia > `capacidadeDia`;
  todo bloco ≥ 15; terminação (o teste conclui); **conservação de minutos pelo
  oráculo da API pública (§6.2):** `Σ blocos ≤ capacidadeTotal` sempre, e, sem
  `aviso`, `Σ blocos ≥ capacidadeTotal − 14·(dias com folga < 15)`; mais a
  **reexecução do teste de conservação exato da fatia 2** com `diagnostico` na
  grade.
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
- Base < 3 perguntas ⇒ `DiagnosticoInsuficienteError` **e `gerar` chamado
  somente nos tópicos de base** (nenhuma chamada nos tópicos novos).
- `OllamaIndisponivelError` no 1º tópico ⇒ propaga (offline); idem no meio.
- `GeracaoFalhouError` no 1º ⇒ propaga (e a mensagem **não** é "offline");
  no 3º com base já ≥ 3 ⇒ parcial válido; no 2º com base < 3 ⇒ relança.
- **`carregarTexto` rejeita** (erro genérico, não só "não encontrado") ⇒ tópico
  `sem_texto`, sem lançar; demais tópicos seguem.
- **Falha no 3º de 4 tópicos** (`GeracaoFalhouError`, com 2 tópicos já
  acumulados): 3º e 4º aparecem em `ignorados` como `nao_gerou`; base ≥ 3 ⇒
  diagnóstico válido com `pedido > perguntas.length`.
- `GeracaoFalhouError` com `acumuladas.length === 0` (1º tópico) ⇒ relança o
  mesmo erro (não vira `DiagnosticoInsuficienteError`).
- Tópico cujo `gerar` devolve só perguntas `aberta` ⇒ filtro `tipo==="multipla"`
  descarta, tópico vira `nao_gerou`.
- `mensagemAmigavelDiagnostico`: **8 linhas da tabela §9.1 com `toBe` exato**;
  `GeracaoFalhouError` não contém "offline" nem "quantidade"; entrada
  `undefined`/string não lança.
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

`src/main/services/diagnostico.ts` também define e exporta
`DiagnosticoIndisponivelError`, `DiagnosticoInsuficienteError`,
`DiagnosticoEmAndamentoError` e `mensagemAmigavelDiagnostico` (§9.1). Constantes
novas incluem `LIMIAR_ACERTO_NUM=3` e `LIMIAR_ACERTO_DEN=5` (§5.3).

**Modificados:** `src/shared/types.ts` (tipos §5.1, `Prova.diagnostico?`);
`src/shared/constants.ts` (9 constantes); `src/shared/plano.ts`
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
4. `classificarDiagnostico` puro: limiar 0.6 estrito, ≥3 respostas por camada (intensidade encolhida por `min(1,total/9)`), base baixa ⇒ `lacuna_base`, senão novo baixo ⇒ `dificuldade_novo`, senão `sem_dificuldade`; base não medida ⇒ `inconclusivo`.
5. Entra na régua como `diagnostico?` que só desloca `fracaoBase` (±`PESO_DIAGNOSTICO`·intensidade da folga até teto/piso); ausente ou intensidade 0 ⇒ idêntico à fatia 2; novo nunca zera.
6. Diagnóstico **opcional e incentivado**.
7. Erros: offline × falha distintos; válido com base ≥ 3 perguntas; parcial avisado com frase própria (a de `avisoGeracaoParcial` fala em "reduzir quantidade", inaplicável).
8. Refazer sempre; só substitui após sucesso; validade por **assinatura do plano** (desatualizado ⇒ não aplica).
9. `Prova.diagnostico?` irmão de `plano` (sobrevive a `salvarPlano`); resultado derivado, não persistido; leitura tolerante.
10. A IA só gera perguntas; ordenar, rotular, classificar, corrigir e distribuir são mecânicos.

---

## 16. Respostas ao design review (revisão 1)

Todos os 10 findings foram **endereçados** (nenhum ignorado, nenhum adiado).

| # | Sev. | Resposta | Onde |
|---|---|---|---|
| 1 | MEDIUM | `calcularPlano` só anexa `diagnosticoAplicado` quando `fracaoBase` com diagnóstico difere da sem; frases ganham `efeitoNoPlano` e `novoPlanejado`; card da 1ª prova não promete ajuste | §4.6, §5.5, §6.1, §6.4, §10, §11, §13.2 |
| 2 | MEDIUM | Bullet trocado por propriedade testável (a)(b)(c): ganho `Δ` não-crescente em `diasRestantes`, 0 em ≥ 30 (`HORIZONTE_DIAS`, `constants.ts` L124), `fracaoNovo ≥ 0.2` | §6.2, §13.2 |
| 3 | MEDIUM | `mensagemAmigavelDiagnostico` com tabela de textos exatos; texto próprio para `GeracaoFalhouError` (sem "reduza a quantidade") | §4.7, §9, §9.1, §13.3 |
| 4 | MEDIUM | `carregarTexto` captura qualquer erro e devolve `null`; defesa em profundidade no orquestrador; teste novo | §7.1, §8, §9, §13.3 |
| 5 | MEDIUM | `fraseResultadoDiagnostico(r, titulos, {novoPlanejado, efeitoNoPlano})` + tabela de saídas exatas (16 após a revisão 2); regras de join/limite/id ausente; `fraseTopicosIgnorados` e `fraseDiagnosticoParcial` com exemplos | §5.5, §13.1 |
| 6 | MEDIUM | "gerado" = `acumuladas.length > 0`; tabela do laço; restantes vão a `ignorados[nao_gerou]`; teste "falha no 3º de 4" | §4.7, §7.1, §9, §13.3 |
| 7 | NIT | Limiar por inteiros (`acertos*DEN < total*NUM`, 3/5); `taxa` só para intensidade | §5.3, §5.1, §13.1 |
| 8 | NIT | Type guard `p.tipo === "multipla"` especificado + teste | §7.1, §13.3 |
| 9 | NIT | `assinaturaPlano` com `JSON.stringify` de pares ordenados por code unit; teste de colisão | §5.2, §13.1 |
| 10 | NIT | Registrado como NÃO coberto: cancelar geração / timeout total | §11 |

## 17. Respostas ao design review (revisão 2)

Todos os 5 findings **endereçados**. O MEDIUM 2 segue a decisão do usuário
(opção (a), cabeçalho do documento).

| # | Sev. | Resposta | Onde |
|---|---|---|---|
| 1 | MEDIUM | `ContextoFrase.planoDistribuido` (`calculado.mistura !== undefined`); sem plano distribuído e sem efeito ⇒ `Ainda não há dias de estudo no plano para ajustar.` (avaliado primeiro); tabela §5.5 passa a 16 casos (15–16 novos); teste em §13.1; wiring §10 | §5.5, §10, §13.1 |
| 2 | MEDIUM | Opção (a): intensidade encolhida por `min(1, total/9)` (`DIAG_AMOSTRA_REFERENCIA`), `MIN_RESPOSTAS_CAMADA=3` mantido; intensidades dos casos 9, 13, 15 recalculadas (0.1852, 0.1481, 0.1111; casos 3–6, 16 e 17 têm total 9 ⇒ inalterados); frase do §11 reescrita sem afirmar redução de ruído | §5.1, §5.3, §11 |
| 3 | NIT | Oráculo executável pela API pública (`Σ ≤ capacidadeTotal`; sem aviso `Σ ≥ capacidadeTotal − 14·dias com folga<15`) + reexecução do teste exato da fatia 2 com `diagnostico` na grade | §6.2, §13.2 |
| 4 | NIT | `AjusteDiagnostico` definido só em `plano.ts`; §5.4 apenas importa | §5.4 |
| 5 | NIT | Aborto antecipado: base < 3 ao fim da camada base ⇒ `DiagnosticoInsuficienteError` sem tocar nos tópicos novos; teste `gerar` só nos tópicos de base | §7.1, §13.3 |