# Worklog — Task 4: Cliente Ollama + detecção de disponibilidade

> Registro de verificação do cliente Ollama (`ollama.ts`), IPC de status/seleção de
> modelo e componente `OllamaStatus`.
> Resolve o achado bloqueante da revisão (`review-task4.json` / `review-task4.md`):
> faltava evidência registrada de build/lint/test. O código em si foi avaliado como
> correto na revisão; esta iteração registra a evidência que estava ausente.

## Mudanças desta iteração (resposta à revisão)

- **Evidência de verificação registrada** (achado bloqueante #1): `npm run build`,
  `npm run lint` e `npm test` executados em `c:\Dev` e capturados abaixo. As caixas de
  verificação da Task 4 em `todo.md` agora têm respaldo nesta execução.
- **Achado #2 (componente `OllamaStatus` sem teste automatizado — não bloqueante):** sem
  mudança nesta iteração. É um débito carregado de passes anteriores (ainda não há harness
  de teste de renderer no projeto); a verificação do componente é manual (ver abaixo).
  Deve ganhar teste quando um setup de teste de UI for introduzido.

## Comandos de verificação (executados em c:\Dev)

```
=== npm run build ===   -> exit 0  (tsc --noEmit + electron-vite build OK)
=== npm run lint ===    -> exit 0  (eslint ., sem erros/avisos)
=== npm test ===        -> exit 0  (5 arquivos, 32 testes, todos passando)
   tests/shared/constants.test.ts   (3)
   tests/main/ollama.test.ts        (10)  <- cliente: isOllamaRunning/listModels/generate + 3 ramos de falha
   tests/main/ipc-ollama.test.ts    (5)   <- IPC: status compõe disponivel/modelos; seleção de modelo
   tests/main/ipc.test.ts           (2)
   tests/main/files.test.ts         (12)
```

O HTTP do Ollama está mockado nos testes (`vi.stubGlobal("fetch", ...)` no serviço e
mock do módulo `ollama.js` + `electron` no IPC), então a suíte não contata nenhum modelo
real.

## Verificação manual: Ollama parado → mensagem de instrução, sem crash

Reproduzido o caminho "Ollama parado" exercitando a mesma lógica do serviço/IPC
(`isOllamaRunning` → `listModels` → `obterStatusOllama` e `generate`) apontando para uma
porta local onde nada escuta (`http://localhost:1`), o que faz o `fetch` rejeitar
exatamente como quando o Ollama não está rodando. Feito com um script `.mjs` temporário
que foi removido em seguida (não faz parte da suíte automatizada).

Resultado observado:

```
status: {"disponivel":false,"modelos":[],"modeloSelecionado":"llama3.1:8b"}
disponivel===false (mostra instrucoes): true
generate lancou: OllamaIndisponivelError code= OLLAMA_INDISPONIVEL
App NAO quebrou (processo seguiu normalmente).
```

Interpretação na UI (`OllamaStatus.tsx`):
- `disponivel: false` → badge "Ollama não detectado" e bloco `INSTRUCOES` renderizado:
  baixar/instalar o Ollama, abrir o app, `ollama pull llama3.1:8b`, botão "Verificar
  novamente".
- Seletor de modelo mostra o default `llama3.1:8b` mesmo sem nenhum modelo baixado
  (semeado via `opcoesModelo`).
- `generate` lança `OllamaIndisponivelError` (code `OLLAMA_INDISPONIVEL`, mensagem pronta
  para o usuário) em vez de derrubar o app.

Observação: neste ambiente o Ollama estava, de fato, rodando (`GET /api/tags` → 200), por
isso a verificação do caso "parado" foi feita contra uma porta morta, que percorre o mesmo
ramo de erro do `fetch`.
