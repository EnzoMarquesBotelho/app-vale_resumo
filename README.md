# Desenrola

> _Estudo sem complicação._

Um aplicativo de **desktop**, **100% local e offline**, que transforma seu material de estudo
em **resumos**, **flashcards**, **exercícios**, **mapas mentais** e **quizzes** usando uma IA
que roda na sua própria máquina (via **Ollama**). Também organiza suas matérias em **cadernos**
e ajuda a se preparar para provas com uma **agenda de revisão**. Nenhum conteúdo é enviado para
a internet.

Funciona com arquivos `.txt`, `.md` e `.pdf`. Os resultados ficam salvos no seu computador e
podem ser reabertos a qualquer momento.

---

## O que ele faz

**Importar material**
- **Importar um arquivo** (`.txt`, `.md` ou `.pdf`) e ver o texto extraído.
- **Importar uma pasta** inteira de uma vez: o app varre as subpastas e importa todos os
  arquivos suportados, organizando cada um no caderno certo.

**Gerar material de estudo (IA local)**
- **Resumo** em dois modos: curto (essencial) ou longo (detalhado).
- **Flashcards** (pergunta/resposta) navegáveis, de 5 a 100 por vez.
- **Exercícios** nos modos teórico, prático ou misto, de 5 a 100 — você pode **responder** e a
  **IA corrige** (Correto / Parcial / Incorreto + comentário).
- **Mapa mental**: uma árvore hierárquica do conteúdo, navegável (expandir/colapsar, zoom, mover).
- **Quiz interativo**: perguntas de múltipla escolha, abertas ou mistas (5 a 100). Você responde
  tudo e depois revê acertos e erros em cada questão, com pontuação. Nas perguntas abertas, você
  escolhe entre **se autoavaliar** pelo gabarito ou deixar a **IA corrigir**.
- **Quantidades grandes de quiz e exercícios** (mais de 20): o app gera em partes menores por
  baixo dos panos e mostra o progresso (**"Gerando 30 de 100…"**) no botão, entregando o total
  que você pediu sem travar. Se uma parte falhar no meio, você fica com o que já foi gerado em
  vez de perder tudo.

**Organizar e exportar**
- **Cadernos**: suas matérias ficam separadas em cadernos (derivados da pasta de origem dos
  arquivos). O **Histórico** mostra os cadernos e, dentro de cada um, seus documentos.
- **Exportar** para **Markdown** ou **PDF**: cada artefato individualmente (só o resumo, só os
  flashcards, etc.) ou o **documento inteiro** num arquivo só. O mapa mental sai como imagem no
  PDF e como lista no Markdown. Você escolhe onde salvar o arquivo.
- **Agenda e provas**: cadastre provas com data e veja a **contagem regressiva**. O app monta uma
  **agenda de revisão** (revisar alguns dias antes da prova), que você pode ajustar à mão, e dá
  uma **dica do dia** — rápida (automática) ou mais elaborada (pela IA). Provas podem ser de uma
  matéria específica ou abrangentes (tipo ENEM/ENADE, cobrindo todas as matérias).

> Tudo roda offline. Se o Ollama não estiver rodando, o app mostra um passo a passo
> para resolver, sem travar. Gerar ou corrigir muitos itens de uma vez pode ser lento no
> modelo local — se demorar demais, o app avisa e sugere reduzir a quantidade.

---

## Antes de começar: o que você precisa instalar

Você vai instalar **dois programas**: o **Node.js** (para rodar o app) e o **Ollama**
(a IA local). É um passo único; depois é só abrir o app.

### Passo 1 — Instalar o Node.js

1. Acesse <https://nodejs.org/pt-br> e baixe a versão **LTS** (a recomendada).
2. Abra o instalador e vá clicando em **Avançar/Próximo** até concluir (as opções padrão servem).
3. Para conferir, abra o **PowerShell** (menu Iniciar → digite "PowerShell") e rode:

   ```powershell
   node --version
   ```

   Se aparecer um número de versão (ex.: `v20.x.x`), deu certo.

### Passo 2 — Instalar o Ollama (a IA local)

1. Acesse <https://ollama.com/download> e baixe o Ollama para Windows.
2. Instale e **abra o Ollama** — ele fica rodando em segundo plano (um ícone perto do relógio).

### Passo 3 — Baixar o modelo de IA

No **PowerShell**, baixe o modelo padrão que o app usa (isso baixa alguns GB uma única vez):

```powershell
ollama pull llama3.1:8b
```

Espere terminar o download. Pronto — o Ollama já está preparado.

---

## Como rodar o app

Abra o **PowerShell** na pasta deste projeto e rode os comandos abaixo, na ordem.

### Passo 4 — Instalar as dependências do app (uma vez só)

```powershell
npm install
```

### Passo 5 — Abrir o app

```powershell
npm run dev
```

A janela do app vai abrir. No topo você vê o status do Ollama:

- **Ollama conectado** (verde): tudo certo, pode gerar.
- **Ollama não detectado** (vermelho): abra o Ollama e clique em **Verificar novamente**.

### Passo 6 — Usar

A navegação fica na **barra lateral** à esquerda, com duas seções: **Biblioteca** e **Agenda**.

1. Na **Biblioteca**, importe um arquivo (`.txt`, `.md` ou `.pdf`) ou uma pasta inteira. Seus
   documentos ficam organizados por caderno ali.
2. Abra um documento para ir à **tela do documento**, onde ficam **Resumo**, **Flashcards**,
   **Exercícios**, **Mapa mental** e **Quiz** — clique em gerar em cada um. Em Exercícios você
   responde e pede a correção da IA; no Quiz você responde e revisa com pontuação.
3. Na **Agenda**, cadastre provas para ver a contagem regressiva, a agenda de revisão e a dica
   do dia.
4. Tudo o que você gera fica salvo e reabre pela Biblioteca, organizado por caderno.
5. Use **Exportar** (em cada artefato ou no documento inteiro) para salvar o material em
   **Markdown** ou **PDF** onde você quiser.

> **Tema:** use o seletor de tema (na barra lateral) para alternar entre **Claro**, **Escuro**
> e **Automático** (acompanha o tema do Windows). Sua escolha fica salva.

> **Atualizações:** o app **instalado** verifica sozinho se há uma versão mais nova ao abrir
> (e você também pode checar pelo botão na barra lateral). Havendo atualização, ele baixa com
> barra de progresso e oferece **Reiniciar para atualizar**. (A atualização automática só
> funciona no app instalado pelo instalador — não no modo de desenvolvimento.)

---

## Gerar um instalador (opcional)

Se quiser instalar o app como um programa normal do Windows (com atalho no menu Iniciar),
gere o instalador:

```powershell
npm run package
```

O instalador (`App de Estudos com IA Local Setup <versão>.exe`) é criado na pasta `release/`.
Dê dois cliques nele para instalar. O app continua precisando do **Ollama** rodando para gerar
conteúdo.

---

## Resolvendo problemas

- **"Ollama não detectado"**: confira se o Ollama está aberto (ícone perto do relógio) e se você
  já rodou `ollama pull llama3.1:8b`. Depois clique em **Verificar novamente** no app.
- **PDF sem texto / "sem texto extraível"**: o PDF é uma imagem escaneada (sem texto de verdade).
  Use um arquivo com texto selecionável. (Leitura de imagem/OCR não está nesta versão.)
- **`node` ou `npm` não é reconhecido**: feche e reabra o PowerShell após instalar o Node, ou
  reinstale o Node.js.
- **A geração está lenta**: modelos locais usam a CPU/GPU da sua máquina. Textos menores e o
  modo de resumo "curto" respondem mais rápido.
- **"A geração falhou ou demorou demais"**: o modelo local estourou o tempo. Em **quiz e
  exercícios** o app já gera quantidades grandes em partes menores (veja acima), então isso é
  mais raro; se mesmo assim acontecer — ou se for **flashcards** em grande quantidade — tente um
  número menor (ex.: 10–30) ou um modelo mais leve. Isso **não** significa que o Ollama está
  desligado.
- **O app não abre / erro "Electron uninstall"** ao rodar `npm run dev`: o binário do Electron
  não foi baixado na instalação (acontece quando o `npm install` pula os scripts de pós-instalação
  ou o download falha). Baixe o binário rodando, na pasta do projeto:

  ```powershell
  node node_modules/electron/install.js
  ```

  Depois rode `npm run dev` de novo. (Se preferir, um `npm install` com os scripts habilitados
  também resolve.)

---

## Comandos úteis (para quem quiser)

| Comando           | O que faz                                             |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Abre o app em modo de desenvolvimento                 |
| `npm run build`   | Compila o app (verificação de tipos + build)          |
| `npm run package` | Gera o instalador Windows em `release/`               |
| `npm test`        | Roda os testes automatizados                          |
| `npm run lint`    | Verifica o estilo do código                           |

---

## Privacidade

Todo o processamento acontece **na sua máquina**. O app conversa apenas com o Ollama local
(`http://localhost:11434`) e **não envia** seu conteúdo para servidores na internet.
