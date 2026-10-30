# Roadmap — Plano de estudo guiado, Fatia 4/4: checkpoints pré-provas

> Decisões confirmadas em `tasks/design-f4.md` (design revisado em 2 ciclos;
> loop encerrado pelo usuário). Implementação: `920e779` na branch
> `feat/plano-f4-checkpoints`. Esta fatia **completa o Plano de estudo guiado
> (4/4)**. 945 testes, build e lint verdes.

## O que a fatia entrega

Na Agenda, abaixo do Diagnóstico, o card **Checkpoints** prepara listas de
exercícios de checagem antes da prova, em modo **lembrete** ou **automático**,
com a preferência alterável depois.

## Decisões confirmadas (design-f4.md §1)

| # | Decisão |
|---|---|
| D1 | Pontos fixos a **28, 14, 7 e 3 dias** da prova (ids `d28`/`d14`/`d7`/`d3`), mantidos só se a data cair estritamente depois da `dataBase` e a janela tiver ≥ 1 tópico (≤ 4 pontos). |
| D2 | Cada ponto cobre os tópicos cujo **último bloco** no plano de referência cai na janela `(pontoAnterior, ponto]`; cada tópico entra em no máximo um ponto. |
| D3 | Até 6 assuntos por ponto (amostra espaçada), texto-base ≤ 12000 caracteres, **8 exercícios, modo `mista`**, caminho curto (1 chamada + 1 corretiva), sem lotes. |
| D4 | **Automático** = ao abrir a prova na Agenda (ou ao trocar para automático com ela aberta), gera só o **candidato mais recente** (maior `data ≤ hoje`). Se ele já está `pronto`/`feito`, não gera nada. Os mais antigos ficam só manuais. Sem retry automático na sessão. |
| D5 | **Sem cancelar / timeout total**: uma lista é no máximo 2 chamadas de 300 s; a geração termina e persiste mesmo se o aluno sair da tela. |
| D6 | Preferência alterada por canal dedicado `definirPreferenciaCheckpoint`; **não** reusa `salvarPlano` (não recarimba `plano.atualizadoEm`, âncora da `dataBase`). |
| D7 | Responder/corrigir **entra**: `ListaExercicios` extraído de `Exercicios.tsx`. Respostas/correções são efêmeras; persistem a lista e `concluidoEm`. |
| D8 | `pronto` pode ser regerado (substitui a lista); `feito` é terminal. |

Premissa corrigida do brief (§0.1): o plano não guarda progresso e é recalculado
a cada abertura, então os checkpoints usam um **plano de referência**
`montarPlanoCalculado(prova, dataBase)`, onde `dataBase` é a data local em que o
questionário foi salvo, limitada a `hoje`. "Já estudado" = o que esse plano já
agendou, assumindo que o aluno seguiu o plano.

Ajustes aplicados na implementação após a 2ª revisão (nota do orquestrador no
topo do design): `carregarDocumento` assíncrono (`await`); `hoje` na assinatura
de `escolherCheckpointAutomatico`; card sai sozinho de "Preparando…"
reconsultando a cada 5 s enquanto `emGeracao` (timer limpo ao desmontar/trocar
de prova); `aoAtualizar` com setter funcional que não sobrescreve a seleção; em
automático **nunca se gera com o bloco desatualizado** até o aluno clicar
manualmente (decisão explícita); passos 2–5 do handler dentro do `try/finally`.

## O que a IA faz e não faz

- Faz: gera os 8 exercícios (`gerarExercicios`, `format:"json"`, parser
  tolerante, corretiva única) e corrige respostas se o aluno clicar em "Corrigir
  com IA".
- Não faz: decidir se há checkpoint, quando cai, em que estado está, quais
  assuntos entram, nem alterar o plano a partir do resultado.

## Casos de borda — cobertos × NÃO cobertos

| Caso | Tratamento | Coberto? |
|---|---|---|
| Prova hoje / passada | sem checkpoints; card some | ✅ |
| Prova muito próxima (plano curto) | pontos ≤ `dataBase` descartados; frase honesta `curto_demais` | ✅ |
| Prova longe (> 28 dias) | até 4 pontos; amostra de 6 assuntos, o resto `fora_da_amostra` (dito na UI) | ✅ |
| Plano sem tópicos / sem dias | card some | ✅ |
| Vários checkpoints vencidos | automático gera só o mais recente; os outros `atrasado` com botão | ✅ |
| Tópico digitado à mão | fora da geração, com aviso; ponto só de manuais ⇒ `indisponivel` | ✅ |
| Documento ausente/ilegível/sem texto | `sem_texto` com aviso; nenhum com texto ⇒ erro tipado antes da IA | ✅ |
| Geração parcial (ex.: 5 de 8) | lista válida se ≥ 3, com aviso | ✅ |
| < 3 exercícios / JSON inválido | erro, nada persistido | ✅ |
| Offline × falha de geração | mensagens distintas; "offline" só para recusa de conexão | ✅ |
| Plano mudou durante a geração | `salvarCheckpoint` rejeita; bloco `desatualizado` depois | ✅ |
| Duplo clique / reabrir durante a geração | guarda em memória + `emGeracao` + reconsulta de 5 s | ✅ |
| Prova antiga sem o bloco / bloco corrompido | carregam como antes; bloco descartado | ✅ |
| Preferência ausente | tratada como `lembrete` | ✅ |
| Relógio recuado | `dataBase = min(dataBase, hoje)`; tudo `futuro` | ✅ |
| Troca de prova durante geração/reconsulta | setter funcional + ref de montagem; sem timers vazados | ✅ |
| Cancelar geração / timeout total | o aluno só espera (≤ 2 chamadas de 300 s) | ❌ NÃO coberto |
| App não mede o que foi **de fato** estudado | "estudado" = o que o plano já agendou | ❌ NÃO coberto |
| Tópicos cujo último bloco cai depois do último ponto (~3 últimos dias) | sem lista (dias de revisão) | ❌ NÃO coberto |
| Tópicos sem bloco por `nao_cabe` | nunca "estudados" ⇒ nunca cobertos | ❌ NÃO coberto |
| Cobertura uniforme dos assuntos na lista | o prompt recebe um texto; sem garantia de distribuição entre seções | ❌ NÃO coberto |
| Nota/desempenho da lista | não é salvo, não ajusta o plano; respostas somem ao sair | ❌ NÃO coberto (por desenho) |
| Re-salvar o questionário pode orfanar lista cujo ponto deixou de existir | fica no disco, oculta | ❌ NÃO coberto (aceito) |
| Diagnóstico concluído após a `dataBase` desloca pontos/janelas sem mudar a assinatura | listas geradas mostram o persistido | ❌ NÃO coberto (deslocamento aceito) |
| Editar a data da prova desloca os pontos | idem | ❌ NÃO coberto (deslocamento aceito) |
| Virada do dia com o card aberto | só atualiza ao reabrir a prova | ❌ NÃO coberto |
| Gerar em todas as provas ao abrir o app / "iniciar com o computador" | só a prova aberta | ❌ NÃO coberto (fora de escopo) |
| Corrida `salvarPlano` × `salvarCheckpoint` em milissegundos | mitigada pela assinatura | ❌ NÃO coberta formalmente |
| Exportar a lista (Markdown/PDF) | fora desta fatia | ❌ NÃO coberto |
| Testes de componente (UI) | o repo não os tem; só lógica pura, serviços, IPC e a reconsulta | ❌ NÃO coberto |
| Latência e qualidade reais do `llama3.1` | sanity único: 8 exercícios em ~28 s | ❌ NÃO verificado (manual) |

## Ficou para depois

- **Iniciar junto com o computador** (`app.setLoginItemSettings`): é o que faz o
  modo automático valer sem o aluno lembrar de abrir o app. Hoje o automático
  só age com a prova aberta na Agenda. Item de UX já registrado no roadmap.
- Gerar checkpoints de todas as provas ao abrir o app (depende do item acima).
- Botão de cancelar geração / timeout total.
- Exportar a lista de checkpoint (Markdown/PDF).
- Guardar desempenho da lista e usá-lo para ajustar o plano.
- Medir o que foi de fato estudado (hoje se assume que o plano foi seguido).
- UI para reordenar manualmente a cronologia (contrato persistido desde a fatia 2).
- Atualização do card ao virar o dia sem reabrir a prova.

## Verificação

- Automática: `npm run build`, `npm run lint`, `npm test` = 945 testes (58
  arquivos), todos verdes; Ollama mockado.
- Sanity com Ollama real (`llama3.1:latest`): tentado uma vez; 8 exercícios em
  ~28 s, tópico manual ignorado com motivo.
- Manual do usuário (não coberto): qualidade/latência reais das listas, modo
  automático em dias reais, encaixe visual/teclado/tema do card na Agenda e
  regressão visual de Exercicios após a extração de `ListaExercicios`.
