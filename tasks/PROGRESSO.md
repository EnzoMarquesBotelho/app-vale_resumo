# Progresso do App "Desenrola"

> Nome do app definido: **Desenrola** (tagline "estudo sem complicação").
> Onde paramos — atualizado em 2026-10-30.

## Estado atual (branch master; Plano de estudo guiado COMPLETO — 4/4, fatia 4 já mergeada)

- **Em andamento (branch `feat/unifica-agenda-plano`, ainda NÃO mergeada):**
  **Agenda de revisão + Plano de estudo numa linha do tempo única** e fluxo de
  criação da prova unificado (nome automático, ENEM/ENADE, datas passadas
  bloqueadas). Build, lint e **1015 testes** passando (61 arquivos; +70 sobre
  os 945 da master, conferidos de verdade com `npm test`). Referência estável:
  **commit de implementação `9664187`** + design `f85c87e`/`4f61e2e` + o commit
  de docs da fatia (hash dele não citado aqui de propósito: autorreferência).
  Decisões em `roadmap-unificacao-agenda-plano.md`; detalhes em "Entregue".
- Build, lint e **945 testes** passando na master (58 arquivos de teste), conferidos de
  verdade na master após o merge fast-forward da fatia 4 (a master estava em
  `bc81789` antes do merge; baseline anterior: 781). Entregue e na master:
  **Plano de estudo guiado — Fatia 4/4** (checkpoints "pré-provas": listas de
  exercícios a 28/14/7/3 dias da prova, em modo lembrete ou automático,
  alterável depois). Com ela o **Plano de estudo guiado está COMPLETO (4/4)**.
  Referência estável: **commit de implementação `920e779`** (`feat: checkpoints
  pre-prova na Agenda…`, sobre `bc81789`) + os commits de design
  `ff038e4`/`b6c108b` + o commit de docs da fatia (`82f7df5`). O hash do commit
  que atualiza este cabeçalho não é citado aqui de propósito (autorreferência).
  Histórico da contagem: fatia 1 = 614; fatia 2 = 635 → 673; fatia 3 = 781;
  **fatia 4 = 945** (+164). Cresce, nunca encolhe.
- Fatia anterior (na master): **Plano de estudo guiado — Fatia 3/4** (quiz
  diagnóstico), implementação `e533d17` + docs `d2193f8`.
- Fatia anterior (já na master): **Plano de estudo guiado — Fatia 2/4**
  (questionário + régua base/novo + distribuição por dias), dois commits de
  feature (`48afc38`, `fabd62b`) + docs (`3a3a8de`, `16ea5c0`), master `16ea5c0`
  → `b4b6cc2` (docs).
- Fatia anterior na master: `c6d3852` (geração em lotes — implementação),
  seguida do roadmap/sincronização de docs e da correção de acabamento da
  própria fatia (parcial honesto + contagem no quiz) com seu commit de docs.
- **Publicado no GitHub:** `EnzoMarquesBotelho/app-vale_resumo`. Release pública
  `v0.1.1` (com `latest.yml`); versão atual do `package.json` = `0.1.1`.
- Ollama local do usuário tem `llama3.1:latest`, `qwen2.5`, `gemma2` (e também
  `moondream`/embeddings, que são inadequados para gerar JSON).

## Entregue (MVP + fatias pós-MVP)

- **MVP:** importar .txt/.md/.pdf → gerar resumo (curto/longo), flashcards
  (5–100) e exercícios (teórica/prática/mista) via IA local; persistência em
  JSON; empacotamento Windows.
- **Correções de robustez:** reconciliação/resolução de modelo instalado no
  momento da geração (evita 404 "model not found"); seletor aceita txt/md;
  ponte `window.api` com erro visível via `getApi()`; aviso de falha de
  persistência.
- **Cadernos (notebooks):** Caderno → Documento; caderno sugerido pela pasta-mãe
  (fallback "Geral"); sugestão editável na importação; Histórico de dois níveis;
  migração idempotente de documentos antigos.
- **Mapas mentais:** árvore hierárquica gerada por IA; visualização SVG própria
  navegável (expandir/colapsar, zoom, pan); salvo no documento. Edição manual
  ficou no roadmap.
- **Geração JSON consistente:** `format:"json"` forçado nas gerações
  estruturadas (mapa/flashcards/exercícios); até 3 tentativas no mapa; mensagens
  orientando usar modelo de texto. Verificado 5/5 contra o Ollama real.
- **Importar pasta (lote, recursivo):** escolher pasta → varre subpastas →
  importa só o texto de cada arquivo suportado → caderno derivado do caminho
  relativo à pasta escolhida; dedup por caminho de origem; limites de
  profundidade/quantidade; resultado do lote em pt-BR.
- **Agenda de revisão + Provas + Dicas do dia:** cadastrar provas (título, data,
  vínculo a um caderno OU avulsa abrangente tipo ENEM/ENADE com modo rotação ou
  intercalado); contagem regressiva por prova; agenda por repetição espaçada
  (7/3/1, nunca no passado) com edição manual (adicionar/mover/remover/marcar
  feita); dica do dia mecânica + botão "Dica da IA" opcional. Lógica de
  agendamento pura e testável (relógio injetado). Aba "Agenda". Verificado com
  datas fixas.
- **Quizzes interativos:** IA gera quiz novo do texto (modo múltipla/aberta/
  misto, 5–100); fluxo responder tudo → revisar (acerto/erro na própria questão,
  alternativa correta destacada nas fechadas, gabarito nas abertas) + pontuação
  das objetivas; autoavaliação nas abertas; salvo no documento, reabrível e
  refazível. Aba "Quiz". Verificado 3/3 modos contra o Ollama real.
- **Correção da mensagem falsa "Ollama não está rodando"** (`fix-geracao-ollama-offline-falso.md`):
  `generate()` classifica o erro em 3 — recusa de conexão → "Ollama offline"
  (só aí); abort/timeout/queda no meio → `GeracaoFalhouError` com mensagem
  honesta ("a geração falhou ou demorou demais; reduza a quantidade"); HTTP
  não-ok → erro genérico. Timeout explícito de 5 min via AbortController. Os 6
  mapeadores de mensagem dos handlers reconhecem o novo erro. Verificado (abort
  vs recusa vs HTTP 500) com fetch mockado.
- **Correção por IA (exercícios + abertas do quiz)** (`roadmap-correcao-ia.md`):
  mecanismo único (`avaliacao.ts`) que avalia resposta dissertativa e devolve
  veredito **Correto/Parcial/Incorreto** + comentário (pt-BR), com
  `format:"json"`, parser tolerante, 1 re-tentativa, estado seguro
  `nao_avaliado` e `modeloParaGeracao()`. Exercícios ganham campo de resposta +
  botão "Corrigir com IA" (sempre IA). Quiz ganha alternador autoavaliação ⇆ IA
  (padrão autoavaliação; só as abertas vão à IA; múltipla escolha intacta;
  fallback de gabarito se a IA falhar). Respostas vazias não vão ao modelo.
  Verificado contra o Ollama real (correto/incorreto/nao_avaliado). Nota: o
  `llama3.1` tende ao binário — "parcial" existe no schema mas o modelo o usa
  pouco (limitação do modelo, não do código).
- **Exportação (Markdown + PDF)** (`roadmap-exportacao.md`): exporta por artefato
  E o documento inteiro para **Markdown** e **PDF**. Markdown em funções puras
  (`src/shared/export/`); PDF via **`pdfmake@0.2.20`** (1ª dependência nova do
  projeto, pinada) montado no main; mapa mental entra no PDF como **SVG
  vetorial** e no Markdown como **lista aninhada**. Salvar via `showSaveDialog`
  (default em Documentos, nunca Facul); exporta só os artefatos presentes;
  100% local, sem Ollama. Verificado com PDF binário real (`%PDF-`, ~25 KB,
  com o mapa) e Markdown do documento.
- **Redesenho (sidebar) + temas claro/escuro** (`roadmap-redesign-temas.md`):
  REDESENHO só de UI — a navegação por 8 abas virou **barra lateral**
  (Biblioteca + Agenda); os 5 artefatos + exportação vivem na **tela do
  documento aberto**. **Temas Claro / Escuro / Automático** (automático segue o
  SO via `nativeTheme`), preferência persistida, padrão automático; função pura
  `resolveEffectiveTheme` + dois conjuntos de tokens em `styles.css` trocados por
  `data-theme`. Acessibilidade: teclado na sidebar, `aria-current`, foco visível,
  metas de contraste WCAG AA. ZERO dependência nova. Lógica de negócio intocada:
  as 5 views de artefato foram REUSADAS (byte-idênticas), só o shell mudou — os
  468 testes de lógica seguem verdes + 8 novos de tema (476/41). Verificado: a
  regra pura de tema (6 casos) e que a suíte não regrediu. Aparência é
  verificação manual.
- **Geração em lotes (chunks) para quiz e exercícios** (`roadmap-geracao-lotes.md`,
  design e review aprovados): quando o usuário pede uma quantidade grande (acima
  de 20) de perguntas de quiz ou de exercícios, a geração passa a ser feita em
  vários pedidos menores ao Ollama (lotes de 15), acumulando e deduplicando os
  itens até atingir o total — sem estourar o timeout de 5 min de um pedido
  gigante. A tela mostra o progresso ("Gerando X de N…") durante a geração. Se
  um lote falha depois de já ter acumulado itens, o app entrega o parcial (não
  perde tudo); se o 1º lote falha sem nada, a mensagem honesta de sempre (Ollama
  offline vs. geração falhou) aparece. A lógica de particionar/acumular/
  deduplicar é pura (`src/shared/geracaoLotes.ts`), 100% testada. Flashcards
  ficaram de fora desta fatia (ver roadmap restante). Até 20 itens o
  comportamento é idêntico ao de antes. 563 testes (514 + 49, Ollama mockado).
  Verificado: build/lint/testes verdes. O comportamento do modelo local real em
  quantidades grandes é verificação manual (fora do CI).
- **Correção de acabamento da geração em lotes** (`roadmap-geracao-lotes.md`,
  seção "Correção de acabamento 2026-10-28"): o usuário pediu 50 questões, o
  quiz entregou 30 **sem aviso** e **sem contagem** no topo (só percebeu
  contando à mão). Dois ajustes, sem mudar o contrato de UI:
  (a) **teto do laço afrouxado** — a parada por margem fixa (`lotes.length + 3`,
  que desistia cedo demais quando a dedup descartava muito) virou **parada por
  estagnação**: continua enquanto há progresso real, desiste após **3 lotes
  consecutivos sem item novo** (`GERACAO_LOTE_SEM_PROGRESSO_MAX`), com um teto
  absoluto de segurança `lotes.length + 6` que garante terminação; critério
  numa função pura (`deveContinuarLotes`) aplicada a quiz e exercícios;
  (b) **aviso de parcial honesto** — quando a lista vem **abaixo** do pedido, a
  view mostra um aviso pt-BR acessível (`role=status`) com mensagem causa-neutra
  ("geramos X de N; o modelo pode não ter produzido conteúdo novo suficiente ou
  a geração foi interrompida"), derivado no renderer comparando `lista.length`
  com a `quantidadePedida` congelada no sucesso — o contrato `AppApi` não muda
  (a lista continua a ser o único retorno);
  (c) **contagem no topo do quiz** (`N questões · Modo`, espelhando os
  Exercícios), para o usuário ver de imediato quantas vieram.
  579 testes (563 + 16, Ollama mockado); build/lint verdes. A validação com o
  Ollama real (pedir 50 e ver o aviso + a contagem) é verificação **manual** do
  usuário (CI sem GUI/modelo).
- **Plano de estudo guiado — Fatia 1/4: captura de data + ordenação mecânica**
  (`roadmap-plano-estudo-guiado-f1.md`; fatia `d4df16b` + commit de docs):
  fundação 100% mecânica/lógica pura, **sem IA**, para a ordenação base→novo do
  plano guiado. Três peças: (a) **captura de uma data por documento na
  importação** (arquivo único e pasta), no main, com hierarquia de fonte — data
  interna do PDF (`CreationDate`, fallback `ModDate`) via `getMetadata()` do
  `pdfjs-dist` já instalado; senão o `mtime` do disco (reaproveitando o `stat`
  existente, sem syscall extra); senão indefinida. `.txt`/`.md` vão direto ao
  mtime. (b) **Campo novo `dataArquivo?`** (ISO 8601 UTC canônica) adicionado de
  forma **aditiva/retrocompatível** em `Documento`, `DocumentoSalvo`,
  `ArquivoImportado` e `ResumoDocumentoSalvo`; documentos antigos sem o campo
  carregam normalmente (leitura tolerante; sem backfill). (c) **Função pura
  `ordenarCronologicamente`** (`src/shared/cronologia.ts`): ordena do mais antigo
  (base) ao mais recente (novo), determinística, estável, não muta a entrada,
  não lê o relógio; itens sem data vão ao final por `id`. Acomoda uma
  **sobreposição manual opcional** por parâmetro (`ordemManual: Map<id, posição>`,
  semântica de prefixo — fixados vêm à frente na ordem pedida, o resto por data);
  quando omitida, a ordenação é 100% por data (regra padrão automática).
  Parsing tolerante da data do PDF em `src/shared/pdfDate.ts` (`parsearDataPdf`)
  e guarda `ehIsoPlausivel` (round-trip de `toISOString()`). Zero dep nova. 614
  testes (579 + 35, Ollama não envolvido); build/lint verdes. **Verificação
  manual do usuário:** a extração de data de um PDF **real** end-to-end (os
  testes usam a fixture `com-data.pdf`, não PDFs reais variados). A ordenação é
  **interna** — nada perceptível ainda na UI nesta fatia.
- **Plano de estudo guiado — Fatia 2/4: questionário + distribuição por dias**
  (`design-f2.md`/`plan-f2.md`; branch `feat/plano-f2-questionario`, dois
  commits): o aluno monta um **plano de estudo** a partir de uma prova já
  cadastrada na Agenda e vê uma **prévia dia-a-dia do que estudar**. Sem IA —
  tudo é lógica pura + persistência JSON + UI. **Commit A (persistência):** bloco
  opcional/aditivo `plano?` em `Prova` com as respostas do questionário (qual
  prova é — 1ª/2ª/final; horas/dia; dias/semana; assuntos com dificuldade e
  "cai na prova"; preferência de checkpoint), saneado no padrão de `provas.ts`
  (clamps silenciosos; ordinal e ≥1 assunto obrigatórios), gravação por spread
  condicional (prova antiga sem plano continua válida), canal IPC `salvarPlano`
  tipado ponta-a-ponta, e o formulário acessível `PlanoEstudo.tsx` encaixado no
  header da prova selecionada. **Commit B (cálculo):** a **régua base/novo**
  pura (`src/shared/plano.ts`) — proporção contínua de esforço que, quanto mais
  longe a prova, mais foca na base (até um teto de 80%, nunca 100%: o conteúdo
  novo nunca zera) e, quanto mais perto, mais no conteúdo novo com alguns toques
  na base; base difícil puxa mais tempo para a base. A **distribuição por dias**
  pura reparte o tempo entre os assuntos ao longo dos dias úteis até a véspera,
  prioriza o difícil, nunca cria dias que não existem nem blocos curtos demais, e
  é **honesta quando não cabe** (avisa quantos assuntos ficaram de fora). O
  serviço `planoCalculo.ts` (no main, sem IA) monta as datas disponíveis, ordena
  os assuntos base→novo (reusando `cronologia.ts` + a ordem manual) e chama o
  puro; o canal IPC `calcularPlano` recalcula sob demanda (nada é persistido). A
  prévia aparece no próprio formulário após salvar ("plano montado em {data}", a
  divisão base/novo em %, os dias com os blocos e as frases honestas de aviso).
  Helpers puros novos: `datasEntre` (`agenda.ts`) e as constantes da régua
  (`HORIZONTE_DIAS`/`PISO_BASE`/`TETO_BASE`/`PESO_DIFICULDADE`/
  `MINUTOS_BLOCO_MIN`). Zero dependência nova. 673 testes (614 → 635 → 673);
  build/lint verdes. **Verificação manual do usuário:** o encaixe visual e a
  acessibilidade do formulário/prévia na Agenda e a "sensação" do plano com
  dados reais (o cálculo tem testes de borda próprios, mas a aparência não).
  Fora de escopo (próximas fatias): quiz diagnóstico (3) e geração/lembrete dos
  checkpoints (4); a UI de reordenar manualmente a cronologia (só o contrato
  persistido entrou).
- **Plano de estudo guiado — Fatia 3/4: quiz diagnóstico + plano ajustado**
  (`design-f3.md`/`plan-f3.md`, decisões em `roadmap-plano-estudo-guiado-f3.md`;
  branch `feat/plano-f3-diagnostico`, implementação até `e533d17`): na Agenda,
  abaixo do plano, um card oferece um **diagnóstico opcional** — até 18 perguntas
  de múltipla escolha geradas pela IA local a partir dos documentos dos assuntos
  do plano (até 3 assuntos de base + 3 novos, 3 perguntas cada; opção "Não sei"
  conta como erro). O resultado diz, em linguagem simples, se a dificuldade
  parece estar na **base** ou no **conteúdo novo**, quais assuntos estão mais
  fracos, e o plano é **recalculado** deslocando a mistura base/novo (nunca zera
  nenhum dos lados). Sem diagnóstico, ou com resultado inconclusivo/sem
  dificuldade/desatualizado, o plano é idêntico ao da fatia 2. A IA só **gera**
  as perguntas: o rótulo base/novo é herdado do assunto, a correção é mecânica e
  a classificação/distribuição são funções puras. Peças: tipos + funções puras
  (`src/shared/diagnostico.ts`: classificação por limiar inteiro 3/5,
  intensidade encolhida pela amostra `min(1,total/9)`, frases exatas da UI),
  param opcional `diagnostico?` na régua/`calcularPlano` (+ `diagnosticoAplicado`
  só quando de fato mudou a mistura), `Prova.diagnostico?` aditivo (irmão de
  `plano`, escrita atômica, leitura tolerante, validade por assinatura do
  plano), orquestração no main (`services/diagnostico.ts`, reusa `gerarQuiz`
  sem alterá-lo; falha parcial honesta), 2 canais IPC (`gerarDiagnostico`,
  `responderDiagnostico`) com progresso, extração da prévia para
  `PlanoPrevia.tsx` e a UI `Diagnostico.tsx`. Refazer substitui o anterior só
  após sucesso; card oculto para prova já passada. Zero dep nova; 781 testes
  (673 + 108, Ollama mockado); build/lint verdes. **Verificação manual do
  usuário (NÃO coberta por testes):** qualidade real das perguntas do
  `llama3.1`, lentidão da geração (até 6 chamadas sequenciais, sem botão
  cancelar), comportamento parcial real, e encaixe visual/teclado/tema do card.
  Teste real contra o Ollama: **não tentado** nesta etapa.
- **Plano de estudo guiado — Fatia 4/4: checkpoints pré-provas** (**COMPLETA o
  plano guiado**; `design-f4.md`, decisões em
  `roadmap-plano-estudo-guiado-f4.md`; branch `feat/plano-f4-checkpoints`,
  implementação `920e779`): na Agenda, abaixo do Diagnóstico, o card
  **Checkpoints** mostra até 4 pontos fixos a **28/14/7/3 dias da prova** (só
  os que caem depois da data-base do plano e cobrem ≥ 1 assunto). Cada ponto
  gera uma **lista de 8 exercícios (modo mista)** dos assuntos que o plano de
  referência já terminou de agendar até ali (até 6 assuntos, texto-base ≤ 12000
  caracteres), reusando `gerarExercicios` sem alterá-lo. **Lembrete** (padrão:
  destaca o ponto acionável mais recente; nada é gerado sem clique) ou
  **automático** (ao abrir a prova gera só o candidato mais recente; sem retry
  na sessão; reconsulta a cada 5 s enquanto há geração em andamento);
  preferência **alterável depois** por canal próprio que não recarimba o plano.
  A lista abre no próprio card via `ListaExercicios` (extraído de
  `Exercicios.tsx`): responder, ver resposta, "Corrigir com IA", marcar como
  concluída, gerar outra. Peças: `src/shared/checkpoints.ts` (gatilho temporal
  puro com relógio injetado, estados, texto-base, frases pt-BR),
  `Prova.checkpoints?` aditivo (irmão de `plano`/`diagnostico`, leitura
  tolerante, validade por assinatura do plano), `services/checkpoints.ts`
  (orquestração + erros tipados), 4 canais IPC com guarda de duplo clique, UI
  `Checkpoints.tsx` e `checkpointsReconsulta.ts`. A IA só gera/corrige; quando,
  quais assuntos e estado são mecânicos. Zero dep nova; 945 testes (781 + 164,
  Ollama mockado); build/lint verdes. **Sanity com Ollama real (llama3.1):
  TENTADO** — `gerarListaCheckpoint` devolveu 8 exercícios em ~28 s e ignorou
  o tópico manual com motivo; não substitui os testes. **Verificação manual do
  usuário (NÃO coberta):** qualidade/latência reais do `llama3.1` nas listas,
  modo automático abrindo o app em dias reais, encaixe visual/teclado/tema do
  card na Agenda e a regressão visual de Exercicios após a extração
  (`ListaExercicios`; não há testes de componente no repo).
- **Unificação Agenda de revisão + Plano de estudo (linha do tempo única) e
  fluxo de criação da prova** (`design-unificacao-agenda-plano.md`,
  `roadmap-unificacao-agenda-plano.md`; branch `feat/unifica-agenda-plano`,
  implementação `9664187`): provas **com plano** (e não passadas) mostram
  uma única lista por data com **estudo**, **revisão** e **checkpoint**; a
  revisão que cai no mesmo dia de um checkpoint (na prática 7 e 3 dias antes)
  aparece junto dele (só exibição: a sessão salva nunca é alterada). Estudo é só
  leitura; revisões mantêm marcar/mover/remover/adicionar/"Regerar revisões
  sugeridas"; checkpoints mantêm gerar/abrir/concluir. Provas **sem plano** (e
  passadas) mantêm a Agenda de revisão idêntica. Criação da prova: novo campo
  **Tipo de prova** (1ª, 2ª, final, ENEM, ENADE; `Prova.tipo?` aditivo) preenche
  o **título automático** com o caderno ("Cálculo — 2ª prova") sem sobrescrever
  o que o aluno digitou; ENEM/ENADE só sugerem "prova abrangente" se nenhum
  caderno foi escolhido e valem como 1ª prova no plano (sem "novo"); o
  questionário deixa de perguntar "qual prova é" quando há tipo. Trocar para
  1ª/ENEM/ENADE uma prova com assuntos "novo" pede confirmação (descarta a
  marcação). **Datas passadas e hoje bloqueadas** (mínimo = amanhã) na UI (`min`)
  e no main (criar e editar; prova antiga com data passada continua abrindo e
  pode ser salva sem mudar a data). Peças puras: `src/shared/{linhaDoTempo,
  tipoProva,nomeProva,dataProva}.ts`; UI `LinhaDoTempo.tsx` e hook
  `useCheckpoints.ts` (extraído do antigo card Checkpoints). Zero dep nova; sem
  canal IPC novo; geração por IA intocada. **1015 testes** (945 + 70).
  **Verificação manual do usuário (NÃO coberta, sem testes de componente):**
  criar prova (caderno → nome; tipo → nome; digitar e trocar tipo), data de
  hoje bloqueada no seletor e na mensagem, prova antiga abre, montar plano →
  linha do tempo, fusão 7/3 dias, mover/marcar/remover/adicionar revisão,
  gerar/abrir/concluir checkpoint pela linha, temas claro/escuro e teclado.
  Ficou fora (decisão do design): marcar bloco de estudo como feito, fundir
  revisão e checkpoint a ±N dias, agrupar listas longas.
- Infra: `.gitignore` e **ESLint** ignoram `.worktrees` e `**/out` (evita erros
  fantasmas de lint quando há worktree).

## Pendência operacional

- As pastas `c:\Dev\.worktrees\agenda`, `correcaoia`, `update`, `geracao-lotes` e
  `plano-f2-questionario`
  ficaram **órfãs e travadas** por um processo do sistema (provável OneDrive/indexador)
  e não puderam ser apagadas. São inócuas (ignoradas por git e ESLint; git já
  não as rastreia como worktree). Apagar manualmente quando o lock soltar
  (fechar OneDrive ou reiniciar). As demais pastas de worktree foram removidas
  normalmente.

## DECISÃO RESOLVIDA — granularidade do caderno na importação de pasta

**Decidido (2026-10-16): Opção 1.** O caderno é o caminho **relativo à pasta
escolhida** (comportamento atual, nenhuma mudança de código necessária).
- Escolher `...\Facul\Sistema Digitais` → subpastas viram "Teo", "Pratica".
- Escolher `...\Facul` → "Sistema Digitais — Teo", "Cálculo — Teórica".
- Para ter o nome da matéria no caderno, importar a pasta-pai (Facul). A
  granularidade fica no controle do usuário pela pasta que ele escolhe.

## Roadmap restante (não priorizado)

### Funcionalidades de estudo
- **Plano de estudo guiado por questionário** — intent **CONFIRMADO** em
  `docs/intent/plano-estudo-guiado.md` (entrevista com a skill `interview-me`,
  2026-10-28); visão em `roadmap-plano-estudo-guiado.md`. Agenda dia-a-dia que
  decide pelo aluno (o quê/ordem/quanto), encaixada na Agenda atual, com
  **checkpoints "pré-provas"** (lista de exercícios, modo automático OU lembrete,
  alterável). Base vs novo pelo ordinal da prova (1ª/2ª/final); ordem cronológica
  **mecânica** pelo app (data interna do arquivo → mtime; sobreposição manual
  opcional) — IA NÃO ordena. **Quiz diagnóstico** (lacuna na base vs. tópico
  novo) entra NESTA fatia. Régua contínua: prova longe → foco na base; perto →
  foco no novo com toques na base. Distribuição por dias = lógica pura testável;
  Ollama só gera diagnóstico/exercícios de checkpoint/frases de orientação. Fora
  de escopo: nada online, ENEM/ENADE curado fica p/ depois, sem promessa de "cai
  na prova".
  **Decomposto em 4 sub-fatias sequenciais (design validado contra o código):**
  - [x] **Fatia 1/4 — Captura de data + ordenação mecânica** — ENTREGUE
    (ver "Entregue", `roadmap-plano-estudo-guiado-f1.md`; fatia `d4df16b` +
    commit de docs). Fundação pura/sem IA: `dataArquivo?` + `cronologia.ts`.
  - [x] **Fatia 2/4 — Questionário + distribuição por dias (pura)** — ENTREGUE
    (ver "Entregue", `design-f2.md`/`plan-f2.md`; branch
    `feat/plano-f2-questionario`, dois commits). Bloco `plano?` aditivo em
    `Prova` (questionário + ordem cronológica manual como array de ids), régua
    contínua base/novo e distribuição por dias (puras), serviço
    `planoCalculo.ts` + IPC `salvarPlano`/`calcularPlano`, e a prévia "o que
    estudar" na Agenda. A **UI de reordenar** manualmente a cronologia ficou
    fora (só o contrato persistido entrou — pode vir depois sem migração).
  - [x] **Fatia 3/4 — Quiz diagnóstico** — ENTREGUE (ver "Entregue",
    `roadmap-plano-estudo-guiado-f3.md`; branch `feat/plano-f3-diagnostico`,
    implementação `e533d17`). Reusou `gerarQuiz` (só múltipla escolha, correção
    mecânica; `avaliarLote` NÃO foi usado). Classificação pura por camada,
    ajuste da mistura base/novo, `Prova.diagnostico?` e UI na Agenda.
  - [x] **Fatia 4/4 — Checkpoints "pré-provas"** — ENTREGUE (ver "Entregue",
    `roadmap-plano-estudo-guiado-f4.md`; branch `feat/plano-f4-checkpoints`,
    implementação `920e779`). Reusou `gerarExercicios` (caminho curto, 8
    exercícios); em vez de `SessaoRevisao`, o bloco aditivo `Prova.checkpoints?`
    (irmão de `plano`/`diagnostico`). **O Plano de estudo guiado está COMPLETO
    (4/4).** Ficou para depois (detalhe no roadmap da fatia): "iniciar com o
    computador" (item de UX abaixo, que destravaria o modo automático sem abrir
    o app à mão), cancelar geração, exportar a lista, UI de reordenar a
    cronologia (fatia 2).
  - [x] **Unificação Agenda + Plano (linha do tempo única) + fluxo de criação
    da prova** — ENTREGUE na branch `feat/unifica-agenda-plano` (aguarda
    merge; ver "Entregue").
  - **Fronteira vinculante (todas 2–4):** a distribuição NÃO depende do modelo;
    só a geração de texto/perguntas/exercícios usa Ollama. Ordem 1 → 2 → 3 → 4
    confirmada (3 depende de 1+2).
- **Edição manual dos mapas mentais** (renomear/adicionar/remover nós); exportar
  mapa como imagem.
- **Exportação para Anki** (.apkg/CSV dos flashcards) — Markdown e PDF já feitos.
- **Geração de IA em lote** (gerar artefatos para uma pasta inteira de uma vez).
- **Geração em lotes/chunks para quantidades grandes** — FEITO para **quiz e
  exercícios** (ver "Entregue"). Falta estender a **flashcards** (a base pura já
  é genérica — `ArtefatoLote` é um union; a extensão é uma fatia pequena e
  isolada, sem redesenho).
- Transcrição de áudio; ingestão de vídeo/imagem (OCR).
- Multi-idioma; multi-agente; monitoramento automático de pasta;
  comparar/mesclar materiais; detectar falta de material.

### Aparência e UX
- **Nome do app + Logo** — FEITO.
  - **Nome: "Desenrola"** (gíria BR de resolver/explicar; benefício, memorável,
    vira marca). Tagline: "estudo sem complicação".
  - **Logo:** pergaminho se desenrolando (folha com conteúdo + pontas enroladas),
    volume 3D via sombras/gradiente, paleta vibrante laranja→magenta→roxo,
    wordmark itálico pesado. SVGs em `resources/logo-icone.svg` (ícone quadrado)
    e `resources/logo-horizontal.svg` (com wordmark + tagline).
  - **Pipeline de ícones:** `npm run icons` (`scripts/gerar-icones.mjs`) gera
    PNGs 16–512 + `resources/icon.ico` multi-resolução a partir do SVG, via
    `sharp@0.35.5` + `png-to-ico@3.0.2` (devDeps pinadas). `electron-builder.yml`
    usa `icon: resources/icon.ico`; a `BrowserWindow` usa o PNG 256. Título da
    janela mudado para "Desenrola". Verificado: .ico válido (assinatura 0,0,1,0),
    PNGs válidos, build/lint/514 testes OK.
  (Modo claro/escuro + melhoria de aparência + barra lateral: ENTREGUES.)
- **Rename completo para "Desenrola"** — FEITO. `appId: com.desenrola.app`,
  `productName: Desenrola`, `shortcutName: Desenrola` (electron-builder.yml);
  `name: desenrola` + description (package.json); `appName`, `<title>` e título
  da janela = "Desenrola". Teste do nome atualizado; 514 testes OK. Nota: o
  `appId` mudou — como ainda não há base instalada em produção, foi o momento
  certo (muda o userData e o casamento do auto-update).
- **Iniciar junto com o computador (auto-start no boot)** — ideia registrada
  (2026-10-28), não iniciada. Botão nas configurações para ligar/desligar se o
  app abre sozinho ao ligar o PC, para o aluno que esquece de abrir (casa com os
  lembretes/checkpoints do plano guiado). Pequeno no Electron
  (`app.setLoginItemSettings`), só Windows por ora; preferência persistida.

### Plataformas (porte)
- **Porte para Linux e macOS** (desktop — a stack Electron já favorece; revisar
  caminhos, empacotamento e detecção do Ollama por SO).
- **Porte para Android / iOS** (mobile — ITEM MAIS PESADO. Decisão de
  arquitetura pendente: o Ollama local não roda em celular; definir IA remota,
  modelo no dispositivo, ou modo só-leitura/sync. Requer levantamento próprio).

### Distribuição e atualizações
- **Deploy no GitHub** — CONCLUÍDO (`worklog-deploy-github.md`): repo
  `EnzoMarquesBotelho/app-vale_resumo`. CI em **Caminho 1**:
  `.github/workflows/release.yml` dispara na tag `v*`, builda o instalador com
  `electron-builder --publish never` (só constrói, não publica) e cria UMA única
  Release via `softprops/action-gh-release@v2`, anexando `.exe` + `.blockmap` +
  `latest.yml`. Node 22 no CI. O bloco `publish` (github) segue no
  `electron-builder.yml` porque o electron-updater o lê em runtime.
  - **Release pública validada:** `v0.1.1` (commit `0f05bdc`), draft=False, com
    os 3 assets (`.exe` 126 MB, `.blockmap`, `latest.yml` 383 bytes). SEM
    duplicata — o problema das releases duplicadas (electron-builder publicando)
    foi resolvido tirando a publicação do builder.
  - **Processo de release** (documentado no worklog): bumpar `package.json` →
    commitar → criar tag que CASA com a versão → `git push origin master` →
    `git push origin <tag>`. A tag DEVE igualar a versão do package.json.
  - Tags/releases antigas `v0.1.0` (e as duplicatas) foram limpas.
- **Botão de atualização no app** — FEITO (`roadmap-botao-update.md`):
  `electron-updater@6.8.12` (dep nova, pinada) no main, `autoDownload=false`,
  `quitAndInstall` só no clique de "Reiniciar". Verificação automática ao abrir
  (silenciosa) + botão manual; download com barra de progresso → "Reiniciar para
  atualizar". Lógica pura de estado em `src/shared/updater.ts`; eventos
  main→renderer no padrão do tema; controle no rodapé da Sidebar (claro+escuro).
  Tudo protegido por `app.isPackaged` — em dev mostra "disponível só no app
  instalado", sem erro. 514 testes (476 + 38, autoUpdater mockado). Verificado:
  lógica pura (mapeamento evento→estado, clamp, versão, erro rede/genérico).
  - **Pendente de verificação do usuário (precisa de app instalado + 2 versões):**
    o fluxo real baixar→reiniciar só se testa instalando a `v0.1.1` e publicando
    uma `v0.1.2`. Auto-update NÃO roda em `npm run dev`.
