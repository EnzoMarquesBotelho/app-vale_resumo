# Worklog — Task 7: Gerar exercícios (fatia vertical)

> Registro de verificação da fatia vertical "gerar exercícios" (prompt nos modos
> teórica/prática/mista, parser estruturado reusando `parse.ts`/`extrairBlocoJson`,
> limites 5–100 via `normalizarQuantidade`, IPC `exercicios:gerar`, tela
> `Exercicios.tsx` com lista legível e gabarito recolhível).
> Resolve o achado bloqueante da revisão (`review-task7.json` / `review-task7.md`):
> faltava a evidência registrada de build/lint/test e o teste manual dos três modos.
> O código em si foi avaliado como correto na revisão (spot-check de 23 testes das
> suítes da Task 7 passou); esta iteração registra a evidência ausente e anota a
> disposição do achado não bloqueante.

## Mudanças desta iteração (resposta à revisão)

- **Evidência de verificação registrada** (achado bloqueante #1): `npm run build`,
  `npm run lint` e `npm test` executados em `c:\Dev` e capturados abaixo, mais um teste
  manual real dos três modos contra o Ollama local e um PDF real da pasta Facul
  (somente leitura). Antes deste worklog, o único traço eram os `[x]` no `todo.md` —
  como as Tasks 3–6, a Task 7 agora tem o registro que o contrato exige.
- **Achado #2 (assimetria clamp-vs-block — não bloqueante):** convenção definida e
  documentada, sem mudar o comportamento visível. Decisão: o serviço
  (`normalizarQuantidade`) é a fonte da verdade e **sempre** faz clamp para 5–100 —
  essa é a garantia de que nunca sai pedido fora da faixa. A UI é apenas uma camada de
  feedback antecipado: bloqueia o botão e avisa enquanto o valor está fora de 5–100,
  para o usuário não achar que o número foi ignorado. As duas camadas são intencionais
  e consistentes; um comentário em `Exercicios.tsx` registra essa decisão (herdada da
  revisão da Task 6, que pediu para resolver aqui). Nenhum comportamento de usuário
  mudou — só ficou documentado qual é a convenção.

## Comandos de verificação (executados em c:\Dev)

```
=== npm run build ===   -> exit 0  (tsc --noEmit + electron-vite build OK)
=== npm run lint ===    -> exit 0  (eslint ., sem erros/avisos)
=== npm test ===        -> exit 0  (12 arquivos, 105 testes, todos passando)
   tests/shared/constants.test.ts     (3)
   tests/shared/prompts.test.ts       (12)
   tests/main/ollama.test.ts          (10)
   tests/main/resumo.test.ts          (9)
   tests/main/parse.test.ts           (21)
   tests/main/files.test.ts           (12)
   tests/main/ipc.test.ts             (2)
   tests/main/ipc-ollama.test.ts      (5)
   tests/main/ipc-resumo.test.ts      (3)
   tests/main/ipc-flashcards.test.ts  (5)
   tests/main/exercicios.test.ts      (18)  <- Task 7: parseExercicios (3 modos, boas E
                                               malformadas), gerarExercicios (limites 5–100,
                                               sub-mínimo→5, acima-máximo→100, retry, erros)
   tests/main/ipc-exercicios.test.ts  (5)   <- Task 7: canal exercicios:gerar, happy path,
                                               retry→sucesso, inválido-persistente→erro amigável,
                                               falha genérica→mensagem amigável
```

Os testes automatizados mockam/injetam o Ollama (`gerar` injetável no serviço, mock de
módulo no IPC), então a suíte não contata nenhum modelo real. A cobertura de parsing dos
exercícios exercita respostas BOAS (objeto `{exercicios:[...]}`, array direto) e
MALFORMADAS (JSON truncado/não fechado, sintaxe inválida, campos vazios/ausentes, sem
JSON) — critério "parsing + limites 5–100" da Task 7. O `modo` é anexado a cada exercício
a partir do argumento da geração (não é lido da resposta do modelo), e os testes afirmam
isso nos três modos. Os limites são checados ponta a ponta: `quantidade 2` → prompt pede
5 e a lista é limitada a 5; `quantidade 500` → prompt pede 100.

## Verificação manual com material real (SOMENTE LEITURA)

Fonte: `C:\Users\enzom\OneDrive\Desktop\Facul` (PDFs reais de faculdade, por matéria).
Nada foi modificado, movido ou apagado nessa pasta. A checagem foi feita por um teste
temporário (`tests/_manual-exercicios.test.ts`) que chamou o fluxo real sem mocks
(`importarArquivo` → `gerarExercicios` → `generate` do Ollama) e foi **removido em
seguida** (não faz parte da suíte automatizada, que continua 100% com Ollama mockado).

Ambiente: Ollama rodando localmente (`GET /api/tags` → 200). O modelo default
`llama3.1:8b` está instalado nesta máquina com a tag `llama3.1:latest`, então o teste
manual passou esse nome explícito ao `generate`; na UI o modelo é escolhido pelo seletor
da Task 4.

Arquivo testado: `Analise de Algoritimos/Pratica/Pr_atica1prblemascomputacionais.pdf`
(5824 chars extraídos; `semTexto: false`). Pedidos 5 exercícios em cada modo.

Resultados observados (PEDIDOS: 5 em todos; cada item carrega o `modo` da geração):

```
=== MODO teorica | PEDIDOS: 5 | RECEBIDOS: 5 ===
  1. [teorica] "Um problema de Decisão... a resposta é sim ou não" :: "Sim ou não (1 ou 0)"
  2. [teorica] "Números primos: naturais > 1 com apenas dois divisores" :: "O número 1 não é primo"
  3. [teorica] "O crivo de Eratóstenes..." :: "O(Q*N)"
  4. [teorica] "Complexidade de espaço da ordenação in-place" :: "O(n²)"
  5. [teorica] "Complexidade da busca binária" :: "O(log n)"

=== MODO pratica | PEDIDOS: 5 | RECEBIDOS: 5 ===
  1. [pratica] "Número primo: natural > 1 com dois divisores (1 e ele)" :: "Verdadeiro"
  2. [pratica] "Se N é primo, seus múltiplos não são primos (ex.: 7)" :: "Verdadeiro"
  3. [pratica] "Complexidade da Busca Sequencial/Linear?" :: "O(n)"
  4. [pratica] "Complexidade da Busca Binária?" :: "O(log n)"
  5. [pratica] "Qual é a sequência de Fibonacci?" :: "0, 1, 1, 2, 3, 5, 8, 13, ..."

=== MODO mista | PEDIDOS: 5 | RECEBIDOS: 5 ===
  1. [mista] "Qual é o número primo que é par?" :: "2"
  2. [mista] "O Crivo de Eratóstenes..." :: "Testando até N/2"
  3. [mista] "Complexidade de tempo do Bubble Sort?" :: "O(n²)"
  4. [mista] "Complexidade de espaço do Quick Sort (caso médio)?" :: "O(log n)"
  5. [mista] "Busca que divide o problema pela metade, O(log n)?" :: "Busca Binária"
```

Interpretação:
- Os três modos (teórica/prática/mista) geraram listas reais e coerentes com o conteúdo
  do PDF — critério "gera nos três modos" atendido com material de verdade.
- A quantidade escolhida (5, o mínimo) foi respeitada ponta a ponta nos três modos
  (`normalizarQuantidade` → prompt → `slice(0, n)`): 5 pedidos → 5 recebidos em cada.
- O JSON pedido ao modelo foi extraído e validado em todos os casos (não foi preciso a
  re-tentativa corretiva nesta rodada); os caminhos de malformação e re-tentativa são
  cobertos pelos testes automatizados.
- A lista é exibida de forma legível na tela `Exercicios.tsx` (`<ol>` com enunciado e
  gabarito em `<details>` recolhível) — verificação de UI por este fluxo manual +
  inspeção, como previsto desde a Task 1 (sem harness de DOM no projeto).
