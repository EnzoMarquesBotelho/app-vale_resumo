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
