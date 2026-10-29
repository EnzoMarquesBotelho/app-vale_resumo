# Roadmap — Plano de estudo guiado, Fatia 2/4 (resumo)

> Resumo curto das decisões de `tasks/design-f2.md` (o design não é reescrito
> aqui). Entregue: branch `feat/plano-f2-questionario`, commits `48afc38`
> (persistência) e `fabd62b` (cálculo); 673 testes; sem IA, zero dep nova.

- **Persistência:** bloco opcional/aditivo `Prova.plano` (`PlanoEstudo`):
  ordinal (1ª/2ª/final), horas/dia, dias/semana, assuntos (`TopicoPlano`:
  `novo`, dificuldade, `dataArquivo`), `ordemManual` (array de ids),
  `checkpoint` (default `lembrete`; só persistido), `atualizadoEm`. Saneamento
  com clamps silenciosos; ordinal e ≥ 1 assunto obrigatórios. Na 1ª prova todo
  assunto é forçado a base (`novo:false`). Assuntos digitados à mão têm id
  `manual:<slug>-<i>`. Prova antiga sem plano continua válida.
- **Régua base/novo** (`calcularMisturaBaseNovo`, pura): rampa linear contínua
  entre `PISO_BASE`=0,15 e `TETO_BASE`=0,80 conforme a distância da prova
  (`HORIZONTE_DIAS`=30); base difícil empurra para o teto (`PESO_DIFICULDADE`
  0,5). O novo nunca zera e a base nunca toma tudo; degenerações (um lado
  vazio) tratadas antes. Prova passada é tratada como "hoje".
- **Distribuição por dias** (`calcularPlano`, pura): reparte o orçamento por
  camada (largest-remainder), piso de `MINUTOS_BLOCO_MIN`=15 por bloco,
  preenchimento sequencial base → novo, prioriza o difícil, não inventa dias e
  avisa honestamente quantos assuntos não couberam (resíduo < 15 não conta como
  "fora"). Laço de reconciliação do piso remove só os assuntos < 15 e termina em
  ≤ nº de assuntos da camada voltas. Testes de terminação e conservação de
  minutos.
- **Fronteira main × puro:** o main conhece relógio/disco (`hojeLocal`,
  `datasEntre` + filtro de dias úteis, `ordenarCronologicamente`,
  `nivelParaPeso`); `calcularPlano` só faz aritmética. Nada do plano calculado é
  persistido (recalculado sob demanda via IPC `calcularPlano`).
- **UI:** formulário acessível `PlanoEstudo.tsx` no header da prova na Agenda +
  prévia "o que estudar". A UI de reordenar manualmente ficou fora (só o
  contrato persistido).
- **Fora de escopo (f3/f4):** diagnóstico e checkpoints.
