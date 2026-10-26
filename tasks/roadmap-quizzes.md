# Roadmap — Fatia: Quizzes interativos

> Fatia pós-MVP. Novo artefato de estudo gerado por IA local: um quiz
> interativo com modo responder + modo revisão. Base: SPEC.md, cadernos,
> padrão de artefatos (resumo/flashcards/exercícios/mapa).
> Decisões confirmadas com o usuário em 2026-10-16.

## Objetivo

A partir do texto importado, a IA local gera um **quiz** que o usuário responde
e depois revisa com correção. Salvo no documento (dentro do caderno), como os
demais artefatos, reabrível e refazível.

## Decisões confirmadas

1. **Fonte das perguntas:** a IA gera um quiz NOVO a partir do texto do
   documento (artefato próprio, como os outros). Não reaproveita flashcards.
2. **Modo escolhido pelo usuário** (como nos exercícios): **múltipla escolha**,
   **abertas**, ou **misto**. E **quantidade** de 5 a 100 (reusar os limites
   `normalizarQuantidade` / 5–100 já existentes).
   - Múltipla escolha: enunciado + N alternativas, exatamente uma correta.
   - Aberta: enunciado + resposta-modelo (gabarito).
   - Misto: combina os dois tipos.
3. **Correção das abertas:** AUTOAVALIAÇÃO. O app mostra o gabarito ao lado da
   resposta do usuário; o usuário se avalia. (A avaliação por IA das abertas
   fica para a FUTURA fatia "correção de exercícios pela IA".)
4. **Fluxo responder → revisar:**
   - O usuário responde TODAS as perguntas primeiro, SEM feedback durante.
   - Ao ENVIAR, o app volta ao início do quiz em MODO REVISÃO, mostrando cada
     questão com a resposta do usuário e se acertou/errou NA PRÓPRIA QUESTÃO:
     - Fechada (múltipla escolha): destaca a ALTERNATIVA CORRETA e marca a
       escolha do usuário como certa/errada.
     - Aberta: mostra a RESPOSTA-MODELO (gabarito) ao lado da resposta do
       usuário, para autoavaliação.
   - Mostrar PONTUAÇÃO das objetivas (ex.: "7 de 10 em múltipla escolha"). As
     abertas não entram na pontuação automática (são autoavaliadas).
5. **Persistência:** o quiz é salvo no documento como artefato. Pode ser
   reaberto e REFEITO (reiniciar: limpa as respostas e volta ao modo responder,
   mantendo as mesmas perguntas; ou gerar um quiz novo substitui).
6. **Geração robusta:** reusar o parser tolerante (`extrairBlocoJson` / padrão
   de `parse.ts`), validação de schema e re-tentativa corretiva, e `format:
   "json"` no Ollama (como já fazem flashcards/exercícios/mapa). Resolver modelo
   via `modeloParaGeracao()`. Chunking para textos grandes se necessário.

## Regras para o design decidir (simples e seguras)

- **Schema do quiz:** uma pergunta tem tipo ("multipla" | "aberta"), enunciado,
  e: para múltipla, uma lista de alternativas + índice/der da correta; para
  aberta, a resposta-modelo. Validar: múltipla tem ≥2 alternativas e exatamente
  uma correta; descartar perguntas inválidas; respeitar 5–100 no total.
- **Estado da tentativa:** respostas do usuário (alternativa escolhida por
  pergunta fechada; texto por aberta) e se a tentativa foi enviada. Decidir se o
  estado da tentativa persiste entre sessões ou só o quiz (perguntas). Preferir:
  persistir o quiz (perguntas); a tentativa pode ser em memória e "refazer"
  reinicia — o design documenta.
- **Pontuação:** só das perguntas de múltipla escolha (objetivas). Abertas são
  autoavaliadas, fora da pontuação automática.

## Fora de escopo desta fatia (roadmap)

- Avaliação por IA das respostas abertas (vai com "correção de exercícios").
- Estatísticas/histórico de tentativas ao longo do tempo.
- Temporizador / modo prova cronometrado.
- Exportar o quiz.

## Orientação técnica (o design refina)

- **Shared:** novo tipo de artefato Quiz (perguntas tipadas) em
  `src/shared/types.ts`; template de prompt em `src/shared/prompts.ts` pedindo o
  quiz em JSON no modo escolhido, com `format:"json"`.
- **Main:** serviço de geração reusando o parser tolerante + validação de schema
  (regras acima) + re-tentativa corretiva; handler IPC (ex.: `quiz:gerar`)
  resolvendo modelo via `modeloParaGeracao()`; persistência no documento em
  `storage.ts` (análogo a resumo/flashcards/exercícios/mapa). Atualizar
  `ipc.ts` e `preload.ts`.
- **Renderer:** nova aba/view "Quiz" com dois modos: RESPONDER (navega
  perguntas, escolhe alternativa / escreve resposta, botão Enviar) e REVISÃO
  (acerto/erro por questão, alternativa correta / gabarito, pontuação, botão
  Refazer). Desabilitada/empty-state sem texto importado, como as outras.
  Chamadas só via `getApi()`. Visual consistente com os tokens de `styles.css`.
- **Testes:** parsing do quiz (bom/malformado/truncado/retry/desistência);
  validação de schema (múltipla com uma correta, mínimo de alternativas,
  descarte de inválidas, limites 5–100); pontuação das objetivas (lógica pura);
  persistência round-trip do quiz no documento. UI é verificação manual (sem
  harness de componente). Testes mockam o Ollama e NÃO dependem da pasta Facul
  (somente leitura). Textos pt-BR; identificadores em inglês.
