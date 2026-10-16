# App de Estudos com IA Local

Um aplicativo de **desktop**, **100% local e offline**, que transforma seu material de estudo
em **resumos**, **flashcards** e **listas de exercícios** usando uma IA que roda na sua
própria máquina (via **Ollama**). Nenhum conteúdo é enviado para a internet.

Funciona com arquivos `.txt`, `.md` e `.pdf`. Os resultados ficam salvos no seu computador e
podem ser reabertos a qualquer momento.

---

## O que ele faz

- **Importar** um arquivo de texto ou PDF e ver o texto extraído.
- **Resumo** em dois modos: curto (essencial) ou longo (detalhado).
- **Flashcards** (pergunta/resposta) navegáveis, de 5 a 100 por vez.
- **Exercícios** nos modos teórico, prático ou misto, de 5 a 100.
- **Histórico**: tudo o que você gera fica salvo e reabre depois.

> Tudo roda offline. Se o Ollama não estiver rodando, o app mostra um passo a passo
> para resolver, sem travar.

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

1. Clique em **Importar** e escolha um arquivo `.txt`, `.md` ou `.pdf`.
2. Vá nas abas **Resumo**, **Flashcards** ou **Exercícios** e clique em gerar.
3. O que você gerar fica salvo na aba **Histórico** — reabra quando quiser.

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
