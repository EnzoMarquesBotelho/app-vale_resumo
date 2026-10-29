# Plano de implementação — Plano de estudo guiado, Fatia 2/4

> Questionário + distribuição por dias (pura) + régua base/novo.
> Worktree: `c:\Dev\.worktrees\plano-f2-questionario` (branch `feat/plano-f2-questionario`).
> Fonte de verdade: `tasks/design-f2.md` (3ª versão, APROVADO). Nada usa Ollama.
>
> **Baseline verificado neste worktree:** `npm test` → **614 testes, 47 arquivos, verde**
> (HEAD `ae729bd`). O total após a fatia DEVE ficar **> 614**.
>
> Comandos (de `AGENTS.md`): `npm run build` (tsc --noEmit + electron-vite build),
> `npm run lint` (eslint), `npm test` (vitest run). Os três devem passar ao fim de
> cada commit. `.worktrees/` é ignorado por git e ESLint — rodar os comandos de
> DENTRO do worktree (`cwd` = worktree), nunca da raiz `c:\Dev`.
>
> Ordem = dois commits (design §13.1): **Commit A = persistência** (itens 1–7),
> **Commit B = distribuição** (itens 8–14). Cada item deixa o repo compilável.
> B depende de A (tipos + persistência). Cada item cita o § do design que o governa.

---

## Commit A — Modelo + persistência do bloco `plano`

- [ ] 1. Adicionar os tipos aditivos do plano em `src/shared/types.ts`.
      Novos: `OrdinalProva = "primeira"|"segunda"|"final"`, `PreferenciaCheckpoint =
      "automatico"|"lembrete"`, `NivelDificuldade = "facil"|"media"|"dificil"`,
      `interface TopicoPlano` (`id`, `titulo`, `novo: boolean`, `dificuldade?`,
      `dataArquivo?`) e `interface PlanoEstudo` (`ordinal`, `horasPorDia: number`,
      `diasPorSemana: number`, `topicos: TopicoPlano[]`, `ordemManual?: string[]`,
      `checkpoint: PreferenciaCheckpoint`, `atualizadoEm: string`) — ver §5.1 verbatim.
      Adicionar `plano?: PlanoEstudo` à interface `Prova` (campo opcional, aditivo).
      Files: src/shared/types.ts
      Verify: `npm run build` compila (tsc --noEmit sem erros).

- [ ] 2. Adicionar `slugTopico` puro em `src/shared/slug.ts` (NOVO).
      Determinística, sem dependência: minúsculas, `normalize("NFD")` + strip de
      diacríticos (regex `/[\u0300-\u036f]/g`), troca não-alfanumérico por `-`,
      colapsa hífens repetidos, trim de hífens das pontas; vazio após normalizar →
      `"topico"`. NÃO inclui o prefixo `manual:` (isso é responsabilidade de
      `sanearPlano`). Ver §5.4.
      Files: src/shared/slug.ts, tests/shared/slug.test.ts
      Verify: `npx vitest run tests/shared/slug.test.ts` — testes novos passam
      (acentos viram ascii; vazio→"topico"; dois títulos iguais geram o mesmo slug,
      a unicidade vem do sufixo de índice aplicado por sanearPlano).

- [ ] 3. Implementar `sanearPlano` em `src/main/services/provas.ts`.
      Assinatura: `export function sanearPlano(bruto: unknown, agora: string):
      PlanoEstudo`. Aplica a tabela da §5.3 — `ordinal` só os 3 valores (senão
      `DadosProvaInvalidosError("Informe qual prova é.")`); `horasPorDia`
      `Math.round`+clamp 1–24 (default 2); `diasPorSemana` `Math.round`+clamp 1–7
      (default 5); `topicos`: cada item com `titulo` trim 1–200 (vazio → descarta),
      `id` trim não-vazio **E não iniciado por `manual:`** aceito como veio do doc,
      senão `"manual:" + slugTopico(titulo) + "-" + i`, `novo` coerção booleana e
      **forçado `false` se `ordinal==="primeira"`**, `dificuldade` só se ∈ níveis,
      `dataArquivo` só se `ehIsoPlausivel` (importar de `@shared/cronologia`), dedup
      por `id` mantendo o 1º, **vazio após sanear → `DadosProvaInvalidosError("Informe
      ao menos um assunto.")`**; `ordemManual` array de strings, descarta ids
      inexistentes em `topicos`, dedup, vazio → chave omitida (spread condicional);
      `checkpoint` 2 valores (default `"lembrete"`); `atualizadoEm` = `agora`
      (parâmetro, ignora o do renderer). Importar `slugTopico` de `@shared/slug`.
      Ver §5.3, §5.4, §11.
      Files: src/main/services/provas.ts
      Verify: `npm run build` compila.

- [ ] 4. Implementar `salvarPlano` em `src/main/services/provas.ts`.
      Assinatura: `export async function salvarPlano(id: string, planoBruto: unknown,
      agora: string, baseDir?: string): Promise<Prova>`. Carrega a prova
      (`carregarProva`, propaga `ProvaNaoEncontradaError`), gera **um** `agora`
      recebido como parâmetro (o handler o injeta), chama `sanearPlano(planoBruto,
      agora)`, grava a prova com `...(plano ? { plano } : {})` (spread condicional no
      padrão REAL de `listarProvas`/`salvarSessoes`) e recarimba **ambos** os
      `atualizadoEm` com o MESMO `agora` — `PlanoEstudo.atualizadoEm` (via
      `sanearPlano`) e `Prova.atualizadoEm`. Usa `escreverProva` (atômico) existente.
      Ver §5.3, §8.3 (carimbos), NIT-4.
      Files: src/main/services/provas.ts
      Verify: `npm run build` compila.

- [ ] 5. Adicionar os testes de persistência em `tests/main/services/provas.test.ts`.
      Cobrir (padrão `tmpdir` já usado no arquivo): cada regra de `sanearPlano`
      (§5.3) — ordinal inválido lança; `primeira` força todo `novo:false`; clamps de
      horas/dias; dedup por id; **id de tópico à mão vira `manual:<slug>-<i>` e nunca
      colide com id de doc (randomUUID)**; `ordemManual` filtra ids inexistentes;
      topicos vazio → erro. `salvarPlano`: grava o bloco aditivo e **recarimba ambos
      os `atualizadoEm` com o mesmo timestamp**; **round-trip** — salvar e recarregar
      via `carregarProva` devolve o bloco idêntico; **carregar uma prova ANTIGA sem
      `plano`** (fixture gravada sem o campo) carrega sem erro e `prova.plano ===
      undefined`. Ver §12.
      Files: tests/main/services/provas.test.ts
      Verify: `npx vitest run tests/main/services/provas.test.ts` — passam; total
      global sobe acima de 614.

- [ ] 6. Expor o canal `salvarPlano` na cadeia IPC tipada.
      `src/shared/ipc.ts`: adicionar `salvarPlano: "prova:salvar-plano"` a
      `IPC_CHANNELS` e o método `salvarPlano(id: string, plano: PlanoEstudo):
      Promise<Prova>` em `AppApi` (importar `PlanoEstudo` em `import type`).
      `src/main/preload.ts`: wrapper `salvarPlano: (id, plano) =>
      ipcRenderer.invoke(IPC_CHANNELS.salvarPlano, id, plano)`.
      `src/main/ipc/index.ts`: `ipcMain.handle(IPC_CHANNELS.salvarPlano, async
      (_event, id: string, plano: unknown) => { try { return await salvarPlano(id,
      plano, new Date().toISOString()); } catch (erro) { throw new
      Error(mensagemAmigavelProva(erro)); } })` — importar `salvarPlano` de
      `../services/provas.js`. `src/renderer/api.ts` não muda (`PreloadApi = AppApi`).
      Ver §8.3.
      Files: src/shared/ipc.ts, src/main/preload.ts, src/main/ipc/index.ts
      Verify: `npm run build` compila.

- [ ] 7. UI mínima do questionário em `src/renderer/views/PlanoEstudo.tsx` (NOVO) +
      botão na Agenda (só salvar/reeditar neste commit; a prévia vem no item 14).
      Componente com formulário acessível (pt-BR): ordinal (radio 1ª/2ª/final — a
      coluna "cai na prova?" dos tópicos some quando `ordinal==="primeira"`),
      horas/dia (number 1–24), dias/semana (number 1–7), lista de tópicos (sugeridos
      de `getApi().listarDocumentos(cadernoId?)` — `id=.id`, `titulo=.nome`,
      `dataArquivo=.dataArquivo`; mais tópicos à mão), checkpoint (radio
      automático/lembrete). `<label>`/`<fieldset>`/`<legend>`, `role="alert"` nos
      erros, só tokens de tema. Salva via `getApi().salvarPlano(provaId, plano)`.
      Pré-preenche de `provaSelecionada.plano` na reedição. Em `Agenda.tsx`, no
      header do bloco `provaSelecionada !== null` (`agenda-detalhe-header`, ao lado
      de "Editar prova"), botão "Montar plano de estudo" / "Editar plano" (conforme
      `provaSelecionada.plano`). Classes novas em `src/renderer/styles.css` (só
      tokens). Renderer só via `getApi()`. Ver §8.1, §8.2, RNF5.
      Files: src/renderer/views/PlanoEstudo.tsx, src/renderer/views/Agenda.tsx, src/renderer/styles.css
      Verify: `npm run build`, `npm run lint`, `npm test` — todos verdes (>614).
      Fim do Commit A: criar o commit local no branch (não push).

## Commit B — Lógica pura (régua + distribuição) + prévia

- [ ] 8. Adicionar as constantes do cálculo em `src/shared/constants.ts`.
      `HORIZONTE_DIAS = 30`, `PISO_BASE = 0.15`, `TETO_BASE = 0.80`,
      `PESO_DIFICULDADE = 0.5`, `MINUTOS_BLOCO_MIN = 15`, cada uma com doc-comment no
      padrão do arquivo (como `INTERVALOS_REVISAO_PADRAO`). Ver §6.3, §13.
      Files: src/shared/constants.ts
      Verify: `npm run build` compila.

- [ ] 9. Adicionar o helper puro `datasEntre` em `src/shared/agenda.ts`.
      `export function datasEntre(inicioExclusivo: string, fimExclusivo: string):
      string[]` — datas "YYYY-MM-DD" ESTRITAMENTE entre as pontas (ambas excluídas),
      crescente; reusa `diaParaNumero`/`numeroParaDia` (valida formato, lança em data
      inválida); `fim <= inicio+1` → `[]`. Ver §7.6.
      Files: src/shared/agenda.ts, tests/shared/agenda.test.ts (estender)
      Verify: `npx vitest run tests/shared/agenda.test.ts` — novos passam (pontas
      exclusivas; intervalo curto → `[]`; ordem crescente; data inválida lança).

- [ ] 10. Implementar a régua pura `calcularMisturaBaseNovo` em `src/shared/plano.ts` (NOVO).
      Tipos `MisturaBaseNovoParams` (`diasRestantes`, `totalBase`, `totalNovo`,
      `dificuldadeBase`) e `MisturaBaseNovo` (`fracaoBase`, `fracaoNovo`); função
      conforme §6.1/§6.2. Ordem obrigatória: **passo 0 degenerações primeiro**
      (`0/0`→`{0,0}`; `totalNovo===0`→`{1,0}`; `totalBase===0`→`{0,1}`); passo 1
      `prox = 1 - clamp(diasRestantes,0,HORIZONTE_DIAS)/HORIZONTE_DIAS`; passo 2
      `baseBruta = PISO_BASE + (TETO_BASE-PISO_BASE)*(1-prox)`; passo 3 `baseAjustada
      = baseBruta + PESO_DIFICULDADE*dificuldadeBase*(TETO_BASE-baseBruta)`; passo 4
      `fracaoBase = arredondar4(baseAjustada)`, `fracaoNovo = 1 - fracaoBase`
      (derivado). Importa só constantes de `./constants`. Ver §6.
      Files: src/shared/plano.ts
      Verify: `npm run build` compila.

- [ ] 11. Implementar a distribuição pura `calcularPlano` em `src/shared/plano.ts`.
      Tipos `TopicoDistribuivel`, `CalcularPlanoParams`, `BlocoEstudo`, `DiaPlano`,
      `AvisoPlano` (união), `PlanoCalculado` (`dias`, `mistura?`, `aviso?`) conforme
      §7.1. Algoritmo da §7.3 passo a passo: guardas ANTES da régua (topicos vazio →
      `sem_topicos`, `mistura` omitida; datasDisponiveis vazio → `sem_dias`,
      omitida); régua; orçamento por camada (round, soma exata); minutos por tópico
      por peso `(1+dificuldade)`; **piso = remover** quem fica `< MINUTOS_BLOCO_MIN`
      (menor prioridade primeiro); **largest-remainder por camada** (`Σ minutos =
      capacidadeTotal`, re-verifica piso); prioridade única `(1+dificuldade)*
      fracaoDaCamada` desempate `id.localeCompare`; **sequential-fill por tópico**
      com cursor de dia que só avança (nunca estoura `capacidadeDia`, nenhum bloco
      <15); `topicosForaDoPlano` = removidos + resíduos → `aviso: nao_cabe`.
      `mistura` presente só quando há plano (sem aviso ou `nao_cabe`), §7.1.1.
      Ver §7 inteira.
      Files: src/shared/plano.ts
      Verify: `npm run build` compila.

- [ ] 12. Adicionar os testes puros do cálculo em `tests/shared/plano.test.ts` (NOVO).
      `calcularMisturaBaseNovo`: cada linha da tabela §6.4 com valores fixos (hoje
      0.15/0.85; 15d 0.475/0.525; longe ≥30d 0.80/0.20; passado→trata como hoje;
      base difícil em 15d 0.6375/0.3625; degenerações 0/0, 1/0, 0/1), **invariante de
      soma** (`fracaoBase+fracaoNovo===1` salvo 0/0), **monotonia** em dias e
      dificuldade, e o **teste-chave do HIGH-1**: com `totalNovo>0`, `fracaoNovo>0`
      mesmo com a prova longe. `calcularPlano`: tabela §7.5 — cabe (mistura presente,
      sem aviso); **não cabe por orçamento** (`alvo<15`→K); **não cabe por dias
      esgotados** (resíduo ≥15 após o último dia entra em K); 1 tópico muitos dias;
      `sem_dias`/`sem_topicos` com `mistura` ausente; **nenhum dia estoura
      `capacidadeDia`**; **`Σ minutos nos blocos + residuais === capacidadeTotal`
      (nenhum minuto órfão)**; largest-remainder soma exata por camada; determinismo
      por `id`. Ver §12.
      Files: tests/shared/plano.test.ts
      Verify: `npx vitest run tests/shared/plano.test.ts` — todos passam.

- [ ] 13. Implementar o serviço de orquestração `src/main/services/planoCalculo.ts` (NOVO)
      + canal `calcularPlano`.
      Export `nivelParaPeso(n?: NivelDificuldade): number` (`facil→0`, `media→0.5`,
      `dificil→1`, `undefined→0.5`). Export `montarPlanoCalculado(prova: Prova, hoje:
      string, docsPorId?): PlanoCalculado` — se `prova.plano===undefined` lança
      `DadosProvaInvalidosError("Monte o plano de estudo antes de ver a prévia.")`;
      `diasRestantes = diferencaDias(prova.data, hoje)`; se `<=0` retorna `{dias:[],
      aviso:{tipo:"prova_passou"}}` (sem régua, mistura omitida); monta
      `datasDisponiveis` via `datasEntre(hoje, prova.data)` + filtro de dias úteis
      `i % 7 < diasPorSemana`; ordena os tópicos com `ordenarCronologicamente`
      reconstruindo `ReadonlyMap<string,number>` de `plano.ordemManual`; converte
      cada `dificuldade?` via `nivelParaPeso`; chama `calcularPlano`. Cadeia IPC:
      `IPC_CHANNELS.calcularPlano = "prova:calcular-plano"`; `AppApi.calcularPlano(id:
      string): Promise<PlanoCalculado>`; wrapper no preload; handler em
      `ipc/index.ts` usando `hojeLocal()` + `mensagemAmigavelProva` no catch.
      Testes `tests/main/services/planoCalculo.test.ts`: `nivelParaPeso` mapeia
      0/0.5/1/0.5; `datasDisponiveis` com âncora de dias úteis; `ordemManual`
      reconstruída; plano ausente → erro. Estender os testes de handler para
      `salvarPlano`/`calcularPlano` (erro amigável quando a prova não existe e quando
      não tem plano). Ver §1.2, §7.2, §8.3, §12.
      Files: src/main/services/planoCalculo.ts, src/shared/ipc.ts, src/main/preload.ts, src/main/ipc/index.ts, tests/main/services/planoCalculo.test.ts, tests/main/ipc/* (estender se existir)
      Verify: `npx vitest run tests/main/services/planoCalculo.test.ts` + `npm run build` — passam.

- [ ] 14. Ligar a prévia na UI (`PlanoEstudo.tsx`) e sincronizar os docs.
      Após salvar, chamar `getApi().calcularPlano(provaId)` e renderizar "o que
      estudar" por dia; quando vier `aviso`, mostrar a frase honesta correspondente
      (§7.4) — `prova_passou`/`sem_topicos`/`sem_dias`/`nao_cabe` (com os números).
      Exibir "plano montado em {data}" lendo `PlanoEstudo.atualizadoEm`. Só tokens de
      tema; acessível. Depois, atualizar `tasks/PROGRESSO.md`, `tasks/todo.md` e
      `README.md` com o estado real (regra `manter-docs-atualizados`): HEAD, contagem
      REAL de `npm test` (reconciliar a divergência AGENTS.md 514 × roadmap-f1 614
      usando o resultado real como fonte de verdade — §14/NIT-6), item entregue,
      roadmap restante. README em pt-BR voltado ao usuário (botão "Montar plano",
      questionário, prévia do que estudar, aviso honesto quando não cabe).
      Files: src/renderer/views/PlanoEstudo.tsx, tasks/PROGRESSO.md, tasks/todo.md, README.md
      Verify: `npm run build`, `npm run lint`, `npm test` — todos verdes, total > 614.
      Fim do Commit B: criar o commit local no branch (não push).

---

## Verificação final (ambos os commits)

- `npm run build` (tsc --noEmit + electron-vite build) — sem erros.
- `npm run lint` (eslint .) — sem erros.
- `npm test` (vitest run) — todos verdes, total **> 614** (baseline real deste worktree).
- Não-verificável por teste automatizado (verificação manual do usuário): o encaixe
  visual/acessibilidade do formulário na Agenda e a "sensação" do plano com dados
  reais (§12, §14).

## Lacunas / suposições

- UI de reordenar a cronologia manualmente fica FORA desta fatia (§9); só o contrato
  persistido (`ordemManual: string[]`) entra. Suposição mantida do design aprovado.
- Baseline reconciliado para **614** (resultado real de `npm test` neste worktree, não
  de memória); o AGENTS.md diz 514 (desatualizado). O novo total só precisa ser > 614.
