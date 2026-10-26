# Roadmap — Fatia: Correção por IA (exercícios + respostas abertas do quiz)

> Fatia pós-MVP. A IA local avalia respostas dissertativas do usuário.
> Mecanismo ÚNICO compartilhado entre exercícios e quiz.
> Decisões confirmadas com o usuário em 2026-10-16.

## Objetivo

Permitir que o usuário RESPONDA exercícios e as respostas abertas do quiz, e que
a IA local avalie cada resposta com um veredito + comentário. Unifica a
"correção de exercícios pela IA" com a "avaliação por IA das abertas do quiz".

## Decisões confirmadas

1. **Veredito da IA (por resposta):** três níveis — **Correto / Parcial /
   Incorreto** — + um **comentário curto** explicando. Sem nota numérica (evita
   falso rigor de um modelo local). O comentário é em pt-BR.
2. **Quiz — respostas abertas: ALTERNADOR de modo de correção** (vale para o
   quiz inteiro, não por questão):
   - **Autoavaliação** (padrão atual): mostra o gabarito ao lado da resposta do
     usuário, instantâneo, sem Ollama. Continua existindo.
   - **Correção pela IA:** ao revisar, a IA avalia TODAS as abertas e mostra
     Correto/Parcial/Incorreto + comentário na própria questão.
   - O usuário escolhe o modo ao enviar/revisar o quiz. Múltipla escolha segue
     corrigindo automaticamente (objetiva), como hoje.
3. **Exercícios — fluxo de responder + correção SEMPRE pela IA:** hoje os
   exercícios só mostram enunciado + gabarito. Passam a ter um fluxo onde o
   usuário escreve a resposta de cada um e pede a correção; a IA avalia (não há
   alternador aqui — exercícios nunca tiveram autoavaliação). Veredito +
   comentário por exercício.
4. **Mecanismo único:** um serviço de avaliação por IA compartilhado pelos dois
   (quiz e exercícios), com o mesmo formato de veredito e o mesmo parsing
   tolerante.

## Regras para o design decidir (simples e seguras)

- **Formato do veredito:** a IA recebe (enunciado + gabarito/critério + resposta
  do usuário) e devolve JSON estruturado: veredito ∈ {correto, parcial,
  incorreto} + comentário. Reusar o parser tolerante (`extrairBlocoJson` /
  padrão `parse.ts`), validação de schema, `format:"json"`, e resolver modelo
  via `modeloParaGeracao()`. Veredito inválido → tratar (re-tentativa corretiva
  ou marcar como "não foi possível avaliar", sem quebrar).
- **Avaliação em lote vs. uma a uma:** como a avaliação é N chamadas ao modelo
  local (lenta), decidir uma abordagem previsível (ex.: avaliar sequencialmente
  com feedback de progresso; cada resposta vazia não é enviada ao modelo). A
  correção recém-feita do erro de geração (`GeracaoFalhouError`, timeout de
  5 min, mensagem honesta) já cobre falha/lentidão — reusar essa classificação.
- **Persistência:** decidir se as respostas do usuário e os vereditos são salvos
  no documento (junto do quiz/exercícios) ou ficam em memória por tentativa.
  Preferência: seguir o padrão do quiz (tentativa em memória; "refazer"
  reinicia). O design documenta.
- **Modo offline/Ollama ausente:** no quiz, a autoavaliação funciona sem Ollama;
  a correção por IA (quiz e exercícios) exige Ollama — tratar ausência com a
  mensagem clara já existente, sem quebrar.

## Fora de escopo desta fatia (roadmap)

- Nota numérica / rubrica detalhada.
- Histórico/estatística de desempenho ao longo do tempo.
- Correção por IA de múltipla escolha (é objetiva, não precisa).

## Orientação técnica (o design refina)

- **Shared:** tipos do veredito (Veredito = "correto"|"parcial"|"incorreto";
  AvaliacaoResposta { veredito, comentario }) em `src/shared/types.ts`; template
  de prompt de avaliação em `src/shared/prompts.ts` (recebe enunciado, gabarito,
  resposta do usuário; pede JSON), usado com `format:"json"`.
- **Main:** serviço de avaliação (ex.: `src/main/services/avaliacao.ts`)
  reusando o parser tolerante + validação + re-tentativa; handler IPC (ex.:
  `avaliacao:avaliar`) resolvendo modelo via `modeloParaGeracao()`; se persistir
  vereditos, estender `storage.ts`. Atualizar `ipc.ts` e `preload.ts`.
- **Renderer:**
  - Exercícios (`src/renderer/views/Exercicios.tsx`): adicionar campo de resposta
    por exercício + botão de corrigir (IA sempre) + exibição do veredito/
    comentário por exercício.
  - Quiz (`src/renderer/views/Quiz.tsx`): adicionar o ALTERNADOR autoavaliação ⇆
    IA; no modo IA, ao revisar, avaliar as abertas e mostrar veredito/comentário;
    manter a autoavaliação com gabarito como está no outro modo; múltipla escolha
    intacta.
  - Chamadas só via `getApi()`. Visual consistente com `styles.css`.
- **Testes:** parsing/validação do veredito (bom/malformado/retry); o serviço de
  avaliação (mapeia resposta vazia, veredito inválido); comportamento do
  alternador (lógica, se houver parte pura); exercícios sempre-IA. UI é
  verificação manual. Ollama mockado; nada depende da pasta Facul (somente
  leitura). Textos pt-BR; identificadores em inglês.
