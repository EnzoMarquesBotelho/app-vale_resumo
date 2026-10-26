# Roadmap — Fatia: Agenda de revisão + Contagem regressiva de provas + Dicas do dia

> Fatia pós-MVP mais pesada: módulo de organização acadêmica. Conceito novo
> (provas com datas), agendamento de revisões por repetição espaçada, edição
> manual, dicas do dia (mecânica + IA opcional). Base: cadernos já existentes.
> Decisões confirmadas com o usuário em 2026-10-16.

## Objetivo

Permitir cadastrar **provas** (com data), ver uma **contagem regressiva** para
cada uma, receber uma **agenda de revisão** (o que estudar e quando, até a prova)
e **dicas do dia** sobre o que focar. A agenda se baseia nos cadernos/documentos
já existentes.

## Decisões confirmadas

### 1. Prova — modelo e vínculos
Uma prova tem: título (ex.: "P1", "ENEM"), **data**, e um vínculo que pode ser:
- **(a) Vinculada a um caderno:** revisões/dicas apontam para os documentos
  daquele caderno (ex.: prova de "Cálculo — Teórica").
- **(b) Avulsa abrangente (ENEM/ENADE):** cobre TODOS os cadernos/matérias. O
  usuário escolhe o **modo de distribuição** das matérias nos dias de revisão:
  - **Rotação:** uma matéria/caderno por dia de revisão, ciclando por todos.
  - **Intercalado:** um pouco de cada matéria em todos os dias de revisão.

### 2. Agenda de revisão — como os dias são escolhidos
- **Repetição espaçada automática** a partir da data da prova: o app calcula
  datas de revisão recuando da prova (ex.: 7, 3 e 1 dia antes — intervalos
  padrão, idealmente configuráveis). A primeira revisão nunca cai no passado:
  se a prova está próxima, só agenda as sessões que ainda cabem.
- **Edição manual:** o usuário pode ajustar — adicionar, remover ou mover
  sessões de revisão sugeridas. O app sugere; o usuário tem a palavra final.

### 3. Dicas do dia — mecânica + IA opcional (Opção C)
- **Dica mecânica (sempre, instantânea, sem Ollama):** calculada pelo app a
  partir de datas e cadernos. Ex.: "Faltam 5 dias para a prova de Cálculo —
  Teórica. Hoje: revise este caderno (N documentos; tem resumo e flashcards)."
  Para prova abrangente, respeita o modo (rotação → a matéria do dia;
  intercalado → a lista de matérias do dia).
- **Dica da IA (opcional, botão sob demanda):** um botão "Dica da IA" pede ao
  Ollama local uma sugestão mais elaborada do que focar hoje, com base no
  material do(s) caderno(s) relevante(s). Usa `modeloParaGeracao()` e
  `format` quando fizer sentido; nunca bloqueia a tela; trata Ollama ausente
  com mensagem clara (padrão já existente).

### 4. Contagem regressiva
Para cada prova, mostrar quantos dias faltam (e destacar provas de hoje/amanhã,
e marcar provas já passadas). Ordenar provas pela data (mais próxima primeiro).

## Fora de escopo desta fatia (roadmap)

- Notificações do sistema operacional / lembretes fora do app.
- Sincronização com calendários externos (Google Calendar etc.).
- Estatísticas de desempenho / acompanhamento de o que já foi revisado de fato
  (marcar sessão como concluída pode ser um extra simples; ver abaixo).
- Quizzes (é a PRÓXIMA fatia, separada).
- Geração de IA em lote.

## Pontos para o design decidir (regras simples e seguras)

- **Persistência das provas e da agenda:** onde salvar (JSON local em
  `userData`, análogo aos documentos). Uma prova guarda suas sessões de revisão
  (as sugeridas + edições do usuário) para não recalcular e sobrescrever edições.
- **Recalcular vs. preservar edições:** se o usuário editou sessões e depois
  muda a data da prova, o design decide uma regra simples e previsível
  (ex.: perguntar/recalcular mantendo marcações manuais quando possível).
- **"Hoje":** definir o fuso/midnight local para a contagem e para "a dica de
  hoje" de forma determinística e testável.
- **Marcar revisão como feita (opcional, se barato):** um checkbox simples por
  sessão pode entrar; se adicionar complexidade, fica no roadmap.
- **Prova sem nenhum caderno existente (avulsa sem cadernos):** comportamento
  seguro (ex.: dica orienta importar material primeiro).

## Orientação técnica (o design refina)

- **Shared:** novos tipos (Prova, SessaoRevisao, modo de distribuição) em
  `src/shared/types.ts`; lógica PURA de agendamento (cálculo das datas de
  revisão por repetição espaçada, rotação/intercalado, "dias restantes") em um
  módulo compartilhado testável (ex.: `src/shared/agenda.ts`), sem tocar disco
  nem depender de IA — fácil de testar com datas fixas.
- **Main:** persistência das provas/agenda em `storage.ts` (ou módulo próprio);
  handlers IPC (criar/listar/editar/remover prova; obter agenda/dica mecânica;
  "dica da IA" via geração). A dica da IA usa o cliente Ollama existente.
- **Shared/IPC/preload:** novos canais + métodos na AppApi.
- **Renderer:** nova aba/tela "Agenda" (ou "Provas") com: lista de provas +
  contagem regressiva, formulário de nova prova (título, data, vínculo:
  caderno / avulsa + modo), a agenda de revisão editável, a dica do dia
  (mecânica + botão "Dica da IA"). Chamadas só via `getApi()`. Visual
  consistente com os tokens de `styles.css`.
- **Testes:** foco na lógica pura de agendamento (datas de revisão, não agendar
  no passado, rotação vs. intercalado, dias restantes, bordas de fuso),
  persistência round-trip de prova com sessões, e preservação de edições
  manuais. UI é verificação manual. Nada depende da pasta Facul (somente
  leitura) nem de modelo real (Ollama mockado nos testes).
- Multi-idioma segue fora de escopo: textos em pt-BR, identificadores em inglês.
