# Plano — Correção da inconsistência na geração de JSON (mapas mentais, flashcards, exercícios)

> Fonte da verdade: `c:\Dev\tasks\fix-mapas-inconsistencia.md` (relato do usuário + diagnóstico),
> `SPEC.md` e `tasks/design-mapas.md`. Todo o trabalho ocorre no worktree
> `c:\Dev\.worktrees\fixjson` (branch `fix/geracao-json`), caminhos absolutos.
>
> Causa raiz confirmada no código: `src/main/services/ollama.ts` → `generate()` faz
> `POST /api/generate` com `{ model, prompt, stream: false }` e **não** passa o parâmetro
> `format` do Ollama. Sem ele, modelos de texto frequentemente embrulham o JSON em
> markdown/prosa (explica "só funcionou na 3ª vez"); `moondream` é modelo de visão e não
> serve para JSON estruturado. Correções: forçar `format: "json"` nas três gerações
> estruturadas, aumentar a resiliência da re-tentativa do mapa mental, e melhorar a
> mensagem de erro em pt-BR orientando o usuário a usar um modelo de texto.
>
> Baseline a preservar (verificado agora): **213 testes passando**, `npm run build` e
> `npm run lint` limpos. Comandos reais do projeto (de `package.json`):
> `npm test` → `vitest run`; `npm run build` → `tsc --noEmit && electron-vite build`;
> `npm run lint` → `eslint .`.
>
> Decisões de design tomadas aqui (sem design externo para esta correção):
> - **`format: "json"`** (string nativa do Ollama), **não** JSON-schema por artefato.
>   Motivo: os prompts já instruem o formato exato de cada artefato e o parser tolerante
>   já normaliza a forma; `"json"` elimina o markdown/prosa com risco e manutenção
>   mínimos, sem precisar manter três schemas em sincronia com os tipos. Mantém a
>   recomendação do Ollama (prompt + `format` juntos), que já é o caso.
> - **Resumo continua texto livre** (sem `format`): não é JSON e forçar o formato
>   quebraria a saída.
> - **Mapa mental passa a 3 chamadas** (1ª + 2 corretivas). Flashcards/exercícios
>   **não** mudam o número de tentativas (ver item 4): o ganho principal vem do
>   `format: "json"`, e mexer no fluxo deles arrisca regressão sem necessidade — o
>   escopo pede "mesmo espírito apenas se trivial e não-regressivo".
> - **UI (OllamaStatus.tsx): sem mudança** nesta fatia (ver item 7) — a orientação de
>   modelo vai na mensagem de erro, que é o caminho de menor risco e já cobre o relato.

---

## Ordem e dependências

Os itens 1→4 são sequenciais: cada um depende da assinatura/estado introduzido pelo
anterior. Item 1 (assinatura de `generate`) é a base de tudo. Itens 2 e 3 threadam o
`format` pelos call-sites. Item 4 aumenta a resiliência do mapa. Item 5 ajusta a cópia
de erro. Itens 6–8 são os testes (um por área), escritos por último porque exercitam o
comportamento final. Cada item deixa o código compilável e com a suíte verde.

---

- [ ] 1. Adicionar suporte opcional a `format` em `generate()` do cliente Ollama.
      Em `GenerateParams`, acrescentar `format?: "json" | Record<string, unknown>`
      (JSDoc em pt-BR explicando que, quando presente, instrui o Ollama a devolver JSON;
      ausente mantém texto livre). Em `generate()`, incluir `format` no corpo do
      `POST /api/generate` **somente quando definido** — construir o objeto base
      `{ model, prompt, stream: false }` e adicionar `format` condicionalmente
      (ex.: espalhar `...(format !== undefined ? { format } : {})`), para que o corpo
      serializado NÃO contenha a chave `format` quando ela não é passada (compat retroativa:
      resumo e qualquer chamador atual não enviam `format`).
      Arquivos: `src/main/services/ollama.ts`
      Verify: `npm test` — a suíte inteira continua verde (nenhum teste existente de
      `generate` quebra, pois o corpo sem `format` é idêntico ao atual). Confirmação
      específica vem no item 6.

- [ ] 2. Estender o tipo do gerador injetável para aceitar `format` e threadá-lo nos
      serviços estruturados. Em `src/main/services/resumo.ts`, alterar
      `export type GerarTexto = (prompt: string) => Promise<string>` para
      `export type GerarTexto = (prompt: string, format?: "json" | Record<string, unknown>) => Promise<string>`
      (JSDoc pt-BR: o 2º parâmetro é opcional; o resumo não o usa). `parse.ts` e `mapa.ts`
      reusam `GerarTexto` (parse.ts declara o seu próprio alias idêntico — alinhar os dois
      para a mesma assinatura). Em `mapa.ts` e `parse.ts`, as chamadas internas a `gerar(...)`
      para gerações estruturadas passam `"json"` como 2º argumento:
      - `mapa.ts`: `gerar(montarPromptMapaMental(base), "json")` e
        `gerar(montarPromptCorrigirMapaMental(...), "json")`. A condensação de texto grande
        chama `gerarResumo({...})`, que continua **sem** `format` (resumo é texto livre).
      - `parse.ts` (`gerarFlashcards`/`gerarExercicios`): as quatro chamadas a `gerar(...)`
        (1ª e corretiva de cada) passam `"json"` como 2º argumento.
      O resumo (`resumo.ts`) **não** passa `format` em nenhuma chamada.
      Arquivos: `src/main/services/resumo.ts`, `src/main/services/parse.ts`,
      `src/main/services/mapa.ts`
      Verify: `npm run build` (checa tipos de `tsc --noEmit`) e `npm test` — ambos limpos;
      os testes de `mapa.test.ts`/`parse.test.ts` que injetam `gerar` como
      `vi.fn()` continuam passando (o 2º argumento é ignorado pelos mocks atuais).

- [ ] 3. Threadar o `format: "json"` nos handlers IPC das três gerações estruturadas.
      Em `src/main/ipc/index.ts`, os callbacks `gerar` construídos nos handlers
      `gerarMapaMental`, `gerarFlashcards` e `gerarExercicios` passam a repassar o `format`
      recebido para `generate`: trocar `(prompt) => generate({ prompt, model })` por
      `(prompt, format) => generate({ prompt, model, format })` nesses três handlers.
      O handler `gerarResumo` **permanece** `(prompt) => generate({ prompt, model })`
      (sem `format`). Como o serviço só chama `gerar(prompt, "json")` nas gerações
      estruturadas, `generate` recebe `format: "json"` só nelas; no resumo `format` chega
      `undefined` e é omitido do corpo (item 1).
      Arquivos: `src/main/ipc/index.ts`
      Verify: `npm test` — toda a suíte verde; os testes IPC existentes
      (`ipc-mapa`, `ipc-flashcards`, `ipc-exercicios`, `ipc-resumo`) continuam passando
      pois os mocks de `generate` ignoram campos extras do objeto de params.

- [ ] 4. Aumentar a resiliência da re-tentativa do mapa mental para **3 chamadas**
      (1ª + 2 corretivas) antes de lançar `MapaMentalInvalidoError`, mantendo o parser
      tolerante como rede de segurança. Em `gerarMapaMental` (`src/main/services/mapa.ts`),
      após a 1ª tentativa, executar **duas** tentativas corretivas em sequência: cada uma
      chama `gerar(montarPromptCorrigirMapaMental(ultimaRespostaCrua), "json")` e tenta
      `parseMapaMental`; retorna no 1º sucesso; se ambas falharem, lança
      `MapaMentalInvalidoError`. Preferir um laço pequeno (ex.: array das respostas
      corretivas / contador) a copiar o bloco, alimentando cada corretiva com a resposta
      crua anterior. Atualizar o JSDoc da função (que hoje diz "UMA re-tentativa") para
      "até duas re-tentativas corretivas (3 chamadas no total)". Flashcards/exercícios
      ficam como estão (decisão: não é trivial sem risco de regressão; o ganho vem do
      `format`).
      Arquivos: `src/main/services/mapa.ts`
      Verify: `npm test` — o teste existente de `mapa.test.ts`
      "lança MapaMentalInvalidoError após falha persistente" espera hoje
      `gerar` chamado 2x; ele será **atualizado no item 7** para 3x. Rodar
      `npx vitest run tests/main/mapa.test.ts` após o item 7 e confirmar verde.

- [ ] 5. Melhorar a cópia pt-BR da mensagem de falha repetida de geração estruturada,
      orientando a usar um modelo de **texto** e evitar modelos de visão/embedding.
      Ajustar a `message` dos erros de "formato inválido" para incluir a sugestão. Opção
      escolhida (menor risco, uma fonte por erro): editar a string passada ao `super(...)`
      em `MapaMentalInvalidoError` (`src/main/services/mapa.ts`),
      `FlashcardsInvalidosError` e `ExerciciosInvalidosError` (`src/main/services/parse.ts`),
      acrescentando uma 2ª frase, por exemplo:
      `"A IA não devolveu um mapa mental em um formato válido. Tente gerar novamente. "`
      `+ "Para melhores resultados, use um modelo de texto (ex.: llama3.1, qwen2.5, gemma2) "`
      `+ "e evite modelos de visão ou de embedding (moondream, minicpm-v, nomic-embed-text)."`
      (análogo para flashcards/exercícios, trocando "mapa mental" por "flashcards"/
      "exercícios"). Como os handlers IPC em `index.ts` já devolvem `erro.message` para
      esses erros conhecidos (via `mensagemAmigavelMapaMental`/`...Flashcards`/
      `...Exercicios`), a nova frase chega à UI sem outras mudanças. Manter tudo em pt-BR;
      identificadores de código em inglês.
      Arquivos: `src/main/services/mapa.ts`, `src/main/services/parse.ts`
      Verify: `npm test` — asserts existentes usam regex `/formato válido/`, que continua
      casando com a nova frase; a nova substring de orientação é coberta no item 7.
      Confirmar com `npx vitest run tests/main/mapa.test.ts tests/main/parse.test.ts`.

- [ ] 6. Teste: `generate` inclui `format` no corpo quando fornecido e o omite quando não.
      Em `tests/main/ollama.test.ts`, no `describe("generate")`, adicionar dois casos
      seguindo o padrão `respostaFake` + `vi.stubGlobal("fetch", fetchMock)` já usado:
      (a) `generate({ prompt: "x", format: "json" })` → parsear `init.body` e asserir
      `corpo.format === "json"`; (b) `generate({ prompt: "x" })` → asserir que `"format"`
      **não** é chave do corpo (`expect(Object.keys(corpo)).not.toContain("format")`).
      Arquivos: `tests/main/ollama.test.ts`
      Verify: `npx vitest run tests/main/ollama.test.ts` — todos os casos (antigos e novos)
      passam.

- [ ] 7. Testes: IPC threada `format: "json"` nas três gerações estruturadas e NÃO no
      resumo; e o mapa mental faz até 3 tentativas. Mudanças:
      - `tests/main/ipc-mapa.test.ts`: no caso de geração bem-sucedida, asserir
        `generate.mock.calls[0][0].format === "json"`.
      - `tests/main/ipc-flashcards.test.ts`: idem, asserir `...format === "json"`.
      - `tests/main/ipc-exercicios.test.ts`: idem, asserir `...format === "json"`.
      - `tests/main/ipc-resumo.test.ts`: no caso bem-sucedido, asserir que o resumo
        **não** envia format: `expect(generate.mock.calls[0][0].format).toBeUndefined()`.
      - `tests/main/mapa.test.ts`: (i) atualizar "lança MapaMentalInvalidoError após falha
        persistente" para esperar `gerar` chamado **3x** (`"nunca é json"` em todas);
        (ii) adicionar um caso novo "re-tenta duas vezes: falha, falha, sucesso" com
        `mockResolvedValueOnce("lixo").mockResolvedValueOnce("ainda lixo").mockResolvedValueOnce(arvoreValida)`
        esperando `gerar` chamado 3x e `mapa.raiz.rotulo === "Tema"`; (iii) opcional:
        asserir em um caso que o `gerar` recebe `"json"` como 2º argumento
        (`gerar.mock.calls[0][1] === "json"`).
      - Cópia de erro (item 5): em `mapa.test.ts` e/ou `parse.test.ts`, asserir que a
        mensagem do erro de formato inclui a orientação, ex.:
        `expect(() => { throw new MapaMentalInvalidoError(); }).toThrow(/llama3.1/)` ou
        checar `new MapaMentalInvalidoError().message` com `/modelo de texto/`.
      Todos os testes mockam o Ollama (serviço ou `fetch`); nenhum depende de modelo real
      nem da pasta `C:\Users\enzom\OneDrive\Desktop\Facul`.
      Arquivos: `tests/main/ipc-mapa.test.ts`, `tests/main/ipc-flashcards.test.ts`,
      `tests/main/ipc-exercicios.test.ts`, `tests/main/ipc-resumo.test.ts`,
      `tests/main/mapa.test.ts`, `tests/main/parse.test.ts`
      Verify: `npm test` — todos os 213 testes anteriores + os novos passam
      (contagem total aumenta; nenhum regride).

- [ ] 8. Verificação final de regressão: build, lint e suíte completa limpos.
      Arquivos: nenhum (apenas execução).
      Verify: rodar, nesta ordem, `npm run lint` (sem erros/avisos de eslint),
      `npm run build` (`tsc --noEmit && electron-vite build` sem erros de tipo) e
      `npm test` (todos verdes, nenhuma regressão do baseline de 213 + novos testes).

---

## Fora de escopo (não fazer)

- Alterar `OllamaStatus.tsx` para filtrar/remover modelos ou mudar a seleção
  (item opcional do relato) — **não** nesta fatia: risco > ganho; a orientação já
  chega pela mensagem de erro (item 5). Reavaliar numa fatia de UX dedicada.
- Qualquer item de roadmap de edição/exportação de mapa mental.
- Redesenhar o pipeline de geração ou introduzir JSON-schema por artefato.
- Adicionar qualquer dependência nova (`format` é nativo do Ollama).

## Notas / suposições

- A assinatura `format?: "json" | Record<string, unknown>` usa `Record<string, unknown>`
  (não `object`) para satisfazer o eslint/TS estrito do projeto; manter `verbatimModuleSyntax`
  em mente (nenhum import de tipo novo é necessário — o literal `"json"` e `Record` são
  globais do TS).
- O contrato de retorno dos handlers e a resolução de modelo via `modeloParaGeracao()`
  **não** mudam; só o corpo do `POST` e a cópia de erro mudam.
