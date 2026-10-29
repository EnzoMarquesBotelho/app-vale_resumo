# Implementation Plan — Fatia 3 (quiz diagnóstico + reordenação do plano)

Fonte: `tasks/design-f3.md` (aprovado; NÃO reabrir arquitetura). Worktree
`c:/Dev/.worktrees/plano-f3-diagnostico`, branch `feat/plano-f3-diagnostico`.
Todos os caminhos abaixo são relativos a esse worktree. Ollama SEMPRE mockado
(`gerar` injetado). Sem dependência nova.

**Decisão de estrutura:** sem decomposição em FEATs separadas. As 5 fatias são
estritamente sequenciais e compartilham tipos/constantes; o loop
implementar+revisar existente executa este plano. Cada item deixa a árvore
verde (`npm run build`, `npm run lint`, `npm test`).

**Verificação em TODO item:** `npm run build && npm run lint && npm test`
(tudo passa). Antes do item 1, rodar `npm test` e anotar o baseline real (o
AGENTS.md cita 673; a contagem real vale). A contagem final DEVE ser maior.

- [ ] 1. Constantes, tipos e funções puras de diagnóstico.
      Em `constants.ts` adicionar (com doc-comment) `DIAG_TOPICOS_POR_CAMADA=3`,
      `DIAG_PERGUNTAS_POR_TOPICO=3`, `DIAG_PEDIDO_POR_TOPICO=5` (literal, sem
      importar de `types.ts`), `DIAG_TEXTO_MAX` (= `tamanhoMaximoChunkCaracteres`
      se já estiver em constants.ts; senão 12000 e conferir o valor real),
      `MIN_RESPOSTAS_CAMADA=3`, `LIMIAR_ACERTO_NUM=3`, `LIMIAR_ACERTO_DEN=5`,
      `LIMIAR_ACERTO_DIAGNOSTICO`, `PESO_DIAGNOSTICO=0.5`,
      `DIAG_AMOSTRA_REFERENCIA=9`. Em `types.ts`: exportar
      `PerguntaMultipla = Extract<PerguntaQuiz,{tipo:"multipla"}>`,
      `CamadaDiagnostico`, `PerguntaDiagnostico`, `MotivoTopicoIgnorado`,
      `TopicoIgnorado`, `DiagnosticoPlano`, e `Prova.diagnostico?`.
      Criar `src/shared/diagnostico.ts` (puro; importa só `./constants`,
      `./quizScore` e TIPOS de `./plano`/`./types`) com: `ehTopicoManual`,
      `assinaturaPlano` (JSON.stringify de pares ordenados por code unit),
      `selecionarTopicosDiagnostico`, `planejarDiagnostico`,
      `pontuarDiagnostico` (reusa `calcularPontuacao`), `classificarDiagnostico`
      (limiar por inteiros; intensidade × `min(1,total/9)`), `estadoDiagnostico`,
      `diagnosticoAplicavel`, `resultadoDoDiagnostico`,
      `fraseResultadoDiagnostico` (com `ContextoFrase` incl. `planoDistribuido`),
      `fraseDiagnosticoParcial`, `fraseTopicosIgnorados` (mesmo join/"e mais N"
      de `listaFracos`, título vazio → "(sem título)", nunca omite),
      `rotuloProgressoDiagnostico`. `AjusteDiagnostico` é definido em `plano.ts`
      (item 2); para manter este item buildável, declarar o tipo em `plano.ts`
      já aqui (apenas `export interface AjusteDiagnostico`) e importá-lo.
      Criar `tests/shared/diagnostico.test.ts` cobrindo (design §13.1): tabelas
      de §5.2 (assinatura incl. colisão `"a,b:1"`, seleção incl. `max<1`,
      planejar incl. só-base-manual/só-novo/1ª prova/amostra de 7), pontuar
      ("Não sei" -1, índice fora, escolhas curto), os 18 casos de §5.3 com
      `toBeCloseTo`, limiar por inteiros (3/5 não baixa; 2/5, 5/9 baixa; 6/10
      não), invariantes (`intensidade∈[0,1]`, aplicável⇔intensidade>0, `[]` não
      lança, monotonia na amostra), tabela §5.4, os 16 casos de §5.5 com `toBe`
      exato (incl. 4 fracos → "e mais 1", id ausente omitido, casos 15–16
      `planoDistribuido=false` nunca com "máximo de foco"), parcial
      `(12,18)/(18,18)/(20,18)/(0,0)`, ignorados (2 exemplos, vazio, 4
      ignorados), rótulo de progresso (`total>0` e `<=0`).
      Files: `src/shared/constants.ts`, `src/shared/types.ts`,
      `src/shared/plano.ts` (só o tipo), `src/shared/diagnostico.ts` (novo),
      `tests/shared/diagnostico.test.ts` (novo).
      Verify: `npx vitest run tests/shared/diagnostico.test.ts` passa; depois
      build + lint + `npm test` verdes.

- [ ] 2. Ajuste da distribuição na régua (depende do item 1).
      Em `plano.ts`: param opcional `diagnostico?: AjusteDiagnostico` em
      `MisturaBaseNovoParams` e `CalcularPlanoParams`; no fim do Passo 3 de
      `calcularMisturaBaseNovo` (após `baseAjustada`, só se definido) aplicar
      `i=clamp(finito?i:0,0,1)`; lacuna_base: `base+PESO·i·(TETO−base)`;
      dificuldade_novo: `base−PESO·i·(base−PISO)`; Passo 0 (um lado vazio) fica
      antes de tudo. `calcularPlano` repassa o param e, se `diagnostico`
      definido, calcula `semDiag` (mesmos campos sem diagnóstico) e anexa por
      spread condicional `diagnosticoAplicado` SÓ se `fracaoBase` difere
      (`PlanoCalculado.diagnosticoAplicado?`). Sem o param, o objeto retornado
      não ganha chave nova. Não tocar no resto do algoritmo.
      Acrescentar (NÃO alterar os existentes) em `tests/shared/plano.test.ts`
      (design §13.2): regressão `toEqual` na grade (dias {0,1,7,15,30,60} ×
      dificuldade {0,0.5,1} × totais {(1,1),(3,2),(0,2),(2,0)}) com diagnóstico
      ausente e com `intensidade:0`; tabela §6.3 inteira (`toBeCloseTo(x,3)`);
      monotonia 0..1 passo 0.1 e ordenação `novo ≤ sem ≤ lacuna`; limites
      (`fracaoBase∈[PISO,TETO]`, novo>0 com prova hoje); modulação pelo tempo
      (a)(b)(c) em {0,1,7,15,29,30,60}; `diagnosticoAplicado` presente (15 dias
      lacuna i=1) e ausente (30 dias lacuna; 0 dias dificuldade_novo;
      totalNovo=0; totalBase=0; i=0; param omitido → sem a chave); `i=NaN`,
      `i=2`, `i=-1`; invariantes da fatia 2 com diagnóstico na grade (dia ≤
      capacidade, bloco ≥ 15, terminação, oráculo de conservação
      `Σ≤capTotal` e sem aviso `Σ≥capTotal−14·dias(folga<15)`) e reexecução do
      teste de conservação exato existente com `diagnostico` na grade.
      Files: `src/shared/plano.ts`, `tests/shared/plano.test.ts`.
      Verify: `npx vitest run tests/shared/plano.test.ts`; testes antigos
      passam sem edição; build + lint + `npm test`.

- [ ] 3. Persistência em `provas.ts` (depende do item 1).
      Adicionar `sanearDiagnosticoPersistido(bruto)` (exportado; nunca lança;
      descarta perguntas inválidas; respostas/concluidoEm omitidos se
      desalinhadas; `pedido` inteiro ≥1 senão `perguntas.length`; `ignorados`
      filtrado; chaves opcionais por spread condicional), chamado em
      `carregarProva`/`carregarTodas` SOMENTE se a chave `diagnostico` existir.
      `salvarDiagnostico(id, d, baseDir?)` (sem `assinaturaUsada`): recarrega;
      plano ausente ou `d.assinatura !== assinaturaPlano(prova.plano)` ⇒
      `DadosProvaInvalidosError("Os assuntos do plano mudaram enquanto eu
      preparava o diagnóstico. Tente de novo.")`; senão `escreverProva`
      (atômico) com `atualizadoEm`. `registrarRespostasDiagnostico(id,
      escolhas, agora, baseDir?)`: diagnóstico ausente ⇒ mensagem PRÓPRIA
      (distinta de "escolhas inválidas"); array com `length===perguntas.length`
      e ints em `[-1,nAlt−1]` senão "Responda todas as perguntas para ver o
      resultado."; grava `respostas`/`concluidoEm` via spread.
      Testes em `tests/main/provas.test.ts` (acrescentar; tmpdir): round-trip
      salvar→carregar; respostas gravadas; sem `.tmp` órfão; prova ANTIGA
      (sem `diagnostico`, com e sem `plano`) idêntica a hoje; bloco corrompido
      (`"x"`, perguntas inválidas, respostas desalinhadas) ⇒ descartado/pendente
      sem lançar e sem chave `undefined`; `salvarPlano` preserva `diagnostico`;
      horas/dia não invalida, mudar `novo` ⇒ `desatualizado`; assinatura
      divergente ⇒ erro e arquivo intacto; escolhas com length errado/índice
      fora ⇒ `DadosProvaInvalidosError`; diagnóstico ausente ⇒ mensagem própria.
      Files: `src/main/services/provas.ts`, `tests/main/provas.test.ts`.
      Verify: `npx vitest run tests/main/provas.test.ts`; build + lint + test.

- [ ] 4. Wiring do plano calculado (depende dos itens 2–3).
      Em `planoCalculo.ts`: extrair e exportar `ordenarTopicosDoPlano(plano)`
      (refator puro, mesmo comportamento) e, em `montarPlanoCalculado`, após
      montar `params`, acrescentar `...(ajuste ? { diagnostico: ajuste } : {})`
      com `ajuste = diagnosticoAplicavel(prova.plano, prova.diagnostico)`. O
      ramo `prova_passou` retorna antes e não aplica/anexa.
      Testes em `tests/main/services/planoCalculo.test.ts` (acrescentar):
      lacuna_base ⇒ `mistura.fracaoBase` maior e `diagnosticoAplicado`
      presente; desatualizado/inconclusivo/sem_dificuldade/pendente ⇒ `toEqual`
      ao sem diagnóstico; prova passada ⇒ sem `diagnosticoAplicado`; prova
      antiga idêntica à fatia 2.
      Files: `src/main/services/planoCalculo.ts`,
      `tests/main/services/planoCalculo.test.ts`.
      Verify: `npx vitest run tests/main/services/planoCalculo.test.ts`; testes
      existentes sem edição; build + lint + test.

- [ ] 5. Orquestração da geração `src/main/services/diagnostico.ts` (depende
      dos itens 1, 3, 4).
      Exportar `DiagnosticoIndisponivelError`, `DiagnosticoInsuficienteError`,
      `DiagnosticoEmAndamentoError`, `mensagemAmigavelDiagnostico` (tabela §9.1,
      texto exato, nunca lança, `GeracaoFalhouError` sem "offline"/"quantidade")
      e `gerarDiagnostico({plano, carregarTexto, gerar?, aoProgresso?, agora})`.
      Passos: `ordenarTopicosDoPlano`; para não manuais `carregarTexto` em
      try/catch (rejeição ⇒ null; corta em `DIAG_TEXTO_MAX` + trim; vazio ⇒ sem
      texto); `planejarDiagnostico`; `indisponivel` ⇒ erro ANTES de chamar a IA;
      por tópico (base primeiro) `gerarQuiz({texto, modo:"multipla",
      quantidade:DIAG_PEDIDO_POR_TOPICO, gerar})` reaproveitando `src/main/
      services/quiz.ts` SEM alterá-lo; filtro `p.tipo==="multipla"`; manter 3;
      carimbar `{topicoId, camada}` pelo `TopicoPlano.novo` (nunca da IA);
      `aoProgresso(feitos,total)` por tópico. Laço conforme tabela §7.1:
      `QuizInvalidoError`/`SemTextoParaQuizError`/0 multipla ⇒ `nao_gerou`;
      `OllamaIndisponivelError` ⇒ relança; `GeracaoFalhouError` com
      acumuladas=0 ⇒ relança, com >0 ⇒ este e todos os não processados em
      `nao_gerou` e encerra. Aborto antecipado: ao fim da camada base com <3
      perguntas ⇒ `DiagnosticoInsuficienteError` sem tocar nos novos (exceto se
      a base terminou por `GeracaoFalhouError`: relança o original). Passo 6:
      base ≥3 senão erro; devolve `DiagnosticoPlano` pendente com `assinatura`,
      `pedido = planejados × 3`, `ignorados`.
      Criar `tests/main/services/diagnostico.test.ts` (design §13.3): caminho
      feliz (2 base+1 novo; rótulo vindo do plano mesmo com `camada` forjada no
      JSON do mock; 3/tópico; base antes de novo; assinatura; progresso
      (1,3),(2,3),(3,3); 1 chamada por tópico, nenhum prompt de condensação com
      texto enorme); manual ⇒ `manual`; doc ausente e `carregarTexto` que
      rejeita ⇒ `sem_texto`; sem base com texto ⇒ Indisponível e `gerar` nunca
      chamado; parcial (2 perguntas) válido com `pedido>perguntas.length`; lixo
      duas vezes ⇒ `nao_gerou`; só `aberta` ⇒ `nao_gerou`; base<3 ⇒
      Insuficiente e `gerar` só nos tópicos base; Ollama offline no 1º e no
      meio propaga; `GeracaoFalhouError` no 1º propaga (≠ offline), no 3º de 4
      com base≥3 ⇒ 3º e 4º em `ignorados` como `nao_gerou`, no 2º com base<3 ⇒
      relança o original; as 8 linhas de `mensagemAmigavelDiagnostico` com
      `toBe` e entradas `undefined`/string.
      Files: `src/main/services/diagnostico.ts` (novo),
      `tests/main/services/diagnostico.test.ts` (novo).
      Verify: `npx vitest run tests/main/services/diagnostico.test.ts`; build +
      lint + test.

- [ ] 6. Cadeia IPC (depende do item 5).
      `geracaoLotes.ts`: `ArtefatoLote` += `"diagnostico"` (aditivo; checar
      `tests/shared/geracaoLotes.test.ts`). `ipc.ts`: canais
      `gerarDiagnostico: "prova:gerar-diagnostico"` e
      `responderDiagnostico: "prova:responder-diagnostico"` + tipos em
      `ApiDoRenderer`. `preload.ts`: expor os 2 métodos. `ipc/index.ts`: handler
      `gerarDiagnostico(id)` com `emGeracao: Set<string>` (liberado em
      `finally`; repetida ⇒ `DiagnosticoEmAndamentoError`), `carregarProva`,
      plano ausente ⇒ `DadosProvaInvalidosError("Monte o plano de estudo antes
      de fazer o diagnóstico.")`, `modeloParaGeracao()`, `carregarTexto` que
      captura QUALQUER erro ⇒ null, `empurrarProgresso(event,"diagnostico")`,
      `salvarDiagnostico`; erro ⇒ `throw new Error(mensagemAmigavelDiagnostico
      (erro))`. Handler `responderDiagnostico(id, escolhas)` ⇒
      `registrarRespostasDiagnostico`. `renderer/api.ts`: se `getApi()` mapeia
      métodos explicitamente, incluir; manter sem `window.api?.`.
      Teste: acrescentar em `tests/main/` seguindo `ipc-quiz.test.ts` (ler antes
      para o padrão de mock) cobrindo: guarda de concorrência liberada em
      `finally`, plano ausente, e que erro de geração sai com a mensagem do
      §9.1; se o padrão não permitir testar o handler sem Electron, cobrir via
      `mensagemAmigavelDiagnostico` (já no item 5) e dizer isso no relatório.
      Files: `src/shared/geracaoLotes.ts`, `src/shared/ipc.ts`,
      `src/main/preload.ts`, `src/main/ipc/index.ts`, `src/renderer/api.ts`,
      teste em `tests/main/`.
      Verify: build (tsc cobre o contrato da cadeia) + lint + `npm test`.

- [ ] 7. UI (depende do item 6).
      a) Extrair a `<section className="plano-previa">` e helpers
      (`formatarMinutos`, `formatarData`, `fraseAviso`) de `PlanoEstudo.tsx`
      para `src/renderer/views/PlanoPrevia.tsx` (presentacional, só mover);
      `PlanoEstudo.tsx` passa a usá-lo sem mudar comportamento.
      b) Criar `Diagnostico.tsx` (props `{prova, aoAtualizar}`; só `getApi()`)
      com a máquina de estados do §10: nenhum (texto varia com
      `temNovoNoPlano`; botão desabilitado + `aria-describedby` se não há base
      não manual; aviso de manuais), gerando (`role="status"`
      `aria-live="polite"`, `aoProgressoGeracao` assinado ANTES do `await`,
      filtra `artefato==="diagnostico"`, cancela no `finally`, como `Quiz.tsx`),
      pendente (`<fieldset>/<legend>`, radios + "Não sei", "Ver resultado" só
      com tudo respondido, avisos de parcial/ignorados), concluído
      (`calcularPlano(id)` → `fraseResultadoDiagnostico` com `{novoPlanejado,
      efeitoNoPlano: diagnosticoAplicado!==undefined, planoDistribuido:
      mistura!==undefined}`, nota "orientação de estudo, não previsão da
      prova", "Feito em DD/MM/AAAA", `PlanoPrevia`, selo "Plano ajustado pelo
      diagnóstico" só com `diagnosticoAplicado`, "Refazer" com confirmação
      inline), desatualizado (aviso + Refazer), erro (`agenda-erro`
      `role="alert"`, diagnóstico anterior permanece).
      c) `Agenda.tsx`: montar `<Diagnostico>` logo APÓS `{montandoPlano &&
      <PlanoEstudo/>}` e ANTES da Dica do dia, com condição `plano !==
      undefined && !montandoPlano` E prova NÃO passada (ocultar se já passou);
      `aoAtualizar = setProvaSelecionada`. `styles.css` só se faltar classe
      (somente tokens de tema).
      Files: `src/renderer/views/PlanoPrevia.tsx` (novo), `Diagnostico.tsx`
      (novo), `PlanoEstudo.tsx`, `Agenda.tsx`, `src/renderer/styles.css`.
      Verify: `npm run build`, `npm run lint`, `npm test` verdes (renderer sem
      testes de componente; fluxo visual NÃO verificável automaticamente —
      declarar no relatório: radios/teclado/tema/latência real do Ollama e o
      passo manual da posição do card na Agenda, usando `Facul` só leitura).

- [ ] 8. Documentação e fechamento (depende de tudo).
      Rodar `npm run build`, `npm run lint`, `npm test`; registrar contagem
      REAL (> baseline) e `git log`. Atualizar `tasks/PROGRESSO.md` (HEAD, total
      de testes, item entregue, roadmap restante), `tasks/todo.md` (marcar
      fatia 3 em "Fases pós-MVP", cabeçalho HEAD/testes) e `README.md`
      (usuário, pt-BR: "Diagnóstico rápido" no plano de estudo: o que faz,
      opcional, só múltipla escolha, refazer, plano ajustado). Os três
      consistentes entre si. Commits por fatia (4 commits verdes conforme o
      design §14; nunca push).
      Files: `tasks/PROGRESSO.md`, `tasks/todo.md`, `README.md`.
      Verify: `npm run build && npm run lint && npm test` verdes.

## Digest

Verificado nesta exploração (código lido/listado, nada executado ainda):
- `src/shared/plano.ts`: exports `MisturaBaseNovoParams` (L24),
  `calcularMisturaBaseNovo` (L68), `CalcularPlanoParams` (L109), `PlanoCalculado`
  (L149), `calcularPlano` (L283). Teste: `tests/shared/plano.test.ts`.
- `src/main/services/planoCalculo.ts`: `montarPlanoCalculado(prova, hoje)` (L53).
  Teste: `tests/main/services/planoCalculo.test.ts`.
- `src/main/services/provas.ts`: `carregarProva` (L236), `carregarTodas` (L261),
  `sanearPlano` (L505), `salvarPlano` (L601), `escreverProva` (L115, atômico),
  erros `ProvaNaoEncontradaError` (L73)/`DadosProvaInvalidosError` (L83). Teste:
  `tests/main/provas.test.ts`.
- `src/main/services/quiz.ts`: `gerarQuiz`, `parseQuiz`, `QuizInvalidoError`,
  `SemTextoParaQuizError` (não alterar). Testes de IPC existentes:
  `tests/main/ipc-quiz.test.ts`.
- `src/shared/geracaoLotes.ts` L15: `ArtefatoLote = "quiz" | "exercicios"`.
- `src/shared/ipc.ts`: canais `prova:*` (ex.: `calcularPlano: "prova:calcular-plano"`).
- `src/renderer/views/Agenda.tsx` (estado `montandoPlano` L132, import
  `PlanoEstudo` L14); `PlanoEstudo.tsx` (`formatarMinutos` L32, `formatarData`
  L41, `fraseAviso` L58, `<section className="plano-previa">` L420).
- Não existem ainda: `src/shared/diagnostico.ts`, `src/main/services/
  diagnostico.ts`, `Diagnostico.tsx`, `PlanoPrevia.tsx`.
- Comandos: `npm run build`, `npm run lint`, `npm test` (vitest run). Baseline
  de testes NÃO executado nesta etapa (AGENTS.md: 673); conferir no item 1.
- `tasks/design-f3.md` tinha edições não commitadas (nota do orquestrador) no
  início deste passo.
