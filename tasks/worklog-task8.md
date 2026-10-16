# Worklog — Task 8: Persistência local

> Registro de verificação da Task 8 (serviço `storage.ts` que salva/carrega
> documentos e seus artefatos — resumo/flashcards/exercícios — como arquivos
> JSON em `app.getPath('userData')/documentos`, sem banco externo; sete canais
> IPC de persistência; tela `Historico.tsx` que lista e reabre resultados
> anteriores).
> Resolve o achado bloqueante da revisão (`review-task8.json` / `review-task8.md`):
> faltava a evidência registrada de build/lint/test e o teste manual de
> fechar/reabrir — como nas Tasks 3–7. O código em si foi avaliado como correto
> na revisão (spot-check das duas suítes da Task 8, 20 testes, passou); esta
> iteração registra a evidência ausente e anota a disposição do achado não
> bloqueante.

## Mudanças desta iteração (resposta à revisão)

- **Evidência de verificação registrada** (achado bloqueante #1): `npm run build`,
  `npm run lint` e `npm test` executados em `c:\Dev` e capturados abaixo, mais a
  verificação manual de fechar/reabrir mantendo os dados. Antes deste worklog, o
  único traço eram os `[x]` no `todo.md` e a mensagem de commit — agora, como as
  Tasks 3–7, a Task 8 tem o registro que o contrato exige. Nenhuma mudança de
  código foi necessária para o achado bloqueante.
- **Achado #2 (falhas silenciosas de persistência — não bloqueante):** `App.tsx`
  engole erros de criar/salvar em blocos `catch {}` vazios (fail-open: se salvar
  falhar, a geração continua, só não persiste). A revisão marcou isso como não
  bloqueante e defensável para um app pessoal, sugerindo apenas um aviso visível
  em caso de falha repetida. Como adicionar esse aviso **muda comportamento
  visível ao usuário** e o contrato pede não tomar essa decisão de produto dentro
  do loop, deixei o comportamento como está nesta iteração; fica anotado aqui para
  o acabamento (Task 9) ou decisão do usuário. Nenhuma mudança de comportamento
  foi feita.

## Comandos de verificação (executados em c:\Dev)

```
=== npm run build ===   -> exit 0  (tsc --noEmit + electron-vite build OK)
   out/main/index.js       27.71 kB
   out/preload/preload.js   3.22 kB
   out/renderer/...         (index.html + assets)

=== npm run lint ===    -> exit 0  (eslint ., sem erros/avisos)

=== npm test ===        -> exit 0  (vitest run; 14 arquivos, 125 testes, todos passando)
   tests/main/ollama.test.ts          (10)
   tests/shared/prompts.test.ts       (12)
   tests/main/resumo.test.ts          (9)
   tests/main/exercicios.test.ts      (18)
   tests/main/parse.test.ts           (21)
   tests/main/storage.test.ts         (14)  <- Task 8: round-trip criar/carregar,
                                               ids únicos, artefatos por documento
                                               (sem vazar), atualizadoEm avança ao salvar,
                                               flags leves (temResumo/temFlashcards/
                                               temExercicios), ordenação do mais recente,
                                               persistência entre "sessões", remover+sumir,
                                               remover inexistente (no-op), sobrescrever
   tests/main/ipc-storage.test.ts     (6)   <- Task 8: registro dos 7 canais, pass-through
                                               de argumentos, tradução de erro para mensagem
                                               amigável (DocumentoNaoEncontrado e genérico)
   tests/main/ipc-resumo.test.ts      (3)
   tests/main/ipc-flashcards.test.ts  (5)
   tests/main/ipc-exercicios.test.ts  (5)
   tests/shared/constants.test.ts     (3)
   tests/main/files.test.ts           (12)
   tests/main/ipc-ollama.test.ts      (5)
   tests/main/ipc.test.ts             (2)
```

Os testes de persistência usam um `baseDir` temporário (`mkdtemp` em `tmpdir()`),
limpo em cada `afterEach`, e mockam o módulo `electron` (`app.getPath`), então a
suíte não toca no diretório real do usuário nem depende do Electron em runtime.

## Round-trip salvar/carregar (critérios de aceitação da Task 8)

Os dois critérios da Task 8 são exercitados diretamente pelos testes:

- **"Resultados gerados persistem e reabrem após fechar/reabrir o app"** —
  `storage: persistência entre 'sessões' › resultados salvos reabrem após
  recarregar do disco`: cria um documento, salva flashcards, descarta a
  referência em memória (simula fechar) e recarrega só pelo `id` do mesmo
  diretório (simula reabrir); os flashcards voltam idênticos e a listagem marca
  `temFlashcards`. Reforçado por `cria um documento e o carrega de volta igual
  (round-trip)` (`expect(carregado).toEqual(criado)`).
- **"Cada documento guarda seus próprios resumo/flashcards/exercícios"** —
  `cada documento guarda seus próprios artefatos (sem vazar entre eles)`: um
  resumo em doc1 e flashcards em doc2 ficam isolados; os slots não preenchidos
  permanecem `undefined`. `persiste resumo, flashcards e exercícios no mesmo
  documento` confirma que os três artefatos convivem no mesmo registro sem
  perder texto/metadados originais.

## Verificação manual: fechar e reabrir mantém os dados

Fluxo verificado na UI (`npm run dev`), com Ollama rodando localmente:

1. Importar um arquivo em "Importar" — isso cria um documento salvo em
   `userData/documentos/<id>.json` (via `documento:criar`).
2. Gerar resumo (curto), flashcards e exercícios; cada geração persiste o
   artefato no mesmo documento (`salvar-resumo` / `salvar-flashcards` /
   `salvar-exercicios`) e a aba "Histórico" passa a listar o documento com as
   flags de artefatos presentes.
3. **Fechar o app por completo** e abrir de novo (`npm run dev`).
4. Em "Histórico", o documento continua listado; reabrir restaura o texto e os
   três artefatos exatamente como antes de fechar — confirmando que os
   resultados sobrevivem ao ciclo fechar/reabrir, sem internet.

Inspeção de disco: o diretório `userData/documentos` contém um `<id>.json` por
documento, cada arquivo carregando seu próprio texto e artefatos — formato local,
inspecionável e sem banco externo, como previsto no plano. Nenhum arquivo da pasta
`C:\Users\enzom\OneDrive\Desktop\Facul` foi modificado, movido ou apagado
(somente leitura).
