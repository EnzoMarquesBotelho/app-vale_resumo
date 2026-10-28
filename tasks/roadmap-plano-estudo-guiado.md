# Roadmap (ideia) — Plano de estudo guiado por questionário

> Ideia registrada pelo usuário em 2026-10-26. AINDA NÃO INICIADA — este doc
> captura a visão para quando a fatia for desenhada (passará pelo fluxo normal:
> perguntas de design → decisões confirmadas → implementação).
> Relaciona-se com a fatia já entregue de Agenda/Provas (`roadmap-agenda-provas.md`),
> que hoje monta a agenda por repetição espaçada. Esta função a torna muito mais
> direcionada.

## Visão

Antes (ou ao criar uma prova/plano), o app faz um **questionário** ao usuário
para que o plano de estudo seja **personalizado e direcionado**, em vez de
genérico. O plano resultante leva em conta o contexto real do aluno.

## Insumos que o questionário coleta (do usuário)

- **Data da prova** (já existe no modelo de Prova).
- **Disponibilidade de tempo** para dedicar ao estudo (ex.: horas por dia / dias
  por semana) — rege quão denso/espaçado o plano fica.
- **Matérias/assuntos que vão cair:**
  - Para prova de uma matéria específica: quais **assuntos/tópicos** caem.
  - Para provas gerais (ENEM/ENADE): os **assuntos mais comuns/prováveis** que
    costumam cair (o app sugere; o usuário ajusta).
- **Dificuldades e facilidades** do aluno em cada matéria/assunto — o plano dá
  mais peso/tempo ao que é difícil e menos ao que já é fácil.

## Diagnóstico por quiz (ideia-chave do usuário)

- Opcionalmente, um **quiz diagnóstico** para medir de onde vem a dificuldade:
  se é no **assunto novo** (ponta da matéria) ou se vem **desde o começo da
  matéria** (base).
- Motivo: uma lacuna na base afeta o entendimento do estado atual — o plano
  precisa saber disso para, se for o caso, **voltar ao fundamento** antes de
  avançar, em vez de insistir no tópico novo.
- Reusa a infra de **quiz** já existente (geração + correção por IA), aplicada
  como sondagem por tópico/nível.

## Como isso vira um plano direcionado (a definir no design)

- Combinar: tempo disponível + data da prova + lista de assuntos + nível de
  dificuldade por assunto + resultado do diagnóstico → uma **agenda de estudo
  priorizada** (o que estudar, em que ordem, quanto tempo em cada coisa).
- Priorizar assuntos difíceis / com lacuna de base; alocar revisões (reusar a
  repetição espaçada da Agenda já existente).
- Apontar, por dia, o que focar — conectando aos documentos/cadernos e aos
  artefatos (resumo/flashcards/exercícios/quiz) do material relevante.

## Perguntas de design a resolver quando a fatia começar

- O questionário é um passo ao criar a Prova, ou um fluxo separado de "montar
  plano"? Como se encaixa na tela de Agenda atual?
- Para ENEM/ENADE: de onde vêm os "assuntos mais comuns"? Lista curada embutida,
  ou a IA sugere a partir do nome do exame? (offline — então provavelmente uma
  lista curada + ajuste do usuário; a IA só ajuda a priorizar).
- O diagnóstico por quiz é obrigatório ou opcional? Quantas perguntas? Como
  mapear o resultado em "lacuna de base" vs "dificuldade no tópico novo"?
- Quanto a IA entra (gerar o plano textual, priorizar) vs. lógica pura/mecânica
  (distribuir tempo pelos dias)? Manter o padrão: lógica pura testável +
  IA opcional por cima.
- Persistência do plano/respostas do questionário (padrão storage atual).

## Fora de escopo (provável) / cuidados

- Nada online: sugestões de "assuntos comuns" não podem depender de internet.
- Não prometer precisão de "cai na prova" — é orientação de estudo, não previsão.
