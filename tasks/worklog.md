# Worklog — Fix false "O Ollama não está rodando" on generation

Branch: `fix/geracao-offline-falso` (worktree `c:\Dev\.worktrees\fixollama`).
Iteration: first (no `tasks/review.json` present at start).

## Problem

Com o Ollama rodando (badge "Ollama conectado"), gerar Quiz (Misto) ou
Exercícios (Mista) com Quantidade = 100 mostrava "O Ollama não está rodando".
Causa: `generate()` em `src/main/services/ollama.ts` tratava QUALQUER falha de
`fetch` como `OllamaIndisponivelError`. Uma geração longa que estourava tempo ou
caía no meio caía nesse mesmo catch e virava a mensagem enganosa de offline.

## Changes

1. `src/shared/constants.ts`
   - Novo `OLLAMA_GENERATE_TIMEOUT_MS = 300_000` (5 min), com doc pt-BR
     explicando que atingir o teto mapeia para "a geração falhou", não offline.

2. `src/main/services/ollama.ts`
   - Novo `GeracaoFalhouError` (code estável `"GERACAO_FALHOU"`), mensagem pt-BR:
     "A geração falhou ou demorou demais. Tente novamente, reduza a quantidade,
     ou use um modelo mais leve." (NÃO afirma que o Ollama está desligado).
   - Novo helper `ehRecusaDeConexao(erro)`: lê de forma defensiva `code` direto e
     `cause.code`; só `ECONNREFUSED`/`ENOTFOUND`/`EAI_AGAIN` contam como recusa
     (Ollama realmente offline).
   - `generate()` reescrito: `AbortController` com `setTimeout` → `controller.abort()`
     em `OLLAMA_GENERATE_TIMEOUT_MS`, `signal` passado ao `fetch`, `clearTimeout`
     num `finally`. No catch: recusa de conexão → `OllamaIndisponivelError`;
     abort/timeout, queda no meio (`ECONNRESET`) ou falha desconhecida →
     `GeracaoFalhouError`. HTTP não-ok permanece `Error` genérico com o status.
   - Investigação do timeout do fetch nativo: o `fetch` do processo main (undici)
     NÃO impõe timeout total de resposta, por isso o AbortController explícito.

3. `src/main/ipc/index.ts`
   - Importa `GeracaoFalhouError`.
   - Adiciona o branch `instanceof GeracaoFalhouError → erro.message` ANTES da
     genérica em TODOS os mappers de geração: resumo, flashcards, exercícios,
     mapa mental, quiz e dica da IA. `OllamaIndisponivelError` continua mapeado
     SÓ para a mensagem de offline real.

4. Testes (fetch/ollama mockados — sem modelo real, sem tocar a pasta Facul):
   - `tests/main/ollama.test.ts`: signal do AbortController definido no happy path;
     recusa via `cause.code = ECONNREFUSED` e via `code` direto → `OllamaIndisponivelError`;
     `ECONNRESET` → `GeracaoFalhouError`; `AbortError` → `GeracaoFalhouError`;
     falha de fetch não reconhecida → `GeracaoFalhouError`; HTTP 404 → `Error` com status.
   - `tests/main/ipc-quiz.test.ts` e `tests/main/ipc-exercicios.test.ts`: mock
     factory passa a exportar `GeracaoFalhouError`; novos testes provam
     `GeracaoFalhouError` → /demorou demais|reduza a quantidade/ e
     `OllamaIndisponivelError` → /Ollama não está rodando/.
   - `tests/main/ipc-resumo.test.ts`, `ipc-flashcards.test.ts`, `ipc-mapa.test.ts`,
     `ipc-agenda.test.ts`: mock factory estendida para exportar `GeracaoFalhouError`
     (necessário porque os mappers fazem `instanceof` contra a classe mockada).

## UX de quantidade alta

Barra mínima entregue: a geração que falha/estoura tempo agora mostra uma
mensagem honesta que orienta reduzir a quantidade ou usar um modelo mais leve, em
vez de culpar o Ollama. Batching/chunking interno para quantidades muito altas
NÃO foi implementado (fora de escopo, maior risco) — fica como ROADMAP.

## Verification (worktree)

Comandos executados em `c:\Dev\.worktrees\fixollama`:

- `npm run build` → GREEN (tsc --noEmit + electron-vite build, exit 0).
- `npm run lint` → GREEN (eslint ., exit 0, sem erros).
- `npm test` → GREEN: **Test Files 30 passed (30); Tests 398 passed (398)**.
  Baseline era 389; os 9 testes a mais são os novos (classificação de erro +
  mappers IPC). Nenhuma regressão.

## Manual acceptance notes

- Com Ollama rodando, uma geração de quantidade alta que falha/demora demais
  passa a mostrar "A geração falhou ou demorou demais. Tente novamente, reduza a
  quantidade, ou use um modelo mais leve." e NÃO "O Ollama não está rodando".
- Uma quantidade razoável continua gerando normalmente (happy path dos testes de
  `generate` e dos handlers de quiz/exercícios).
- Ollama realmente desligado (recusa de conexão) ainda mostra a mensagem de
  offline — comportamento preservado.

## Integração em master (rebase + verificação)

- `git rebase master` → "Current branch is up to date" (merge-base já era o HEAD
  de master `9175cbb`; nenhum conflito, nenhum replay de commit necessário).
- Re-verificação pós-rebase em `c:\Dev\.worktrees\fixollama`:
  - `npm run build` → GREEN (exit 0).
  - `npm run lint` → GREEN (exit 0, sem erros).
  - `npm test` → GREEN: **Test Files 30 passed (30); Tests 398 passed (398)**.
- Pronto para fast-forward de master (`fix/geracao-offline-falso` = `59f043e`).
