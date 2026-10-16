# Design Review — Fatia "Importar pasta" (3ª rodada)

> Revisão feita **sem** o contexto que produziu o design: só o próprio
> `tasks/design.md`, o roadmap autoritativo
> (`c:\Dev\tasks\roadmap-importar-pasta.md`), `SPEC.md`, e o código real do
> worktree (`notebooks.ts`, `constants.ts`, `storage.ts`, `files.ts`,
> `ipc.ts`, `ipc/index.ts`, `App.tsx`, `Importar.tsx`, `types.ts`).
>
> Objetivo: decidir se o documento se sustenta sozinho para um coder
> implementar sem re-decidir nada. Não rodei build nem testes (é revisão de
> design).

## Escopo verificado contra o código real

Li o código citado e confirmei as afirmações factuais do design. Resumo nas
seções "Verified Assumptions" e "Unverified/Wrong Assumptions" no fim.

---

## Achados

Cada achado tem severidade (HIGH / MEDIUM / NIT), onde ocorre, o problema e um
fix concreto.

### 1. [MEDIUM] `normalizarCaminhoOrigem`: o alvo da "unificação de separadores" não é especificado fora do Windows

**Onde:** seção "Persistência: checagem de duplicata…", definição de
`normalizarCaminhoOrigem`.

**Problema:** a regra diz, no Windows, `p.trim()` "com separadores unificados
para `\` e caixa baixa"; fora do Windows, `p.trim()` "com separadores
unificados, preservando caixa". Para o ramo não-Windows **não diz para qual
separador unificar**. Isso é uma instrução com múltiplas interpretações
válidas (unificar para `/`? para `\`? não mexer?). Como a função é aplicada
dos dois lados da comparação, se o coder escolher inconsistentemente (ex.:
unificar para `/` num lugar e deixar como veio em outro), a dedup pode falhar
silenciosamente. Mais importante: em POSIX, `\` é um caractere **válido** em
nome de arquivo — converter `\`→`/` ali corromperia a chave. A intenção quase
certamente é: no Windows, caminhos nunca contêm `/` e `\` de forma misturada
vinda do dialog, mas `path`/`fs` podem produzir ambos; fora do Windows não há
ambiguidade de separador e nenhuma conversão deve ocorrer.

**Fix concreto:** especificar exatamente:

```ts
// storage.ts
function normalizarCaminhoOrigem(p: string): string {
  const aparado = p.trim();
  if (process.platform === "win32") {
    // Windows: FS case-insensitive e aceita / e \ como separador.
    return aparado.replace(/\//g, "\\").toLowerCase();
  }
  // POSIX: separador é só "/"; "\" é caractere de nome válido — NÃO converter.
  // FS case-sensitive — preservar caixa. Normalização é só o trim.
  return aparado;
}
```

E atualizar o texto do design para dizer: "fora do Windows, a normalização é
**apenas** `trim()` — nenhuma conversão de separador (o `/` já é o único
separador e `\` é caractere de nome válido)."

### 2. [MEDIUM] A derivação de `nomePasta` (passo 1) é descrita como testável como "função pura", mas não há função nomeada nem contrato — e ela usa `basename`, cujo resultado depende da plataforma

**Onde:** "Orquestração" passo 1; "Testabilidade" ("raiz de drive / raiz
POSIX: teste de unidade da derivação do passo 1 (função pura de `nomePasta`)").

**Problema:** o design manda testar unitariamente "a derivação do passo 1
(função pura de `nomePasta`) com entradas `C:\\` e `/`", mas o passo 1 está
descrito como código inline dentro de `importarPasta`, não como uma função
extraída. Não dá para unit-testar `C:\\` e `/` de forma determinística sem
extrair, porque:
(a) não há símbolo exportado para o teste chamar; e
(b) `basename("C:\\")` só retorna `"C:"` quando `node:path` opera em modo
Windows — em um runner POSIX (CI Linux), `basename` é a variante POSIX e
`basename("C:\\")` retorna `"C:\\"` inteiro (não `"C:"`), então o guard
`/^[A-Za-z]:$/` **não casa** e o teste do caso `C:\\` falha. O design não diz
se o teste deve usar `path.win32.basename`/`path.posix.basename` explicitamente.

**Fix concreto:** extrair uma função pura exportada e torná-la independente de
plataforma, e dizer no design qual `basename` usar:

```ts
// pasta.ts
import { win32 as pathWin32, posix as pathPosix } from "node:path";

/**
 * Nome de exibição da pasta escolhida, saneando raiz de drive (Windows) e
 * raiz POSIX para "" (cai em "Geral" via montarCaderno). Pura e testável.
 */
export function nomePastaParaCaderno(pastaEscolhida: string): string {
  const semBarra = pastaEscolhida.replace(/[\\/]+$/, "");
  // Tenta ambos os basenames para ser determinístico em qualquer runner.
  const bruto = semBarra.includes("\\")
    ? pathWin32.basename(semBarra)
    : pathPosix.basename(semBarra);
  if (bruto === "" || /^[A-Za-z]:$/.test(bruto)) return "";
  return bruto;
}
```

Then step 1 becomes `const nomePasta = nomePastaParaCaderno(pastaEscolhida)` and
the test calls `nomePastaParaCaderno` directly with `"C:\\"` and `"/"`.
Alternativa aceitável: declarar explicitamente que o teste do caso Windows usa
`path.win32` e documentar que em produção o `basename` nativo basta (porque o
app roda em Windows). Qualquer uma resolve, mas o design precisa **escolher
uma** — hoje deixa o coder adivinhar.

### 3. [NIT] CA6 ("PDF sem texto é importado, não conta como falha") não está refletido na precedência de `resumoLoteTexto`

**Onde:** CA6 + seção UI (`resumoLoteTexto`).

**Problema:** CA6 diz que um PDF sem texto extraível **é importado** (conta em
`importados`). Correto e coberto pela orquestração (passo 5 cria o documento com
texto vazio). Mas a frase de resumo não tem como distinguir "importado com
texto" de "importado vazio", então um lote só de PDFs escaneados dirá
"N arquivos importados em M cadernos" sem qualquer menção de que vieram vazios.
Não é bug (bate com CA6/CA9), mas é um canto que vale um comentário para o coder
não "consertar" indevidamente adicionando uma contagem de vazios fora de escopo.

**Fix concreto:** acrescentar uma frase em CA6 ou na seção UI: "Documentos
importados sem texto extraível contam apenas em `importados`; **não** há
contador separado de 'sem texto' no resumo do lote (fora de escopo). O aviso
'sem texto extraível' aparece por documento ao abri-lo, como hoje."

---

## Verificação ponto-a-ponto do que o prompt pediu

- **Regra do caderno composto, todos os casos:** inequívoca. Raiz/sem-subpasta
  → nome da pasta escolhida (passo 1 + RF4 + CA4); um nível → CA3; vários níveis
  → CA2; acentos/espaços → `montarCaderno` normaliza id e preserva nome
  (confirmado em `notebooks.ts`); colisão cruzada `Cálculo\Teórica`
  (`calculo-teorica`) vs `Física\Teórica` (`fisica-teorica`) → ids distintos
  (seção "Invariantes"). A nota sobre colisão por normalização (dois caminhos
  que normalizam ao mesmo id agrupam no mesmo caderno) está documentada e é
  coerente com `listarCadernos`. **OK.**
- **Re-import / dedup:** regra completa — pular por `caminhoOrigem` normalizado,
  helper `caminhosOrigemImportados` sobre `carregarTodos` (que existe e é
  tolerante), conjunto atualizado dentro do lote, dedup intra-lote determinística
  (vence o primeiro por `localeCompare`). A única lacuna é a #1 (alvo da
  unificação de separador em POSIX). **OK, exceto #1.**
- **Tetos de arquivos/profundidade com números e comportamento seguro:**
  `PASTA_MAX_ARQUIVOS_LOTE = 500` (parada segura, nada criado, CA7) e
  `PASTA_PROFUNDIDADE_MAXIMA = 10` (poda + sinaliza), com definição operacional
  única de profundidade (0 na raiz; desce se ≤ teto) e CA8 com exemplo numérico.
  Resolve o off-by-one de rodadas anteriores. **OK.**
- **Shape do resultado + contrato IPC/preload/AppApi:** `ResultadoImportacaoPasta`
  concreto em `types.ts`; canal `pasta:importar`; `AppApi.importarPasta(): Promise<ResultadoImportacaoPasta | null>`;
  preload com `ipcRenderer.invoke`; handler no estilo de `importarArquivo`
  (confirmado idêntico ao real em `ipc/index.ts`), retornando `null` no cancel.
  **OK.**
- **Nada fora de escopo:** sem IA no lote (RF5/NFR1), sem watch, sem dedup
  sofisticada, read-only (RF9/CA10). O lote reusa `importarArquivo` inteiro e
  **descarta** a sugestão de caderno — documentado como intencional. Nenhum
  scope creep detectado. **OK.**

---

## Verified Assumptions (li o código e confere)

1. `montarCaderno(bruto)` existe em `src/shared/notebooks.ts`, devolve
   `{ cadernoId, cadernoNome }`, usa `normalizarNomeCaderno` (strip de acento +
   slug `[^a-z0-9]+`→`-`) e `derivarNomeExibicaoCaderno` (trim + slice em
   `CADERNO_NOME_MAX = 200`). **O id NÃO é truncado** — a nota do design está
   correta.
2. `montarCaderno("")` cai em `geral`/`Geral` (via fallback de
   `normalizarNomeCaderno`). O guard de raiz de drive passando `""` realmente
   produz o caderno `Geral`. **Confere.**
3. `notebooks.ts` só importa `import type` de `./types` e não depende de
   `constants.ts`. Portanto declarar `SEPARADOR_CADERNO` dentro de `notebooks.ts`
   (e não em `constants.ts`) é necessário para não quebrar a regra do módulo.
   **Confere** (o cabeçalho do arquivo afirma exatamente isso).
4. `derivarCadernoDeCaminho` já aplica o guard `/^[A-Za-z]:$/` para raiz de
   drive. O design espelha esse mesmo guard no passo 1. **Confere.**
5. `storage.criarDocumento(novo: NovoDocumento, baseDir?)` recebe
   `{ nome, formato, texto, cadernoId, cadernoNome, caminhoOrigem? }` já prontos
   — diferente do handler IPC `criarDocumento`, que recebe só a grafia e chama
   `montarCaderno`. A decisão do design de chamar o `storage.criarDocumento`
   direto (sem passar pelo handler) é válida e bate com a assinatura real.
6. `carregarTodos` existe em `storage.ts`, é tolerante a corrompidos e trata
   diretório ausente como `[]`. Reusá-lo em `caminhosOrigemImportados` é viável.
7. `ArquivoImportado` (em `types.ts`) tem `nome`, `formato`, `texto`,
   `semTextoExtraivel`, `caminhoOrigem?`, `cadernoIdSugerido?`,
   `cadernoNomeSugerido?`. O passo 5 (`extraido.nome/formato/texto`) e a nota
   sobre descartar `cadernoIdSugerido` batem com o tipo real.
8. `importarArquivo` (`files.ts`) lança `ArquivoMuitoGrandeError` (>50 MB) e
   `FormatoNaoSuportadoError`, e devolve `semTextoExtraivel`/texto vazio para PDF
   sem texto. O tratamento do lote (tamanho → `falhas`; PDF vazio → importado)
   bate com o comportamento real.
9. O handler `importarArquivo` em `ipc/index.ts` tem exatamente a forma que o
   design propõe para `importarPasta` (dialog → cancel→`null` → try/catch →
   `throw new Error(mensagemAmigavel(...))`). O `mensagemAmigavelPasta` genérico
   é consistente com o padrão existente.
10. `App.tsx` passa `onConfirmarCaderno` **condicionalmente**
    (`documento === null ? {...} : {}`) e `Importar` só é montado quando
    `abaExibida === "importar"`. A correção do design (pôr `onLoteImportado`
    **fora** do spread condicional) está certa e o JSX proposto é compatível com
    o real. `setVersaoHistorico((v) => v + 1)` é o mecanismo real de recarga do
    Histórico (usado em `persistirArtefato`).
11. `Importar.tsx` usa `importar-header`, `ehFluxoImportacao =
    onConfirmarCaderno !== undefined`, e `mensagemDeErro` para limpar o prefixo
    do IPC — tudo como o design descreve ao propor o botão "Escolher pasta" e os
    estados novos.
12. `extensoesSuportadas = ["txt","md","pdf"]` e `tamanhoMaximoArquivoBytes`
    (50 MB) existem em `constants.ts`; `derivarCadernoDeCaminho`/`montarCaderno`
    exportados. O padrão de constantes `MAPA_*` existente justifica os novos
    `PASTA_*`.
13. Caminho real do roadmap: `c:\Dev\tasks\roadmap-importar-pasta.md` existe
    **fora** do worktree (confirmado por busca); dentro de
    `.worktrees\importpasta\tasks\` **não** há roadmap. O cabeçalho do design e a
    seção "Resumo das decisões" agora apontam o caminho absoluto correto. As
    decisões do roadmap (caderno composto com " — ", só texto, read-only,
    feedback de lote, pular duplicatas por `caminhoOrigem`) batem com o design.

## Unverified / Wrong Assumptions

- **(parcial, vira achado #2)** O design afirma que a "derivação do passo 1" é
  uma "função pura" testável com `C:\\` e `/`, mas (a) não a extrai como símbolo
  e (b) depende de `basename` ser a variante Windows — o que **não é verdade** em
  um runner POSIX, onde `path.basename("C:\\")` devolve `"C:\\"` e o guard não
  casa. Essa é uma suposição implícita incorreta sobre o comportamento de
  `node:path` no CI; o achado #2 dá o fix.
- **(parcial, vira achado #1)** A afirmação "separadores unificados" fora do
  Windows pressupõe um alvo de unificação que nunca é dado e que, se
  interpretado como `\`→`/`, estaria **errado** em POSIX (onde `\` é caractere
  de nome válido). Achado #1 dá o fix.
- Não verifiquei em runtime o comportamento do `dialog.showOpenDialog` com
  `openDirectory` (é interação de SO, fora do escopo de revisão estática); o
  design corretamente o deixa mockado nos testes.
- Não verifiquei `preload.ts` nem `tests/*` linha a linha; as mudanças ali são
  aditivas e seguem padrões já confirmados nos outros arquivos.

---

## Veredito

Contagem: **2 MEDIUM + 1 NIT** (0 HIGH). Por ser > 0 em HIGH/MEDIUM, o veredito
é **CHANGES_REQUESTED**. Os dois MEDIUM são especificações faltando (não
arquitetura): o alvo de unificação de separador em POSIX (#1) e a extração +
determinismo de plataforma da derivação de `nomePasta` para o teste de raiz
(#2). Ambos são correções pontuais de documentação/assinatura; o resto do design
está sólido e verificado contra o código real.
