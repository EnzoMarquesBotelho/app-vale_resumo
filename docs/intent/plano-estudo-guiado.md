# Statement of Intent — Plano de estudo guiado

> Intent confirmado pelo usuário em 2026-10-28 via entrevista (skill
> `interview-me`), ANTES de design/implementação. Este documento é a fonte de
> verdade do que a fatia deve entregar; o design (a fazer) o consome.
> Relaciona-se com a Agenda/Provas já entregue (`tasks/roadmap-agenda-provas.md`)
> e com a infra de quiz e de exercícios já existentes.

## Princípio-guia (palavras do usuário)

"Não reinventar a roda, mas deixá-la mais simples para quem não tem esse hábito
e precisa." O público é o aluno que **não sabe se organizar sozinho** — o plano
deve **decidir por ele**, não oferecer mais opções para ele configurar.

## Statement of Intent (confirmado)

- **Resultado:** uma **agenda de estudo dia-a-dia** até a data da prova,
  encaixada na Agenda que já existe, que decide pelo aluno **o que estudar, em
  que ordem e por quanto tempo** — com **checkpoints ("pré-provas")** ao longo
  do caminho que aferem o aprendizado via **lista de exercícios**.
- **Usuário:** o aluno que não tem hábito de se organizar e precisa de um plano
  pronto.
- **Por que agora:** a Agenda hoje monta repetição espaçada genérica; o
  questionário + diagnóstico + checkpoints a tornam direcionada e aferível.
- **Success (como sabemos que funcionou):** o aluno abre a Agenda e sabe o que
  fazer hoje, sem ter configurado nada além de responder o questionário; o plano
  prioriza visivelmente o que ele tem dificuldade / lacuna de base.
- **Constraint (limite vinculante):** 100% local/offline; o modelo local é
  limitado (geração lenta e parcial) — a distribuição do plano NÃO pode depender
  do modelo; só a geração de texto/perguntas/exercícios usa o Ollama.

## Insumos do questionário

- **Data da prova** (já existe no modelo de Prova).
- **Qual prova é:** 1ª / 2ª / final. Define o recorte base vs novo:
  - 1ª prova → **tudo é base**, não há conteúdo novo.
  - 2ª prova em diante → o que já caiu vira **base**; o conteúdo recente é o
    **novo**.
- **Tempo disponível** (horas/dia, dias/semana) — rege a densidade do plano.
- **Assuntos que caem** na prova (o que é "novo").
- **Dificuldades e facilidades** autodeclaradas por assunto.
- **Preferência de checkpoint:** automático ou lembrete (ver abaixo), alterável
  depois.

## Ordem cronológica base → novo (MECÂNICA, não IA)

- A ordenação dos conteúdos do mais antigo (base) ao mais recente (novo) é feita
  **pelo app, por aritmética de datas** — 100% previsível, sem modelo.
- Fonte da data, em ordem de preferência:
  1. **Data dentro do arquivo** (se existir — ex.: metadados/conteúdo).
  2. **mtime do arquivo no disco** (fallback). Hoje o app provavelmente **não**
     registra isso na importação — capturar passa a ser necessário nesta fatia.
- **Sobreposição manual opcional:** o usuário pode informar/ajustar a ordem
  cronológica como camada extra de confiança. A regra é automática por padrão;
  o manual só reforça.
- A IA (Ollama) **não ordena nem infere** a estrutura de pré-requisitos — essa
  é exatamente a parte frágil que a abordagem mecânica evita.

## Diagnóstico por quiz (parte central, entra NESTA fatia)

- Um **quiz de sondagem** (reusa a infra de quiz: geração + correção) mede de
  onde vem a dificuldade: **lacuna na base** (erra nos conteúdos antigos) vs.
  **dificuldade no tópico novo** (só erra no recente).
- O resultado **reordena o plano**.

## Regra do plano (como o diagnóstico vira agenda)

- **Base antes de novo**, mas **modulado pelo tempo até a prova** (régua
  contínua, não liga-desliga):
  - **Prova longe** → foco pesado na base (dá para consertar o fundamento antes
    de avançar).
  - **Prova perto** → foco pesado no conteúdo novo que vai cair, com **alguns
    toques na base**.
- Distribuir os tópicos pelos dias disponíveis, dando mais dias ao que é
  difícil / tem lacuna de base.
- **Divisão de trabalho:** a **distribuição por dias é lógica pura testável**
  (sem Electron/disco/IA); o **Ollama** entra só para gerar as perguntas do
  diagnóstico, os exercícios dos checkpoints e **frases de orientação/
  justificativa** por dia.

## Checkpoints ("pré-provas")

- Pontos na agenda, nos conteúdos já estudados, que aferem o aprendizado com uma
  **lista de exercícios** (reusa a infra de exercícios).
- **Preferência do usuário**, escolhida ao criar o plano e **alterável depois:**
  - **Automático:** o app gera a lista no dia marcado (o aluno abre a agenda e a
    lista já está pronta). Ciente de que a geração local é **lenta e pode vir
    parcial** (ex.: 34 de 50) — isso é um trade-off aceito para o perfil "aluno
    estressado que quer tudo pronto".
  - **Lembrete:** a agenda avisa ("faltam X dias — que tal uma lista de
    exercícios de Y?") com um **botão** que leva o aluno a gerar. Para o perfil
    "aluno organizado que provavelmente já faria".
- A agenda marca o checkpoint e aponta **quais conteúdos** a lista deve cobrir.

## Fora de escopo (confirmado)

- **Nada online.** Sugestão de "assuntos mais comuns de ENEM/ENADE" não busca
  internet.
- **Lista curada de ENEM/ENADE fica PARA DEPOIS** — não entra nesta fatia (salvo
  decisão contrária explícita no design).
- **Nenhuma promessa de "isto cai na prova"** — é orientação de estudo, não
  previsão.
- A IA **não ordena nem infere** a estrutura dos conteúdos (mecânico).

## Perguntas que o DESIGN ainda precisa resolver

- Onde o questionário vive: passo ao criar a Prova, ou fluxo separado "montar
  plano"? Como encaixa na tela de Agenda atual.
- Formato exato do quiz diagnóstico: quantas perguntas por tópico/nível; como o
  resultado vira "lacuna de base" vs "dificuldade no novo" de forma mecânica.
- A fórmula da régua "tempo até a prova → mistura base/novo" (determinística,
  testável).
- Persistência do plano + respostas do questionário (padrão storage atual,
  escrita atômica).
- Como capturar a data do arquivo na importação (data interna → mtime).
