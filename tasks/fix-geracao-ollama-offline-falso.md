# Correção — Mensagem falsa "Ollama não está rodando" ao gerar

> Relato do usuário (2026-10-16, com screenshots): o status no topo mostra
> "Ollama conectado" (verde), mas ao clicar em "Gerar quiz" e "Gerar exercícios"
> (ambos com Quantidade = 100, Tipo Misto/Mista) aparece o erro
> "O Ollama não está rodando. Inicie o Ollama e tente novamente."
> Contradição: as duas coisas não podem ser verdade ao mesmo tempo.

## Diagnóstico (com base no código real)

- `isOllamaRunning()` consulta `GET /api/tags` e o status "conectado" está
  CORRETO (confirmado: Ollama responde 200 agora).
- Em `src/main/services/ollama.ts`, a função `generate()` envolve o `fetch` de
  `POST /api/generate` num try/catch e, no catch de QUALQUER falha, lança
  `OllamaIndisponivelError` ("O Ollama não está rodando..."). Comentário no
  código: "Falha de rede = Ollama não está rodando."
- PROBLEMA: isso é falso para gerações longas. Com Quantidade = 100, o prompt é
  grande e a geração sem streaming demora muito; o `fetch` pode falhar por
  TIMEOUT ou conexão abortada/caída no meio, mesmo com o Ollama rodando. Esse
  erro cai no mesmo catch e vira a mensagem enganosa de "offline".
- Benchmark manual: a geração de ~100 itens no llama3.1:latest sem streaming é
  muito longa/instável (o teste manual não retornou em tempo hábil), coerente
  com a falha observada.

## Correção desejada

1. **Distinguir "offline de verdade" de "falha durante a geração".** Em
   `generate()`, separar:
   - Falha de CONEXÃO inicial (ECONNREFUSED / não conectou) → de fato Ollama
     indisponível → `OllamaIndisponivelError` (mensagem atual).
   - Conectou mas a geração falhou/caiu/estourou tempo → um erro DIFERENTE
     (ex.: `GeracaoFalhouError`) com mensagem honesta em pt-BR, do tipo:
     "A geração falhou ou demorou demais. Tente novamente, reduza a quantidade,
     ou use um modelo mais leve." NÃO dizer que o Ollama está desligado.
   - Verificar o comportamento de timeout do `fetch` nativo no processo main do
     Electron. Se não há timeout, considerar um timeout explícito (AbortController)
     generoso para gerações longas, convertendo o abort na mensagem de "demorou
     demais" (não em "offline").
2. **Mensagens dos handlers** (`mensagemAmigavel*` em `src/main/ipc/index.ts`)
   para quiz/exercícios/flashcards/mapa/resumo: mapear o novo erro para a
   mensagem honesta; manter `OllamaIndisponivelError` só para o caso realmente
   offline. Opcional: antes de uma geração, revalidar `isOllamaRunning()` e, se
   estiver OK mas a geração falhar, nunca cair na mensagem de offline.
3. **UX de quantidade alta (defensivo, recomendado):** quantidades muito altas
   (ex.: 100) tornam a geração lenta/instável com modelos locais. Considerar:
   (a) um aviso quando a quantidade é alta, e/ou (b) gerar em lotes/chunks
   internamente para quantidades grandes. Mínimo desta fatia: a mensagem de erro
   deve ser honesta e orientar reduzir a quantidade; a geração em lotes pode ser
   um extra se barato, senão vira roadmap.

## Restrições

- Stack e padrões atuais; sem dependência nova. UI/mensagens em pt-BR,
  identificadores em inglês.
- Não regredir: baseline 389 testes + build/lint limpos; todos devem continuar
  passando, com testes novos para a classificação de erro (conexão recusada vs.
  timeout/abort vs. HTTP não-ok) usando fetch mockado.
- Testes mockam o Ollama (sem modelo real, sem tocar a pasta Facul, que é
  somente leitura). Verificação manual real: com Ollama rodando, gerar quiz/
  exercícios com quantidade alta e confirmar que a mensagem NÃO é mais "Ollama
  não está rodando", e que uma quantidade razoável funciona.
