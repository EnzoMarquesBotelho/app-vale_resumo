# Worklog — Correção da inconsistência na geração de JSON

Branch: `fix/geracao-json` — worktree `c:\Dev\.worktrees\fixjson`.
Iteração: primeira (não havia `tasks/review-fix-json.json`).

## O que foi feito (por item do plano)

1. **`src/main/services/ollama.ts`** — `GenerateParams` ganhou
   `format?: "json" | Record<string, unknown>` (JSDoc pt-BR). Em `generate()`, o
   corpo do `POST /api/generate` inclui `format` **apenas quando definido** via
   `...(format !== undefined ? { format } : {})`. Sem `format`, o corpo é
   idêntico ao anterior (compat retroativa: resumo e demais chamadores atuais).

2. **`src/main/services/resumo.ts`** e **`src/main/services/parse.ts`** —
   `GerarTexto` agora é `(prompt, format?) => Promise<string>` (assinaturas
   alinhadas entre os dois módulos). Em `parse.ts`, as quatro chamadas a `gerar`
   (1ª + corretiva de flashcards e de exercícios) passam `"json"`. O resumo
   (`resumo.ts`) **não** passa `format` em nenhuma chamada (texto livre).

3. **`src/main/ipc/index.ts`** — os callbacks `gerar` dos handlers
   `gerarMapaMental`, `gerarFlashcards` e `gerarExercicios` passaram de
   `(prompt) => generate({ prompt, model })` para
   `(prompt, format) => generate({ prompt, model, format })`. O handler
   `gerarResumo` permanece sem `format`.

4. **`src/main/services/mapa.ts`** — `gerarMapaMental` passou a fazer até **duas**
   re-tentativas corretivas (**3 chamadas no total**) antes de lançar
   `MapaMentalInvalidoError`, via laço que realimenta a resposta crua anterior.
   JSDoc atualizado ("UMA re-tentativa" → "até duas re-tentativas corretivas").
   Flashcards/exercícios mantêm o fluxo atual (ganho vem do `format`).

5. **Mensagens de erro pt-BR** — `MapaMentalInvalidoError` (`mapa.ts`),
   `FlashcardsInvalidosError` e `ExerciciosInvalidosError` (`parse.ts`) agora
   orientam a usar um modelo de texto (llama3.1, qwen2.5, gemma2) e evitar
   modelos de visão/embedding (moondream, minicpm-v, nomic-embed-text).

   OpcionaL de UI (`OllamaStatus.tsx`): **não alterado** (fora de escopo nesta
   fatia, conforme plano — risco > ganho; a orientação chega pela mensagem de erro).

## Testes adicionados/estendidos

- `tests/main/ollama.test.ts`: `format` presente no corpo quando fornecido;
  `format` ausente das chaves do corpo quando não fornecido.
- `tests/main/ipc-mapa.test.ts`, `ipc-flashcards.test.ts`,
  `ipc-exercicios.test.ts`: assertam `params.format === "json"`.
- `tests/main/ipc-resumo.test.ts`: assarta `params.format` indefinido.
- `tests/main/mapa.test.ts`: 2º argumento `"json"`; caso "falha, falha, sucesso"
  (3 chamadas); falha persistente agora espera 3 chamadas; mensagem de erro com
  orientação de modelo.
- `tests/main/parse.test.ts`: mensagem de erro de flashcards com orientação.

Todos os testes mockam o Ollama (serviço ou `fetch`); nenhum depende de modelo
real nem da pasta `C:\Users\enzom\OneDrive\Desktop\Facul`.

## Verificação (executada no worktree)

| Comando         | Resultado                                   |
| --------------- | ------------------------------------------- |
| `npm run lint`  | limpo (exit 0, sem erros/avisos de eslint)  |
| `npm run build` | limpo (`tsc --noEmit` + `electron-vite build` sem erros) |
| `npm test`      | **218 testes passando** (20 arquivos), exit 0 |

Baseline era 213 testes; +5 novos casos, nenhuma regressão.

Verificação manual contra o Ollama real: **não realizada** (sem acesso a modelo
local no ambiente da subtarefa; a pasta `...\Facul` não foi lida nem modificada).
