# Roadmap — Fatia: Exportação (Markdown + PDF)

> Fatia pós-MVP. Exportar os artefatos gerados para arquivos usáveis fora do app.
> Base: SPEC.md; artefatos existentes (resumo, flashcards, exercícios, mapa
> mental, quiz) persistidos por documento no caderno.
> Decisões confirmadas com o usuário em 2026-10-16.

## Objetivo

Permitir exportar o material gerado para **Markdown** e **PDF**, tanto por
artefato individual quanto o documento inteiro (todos os artefatos num arquivo).

## Decisões confirmadas

1. **Formatos nesta fatia: Markdown + PDF.** Anki fica no roadmap (é específico
   de flashcards, formato próprio — fatia futura).
2. **Escopo: por artefato E documento inteiro.**
   - Por artefato: botão "Exportar" na tela de cada artefato (resumo,
     flashcards, exercícios, mapa mental, quiz) — exporta só aquele.
   - Documento inteiro: um botão que junta todos os artefatos gerados do
     documento num único arquivo (Markdown ou PDF).
3. **PDF via biblioteca `pdfmake`** (DEPENDÊNCIA NOVA, decisão consciente).
   - Justificativa: nosso conteúdo é texto estruturado (títulos, listas de
     flashcards/exercícios, quiz); `pdfmake` é declarativo e cuida de quebra de
     página/linha, espaçamento e listas com pouco esforço, dando um PDF limpo.
     `pdfkit` (desenho manual) teria teto maior mas custo muito alto sem equipe
     de design — descartado.
   - Fixar a versão no `package.json`.
4. **Mapa mental no PDF: imagem vetorial (SVG).** O mapa é um SVG; entra no PDF
   como vetor (bonito), aceitando o trabalho extra de incorporar o SVG no
   pdfmake. (No Markdown, decidir uma representação textual — ver abaixo.)

## Regras para o design decidir (simples e seguras)

- **Geração de Markdown:** função(ões) PURA(s) que convertem cada artefato em
  Markdown (título, seções, listas). Fácil de testar. Para o documento inteiro,
  concatenar os artefatos presentes com cabeçalhos. O mapa mental em Markdown:
  representar como lista aninhada/indentada (a árvore vira tópicos) — decisão do
  design; não precisa ser imagem no Markdown.
- **Geração de PDF (pdfmake):** montar o "document definition" a partir dos
  mesmos dados dos artefatos. Onde fica a montagem: `pdfmake` roda em Node, então
  o serviço vive no processo MAIN. O SVG do mapa entra via o suporte a SVG do
  pdfmake (string SVG). Layout usando as cores/tipografia coerentes com o app.
- **Salvar o arquivo:** usar `dialog.showSaveDialog` no main para o usuário
  escolher onde salvar; nome de arquivo sugerido a partir do nome do documento +
  artefato. Nunca escrever sem o usuário escolher o destino. Fora da pasta de
  dados do app (é o usuário quem escolhe) — e NUNCA tocar a pasta Facul.
- **Artefatos ausentes:** exportar documento inteiro inclui só os artefatos que
  existem; se nada foi gerado, orientar (sem quebrar). Exportar um artefato que
  não existe não deve ser oferecido.
- **Sem IA:** exportação é 100% local e determinística, NÃO usa o Ollama.

## Fora de escopo desta fatia (roadmap)

- **Anki** (.apkg/CSV dos flashcards) — fatia futura.
- Exportar para .docx, HTML standalone, ou impressão direta.
- Templates/temas de exportação configuráveis.

## Orientação técnica (o design refina)

- **Dependência:** adicionar `pdfmake` (fixar versão). Verificar se precisa de
  tipos (`@types/pdfmake`) e das fontes (vfs) para rodar no main.
- **Shared:** funções puras de Markdown por artefato (ex.:
  `src/shared/export/markdown.ts`), testáveis sem Node. Tipos de opções de
  exportação, se necessário.
- **Main:** serviço de exportação (ex.: `src/main/services/export.ts`) que
  monta o PDF (pdfmake) e grava o arquivo via `dialog.showSaveDialog` +
  `fs.writeFile`; handlers IPC (ex.: `export:markdown`, `export:pdf`, cada um
  por artefato ou documento inteiro). Reusar o SVG do mapa já existente para o
  PDF. Atualizar `ipc.ts` e `preload.ts`.
- **Renderer:** botões "Exportar (Markdown/PDF)" em cada view de artefato
  (Resumo/Flashcards/Exercicios/MapaMental/Quiz) e um "Exportar documento" no
  nível do documento (ex.: no Histórico ao abrir um documento, ou um controle
  global). Chamadas só via `getApi()`. Visual consistente com `styles.css`.
- **Testes:** geração de Markdown por artefato e do documento inteiro (puro,
  determinístico); montagem do document-definition do pdfmake (validar a
  estrutura, sem precisar renderizar o PDF binário); inclusão do SVG do mapa.
  A gravação de arquivo (save dialog) é verificação manual. Nada usa Ollama nem
  depende da pasta Facul. Textos pt-BR; identificadores em inglês.
