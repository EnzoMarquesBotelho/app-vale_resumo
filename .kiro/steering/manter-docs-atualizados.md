# Manter documentação sincronizada

Ao FINAL de qualquer mudança entregue no app (nova fatia, correção, ajuste de
comportamento), SEMPRE atualizar os três documentos antes de considerar a tarefa
concluída:

1. **`tasks/PROGRESSO.md`** — visão geral: estado atual (HEAD da master, total de
   testes), item na lista de entregues, e atualização do roadmap restante.
2. **`tasks/todo.md`** — checklist: marcar a fatia como entregue na seção
   "Fases pós-MVP", atualizar o cabeçalho (HEAD/testes), e mover itens do
   roadmap restante conforme o caso.
3. **`README.md`** — documentação do usuário: refletir recursos novos ou
   comportamentos alterados que o usuário percebe (telas, botões, fluxos).

Regras:
- Os três devem ficar consistentes entre si e com o estado real da master
  (conferir `git log` e a contagem de testes de verdade, não de memória).
- O README é voltado ao usuário (pt-BR): descrever o que dá pra fazer, não
  detalhes internos de implementação.
- Só marcar a tarefa como concluída depois de os três estarem atualizados.
