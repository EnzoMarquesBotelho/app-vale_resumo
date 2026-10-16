# Worklog — Task 9 / FEAT-003: Camada renderer da fatia Cadernos

> Registro de verificação da FEAT-003 (fecha a fatia Cadernos). Esta é a
> camada do renderer: campo de caderno editável + `datalist` + botão
> "Confirmar caderno" na `Importar.tsx` (modo reabertura somente-leitura via
> presença de `onConfirmarCaderno`); Histórico de dois níveis (lista de
> cadernos → documentos de um caderno) em `Historico.tsx`; e a orquestração em
> `App.tsx` (`aoConfirmarCaderno` no lugar de `aoImportar`, `persistirArtefato`
> com `Promise<DocumentoSalvo>` sem `| undefined`, troca de `window.api?.` por
> `getApi()`).
> Depende de FEAT-001 (tipos/contrato) e FEAT-002 (handlers
> `listarCadernos`/`listarDocumentos(cadernoId?)`/`criarDocumento` de 5 args),
> ambas já entregues e verdes.

## Mudanças desta iteração (FEAT-003)

- **`src/renderer/views/Importar.tsx`** — nova prop opcional
  `onConfirmarCaderno?: (arquivo, cadernoNome) => void`; a **presença** da prop
  é o seletor de modo.
  - `escolherArquivo()` continua chamando `getApi().importarArquivo()` e
    `onImportado?.(resultado)`; **não** cria documento nem avança de aba.
  - Estado local `cadernoEscolhido`, inicializado com
    `arquivo?.cadernoNomeSugerido ?? ""`. Re-preenchido quando um novo arquivo
    entra, detectando a troca por uma chave derivada de
    `caminhoOrigem`/`cadernoNomeSugerido`. **Nota de implementação:** o re-prefill
    é feito **ajustando o estado durante o render** (padrão recomendado pelo
    React para resetar estado quando uma prop muda), e não num `useEffect`,
    porque o `eslint-plugin-react-hooks` (`react-hooks/set-state-in-effect`)
    rejeita `setState` síncrono dentro de efeito. O comportamento observável é o
    mesmo descrito no design (novo arquivo re-preenche a sugestão; edição manual
    persiste enquanto o mesmo arquivo estiver ativo). Nenhum comportamento visível
    ao usuário muda em relação ao design aprovado.
  - Fluxo de import (`onConfirmarCaderno` definido) + texto extraível: renderiza
    `<input>` controlado pré-preenchido + `<datalist>` de cadernos existentes
    (`getApi().listarCadernos()`, carregado ao montar via `useEffect` e
    **recarregado após cada confirmação**) + botão "Confirmar caderno" que chama
    `onConfirmarCaderno(arquivo, cadernoEscolhido)`.
  - Reabertura (`onConfirmarCaderno` ausente): **sem** input/botão; mostra o
    rótulo somente-leitura `Caderno: <cadernoNomeSugerido>` quando presente.
    Nenhuma criação de documento é possível por este caminho.
  - PDF sem texto extraível: mantém o `avisoSemTextoExtraivel`, sem campo/botão.
- **`src/renderer/views/Historico.tsx`** — visão de dois níveis com estado
  `cadernoAberto: string | null`.
  - Nível 1 (`null`): `getApi().listarCadernos()` → lista de `ResumoCaderno`
    (nome + total de documentos + data via `formatarData`); botão "Abrir" seta
    `cadernoAberto = cadernoId`.
  - Nível 2 (`!== null`): `getApi().listarDocumentos(cadernoAberto)` → reusa a UI
    de item atual (reabrir/remover/etiquetas) + botão "← Cadernos" que volta ao
    nível 1.
  - Todo `window.api?.` trocado por `getApi()` (em `carregar`, no efeito, em
    `reabrir` e em `remover`); removidos os `?? []` e o `if (documento)` que
    dependiam da ponte opcional, mantendo os `catch`. A prop `recarregar`
    dispara o reload do nível atual; `documentoAtivoId` segue destacando o item
    aberto quando visível no caderno.
- **`src/renderer/App.tsx`** — orquestração.
  - `aoImportar` agora só faz `setArquivo(importado)` + `setDocumento(null)`
    (síncrono); novo `aoConfirmarCaderno(arquivo, cadernoNome)` chama
    `const salvo = await getApi().criarDocumento(nome, formato, texto,
    cadernoNome, caminhoOrigem)` (sem `if (salvo)`), depois `setDocumento(salvo)`,
    `setVersaoHistorico(v+1)`, `setAvisoPersistencia(null)` e `setAbaAtiva("resumo")`;
    o `catch` exibe o aviso de persistência e também vai para "resumo".
  - No render de `Importar`, `onConfirmarCaderno` é passado **apenas quando
    `documento === null`** (fluxo de import) e omitido na reabertura.
  - `aoReabrir` passa a preencher no `ArquivoImportado` sintético:
    `caminhoOrigem: salvo.caminhoOrigem`, `cadernoIdSugerido: salvo.cadernoId`,
    `cadernoNomeSugerido: salvo.cadernoNome`.
  - `persistirArtefato` mudou a assinatura de `operacao` para
    `() => Promise<DocumentoSalvo>` (sem `| undefined`); removido o
    `if (atualizado)`. Os três chamadores passam
    `() => getApi().salvarResumo(...)` / `salvarFlashcards(...)` /
    `salvarExercicios(...)` sem `?.`.
  - Nenhuma chamada `window.api?.` remanescente no renderer.
- **`src/renderer/styles.css`** — regras pequenas e aditivas para os elementos
  novos (`.importar-caderno`, `.importar-caderno-rotulo`,
  `.importar-caderno-input`, `.historico-voltar`), reusando as variáveis de tema
  já existentes. Nenhuma regra existente foi alterada.

Textos de UI em pt-BR; identificadores em inglês; nenhuma dependência nova.

## Comandos de verificação (executados em c:\Dev\.worktrees\notebooks)

```
=== npm run build ===   -> exit 0  (tsc --noEmit + electron-vite build OK)
   out/main/index.js       34.67 kB
   out/preload/preload.js   3.52 kB
   out/renderer/assets/index-*.css   14.31 kB
   out/renderer/assets/index-*.js   677.17 kB
   out/renderer/index.html           0.58 kB

=== npm run lint ===    -> exit 0  (eslint ., sem erros/avisos)

=== npm test ===        -> exit 0  (vitest run; 17 arquivos, 170 testes, todos passando)
   tests/main/ollama.test.ts            (10)
   tests/main/resumo.test.ts            (9)
   tests/main/exercicios.test.ts        (18)
   tests/main/parse.test.ts             (21)
   tests/main/migracao.test.ts          (7)   <- FEAT-002
   tests/main/storage.test.ts           (26)  <- FEAT-002 (ampliado: caderno/round-trip)
   tests/main/ipc-flashcards.test.ts    (5)
   tests/main/ipc-storage.test.ts       (10)  <- FEAT-002 (ampliado: criarDocumento 5/4 args,
                                                 listarCadernos, listarDocumentos filtro)
   tests/main/ipc-resumo.test.ts        (4)
   tests/main/ipc-exercicios.test.ts    (5)
   tests/main/files.test.ts             (13)  <- FEAT-002 (ampliado: caminhoOrigem + sugestão)
   tests/shared/notebooks.test.ts       (15)  <- FEAT-001
   tests/shared/prompts.test.ts         (12)
   tests/shared/constants.test.ts       (3)
   tests/main/escolher-modelo.test.ts   (5)
   tests/main/ipc-ollama.test.ts        (5)
   tests/main/ipc.test.ts               (2)
```

- **Sem regressão:** a baseline de 131 testes do MVP continua verde; o total de
  170 (131 baseline + 15 de FEAT-001 + 24 de FEAT-002) foi preservado. FEAT-003
  é só renderer e **não adiciona testes automatizados** — não existem testes de
  componente para `App`/`Importar`/`Historico` neste projeto (o fluxo de dois
  níveis + "Confirmar caderno" é verificável manualmente, conforme a seção
  "Testabilidade" do design). Nenhum teste foi removido ou enfraquecido.
- O `stderr` do vitest mostra uma linha `migrarCadernos: pulando
  "corrompido.json": SyntaxError...` — é um `console.warn` **esperado** do teste
  de tolerância a arquivo corrompido em `migracao.test.ts` (FEAT-002), não uma
  falha. Também aparecem `Warning: Indexing all PDF objects` de `files.test.ts`
  (pdfjs), igualmente esperados.

## Nota: pasta Facul é SOMENTE-LEITURA (nenhum teste depende dela)

Nenhum teste automatizado lê ou escreve em
`C:\Users\enzom\OneDrive\Desktop\Facul`. Os testes de backend usam apenas
`tests/fixtures` e diretórios temporários (`mkdtemp` em `tmpdir()`) com `baseDir`
injetável; esta FEAT (renderer) não adicionou testes nem qualquer referência a
essa pasta. A pasta real `Facul` permanece exclusivamente como fonte de aceitação
manual (importar `Facul\Cálculo\<arquivo>` e confirmar o pré-preenchimento do
campo de caderno), e nada neste trabalho a modificou, moveu ou apagou.

## Verificação manual prevista (documentada, não automatizada)

Conforme o design, o novo fluxo é verificado manualmente (não há harness de
componente):

- Importar um arquivo de `Facul\<Matéria>\...`: o campo de caderno vem
  pré-preenchido com a matéria (pasta-mãe), editável, com autocompletar dos
  cadernos existentes; o documento só é criado ao clicar "Confirmar caderno"; a
  aba de geração só avança após a confirmação.
- Histórico mostra a lista de cadernos; abrir um caderno lista seus documentos;
  "← Cadernos" volta ao nível 1; reabrir/remover dentro do caderno funcionam;
  remover o último documento de um caderno faz o caderno sumir ao voltar.
- Reabrir um documento do histórico: a tela de importação mostra o rótulo
  somente-leitura `Caderno: <nome>` e **não** oferece recriação.
