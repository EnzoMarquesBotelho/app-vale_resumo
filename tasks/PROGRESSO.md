# Progresso do App de Estudos

> Onde paramos — atualizado em 2026-10-16.

## Estado atual (branch master)

- Build, lint e **476 testes** passando. HEAD: `286a119`.
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
- Infra: `.gitignore` e **ESLint** ignoram `.worktrees` e `**/out` (evita erros
  fantasmas de lint quando há worktree).

## Pendência operacional

- As pastas `c:\Dev\.worktrees\agenda` e `c:\Dev\.worktrees\correcaoia` ficaram
  **órfãs e travadas** por um processo do sistema (provável OneDrive/indexador)
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
- **Edição manual dos mapas mentais** (renomear/adicionar/remover nós); exportar
  mapa como imagem.
- **Exportação para Anki** (.apkg/CSV dos flashcards) — Markdown e PDF já feitos.
- **Geração de IA em lote** (gerar artefatos para uma pasta inteira de uma vez).
- **Geração em lotes/chunks para quantidades grandes** (ex.: quiz/exercícios
  com 100): hoje quantidades altas são lentas/instáveis no modelo local e a
  mensagem honesta orienta reduzir; gerar internamente em lotes evitaria o
  timeout. Anotado como roadmap na correção do offline-falso.
- Transcrição de áudio; ingestão de vídeo/imagem (OCR).
- Multi-idioma; multi-agente; monitoramento automático de pasta;
  comparar/mesclar materiais; detectar falta de material.

### Aparência e UX
- **Criação de logo** (identidade visual + ícone do app/instalador).
  (Modo claro/escuro + melhoria de aparência + barra lateral: ENTREGUES.)

### Plataformas (porte)
- **Porte para Linux e macOS** (desktop — a stack Electron já favorece; revisar
  caminhos, empacotamento e detecção do Ollama por SO).
- **Porte para Android / iOS** (mobile — ITEM MAIS PESADO. Decisão de
  arquitetura pendente: o Ollama local não roda em celular; definir IA remota,
  modelo no dispositivo, ou modo só-leitura/sync. Requer levantamento próprio).

### Distribuição e atualizações
- **Deploy no GitHub** (publicar releases/instaladores no GitHub Releases; CI
  para gerar os artefatos).
- **Botão de atualização no app** ligado às releases do GitHub (verificar/baixar
  novas versões; ex.: electron-updater apontando para o GitHub).
