# Task List: App de Estudos com IA Local

> Plano: `tasks/plan.md`. Spec: `SPEC.md`. Progresso geral: `tasks/PROGRESSO.md`.
> Comandos de verificação: `npm test`, `npm run build`, `npm run lint`, `npm run dev`.
>
> **MVP (Fases 1–3 abaixo): CONCLUÍDO e na master.** As fatias pós-MVP estão
> resumidas na seção "Fases pós-MVP" ao final deste arquivo; cada fatia tem seu
> próprio doc `roadmap-*.md` com as decisões confirmadas.
> Branch `feat/unifica-agenda-plano` (não mergeada): linha do tempo única +
> fluxo de criação da prova, **1015 testes** (61 arquivos), build/lint limpos.
> Estado da master: **Plano de estudo guiado COMPLETO (4/4).** Fatia 4/4
> (checkpoints pré-provas) já na master (commit de implementação `920e779` +
> docs `82f7df5`, mergeada por fast-forward sobre `bc81789`),
> **945 testes** passando (58 arquivos), build/lint limpos. Fatia 3/4 na master
> (`e533d17` + docs `d2193f8`, 781 testes); Fatia 2/4 (`48afc38`/`fabd62b` +
> docs, 673 testes); Fatia 1/4 em `d4df16b` + docs.
> Publicado no GitHub (`app-vale_resumo`), release pública `v0.1.1`.

> **Pasta de material real para testes manuais/de aceitação:**
> `C:\Users\enzom\OneDrive\Desktop\Facul` — contém PDFs/arquivos reais de faculdade,
> organizados por matéria. Usar como fonte para validar o app importando conteúdo de verdade
> (dos testes básicos até casos "usuário burro": arquivo vazio, PDF escaneado sem texto,
> arquivo muito grande, formato não suportado, nome com acentos/espaços).
> REGRA: **somente leitura** — nunca modificar, mover ou apagar nada dessa pasta.
> Os testes automatizados (unit/integração) continuam em `tests/` com arquivos de amostra
> próprios do projeto; a pasta Facul é para verificação manual/de aceitação de cada fatia.

## Fase 1: Fundação

### Task 1: Scaffolding do projeto
**Description:** Criar a base Electron + Vite + React + TypeScript com lint e Vitest configurados,
e janela do app abrindo com uma tela placeholder.

**Acceptance criteria:**
- [x] `npm run dev` abre uma janela Electron com uma tela React placeholder.
- [x] `npm run build` conclui sem erros; `npm run lint` roda; `npm test` roda (mesmo que com 1 teste trivial).
- [x] `contextIsolation: true` e `nodeIntegration: false` configurados.

**Verification:**
- [x] Build: `npm run build`
- [x] Testes: `npm test`
- [x] Manual: janela abre em Windows com `npm run dev`

**Dependencies:** None
**Files likely touched:** `package.json`, `electron.vite.config.ts`, `src/main/index.ts`, `src/renderer/App.tsx`, `tsconfig.json`, `.eslintrc`
**Estimated scope:** M

### Task 2: Tipos compartilhados e IPC tipado
**Description:** Definir tipos em `shared/types.ts` (Documento, Resumo, Flashcard, Exercicio, modos)
e um esqueleto de IPC tipado (preload + canais) para o renderer chamar o main com segurança.

**Acceptance criteria:**
- [x] Tipos de domínio definidos e exportados.
- [x] Preload expõe uma API tipada ao renderer via `contextBridge`.
- [x] Um canal de teste (ex.: `ping`) funciona renderer→main→renderer.

**Verification:**
- [x] Build: `npm run build`
- [x] Manual: chamada `ping` retorna no renderer

**Dependencies:** Task 1
**Files likely touched:** `src/shared/types.ts`, `src/main/preload.ts`, `src/main/ipc/index.ts`, `src/renderer/state/`
**Estimated scope:** S

### Checkpoint: Fundação
- [x] `npm run build`, `npm run lint`, `npm test` passam
- [x] App abre e o IPC de teste funciona
- [x] Revisar com o usuário antes de prosseguir

## Fase 2: Núcleo

### Task 3: Importar arquivo e ver texto (fatia vertical)
**Description:** Serviço `files.ts` para ler `.txt`/`.md` e extrair texto de `.pdf` (`pdfjs-dist`);
IPC de importação; UI para escolher arquivo e exibir o texto extraído. PDF sem texto → aviso.

**Acceptance criteria:**
- [x] Importar `.txt`, `.md` e `.pdf` exibe o texto extraído.
- [x] PDF escaneado/sem texto mostra "sem texto extraível".

**Verification:**
- [x] Testes: `npm test` (unit de `files.ts` com arquivos de amostra)
- [x] Manual: importar os 3 formatos

**Dependencies:** Task 2
**Files likely touched:** `src/main/services/files.ts`, `src/main/ipc/`, `src/renderer/views/Importar.tsx`, `tests/files.test.ts`
**Estimated scope:** M

### Task 4: Cliente Ollama + detecção de disponibilidade
**Description:** Serviço `ollama.ts` (`isOllamaRunning`, `generate`) e UI que detecta Ollama
ausente/offline, mostrando instruções claras. Seletor de modelo (default `llama3.1:8b`).

**Acceptance criteria:**
- [x] App detecta se o Ollama está rodando e exibe status.
- [x] Ollama ausente → mensagem com instruções, sem crash.
- [x] Modelo configurável, default `llama3.1:8b`.

**Verification:**
- [x] Testes: `npm test` (ollama mockado)
- [x] Manual: com Ollama parado, ver mensagem de instrução

**Dependencies:** Task 2
**Files likely touched:** `src/main/services/ollama.ts`, `src/main/ipc/`, `src/renderer/components/OllamaStatus.tsx`, `tests/ollama.test.ts`
**Estimated scope:** M

### Task 5: Gerar resumo (fatia vertical)
**Description:** Prompt de resumo com modos curto/longo; chunking para textos grandes; IPC;
UI para escolher modo e ver o resumo.

**Acceptance criteria:**
- [x] Gera resumo nos modos curto e longo a partir do texto importado.
- [x] Textos grandes são divididos em pedaços e resumidos sem estourar o contexto.

**Verification:**
- [x] Testes: `npm test` (fluxo texto→prompt→resposta mockada→resumo)
- [x] Manual: gerar resumo curto e longo de um PDF real

**Dependencies:** Task 3, Task 4
**Files likely touched:** `src/shared/prompts.ts`, `src/main/ipc/`, `src/renderer/views/Resumo.tsx`, `tests/resumo.test.ts`
**Estimated scope:** M

### Task 6: Gerar flashcards (fatia vertical)
**Description:** Prompt que pede flashcards em JSON; parser tolerante + validação de schema;
quantidade escolhível (5–100); UI navegável (virar carta).

**Acceptance criteria:**
- [x] Gera N flashcards (N escolhido pelo usuário, 5–100) estruturados pergunta/resposta.
- [x] JSON malformado é tratado (parser tolerante / re-tentativa), sem quebrar a UI.
- [x] UI permite navegar e virar os cards.

**Verification:**
- [x] Testes: `npm test` (parsing de respostas boas e malformadas)
- [x] Manual: gerar e navegar flashcards

**Dependencies:** Task 5
**Files likely touched:** `src/shared/prompts.ts`, `src/main/services/parse.ts`, `src/renderer/views/Flashcards.tsx`, `tests/flashcards.test.ts`
**Estimated scope:** M

### Task 7: Gerar exercícios (fatia vertical)
**Description:** Prompt de exercícios nos modos teórica/prática/mista; quantidade 5–100; parsing
estruturado; UI de lista.

**Acceptance criteria:**
- [x] Gera lista de exercícios nos três modos (teórica/prática/mista).
- [x] Quantidade entre 5 e 100 respeitada.
- [x] Lista exibida de forma legível.

**Verification:**
- [x] Testes: `npm test` (parsing + limites 5–100)
- [x] Manual: gerar nos três modos

**Dependencies:** Task 6 (reusa parser/estrutura)
**Files likely touched:** `src/shared/prompts.ts`, `src/main/services/parse.ts`, `src/renderer/views/Exercicios.tsx`, `tests/exercicios.test.ts`
**Estimated scope:** M

### Checkpoint: Núcleo
- [x] Fluxo completo funciona offline: importar → resumo + flashcards + exercícios
- [x] `npm test` e `npm run lint` passam
- [x] Revisar com o usuário

## Fase 3: Persistência e acabamento

### Task 8: Persistência local
**Description:** Serviço `storage.ts` para salvar/carregar documentos e seus artefatos em JSON
no `userData`; UI para reabrir resultados anteriores.

**Acceptance criteria:**
- [x] Resultados gerados persistem e reabrem após fechar/reabrir o app.
- [x] Cada documento guarda seus próprios resumo/flashcards/exercícios.

**Verification:**
- [x] Testes: `npm test` (salvar/carregar round-trip)
- [x] Manual: fechar e reabrir mantém os dados

**Dependencies:** Task 5, 6, 7
**Files likely touched:** `src/main/services/storage.ts`, `src/main/ipc/`, `src/renderer/views/Historico.tsx`, `tests/storage.test.ts`
**Estimated scope:** M

### Task 9: Aparência e empacotamento
**Description:** Aplicar um visual agradável e consistente; README passo a passo para iniciante;
configurar `npm run package` para gerar um executável.

**Acceptance criteria:**
- [x] UI consistente e agradável nas telas principais.
- [x] README explica instalar Node, Ollama, `ollama pull`, `npm install`, `npm run dev`.
- [x] `npm run package` gera um executável distribuível para Windows.

**Verification:**
- [x] Build: `npm run build` e `npm run package`
- [x] `npm run package` produziu o instalador NSIS (`release/App de Estudos com IA Local Setup 0.1.0.exe`) e o executável (`release/win-unpacked/App de Estudos com IA Local.exe`). Verificação visual de abertura da janela é manual (ambiente do agente é sem GUI).

**Dependencies:** Task 8
**Files likely touched:** `src/renderer/` (estilos), `README.md`, `package.json` (config de empacotamento)
**Estimated scope:** M

### Checkpoint: MVP completo
- [x] Todos os critérios de sucesso da SPEC.md atendidos
- [x] App roda offline, trata Ollama ausente, persiste dados
- [x] Pronto para revisão final

## Fases pós-MVP (fatias entregues)

> Cada fatia foi desenhada, revisada, implementada em worktree isolado e
> mergeada na master. Decisões confirmadas em `roadmap-*.md`.

- [x] **Correções de robustez** — resolução de modelo instalado no momento da
  geração (evita 404 "model not found"); seletor aceita txt/md; `getApi()` com
  erro visível; aviso de falha de persistência.
- [x] **Cadernos (notebooks)** — `roadmap-notebooks.md`. Caderno → Documento;
  sugestão pela pasta-mãe (fallback "Geral") editável na importação; Histórico
  de dois níveis; migração idempotente.
- [x] **Mapas mentais** — `roadmap-mapas-mentais.md`. Árvore hierárquica por IA;
  visualização SVG navegável (expandir/colapsar, zoom, pan).
- [x] **Geração JSON consistente** — `fix-mapas-inconsistencia.md`.
  `format:"json"` nas gerações estruturadas; até 3 tentativas no mapa;
  orientação de modelo de texto.
- [x] **Importar pasta (lote, recursivo)** — `roadmap-importar-pasta.md`. Varre
  subpastas; caderno pelo caminho relativo à pasta escolhida (decisão: Opção 1);
  dedup por origem; limites; resultado em pt-BR.
- [x] **Agenda + Provas + Dicas do dia** — `roadmap-agenda-provas.md`. Provas
  (vínculo a caderno ou avulsa abrangente com modo rotação/intercalado);
  contagem regressiva; agenda por repetição espaçada editável; dica mecânica +
  botão "Dica da IA".
- [x] **Quizzes interativos** — `roadmap-quizzes.md`. IA gera quiz (múltipla/
  aberta/misto, 5–100); fluxo responder → revisar com pontuação; autoavaliação
  nas abertas; salvo no documento, refazível.
- [x] **Correção da mensagem falsa "Ollama não está rodando"** —
  `fix-geracao-ollama-offline-falso.md`. `generate()` distingue recusa de
  conexão (offline real) de abort/timeout/falha da geração (mensagem honesta,
  orienta reduzir quantidade); timeout de 5 min via AbortController; 6
  mapeadores de erro atualizados.
- [x] **Correção por IA (exercícios + abertas do quiz)** —
  `roadmap-correcao-ia.md`. Mecanismo único de avaliação (veredito Correto/
  Parcial/Incorreto + comentário, `format:"json"`, estado seguro `nao_avaliado`).
  Exercícios sempre por IA; quiz com alternador autoavaliação ⇆ IA (múltipla
  escolha intacta). Verificado contra o Ollama real.
- [x] **Exportação (Markdown + PDF)** — `roadmap-exportacao.md`. Por artefato e
  documento inteiro; Markdown puro em `src/shared/export/`; PDF via
  `pdfmake@0.2.20` (1ª dep nova, pinada) no main; mapa como SVG no PDF / lista
  aninhada no Markdown; save dialog (nunca Facul); sem Ollama. Verificado com
  PDF binário real.
- [x] **Redesenho (sidebar) + temas claro/escuro** — `roadmap-redesign-temas.md`.
  Navegação por barra lateral (Biblioteca + Agenda); artefatos na tela do
  documento aberto. Temas Claro/Escuro/Automático (via `nativeTheme`, preferência
  salva); `resolveEffectiveTheme` puro + tokens claro/escuro via `data-theme`;
  acessibilidade (teclado, aria-current, foco, WCAG AA). Zero dep nova; lógica
  intocada (views reusadas); 476 testes (468 + 8).
- [x] **Geração em lotes (chunks) para quiz e exercícios** —
  `roadmap-geracao-lotes.md` (design e review aprovados). Quantidade grande (> 20) de
  quiz/exercícios passa a ser gerada em lotes de 15 ao Ollama, acumulando e
  deduplicando até o total, sem estourar o timeout de 5 min; progresso
  "Gerando X de N…" na tela; falha parcial honesta (entrega o acumulado; só
  propaga o erro tipado se nada foi gerado). Lógica pura em
  `src/shared/geracaoLotes.ts` (particionar/acumular/dedup), 100% testada; até
  20 itens o comportamento é idêntico ao anterior. Flashcards ficaram de fora
  (base genérica já acomoda a extensão). Zero dep nova; 563 testes (514 + 49,
  Ollama mockado).
  - **Correção de acabamento** (feedback: pediu 50, veio 30 sem aviso/contagem):
    (a) teto do laço afrouxado — parada fixa `lotes.length + 3` virou **parada
    por estagnação** (desiste após 3 lotes seguidos sem item novo, teto absoluto
    `lotes.length + 6`), persistindo enquanto há progresso real; critério na
    função pura `deveContinuarLotes`; (b) **aviso de parcial honesto** (pt-BR,
    acessível, causa-neutra) quando a lista vem abaixo do pedido, derivado no
    renderer sem mudar o contrato `AppApi`; (c) **contagem no topo do quiz**
    (`N questões · Modo`). 579 testes (563 + 16). Ollama real = verificação
    manual do usuário.
- [x] **Plano de estudo guiado — Fatia 1/4: captura de data + ordenação
  mecânica** — `roadmap-plano-estudo-guiado-f1.md` (fatia `d4df16b` + commit de
  docs). Fundação 100% pura/sem IA da ordenação base→novo: captura de uma data
  por documento na importação (data interna do PDF via `getMetadata()` →
  `mtime` do disco → indefinida; `.txt`/`.md` vão direto ao mtime), campo novo
  `dataArquivo?` (ISO 8601 UTC) aditivo/retrocompatível em `Documento`,
  `DocumentoSalvo`, `ArquivoImportado` e `ResumoDocumentoSalvo`, e a função pura
  `ordenarCronologicamente` (`src/shared/cronologia.ts`: determinística,
  estável, não muta a entrada, não lê o relógio; sem data → ao final por `id`;
  sobreposição manual opcional por parâmetro, semântica de prefixo). Parsing
  tolerante da data do PDF em `src/shared/pdfDate.ts` + guarda `ehIsoPlausivel`.
  Zero dep nova; 614 testes (579 + 35, Ollama não envolvido). A ordenação é
  **interna** (nada perceptível na UI ainda). PDF real end-to-end = verificação
  manual do usuário.
- [x] **Plano de estudo guiado — Fatia 2/4: questionário + distribuição por
  dias** — `design-f2.md`/`plan-f2.md` (branch `feat/plano-f2-questionario`,
  dois commits). Sem IA: lógica pura + persistência JSON + UI. **Commit A:**
  bloco opcional/aditivo `plano?` em `Prova` (qual prova é — 1ª/2ª/final; horas/
  dia; dias/semana; assuntos com dificuldade e "cai na prova"; preferência de
  checkpoint), saneado no padrão de `provas.ts` (clamps silenciosos; ordinal e
  ≥1 assunto obrigatórios; gravação por spread condicional; prova antiga sem
  plano continua válida), canal IPC `salvarPlano`, e o formulário acessível
  `PlanoEstudo.tsx` no header da prova selecionada. **Commit B:** régua base/
  novo pura (`src/shared/plano.ts`: foco na base quanto mais longe a prova, até
  80% — o novo nunca zera; foco no novo com toques na base quando perto; base
  difícil puxa mais tempo) + distribuição por dias pura (reparte o tempo pelos
  dias úteis, prioriza o difícil, não inventa dias nem blocos curtos demais, e
  avisa quantos assuntos não couberam), serviço `planoCalculo.ts` (monta datas,
  ordena base→novo via `cronologia.ts` + ordem manual, chama o puro) + IPC
  `calcularPlano` (recalcula sob demanda, nada persistido), e a prévia "o que
  estudar" no formulário (plano montado em {data}, divisão base/novo %, dias com
  blocos, frases honestas de aviso). Helpers novos: `datasEntre` (`agenda.ts`) e
  as constantes da régua. Zero dep nova; 673 testes (614 → 635 → 673). A UI de
  reordenar manualmente ficou fora (só o contrato persistido entrou). Encaixe
  visual/acessibilidade e a "sensação" com dados reais = verificação manual.

- [x] **Plano de estudo guiado — Fatia 3/4: quiz diagnóstico + plano
  ajustado** — `design-f3.md`/`plan-f3.md`/`roadmap-plano-estudo-guiado-f3.md`
  (branch `feat/plano-f3-diagnostico`, implementação `e533d17`). Diagnóstico
  opcional (até 18 perguntas de múltipla escolha geradas a partir dos documentos
  dos assuntos, rótulo base/novo herdado do assunto, correção mecânica);
  classificação pura (`lacuna_base`/`dificuldade_novo`/`sem_dificuldade`/
  `inconclusivo`) que desloca só a mistura base/novo da régua (novo nunca zera);
  `Prova.diagnostico?` aditivo com validade por assinatura do plano; orquestração
  sobre `gerarQuiz` (sem alterá-lo) com falha parcial honesta; 2 canais IPC com
  progresso; UI `Diagnostico.tsx` na Agenda + `PlanoPrevia.tsx` extraído. Zero
  dep nova; 781 testes (673 → 781). Qualidade real das perguntas do `llama3.1`,
  lentidão/parcial reais e encaixe visual = verificação manual.

- [x] **Plano de estudo guiado — Fatia 4/4: checkpoints pré-provas (COMPLETA o
  plano guiado)** — `design-f4.md`/`roadmap-plano-estudo-guiado-f4.md` (branch
  `feat/plano-f4-checkpoints`, implementação `920e779`). Pontos fixos a 28/14/7/3
  dias da prova; cada um gera uma lista de 8 exercícios (mista) dos assuntos que
  o plano de referência já cobriu, reusando `gerarExercicios`; modo **lembrete**
  ou **automático** (só o ponto mais recente, ao abrir a prova), alterável depois
  por canal próprio; lista respondível/corrigível no card (`ListaExercicios`
  extraído de `Exercicios.tsx`) e "marcar como concluída". Gatilho/estados/texto-
  base puros em `src/shared/checkpoints.ts`; `Prova.checkpoints?` aditivo;
  `services/checkpoints.ts`; 4 canais IPC; UI `Checkpoints.tsx`. Zero dep nova;
  945 testes (781 → 945). Sanity com Ollama real tentado (8 exercícios, ~28 s);
  qualidade/latência reais, modo automático em dias reais e encaixe visual =
  verificação manual.

- [x] **Unificação Agenda de revisão + Plano de estudo (linha do tempo única) e
  fluxo de criação da prova** — `design-unificacao-agenda-plano.md` (branch
  `feat/unifica-agenda-plano`, ainda não mergeada). Prova com plano (não
  passada) mostra estudo + revisão + checkpoint por data (revisão no mesmo dia
  do checkpoint aparece junto); prova sem plano mantém a Agenda de revisão
  idêntica. Novo campo **Tipo de prova** (1ª/2ª/final/ENEM/ENADE, `Prova.tipo?`
  aditivo) gera o título automático (sem sobrescrever o digitado) e define o
  ordinal do plano (ENEM/ENADE = 1ª prova); datas passadas e hoje bloqueadas na
  UI e no main (mínimo = amanhã; prova antiga com data passada continua
  abrindo). Puros `linhaDoTempo/tipoProva/nomeProva/dataProva` em `src/shared/`,
  UI `LinhaDoTempo.tsx` + hook `useCheckpoints.ts`. Zero dep nova, sem canal IPC
  novo. **1015 testes** (945 → 1015, 61 arquivos). Verificação manual do
  usuário: fluxo de criação, data bloqueada, linha do tempo, fusão 7/3, temas e
  teclado (sem testes de componente).
## Roadmap restante (complementos — não iniciados)

### Funcionalidades de estudo
- [x] **Plano de estudo guiado por questionário — COMPLETO (4/4 entregues;
  mantido aqui só como histórico das sub-fatias)** — intent CONFIRMADO em
  `docs/intent/plano-estudo-guiado.md` (entrevista com `interview-me`), visão em
  `roadmap-plano-estudo-guiado.md`. Agenda dia-a-dia que decide pelo aluno (o quê/
  ordem/quanto), com **checkpoints "pré-provas"** (lista de exercícios, modo
  automático OU lembrete, alterável). Base vs novo pelo ordinal da prova (1ª/2ª/
  final) e ordem cronológica **mecânica** (data interna do arquivo → mtime, com
  sobreposição manual). **Quiz diagnóstico** (base vs tópico novo) entra NA fatia
  3. Régua: prova longe = foco na base; perto = foco no novo. Distribuição =
  lógica pura; Ollama só gera diagnóstico/exercícios/frases. Fora: nada online,
  ENEM/ENADE curado fica p/ depois, IA não ordena.
  **Decomposto em 4 sub-fatias sequenciais (design validado — detalhe em
  `roadmap-plano-estudo-guiado-f1.md`):**
  - [x] **Fatia 1/4 — Captura de data + ordenação mecânica** — ENTREGUE (ver
    "Fases pós-MVP"; fatia `d4df16b` + commit de docs).
  - [x] **Fatia 2/4 — Questionário + distribuição por dias (pura)** — ENTREGUE
    (ver "Fases pós-MVP"; branch `feat/plano-f2-questionario`, dois commits).
    Régua contínua base/novo + distribuição por dias (puras), persistência do
    `plano?` em `Prova` (+ ordem cronológica manual como array de ids) e a prévia
    na Agenda. A **UI de reordenar** manualmente ficou fora (só o contrato
    persistido entrou — pode vir depois sem migração).
  - [x] **Fatia 3/4 — Quiz diagnóstico** — ENTREGUE (ver "Fases pós-MVP";
    branch `feat/plano-f3-diagnostico`, implementação `e533d17`). Reusou
    `gerarQuiz` (só múltipla escolha); `avaliarLote` não foi necessário.

- [ ] **Edição manual dos mapas mentais**; exportar mapa como imagem.
- [ ] **Exportação para Anki** (.apkg/CSV dos flashcards) — Markdown e PDF já feitos.
- [ ] **Geração de IA em lote** (pasta inteira).
- [ ] **Geração em lotes/chunks para flashcards** (quiz e exercícios já feitos):
  estender a mesma base pura genérica a flashcards — fatia pequena e isolada.
- [ ] Transcrição de áudio; ingestão de vídeo/imagem (OCR).
- [ ] Multi-idioma; multi-agente; monitoramento automático de pasta;
  comparar/mesclar materiais; detectar falta de material.

### Aparência e UX
- [x] **Nome do app + Logo** — nome **"Desenrola"** (tagline "estudo sem
  complicação"); logo de pergaminho se desenrolando (SVGs em `resources/`),
  pipeline `npm run icons` (sharp + png-to-ico) gerando PNGs + `icon.ico`,
  ligado no `electron-builder.yml` e na janela. 514 testes OK.
- [ ] **Rename completo para "Desenrola"** (pequeno): trocar
  `productName`/`appId`/`shortcutName` (electron-builder.yml) e
  `name`/`description` (package.json), hoje ainda "App de Estudos com IA Local".
- [ ] **Iniciar junto com o computador (auto-start no boot)** — botão nas
  configurações para o usuário ligar/desligar se o app abre sozinho ao ligar o
  PC. Pensado para o aluno que esquece de abrir o app (casa com os lembretes/
  checkpoints do plano guiado — de nada adianta a agenda lembrar se o app nunca
  abre). Técnico e pequeno no Electron (`app.setLoginItemSettings`), só Windows
  por ora; preferência persistida. Não iniciado.

### Plataformas (porte)
- [ ] **Porte para Linux e macOS** (desktop — a stack Electron já favorece;
  revisar caminhos, empacotamento e detecção do Ollama por SO).
- [ ] **Porte para Android / iOS** (mobile — decisão de arquitetura pendente: o
  Ollama local não roda em celular; definir se usa IA remota, modelo no
  dispositivo, ou um modo só-leitura/sync. É o item mais pesado e requer
  levantamento próprio).

### Distribuição e atualizações
- [x] **Deploy no GitHub** — `worklog-deploy-github.md`. Repo
  `EnzoMarquesBotelho/app-vale_resumo`. CI Caminho 1: workflow dispara na tag
  `v*`, builda com `electron-builder --publish never` e cria UMA Release via
  `softprops/action-gh-release@v2` (`.exe` + `.blockmap` + `latest.yml`). Release
  pública `v0.1.1` validada (3 assets, sem duplicata). Processo: bumpar
  package.json → tag casando com a versão → push.
- [x] **Botão de atualização no app** — `roadmap-botao-update.md`.
  `electron-updater@6.8.12` no main (autoDownload=false, quitAndInstall só no
  "Reiniciar"); verificação automática ao abrir + botão manual; download com
  progresso → reiniciar. Lógica pura em `src/shared/updater.ts`; controle no
  rodapé da Sidebar; tudo sob `app.isPackaged` (dev = estado neutro). 514 testes.
  Fluxo real baixar→reiniciar = verificação do usuário (app instalado + 2 versões).
