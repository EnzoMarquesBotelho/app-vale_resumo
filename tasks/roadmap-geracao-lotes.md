# Roadmap — Fatia: Geração em lotes (chunks) para quantidades grandes

> Fatia pós-MVP. Resolve, por dentro, a lentidão/instabilidade do modelo local
> ao gerar quantidades grandes de **quiz** e **exercícios** num único pedido ao
> Ollama. Base: SPEC.md, limitações conhecidas (AGENTS.md), fatias de quiz e
> exercícios entregues. Requisitos + design técnico completos em
> `.agents/tasks/design.md` (Revisão 3, design/review aprovados). Decisões
> confirmadas abaixo.

## Objetivo

Entregar o total de perguntas/exercícios que o usuário pediu (5–100) mesmo em
quantidades grandes, sem estourar o timeout de 5 min de um pedido gigante e sem
mudar o contrato de UI. Quando a quantidade é grande, a geração passa a ser feita
em vários pedidos menores ao Ollama (lotes), acumulando e deduplicando os itens
até o total, com feedback de progresso na tela.

## Decisões confirmadas

1. **Tamanho do lote fixo = 15; chunking a partir de >20 itens.**
   - `n ≤ 20` segue o caminho de hoje (uma chamada, zero mudança de
     comportamento). `n > 20` (21+) liga o chunking.
   - Lote **fixo** (não adaptativo): a causa dominante de falha em lote grande é
     o volume de JSON de saída, e 15 itens cabem com folga na janela de contexto
     e no timeout por chamada. Simplicidade vence; o parâmetro fica exposto como
     constante para afinação futura sem mexer na lógica.
   - Gate em 20 (e não 15) para que pedir exatamente 15 seja UMA chamada e para
     que todo o intervalo 5–20 permaneça idêntico ao já testado e aceito. O menor
     caso particionado (21) vira 15 + 6 — dois lotes reais.
   - Constantes em `src/shared/constants.ts`: `GERACAO_LOTE_LIMIAR = 20`,
     `GERACAO_LOTE_TAMANHO = 15`.

2. **Deduplicação entre lotes — dupla camada barata (sem similaridade difusa).**
   - **Prevenção (prompt):** a cada lote após o primeiro, o prompt recebe os
     últimos enunciados já aceitos com a instrução de não repetir e gerar novos
     e diferentes — limitado aos **últimos 30** (`GERACAO_EVITAR_MAX`), truncados
     a **120 caracteres** cada (`GERACAO_EVITAR_MAXLEN`) para não pressionar o
     contexto (≈ 3,6 KB de prompt extra no pior caso).
   - **Garantia (determinística):** ao acumular, cada item é comparado por uma
     **chave normalizada do enunciado** (trim + lowercase + sem acentos + colapso
     de espaços + remoção de pontuação de borda) contra um `Set` de chaves já
     aceitas; chave repetida é descartada. A dedup é a fonte da verdade; o prompt
     é só uma dica que o modelo pode ignorar.
   - **Rejeitado:** similaridade difusa (Levenshtein/embeddings) — exigiria
     limiar mágico e/ou outra chamada ao modelo (dependência/custo) com risco de
     falso-positivo. A normalização exata pega o caso dominante (o modelo
     repetindo o mesmo enunciado quase idêntico), sem custo e trivialmente
     testável.

3. **Falha parcial honesta.**
   - Enquanto houver acúmulo, um lote que falha por infra do Ollama
     (`OllamaIndisponivelError` ou `GeracaoFalhouError`) **encerra o laço** e a
     função **retorna o parcial** (sem lançar): o usuário fica com o que já foi
     gerado em vez de perder tudo.
   - Se o **primeiro lote falha sem nada acumulado**, o erro tipado é
     **propagado** exatamente como hoje — recusa de conexão vira "Ollama offline";
     abort/timeout/falha vira a mensagem honesta ("a geração falhou ou demorou
     demais; reduza a quantidade"). **Nunca** se diz "offline" para uma geração
     que só falhou.
   - **Rejeitado:** re-tentar o lote inteiro (já há a re-tentativa corretiva por
     chamada) e um `AbortController` global do processo (o teto de tempo continua
     por chamada; cada lote é pequeno).

4. **Progresso main→renderer (evento tipado, escopado ao `invoke`).**
   - Canal novo `geracao.progresso` em `IPC_CHANNELS` (grupo aninhado, como
     `tema`/`atualizacao`); método `aoProgressoGeracao` no `AppApi`/preload
     (espelha `aoAtualizarStatus`), consumido só por `getApi()`.
   - No main, o push é feito **dentro do handler** via
     `janelaDoEvento(event)?.webContents.send(...)` com guarda `isDestroyed()` —
     escopado ao `webContents` que invocou a geração (não o getter global do
     updater nem o broadcast do tema).
   - O **serviço é agnóstico ao artefato**: só chama `aoProgresso(prontos,
     total)`. O handler embrulha isso no payload do canal, anexando `artefato`
     ("quiz"/"exercicios") e um `geracaoId` que serve **só** para log/telemetria.
   - No renderer, cada tela (Quiz/Exercícios) assina o canal, **filtra pelo seu
     `artefato`** e mostra "Gerando X de N…"; cancela a assinatura no `finally`.
     Filtro por `artefato` basta — há uma só geração por vez (botões `disabled`).

5. **Flashcards — FORA desta fatia (justificado).**
   - O problema reportado é de quiz e exercícios; resolver o escopo pedido mantém
     a fatia enxuta e verificável.
   - Flashcards são mais baratos por item (par pergunta/resposta curto, sem
     alternativas/gabarito), então toleram quantidades maiores num único pedido.
   - A lógica pura e o progresso nascem **genéricos** (`ArtefatoLote` já é um
     union): estender a flashcards depois é uma fatia pequena e isolada, sem
     redesenho. Fica registrado no roadmap restante.

## Como ficou (resumo de implementação)

- **Lógica pura** em `src/shared/geracaoLotes.ts` (sem Electron/disco/IA, 100%
  testada): `particionarQuantidade`, `deveParticionar`, `chaveDedup`,
  `acumularComDedup`, `enunciadosParaEvitar`, `rotuloProgresso`, e os tipos
  `ArtefatoLote` / `AoProgresso` / `ProgressoGeracao`.
- **Orquestração** (laço sequencial de lotes) nos serviços existentes
  (`quiz.ts`, `parse.ts` para exercícios), reusando o mesmo `gerar` (modelo
  resolvido **uma vez por `invoke`** via `modeloParaGeracao()`), o parser
  tolerante e a re-tentativa corretiva **por lote**. Critério de parada
  determinístico: continua enquanto `prontos < n` e `tentativas < teto`, com
  `teto = lotes.length + GERACAO_LOTE_TENTATIVAS_MARGEM` (margem fixa 3). Todo
  lote conta como tentativa (inclusive quando a dedup descarta tudo), o que faz o
  laço convergir para o parcial em vez de girar.
- **Prompts** (`montarPromptQuiz`/`montarPromptExercicios`) ganham o parâmetro
  opcional `evitar: string[] = []`; sem ele, o prompt é byte-a-byte o de hoje.
- **IPC/preload/renderer**: canal e método tipados de progresso; Quiz e
  Exercícios exibem "Gerando X de N…".
- **Até 20 itens o comportamento é idêntico ao anterior.** Sem dependência nova.

## Restrição crítica — não regredir

- O contrato de `gerarQuiz`/`gerarExercicios` não muda (ainda devolvem a lista;
  limite 5–100 e `normalizarQuantidade` valendo). O progresso é um canal lateral.
- A classificação de erro offline-vs-falha (convenção 5) e a robustez por lote
  (`format:"json"`, parser tolerante, re-tentativa corretiva) são preservadas.
- A baseline de testes anterior (514) não deve quebrar; os testes novos cobrem a
  lógica pura e os caminhos de lote/parcial/progresso.

## Fora de escopo desta fatia (roadmap restante)

- **Flashcards em lotes** — a base genérica já acomoda; fatia pequena futura.
- **Similaridade difusa / embeddings** para dedup — rejeitado.
- **Lote adaptativo / re-tentativa de lote inteiro** — rejeitado.
- **Filtragem por `geracaoId` no renderer** — desnecessária (uma geração por vez;
  filtro por `artefato` basta).
- **Cancelamento pelo usuário** de uma geração em curso — não pedido; o `disabled`
  atual basta. Melhoria futura.
- **Paralelismo de lotes** — rejeitado (um Ollama local; sequencial é mais
  estável).

## Verificação

- **Automatizada (CI, Ollama mockado):** build + lint + testes verdes. Lógica
  pura testada com entradas fixas; serviços testados com `gerar` injetado
  cobrindo gate, acúmulo, dedup, parcial por infra, parcial por teto, offline no
  1º lote, todos inválidos, progresso crescente e re-tentativa corretiva por
  lote; IPC com o push de progresso exercitado via fake de `event.sender`.
- **Manual (fora do CI):** o comportamento do modelo local real em quantidades
  grandes (variedade entre lotes, pressão de contexto com `n` alto) é verificação
  manual. Primeiro ajuste se houver pressão de contexto: reduzir
  `GERACAO_EVITAR_MAX` (uma linha em `constants.ts`).

## Correção de acabamento (2026-10-28) — teto por estagnação + parcial honesto

> Feedback do usuário: ao pedir 50 questões, o quiz entregou 30 **sem** nenhum
> aviso e **sem** mostrar a contagem no topo — então ele só percebeu o parcial
> contando à mão. Esta correção fecha as duas lacunas (o laço desistia cedo
> demais e o parcial era silencioso) sem mudar o contrato de UI.

### Decisão 6 — Teto do laço: estagnação (K lotes vazios), não margem fixa

- **Problema do teto antigo:** o critério era `tentativas < lotes.length + 3`
  (margem fixa). Para 50 itens a partição é 15+15+15+5 → 4 lotes, teto 7. Se o
  modelo repetia muito (dedup descartando itens), as 7 tentativas se esgotavam
  antes de atingir 50 e o laço entregava o parcial cedo demais, sem persistir
  enquanto ainda havia progresso real.
- **Novo critério (`deveContinuarLotes`, puro):** continua enquanto
  `prontos < alvo` **E** `semProgresso < GERACAO_LOTE_SEM_PROGRESSO_MAX` (K=3)
  **E** `tentativas < tetoAbsoluto`. Qualquer uma das três para o laço.
  - `semProgresso` = lotes **consecutivos** com `aceitos === 0` (vindo de
    `acumularComDedup`). Zera a cada lote que aceita ≥ 1 item novo. Assim o laço
    **persiste** enquanto o modelo ainda produz coisa nova (resolve o "entregou
    30 cedo demais") e **desiste** quando o modelo claramente travou repetindo
    (3 lotes vazios seguidos), sem queimar tempo.
  - `tetoAbsoluto = lotes.length + GERACAO_LOTE_TETO_MARGEM_ABS` (margem 6,
    computada no serviço porque depende de `lotes.length` em runtime, não é
    constante). É só rede de segurança de terminação para o caso degenerado de
    alternar "1 aceito / 0 aceito" indefinidamente; a parada por estagnação
    dispara antes na prática. Garante que o laço SEMPRE termina.
- **`semProgresso` só muda no SUCESSO do `await`** (quando o lote volta e a
  dedup roda), **nunca** no `catch` de infra. Uma falha de Ollama no meio
  continua encerrando o laço e devolvendo o parcial (Decisão 3, intacta) — ela
  não é contada como "estagnação".
- **`tamanhoLote` clampado a `Math.max(1, …)`** na partição, defensivo.
- Constantes novas em `constants.ts`: `GERACAO_LOTE_SEM_PROGRESSO_MAX = 3`,
  `GERACAO_LOTE_TETO_MARGEM_ABS = 6`. A antiga `GERACAO_LOTE_TENTATIVAS_MARGEM`
  (margem fixa 3) foi substituída.
- Aplicado em `quiz.ts` e `parse.ts` (exercícios) com o MESMO critério, via a
  função pura compartilhada.

### Decisão 7 — Como o parcial chega ao renderer (contrato)

- **O contrato de `AppApi` NÃO muda.** `gerarQuiz`/`gerarExercicios` continuam
  devolvendo só a **lista** de itens (sem envelope, sem flag de parcial, sem
  causa). O progresso segue no canal lateral `geracao.progresso`.
- **O parcial é derivado no renderer**, não transmitido pelo main: a view
  **congela `quantidadePedida`** (quanto o usuário pediu) no **sucesso** da
  geração e compara com `lista.length`. Se `lista.length < quantidadePedida`, a
  view renderiza o aviso; senão, `null` (helper puro `avisoGeracaoParcial`).
  - `quantidadePedida` é **resetada no topo de cada `gerar()`** e só regravada no
    sucesso → o aviso **nunca** aparece num erro (erro mostra a mensagem honesta
    de sempre, não "parcial").
- **Mensagem de aviso causa-NEUTRA:** como o contrato não carrega a causa, a
  frase cobre honestamente as duas possibilidades ("o modelo pode não ter
  produzido conteúdo novo suficiente, ou a geração foi interrompida; tente de
  novo ou reduza a quantidade"). Acessível: `role="status"`, `aria-live="polite"`.
- **Contagem no topo do quiz:** o quiz passa a mostrar `N questões · Modo` no
  topo (espelhando a contagem que os Exercícios já tinham), via `ROTULO_MODO_QUIZ`
  e as classes `.quiz-contador` / `.quiz-aviso-parcial` / `.exercicios-aviso-parcial`.
  Assim o usuário vê de imediato quantas questões vieram, sem contar à mão.
- **Distinto do selo "parcial" da avaliação por IA** (veredito Correto/Parcial/
  Incorreto numa resposta): aquele é veredito de correção; este é "veio menos do
  que você pediu".

### Verificação desta correção

- Puros: `deveContinuarLotes` (5 casos) e `avisoGeracaoParcial` (3 casos).
- Serviço (quiz e exercícios): gerou o total; estagnação com reset do contador
  quando um lote volta a produzir; lote extra sempre ≥ 1; falha de infra **após**
  já ter progresso devolve o parcial sem contar como estagnação. Os 2 testes
  antigos de "parcial por teto" foram atualizados para o critério de estagnação.
- **579 testes** verdes (build/lint OK). A validação com o **Ollama real**
  (pedir 50 e ver o aviso + a contagem) continua sendo verificação **manual** do
  usuário — o ambiente de CI não tem GUI nem modelo.
