# Design — Fatia: Importar pasta (lote, recursivo)

> Fatia pós-MVP. Estende a importação para aceitar PASTAS, não só arquivos.
> Fonte de verdade das decisões: `c:\Dev\tasks\roadmap-importar-pasta.md`
> (FORA do worktree; confirmado com o usuário em 2026-10-15) e `SPEC.md` (na
> raiz do worktree). O roadmap **NÃO** está em `.worktrees\importpasta\tasks\`:
> toda menção a "o roadmap" neste documento se refere ao caminho absoluto acima.
> Este documento refina aquelas decisões a ponto de um planner/coder implementar
> sem re-decidir nada.
> Status: revisado (respostas à revisão em `tasks/design-review.json` /
> `tasks/design-review.md` no fim deste documento).

---

## Requisitos

### Resumo

Hoje a importação aceita **um arquivo** por vez (`importarArquivo`). Esta fatia
adiciona a opção de escolher uma **pasta** e importar em lote todos os arquivos
suportados (`.txt`/`.md`/`.pdf`) dela e de suas subpastas. Cada arquivo vira um
`DocumentoSalvo` no caderno correto, derivado do caminho da subpasta **relativo à
pasta escolhida**. O lote importa **apenas o texto** — nenhuma geração de IA é
disparada automaticamente; a geração continua sob demanda, por documento. Ao
final, a UI mostra um resumo claro em pt-BR (importados, ignorados por formato,
pulados por duplicata, cadernos tocados) sem travar.

A fatia toca quatro camadas: serviço de varredura no main, contrato IPC
compartilhado (tipos + canal + preload + `AppApi`), persistência (checagem de
duplicata por `caminhoOrigem` e criação em lote) e a UI de `Importar.tsx`.

### Requisitos funcionais

1. **RF1 — Escolher pasta.** A tela Importar passa a ter, ao lado de "Escolher
   arquivo", um botão "Escolher pasta" que abre
   `dialog.showOpenDialog({ properties: ["openDirectory"] })`.
2. **RF2 — Varredura recursiva.** A pasta escolhida e todas as suas subpastas são
   varridas (até o teto de profundidade do RF8).
3. **RF3 — Filtro por extensão.** Apenas `.txt`/`.md`/`.pdf` são importados.
   Qualquer outra extensão é **silenciosamente ignorada** (não é erro) e contada
   em `ignoradosPorFormato`.
4. **RF4 — Caderno composto por caminho relativo.** O caderno de cada arquivo é o
   caminho das subpastas entre a pasta escolhida e o arquivo, juntado com `" — "`;
   quando o arquivo está direto na pasta escolhida, o caderno é o **nome da pasta
   escolhida**. A normalização reutiliza `montarCaderno` de
   `src/shared/notebooks.ts` (id sem acento/slug; nome de exibição preservado).
5. **RF5 — Importa só texto.** Reutiliza a extração de `files.ts`. Nenhuma geração
   de IA é disparada no lote. PDF sem texto extraível **entra mesmo assim**, com o
   mesmo tratamento de hoje (`semTextoExtraivel`/texto vazio).
6. **RF6 — Pular duplicatas.** Um arquivo cujo `caminhoOrigem` já existe em um
   documento salvo é **pulado** (não duplica) e contado em `ignoradosPorDuplicata`.
7. **RF7 — Resultado do lote.** O main devolve um objeto com contagens
   (importados, ignorados por formato, ignorados por duplicata, falhas) e a lista
   de cadernos tocados. A UI exibe uma frase pt-BR a partir disso.
8. **RF8 — Guardas.** Teto de 50 MB por arquivo (já existe) continua valendo;
   somam-se um teto de profundidade de varredura e um teto de arquivos por lote,
   com comportamento seguro ao exceder (ver NFR e seção Limites).
9. **RF9 — Somente leitura.** A varredura nunca escreve, move, renomeia ou apaga
   nada na pasta escolhida.
10. **RF10 — Não travar a UI.** A importação roda no processo main; o botão fica
    em estado "Importando…" e a UI permanece responsiva.

### Requisitos não-funcionais

- **NFR1 — Offline/local.** Nenhuma chamada de rede. Nada de IA no lote.
- **NFR2 — Robustez.** Falha ao ler/extrair um arquivo individual não aborta o
  lote: o arquivo é contado como falha e a varredura segue.
- **NFR3 — Determinismo testável.** A varredura e a derivação de caderno são
  funções puras sobre caminhos/`fs`, testáveis em `tmpdir` com fixtures — nunca a
  pasta real do usuário.
- **NFR4 — Idioma.** Toda a UI e as mensagens em pt-BR; identificadores em inglês.
- **NFR5 — Memória.** Guardas de tamanho/quantidade/profundidade impedem que uma
  árvore gigante carregue tudo na memória de uma vez.

### Critérios de aceitação (específicos e testáveis)

1. **CA1.** Escolher uma pasta com `a.txt`, `b.md`, `c.pdf` e `d.docx` importa 3
   documentos e devolve `ignoradosPorFormato = 1`.
2. **CA2.** Dada a árvore `Facul/Cálculo/Teórica/x.pdf` com a pasta escolhida
   `Facul`, o documento criado tem `cadernoNome = "Cálculo — Teórica"` e
   `cadernoId = "calculo-teorica"`.
3. **CA3.** Com a pasta escolhida `Facul/Cálculo`, o arquivo `Teórica/x.pdf` gera
   `cadernoNome = "Teórica"`.
4. **CA4.** Um arquivo direto na pasta escolhida `Facul/nota.txt` gera
   `cadernoNome = "Facul"`.
5. **CA5.** Reimportar a mesma pasta uma segunda vez devolve
   `importados = 0` e `ignoradosPorDuplicata = N`, sem criar documentos novos.
6. **CA6.** Um PDF sem texto extraível é importado (documento criado) e seu
   `texto` fica vazio; não é contado como falha nem como ignorado.
7. **CA7.** Exceder o teto de arquivos por lote devolve resultado com
   `limiteExcedido: "arquivos"` e **não cria nenhum documento** (parada segura);
   a UI mostra a mensagem de limite.
8. **CA8.** Definição operacional de profundidade: a profundidade de uma pasta é
   o número de subpastas entre a pasta escolhida (profundidade 0) e ela. Descemos
   para uma subpasta somente se a profundidade dela for **≤
   `PASTA_PROFUNDIDADE_MAXIMA`**. Logo, com o teto 10, a 1ª subpasta de
   profundidade **11** é a primeira podada (os arquivos dentro dela e abaixo não
   entram), e o resultado traz `limiteExcedido: "profundidade"` apenas quando a
   poda de fato cortou alguma subpasta. Exemplo numérico: numa árvore com 11
   níveis de subpasta aninhada, o 11º nível é podado; os níveis 1–10 (e os
   arquivos neles) são varridos normalmente.
9. **CA9.** A UI, após o lote, exibe uma frase do tipo "3 arquivos importados em 2
   cadernos; 1 ignorado por formato" sem travar nem recarregar a janela.
10. **CA10.** Nenhuma escrita ocorre dentro da pasta escolhida (verificável: o
    serviço só chama `readdir`/`stat`/`readFile`).

### Fora de escopo (não desenhar)

- Geração de IA em lote para a pasta inteira.
- Monitoramento automático de pasta (watch/re-import ao mudar).
- Dedup sofisticada ou atualização in-place de documento existente (além do
  simples "pular por `caminhoOrigem`").
- Importar formatos não suportados.

---

## Design técnico

### Visão geral

O fluxo é: o renderer chama `getApi().importarPasta()`; o main abre o seletor de
pasta, varre recursivamente coletando apenas os arquivos suportados, deriva o
caderno de cada um pelo caminho relativo, pula os que já foram importados (mesmo
`caminhoOrigem`), extrai o texto reutilizando `files.ts`, cria um `DocumentoSalvo`
por arquivo via `storage.ts` e devolve um `ResultadoImportacaoPasta` com as
contagens e os cadernos tocados. A UI mostra o resultado em pt-BR.

O trabalho novo se divide em: (a) um serviço puro de varredura/derivação
(`src/main/services/pasta.ts`), (b) uma função de persistência em lote +
checagem de duplicata em `storage.ts`, (c) o contrato IPC
(`types.ts`/`ipc.ts`/`preload.ts`), (d) o handler em `ipc/index.ts`, e (e) a UI em
`Importar.tsx` + a wiring em `App.tsx`.

### Stack técnica (travada)

Electron + React + TypeScript + Vite (electron-vite). IPC tipado via
`contextBridge` no preload. Persistência JSON local em
`app.getPath('userData')/documentos`. Varredura com `node:fs/promises`
(`readdir({ withFileTypes: true })`, `stat`, `readFile`) e `node:path`. Testes com
Vitest; a chamada HTTP ao Ollama permanece mockada (e aqui nem é usada, pois o
lote não gera IA). Nada disso muda nesta fatia.

### Decisão: onde mora a lógica de varredura

Duas opções foram consideradas:

- **(A)** Pôr tudo (varredura + loop de persistência) dentro do handler IPC.
- **(B)** Criar um serviço `pasta.ts` com funções puras/isoláveis e deixar o
  handler só orquestrando dialog → serviço → resultado.

**Escolhido: (B).** Espelha a arquitetura existente (`files.ts`, `storage.ts`,
`mapa.ts` são serviços finos e testáveis; o handler só adapta erros em mensagens
pt-BR). Permite testar a varredura e a derivação de caderno em `tmpdir` sem
Electron (como `files.test.ts` já faz), que é exatamente o que o roadmap pede.

### Derivação do caderno (caminho relativo → composto)

Função pura nova, em `src/shared/notebooks.ts` (sem dependência de `fs`, para
ficar junto da demais lógica de caderno e ser testável isoladamente). **O
separador de exibição `SEPARADOR_CADERNO` é declarado DENTRO de `notebooks.ts`**
(junto das constantes `CADERNO_*` já existentes), não em `constants.ts`: o
cabeçalho de `notebooks.ts` declara que o módulo só importa `import type` de
`./types` e não depende de outros módulos de valores — colocar o separador aqui
respeita essa regra e mantém o módulo autocontido. Se o renderer precisar do
literal (para o texto do resumo do lote, por exemplo), ele importa
`SEPARADOR_CADERNO` **de `@shared/notebooks`**.

```ts
/**
 * Deriva o caderno composto a partir do caminho de um arquivo relativo à pasta
 * escolhida. As subpastas entre a pasta escolhida e o arquivo são juntadas com
 * " — "; sem subpasta (arquivo direto na raiz escolhida), usa o nome da pasta
 * escolhida como caderno. Função pura: não toca o disco.
 *
 * @param nomePastaEscolhida  nome (basename) da pasta escolhida pelo usuário.
 * @param caminhoRelativo     caminho do arquivo relativo à pasta escolhida
 *                            (ex.: "Cálculo/Teórica/x.pdf"; aceita "/" e "\").
 */
export function derivarCadernoComposto(
  nomePastaEscolhida: string,
  caminhoRelativo: string,
): { cadernoId: string; cadernoNome: string };
```

Regra concreta:

1. Quebrar `caminhoRelativo` em segmentos por `/[\\/]+/`, filtrando vazios.
2. Descartar o **último** segmento (o nome do arquivo).
3. Os segmentos restantes são as subpastas.
   - Se **vazio** (arquivo direto na pasta escolhida): `bruto = nomePastaEscolhida`.
   - Senão: `bruto = subpastas.join(" — ")`.
4. Retornar `montarCaderno(bruto)` — reusa a normalização existente (id sem
   acento/slug, nome de exibição preservado e truncado em `CADERNO_NOME_MAX`).
   O separador de exibição é `SEPARADOR_CADERNO` (`" — "`), declarado no próprio
   `notebooks.ts`, usado no `join` das subpastas.

**Nota sobre o tamanho do `cadernoId`:** `montarCaderno` trunca o `cadernoNome`
em `CADERNO_NOME_MAX` (200), mas `normalizarNomeCaderno` **não trunca o id** (ele
só sofre strip de acento + slug). Logo, caminhos profundos (vários segmentos
juntados por `-`) podem gerar um `cadernoId` composto longo. Isso **não quebra
nada**: o `cadernoId` só agrupa documentos no Histórico e nunca vira nome de
arquivo (os docs em disco são `<uuid>.json`, não `<cadernoId>.json`). A
profundidade máxima (10) limita o tamanho na prática. Um id longo é aceitável
nesta fatia; não há truncamento proposital do id.

Exemplos (batem com o roadmap):

| Pasta escolhida | Caminho do arquivo         | caminhoRelativo        | cadernoNome        | cadernoId          |
|-----------------|----------------------------|------------------------|--------------------|--------------------|
| `...\Facul`     | `Facul\Cálculo\Teórica\x.pdf` | `Cálculo\Teórica\x.pdf` | `Cálculo — Teórica` | `calculo-teorica`  |
| `...\Facul\Cálculo` | `Cálculo\Teórica\x.pdf` | `Teórica\x.pdf`        | `Teórica`          | `teorica`          |
| `...\Facul`     | `Facul\nota.txt`           | `nota.txt`             | `Facul`            | `facul`            |

Observação (raiz de drive): quando o arquivo está direto na pasta escolhida,
`bruto = nomePastaEscolhida`. Se o `nomePastaEscolhida` for uma **raiz de drive**
(no Windows, `basename("C:\\")` → `"C:"`; no POSIX, raiz `/` → `""`), não
queremos um caderno `c`/`C:`. Por isso a **derivação do `nomePastaEscolhida`
acontece no passo 1 da orquestração** (não dentro de `derivarCadernoComposto`), e
lá tratamos a raiz de drive explicitamente (ver "Orquestração" passo 1), passando
`""` para cair no caderno padrão `Geral`/`geral` — espelhando o guard
`/^[A-Za-z]:$/` que `derivarCadernoDeCaminho` já aplica. Assim
`derivarCadernoComposto` recebe um `nomePastaEscolhida` já saneado e permanece uma
função pura simples.

Constante nova em `src/shared/notebooks.ts` (junto de `CADERNO_*`, não em
`constants.ts` — ver nota acima):

```ts
/** Separador de exibição entre segmentos de um caderno composto. */
export const SEPARADOR_CADERNO = " — ";
```

`derivarCadernoComposto` usa essa constante no `join` das subpastas.

### Serviço de varredura — `src/main/services/pasta.ts`

```ts
import { readdir, stat } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { extensoesSuportadas } from "@shared/constants";

/** Um arquivo suportado encontrado na varredura. */
export interface ArquivoVarrido {
  /** Caminho absoluto no disco. */
  caminhoAbsoluto: string;
  /** Caminho relativo à pasta escolhida (para derivar o caderno). */
  caminhoRelativo: string;
}

/** Resultado da varredura (antes de qualquer persistência). */
export interface ResultadoVarredura {
  arquivos: ArquivoVarrido[];
  /** Quantos arquivos tinham extensão não suportada (contados, não lidos). */
  ignoradosPorFormato: number;
  /** `true` se a poda por profundidade cortou alguma subpasta. */
  profundidadePodada: boolean;
}

/**
 * Tetos opcionais de varredura/lote, injetáveis sobretudo para teste. Em
 * produção são omitidos e caem nos defaults de `@shared/constants`
 * (`PASTA_PROFUNDIDADE_MAXIMA`, `PASTA_MAX_ARQUIVOS_LOTE`). Expor isso como
 * parâmetro — em vez de `let` mutável em módulo — mantém as funções puras e
 * permite testar a poda/parada com números baixos sem gerar centenas de
 * arquivos reais.
 */
export interface LimitesVarredura {
  profundidadeMaxima?: number;
  maxArquivosLote?: number;
}

export async function varrerPasta(
  pastaEscolhida: string,
  limites?: LimitesVarredura,
): Promise<ResultadoVarredura>;
```

**Definição operacional única de profundidade (evita off-by-one):** a
`profundidade` de uma pasta é o **número de subpastas entre a pasta escolhida e
ela** — a pasta escolhida tem profundidade 0, uma subpasta direta tem
profundidade 1, e assim por diante. Arquivos não têm profundidade própria;
pertencem à profundidade da pasta que os contém. A regra de descida é: **descer
para uma subpasta somente se a profundidade dela for ≤
`PASTA_PROFUNDIDADE_MAXIMA`.** Com o teto = 10, isso significa que descemos até a
profundidade 10 inclusive, e a 1ª subpasta de profundidade 11 é a primeira
podada.

Algoritmo (recursivo com `readdir(dir, { withFileTypes: true })`), onde
`profundidadeAtual` é a profundidade da pasta sendo lida (a pasta escolhida é
chamada com `profundidadeAtual = 0`):

Seja `profundidadeMax = limites?.profundidadeMaxima ?? PASTA_PROFUNDIDADE_MAXIMA`
(resolvido uma vez no início de `varrerPasta`).

- Para cada entrada do diretório atual:
  - **Diretório:** a subpasta tem `profundidadeFilho = profundidadeAtual + 1`. Se
    `profundidadeFilho > profundidadeMax`, marca
    `profundidadePodada = true` e **não** desce; senão desce recursivamente com
    `profundidadeFilho`.
  - **Arquivo:** calcula a extensão (minúscula, sem ponto). Se estiver em
    `extensoesSuportadas`, adiciona a `arquivos` com
    `caminhoRelativo = relative(pastaEscolhida, caminhoAbsoluto)`; senão incrementa
    `ignoradosPorFormato`.
  - **Symlink / outro tipo** (`isSymbolicLink()` ou nem file nem dir): **ignora
    silenciosamente** (não conta como formato ignorado) — evita loops de symlink e
    tipos especiais. Não seguimos symlinks de diretório.
- A ordenação final de `arquivos` é por `caminhoRelativo` (`localeCompare`), para
  um resultado determinístico e testável.
- Entradas ilegíveis (um subdiretório que lança em `readdir`, ex.: permissão
  negada) são **puladas com `console.warn`**; a varredura continua. A varredura
  nunca escreve nada (RF9/CA10). Nota: a `readdir` **da pasta escolhida (raiz)**
  é a única cuja falha é fatal (ver Tratamento de erros); a de qualquer subpasta
  é absorvida.

### Persistência: checagem de duplicata e criação em lote — `storage.ts`

Hoje não há índice por `caminhoOrigem`. Adiciona-se um helper que carrega os
documentos existentes uma única vez e expõe o conjunto de caminhos já importados:

```ts
/**
 * Retorna o conjunto de `caminhoOrigem` (normalizados) de todos os documentos
 * já salvos. Usado pela importação em lote para pular arquivos já importados.
 * Caminhos ausentes/vazios não entram no conjunto. Leitura tolerante: diretório
 * ausente → conjunto vazio.
 */
export async function caminhosOrigemImportados(
  baseDir?: string,
): Promise<Set<string>>;
```

- Reutiliza `carregarTodos` (já existe e é tolerante a arquivos corrompidos).
- **Normalização da chave de duplicata:** compara por
  `normalizarCaminhoOrigem(p)`, definido como:
  - no Windows (`process.platform === "win32"`): `p.trim()` com separadores
    unificados para `\` e **caixa baixa** (o FS do Windows é case-insensitive);
  - fora do Windows: `p.trim()` com separadores unificados, **preservando caixa**.
  Essa função fica em `storage.ts` (é regra de persistência, não de domínio puro)
  e é aplicada dos dois lados da comparação. Documentado: a dedup é por caminho,
  não por conteúdo — dois caminhos diferentes para o mesmo arquivo físico (ex.:
  via symlink) contam como distintos; aceitável para esta fatia.
- **Dedup intra-lote determinística (colisão de chave normalizada no mesmo
  lote):** como a varredura ordena `arquivos` por `caminhoRelativo`
  (`localeCompare`) e a orquestração percorre nessa ordem, se dois arquivos do
  mesmo lote normalizarem para a **mesma chave** (ex.: no Windows, caminhos que
  diferem só na caixa), **vence o primeiro na ordem de `caminhoRelativo`** (é o
  que é efetivamente importado); os seguintes são contados em
  `ignoradosPorDuplicata`. Isso é consequência direta de atualizar `jaImportados`
  com a chave logo após criar o documento (passo 5): o primeiro cria e insere a
  chave; os seguintes já a encontram e são pulados. Comportamento coberto por
  teste (ver Testabilidade).

A criação em lote é feita pelo serviço `pasta.ts` chamando o `criarDocumento`
existente para cada arquivo não-duplicado (um `writeFile` atômico por documento,
como hoje). Não se cria uma transação: cada documento é independente, e uma falha
isolada é contabilizada sem abortar o lote (NFR2).

### Orquestração da importação em lote — `pasta.ts`

```ts
export interface ResultadoImportacaoPasta {
  /** Documentos efetivamente criados. */
  importados: number;
  /** Arquivos com extensão não suportada. */
  ignoradosPorFormato: number;
  /** Arquivos pulados por já terem sido importados (mesmo caminhoOrigem). */
  ignoradosPorDuplicata: number;
  /** Arquivos encontrados mas que falharam ao ler/extrair/salvar. */
  falhas: number;
  /** Nomes de exibição dos cadernos tocados (distintos, ordenados). */
  cadernosTocados: string[];
  /** `null` se nada estourou; senão qual limite parou/afetou o lote. */
  limiteExcedido: "arquivos" | "profundidade" | null;
}

export async function importarPasta(
  pastaEscolhida: string,
  baseDir?: string,
  limites?: LimitesVarredura,
): Promise<ResultadoImportacaoPasta>;
```

Passos:

1. **Nome da pasta escolhida (com guard de raiz de drive):**
   `bruto = basename(pastaEscolhida.replace(/[\\/]+$/, ""))` (tira barra final).
   Se `bruto` casar `/^[A-Za-z]:$/` (raiz de drive no Windows, ex.: `C:`) **ou**
   for string vazia (raiz POSIX `/`), usa `nomePasta = ""`; senão
   `nomePasta = bruto`. Passar `""` faz o arquivo direto na raiz cair no caderno
   `Geral` via `montarCaderno("")`, em vez de um caderno espúrio `c`/`C:`.
   Testar com `C:\\` e `/`.
2. `varredura = await varrerPasta(pastaEscolhida, limites)` (repassa os mesmos
   `limites` recebidos — na prática `undefined` em produção, com valores só nos
   testes).
3. **Guarda de quantidade:** seja
   `maxArquivos = limites?.maxArquivosLote ?? PASTA_MAX_ARQUIVOS_LOTE`; se
   `varredura.arquivos.length > maxArquivos`, **parar com segurança**:
   retornar imediatamente `{ importados: 0, ignoradosPorFormato: varredura.ignoradosPorFormato, ignoradosPorDuplicata: 0, falhas: 0, cadernosTocados: [], limiteExcedido: "arquivos" }`.
   Nenhum documento é criado (CA7). (Escolha: parar, não truncar — truncar
   importaria um subconjunto arbitrário e confundiria o usuário.)
4. `jaImportados = await caminhosOrigemImportados(baseDir)`.
5. Para cada `arquivo` (em ordem determinística):
   - Se `normalizarCaminhoOrigem(arquivo.caminhoAbsoluto)` ∈ `jaImportados`:
     `ignoradosPorDuplicata++`; continua.
   - `const { cadernoId, cadernoNome } = derivarCadernoComposto(nomePasta, arquivo.caminhoRelativo)`.
   - `try`:
     - `const extraido = await importarArquivo(arquivo.caminhoAbsoluto)` (reusa
       `files.ts`; devolve `texto`, `formato`, `semTextoExtraivel`, etc.).
     - `await criarDocumento({ nome: extraido.nome, formato: extraido.formato, texto: extraido.texto, cadernoId, cadernoNome, caminhoOrigem: arquivo.caminhoAbsoluto }, baseDir)`.
     - `importados++`; registra `cadernoNome` em um `Set`.
     - Também adiciona a chave normalizada a `jaImportados` **imediatamente após
       criar o documento**, para que duas entradas que normalizem igual no mesmo
       lote não dupliquem. Como a iteração segue a ordem de `caminhoRelativo`
       (`localeCompare`), em colisão de chave vence determinísticamente o
       primeiro nessa ordem; os seguintes caem em `ignoradosPorDuplicata` no topo
       do loop.
   - `catch (erro)`: `console.warn(...)`; `falhas++`; continua (NFR2).
     Observação: `ArquivoMuitoGrandeError` (acima de 50 MB) e qualquer erro de
     extração caem aqui — contam como falha, não abortam o lote.
6. `cadernosTocados = [...set].sort((a, b) => a.localeCompare(b))`. O `Set` só
   recebe `cadernoNome` **após** um `criarDocumento` bem-sucedido, então ele conta
   apenas os cadernos de documentos efetivamente criados. Consequência: reimportar
   uma pasta já importada resulta em `importados = 0` e `cadernosTocados = []` (só
   duplicatas) — por isso o `resumoLoteTexto` tem o caso dedicado (precedência 2)
   em vez de dizer "em 0 cadernos".
7. `limiteExcedido = varredura.profundidadePodada ? "profundidade" : null`.
   (O caso "arquivos" já retornou no passo 3.)

Decisão sobre `criarDocumento`: o `criarDocumento` de `storage.ts` recebe
`cadernoId` + `cadernoNome` já prontos (`NovoDocumento`), ao contrário do handler
`criarDocumento` do IPC que recebe só a grafia e chama `montarCaderno` lá dentro.
Como `derivarCadernoComposto` já devolve o par `{ cadernoId, cadernoNome }` via
`montarCaderno`, chamamos a função de storage diretamente — sem passar pelo
handler IPC de documento único.

**Nota para o planner (não assustar com `cadernoIdSugerido`):** `importarArquivo`
(`files.ts`) sempre computa e devolve `cadernoIdSugerido`/`cadernoNomeSugerido`
(sugestão derivada da pasta-mãe do arquivo). No lote, **essa sugestão é
ignorada** — o caderno vem exclusivamente de `derivarCadernoComposto` (caminho
relativo à pasta escolhida), que é a regra desta fatia. Reutilizar
`importarArquivo` inteiro (em vez de extrair uma função de leitura mais enxuta) é
**intencional**: menos superfície de código duplicada; o pequeno custo de computar
uma sugestão descartada é inócuo.

### Limites e guardas (números concretos)

Novas constantes em `src/shared/constants.ts`:

```ts
/**
 * Profundidade máxima de subpastas na varredura. A pasta escolhida tem
 * profundidade 0; descemos para uma subpasta só se a profundidade dela for
 * <= este teto. Logo a 1ª subpasta de profundidade 11 (com teto 10) é podada.
 */
export const PASTA_PROFUNDIDADE_MAXIMA = 10;
/** Máximo de arquivos suportados aceitos em um único lote de importação. */
export const PASTA_MAX_ARQUIVOS_LOTE = 500;
```

- **Tamanho por arquivo:** mantém `tamanhoMaximoArquivoBytes` (50 MB) via
  `importarArquivo`; um arquivo acima disso vira `falhas++` (não aborta o lote).
- **Profundidade = 10:** cobre com folga a estrutura
  `Matéria/Subárea/Teórica/...`; além disso, poda e sinaliza
  `limiteExcedido: "profundidade"` sem travar.
- **Arquivos por lote = 500:** acima disso, **parada segura** sem criar nada
  (CA7), com `limiteExcedido: "arquivos"`. 500 documentos JSON pequenos é um teto
  folgado para um app de estudos local, e evita um lote que levaria minutos e
  pareceria travado.

Esses tetos são defensivos (proteção contra árvores patológicas), não limites de
produto; ficam em `constants.ts` para ajuste fácil e teste.

### Contrato IPC

**`src/shared/types.ts`** — adicionar o tipo de resultado (reexportado onde
`ipc.ts` já importa de `./types`):

```ts
/** Resultado de uma importação de pasta em lote (contagens + cadernos). */
export interface ResultadoImportacaoPasta {
  importados: number;
  ignoradosPorFormato: number;
  ignoradosPorDuplicata: number;
  falhas: number;
  cadernosTocados: string[];
  limiteExcedido: "arquivos" | "profundidade" | null;
}
```

(O serviço `pasta.ts` importa esse tipo de `@shared/types` em vez de declarar o
seu — um único shape compartilhado entre main e renderer.)

**`src/shared/ipc.ts`** — novo canal e novo método na `AppApi`:

```ts
// em IPC_CHANNELS:
/** Abre um seletor de PASTA e importa em lote os arquivos suportados. */
importarPasta: "pasta:importar",
```

```ts
// na interface AppApi:
/**
 * Abre o seletor de pasta, varre recursivamente (até o teto de profundidade),
 * importa em lote os arquivos .txt/.md/.pdf (texto apenas, sem IA), pulando os
 * já importados (mesmo caminhoOrigem), e devolve o resumo do lote.
 * @returns o resultado do lote, ou `null` se o usuário cancelou a seleção.
 */
importarPasta: () => Promise<ResultadoImportacaoPasta | null>;
```

(Importar `ResultadoImportacaoPasta` no bloco `import type` existente de `ipc.ts`.)

**`src/main/preload.ts`** — expor o método:

```ts
importarPasta: () => ipcRenderer.invoke(IPC_CHANNELS.importarPasta),
```

**`src/main/ipc/index.ts`** — novo handler, no mesmo estilo de `importarArquivo`:

```ts
ipcMain.handle(
  IPC_CHANNELS.importarPasta,
  async (): Promise<ResultadoImportacaoPasta | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Importar pasta de estudo",
      properties: ["openDirectory"],
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }
    try {
      return await importarPasta(filePaths[0]);
    } catch (erro) {
      throw new Error(mensagemAmigavelPasta(erro));
    }
  },
);
```

`mensagemAmigavelPasta` é uma função nova no mesmo arquivo: por ora só devolve uma
genérica — "Não foi possível importar a pasta. Tente novamente." — porque falhas
individuais já são absorvidas no serviço e o resultado normal nunca rejeita. O
`try/catch` cobre o caso raro de erro inesperado na varredura da raiz.
**Diferente do fluxo de arquivo único** (cujo `mensagemAmigavel` mapeia
`FormatoNaoSuportadoError`/`ArquivoMuitoGrandeError`), o fluxo de pasta **não tem
erros tipados a mapear**: formato e tamanho viram contagens no resultado, não
exceções; a mensagem genérica cobre o único caminho de rejeição (a `readdir` da
raiz falhar). Não falta cobertura de casos tipados — eles simplesmente não
existem aqui.

### UI — `src/renderer/views/Importar.tsx`

Mudanças mínimas e aditivas (não mexer no fluxo de arquivo único):

- Botão novo "Escolher pasta" ao lado de "Escolher arquivo", no mesmo
  `importar-header`. Enquanto o lote roda, mostra "Importando pasta…" e desabilita
  ambos os botões (`carregandoPasta`).
- `escolherPasta()`:
  - `setErroPasta(null); setResultadoPasta(null); setCarregandoPasta(true)`.
  - `const r = await getApi().importarPasta()`.
  - `r === null` → cancelado, não faz nada.
  - senão `setResultadoPasta(r)` e, se `onLoteImportado` existir, chama para o App
    recarregar o Histórico (ver wiring abaixo).
  - `catch` → `setErroPasta(mensagemDeErro(e))`.
  - `finally` → `setCarregandoPasta(false)`.
- Exibir o resultado em um bloco pt-BR novo (`role="status"`), montado por uma
  função pura `resumoLoteTexto(r)`. **A ordem de precedência das cláusulas é
  explícita** (early returns, para nunca concatenar a frase base com a mensagem
  de limite "arquivos" nem produzir "em 0 cadernos" estranho):

  1. **Parada por teto de arquivos** — se `limiteExcedido === "arquivos"`:
     retornar **somente** a mensagem dedicada (early return, nenhuma frase base):
     `"A pasta tem mais de {PASTA_MAX_ARQUIVOS_LOTE} arquivos suportados. Nada foi importado. Escolha uma subpasta menor."`.
  2. **Nenhum arquivo novo (só duplicatas)** — senão, se `importados === 0 &&
     ignoradosPorDuplicata > 0`: retornar (early return) uma frase natural em vez
     de "em 0 cadernos":
     `"Nenhum arquivo novo: {ignoradosPorDuplicata} já importado(s) antes."`
     (acrescenta os sufixos de formato/falha/profundidade abaixo, se houver).
  3. **Caso geral** — senão, montar a frase base e os sufixos nesta ordem:
     - Base: `"{importados} arquivo(s) importado(s) em {N} caderno(s)"` onde
       `N = r.cadernosTocados.length`.
     - Se `ignoradosPorFormato > 0`: `"; {x} ignorado(s) por formato"`.
     - Se `ignoradosPorDuplicata > 0`: `"; {x} já importado(s) antes"`.
     - Se `falhas > 0`: `"; {x} com erro de leitura"`.
     - Se `limiteExcedido === "profundidade"` (sufixo, sempre por último):
       `" (algumas subpastas muito profundas foram ignoradas)"`.
  - O sufixo de `"profundidade"` também é anexado ao fim nos casos 2 e 3 (nunca
    no caso 1, que é early return puro).
  - Plurais tratados com uma mini-helper (`arquivo`/`arquivos`,
    `caderno`/`cadernos`), para o texto soar natural em pt-BR.
- Pluralização e montagem de `resumoLoteTexto` ficam em uma função **pura
  exportada** no próprio arquivo (ou em um util), para ser testável sem renderizar.

Estados novos no componente: `carregandoPasta: boolean`,
`resultadoPasta: ResultadoImportacaoPasta | null`, `erroPasta: string | null`.
Nenhum estado novo precisa de efeito.

### Wiring — `src/renderer/App.tsx`

O lote cria documentos direto no disco (não passa pelo estado de "documento
ativo"). O App só precisa recarregar o Histórico:

- Passar uma prop nova `onLoteImportado?: () => void` para `Importar`, que faz
  `setVersaoHistorico((v) => v + 1)` (mesmo mecanismo que `persistirArtefato` já
  usa para o Histórico recarregar).
- O lote **não** troca a aba automaticamente nem define um documento ativo: o
  usuário vê o resumo do lote na própria tela Importar e depois vai ao Histórico
  (agora populado) para abrir qualquer documento e gerar artefatos sob demanda.
  Isso respeita "geração sob demanda, por documento" e evita escolher
  arbitrariamente um documento ativo entre muitos.

**Ponto de montagem real (corrige a leitura ingênua de "passada sempre").** No
`App.tsx` atual, `Importar` só é renderizado quando `abaExibida === "importar"`;
não existe uma instância sempre-viva. Além disso, `onConfirmarCaderno` é passada
**condicionalmente** (`documento === null ? { onConfirmarCaderno } : {}`), o que
coloca `Importar` em dois modos: **importação** (`documento === null`, campo de
caderno editável) e **reabertura** (`documento !== null`, rótulo somente-leitura).
Portanto:

- `onLoteImportado` é passada à **instância de `Importar` montada na aba Importar,
  independentemente de haver `documento` ativo** — isto é, nos dois modos, ao
  contrário de `onConfirmarCaderno` (que é condicional a `documento === null`).
  Concretamente, no JSX de `App.tsx` a prop fica **fora** do spread condicional:

  ```tsx
  <Importar
    arquivo={arquivo}
    onImportado={aoImportar}
    onLoteImportado={() => setVersaoHistorico((v) => v + 1)}
    {...(documento === null
      ? { onConfirmarCaderno: (a, nome) => void aoConfirmarCaderno(a, nome) }
      : {})}
  />
  ```

- **"Escolher pasta" e o bloco de resumo do lote ficam visíveis nos dois modos**
  de `Importar` (importação e reabertura). O lote não depende de `arquivo` nem de
  `documento` ativo: ele cria documentos direto no disco e só sinaliza o App para
  recarregar o Histórico. Logo, o botão "Escolher pasta" e o `role="status"` do
  resumo do lote são renderizados **sempre**, no `importar-header`, sem gate por
  modo — diferente do fluxo de arquivo único, cujo campo "Confirmar caderno"
  continua gated por `ehFluxoImportacao` (`onConfirmarCaderno !== undefined`). O
  título da seção "Importar arquivo" pode permanecer; o botão de pasta é apenas
  um novo controle no mesmo cabeçalho.

### Tratamento de erros (concreto, por operação)

| Operação | Condição de falha | Recuperável? | O que o chamador recebe | Log |
|----------|-------------------|--------------|-------------------------|-----|
| `dialog.showOpenDialog` | usuário cancela | sim | `null` (sem erro) | não |
| `varrerPasta` – `readdir` da raiz | raiz ilegível/sumiu | fatal p/ o lote | handler rejeita → msg genérica pt-BR | `console.warn` no serviço + rethrow |
| `varrerPasta` – `readdir` de subpasta | permissão negada etc. | sim | subpasta pulada; lote segue | `console.warn` |
| guarda de quantidade | > `PASTA_MAX_ARQUIVOS_LOTE` | sim (parada segura) | resultado com `limiteExcedido: "arquivos"`, nada criado | não (estado normal) |
| guarda de profundidade | subpasta além do teto | sim | poda + `limiteExcedido: "profundidade"` | não |
| `importarArquivo` (por arquivo) | formato (não deve ocorrer, já filtrado), tamanho (>50 MB), PDF corrompido, I/O | sim | `falhas++`; arquivo não entra; lote segue | `console.warn` com o caminho |
| `criarDocumento` (por arquivo) | falha de escrita (disco cheio, permissão no userData) | sim | `falhas++`; lote segue | `console.warn` |
| duplicata | `caminhoOrigem` já importado | sim | `ignoradosPorDuplicata++`; não cria | não |
| PDF sem texto | `semTextoExtraivel` | sim | documento criado com texto vazio; conta como importado | não |

Princípio: **o resultado normal nunca rejeita o IPC** — todas as condições
esperadas viram contagens no `ResultadoImportacaoPasta`. Só um erro inesperado na
varredura da raiz vira rejeição (mensagem genérica pt-BR), exibida pela UI via o
`mensagemDeErro` já existente em `Importar.tsx`.

### Validação de entradas externas

- **Pasta escolhida (do dialog):** vem do SO; é tratada como caminho absoluto
  confiável do ponto de vista de formato. O `basename` (após remover barra final)
  pode degenerar na **raiz de drive**: no Windows `basename("C:\\")` retorna
  `"C:"` (não vazio) e no POSIX a raiz `/` retorna `""`. O passo 1 da orquestração
  trata ambos explicitamente (guard `/^[A-Za-z]:$/` ou vazio → `nomePasta = ""`),
  caindo no caderno `Geral`. Não há concatenação de shell (usa `fs`/`path`), sem
  risco de injeção.
- **Nomes de arquivo/subpasta:** usados só como texto (nome do caderno e do
  documento); passam por `montarCaderno`, que já normaliza/trunca
  (`CADERNO_NOME_MAX = 200`). Caracteres especiais no nome do caderno não são
  problema: o `cadernoId` é slugificado; o `cadernoNome` é só exibição.
- **Extensão:** comparada em caixa baixa contra `extensoesSuportadas` (fonte
  única), igual a `detectarFormato`.
- **Tamanho:** validado por arquivo dentro de `importarArquivo` (50 MB).
- **Quantidade/profundidade:** validadas na varredura/orquestração (tetos acima).

### Invariantes e quem os garante

- **"Cada documento pertence a um caderno coerente (`cadernoId`/`cadernoNome`)."**
  Garantido na derivação (`derivarCadernoComposto` → `montarCaderno`), antes de
  `criarDocumento`. A camada de domínio (`notebooks.ts`) é a dona da normalização;
  a persistência só grava o par pronto.
  - **Unicidade do caderno é por `cadernoId` normalizado.** O Histórico agrupa
    documentos por `cadernoId` (via `listarCadernos`), não por `cadernoNome`.
    Caminhos distintos que normalizam para o **mesmo** `cadernoId` (ex.: variações
    de acento/caixa/separador como `Cálculo — Teórica` e `calculo teorica`, ambos
    → `calculo-teorica`) **agrupam no mesmo caderno**, exibido com o `cadernoNome`
    do documento representante (o de maior `atualizadoEm`, conforme
    `listarCadernos`). Isso é comportamento existente herdado, e é aceitável nesta
    fatia. A colisão cruzada entre matérias que o roadmap pede
    (`Cálculo\Teórica` → `calculo-teorica` vs `Física\Teórica` → `fisica-teorica`)
    resolve corretamente em **ids distintos**, justamente porque a unicidade é por
    id.
- **"Sem duplicatas por caminho de origem."** Garantido na orquestração
  (`pasta.ts`), consultando `caminhosOrigemImportados` e atualizando o conjunto no
  próprio lote. A persistência não impõe unicidade (mantém `storage.ts` simples e
  retrocompatível); a fatia aceita essa escolha porque o único produtor de
  duplicatas é o lote.
- **"Somente leitura na pasta escolhida."** Garantido por construção no serviço de
  varredura (só `readdir`/`stat`/`readFile`), nunca escreve lá; as escritas são
  todas no `userData` via `storage.ts`.

### Testabilidade

Unitário (Vitest, sem Electron, em `tmpdir`/fixtures — nunca a pasta real):

- `tests/shared/notebooks.test.ts` (estender): `derivarCadernoComposto` para raiz,
  1 nível, vários níveis, acento/espaço, e a colisão
  `Cálculo/Teórica` vs `Física/Teórica` resolvida pelo composto (ids distintos).
- `tests/main/pasta.test.ts` (novo):
  - `varrerPasta` numa árvore de fixtures com `.txt/.md/.pdf` + extensões
    ignoradas + subpastas → confere `arquivos`, `ignoradosPorFormato`, ordem.
  - **poda de profundidade:** usar o parâmetro `limites` com um teto baixo (ex.:
    `{ profundidadeMaxima: 2 }`) sobre uma árvore de 3 níveis → confere
    `profundidadePodada = true` e que arquivos no 3º nível **não** entram, sem
    precisar de uma árvore de 11 níveis. Um caso com `profundidadeMaxima` folgado
    confere `profundidadePodada = false`.
  - `importarPasta` round-trip com `baseDir` temporário: contagens, cadernos
    tocados, documentos de fato criados em cadernos distintos.
  - regra de duplicata (entre lotes): rodar `importarPasta` duas vezes → segunda
    volta `importados: 0`, `ignoradosPorDuplicata: N`, `cadernosTocados: []`.
  - **dedup intra-lote determinística:** árvore com dois arquivos cujo caminho
    normaliza igual (ex.: no Windows, só diferença de caixa) → confere que vence o
    primeiro em ordem de `caminhoRelativo` e o outro conta em
    `ignoradosPorDuplicata`. (Em runners POSIX, simular via `normalizarCaminhoOrigem`
    diretamente, já que o FS é case-sensitive.)
  - **guarda de quantidade (parada segura, CA7):** chamar
    `importarPasta(pasta, baseDir, { maxArquivosLote: 2 })` sobre uma árvore com 3
    arquivos suportados → `importados: 0`, `limiteExcedido: "arquivos"`, e confere
    (via `carregarTodos`/`listarDocumentos` no `baseDir`) que **nenhum** documento
    foi criado. O parâmetro `limites` torna isso determinístico e barato — não é
    preciso gerar `PASTA_MAX_ARQUIVOS_LOTE + 1` arquivos reais.
  - **raiz de drive / raiz POSIX:** teste de unidade da derivação do passo 1
    (função pura de `nomePasta`) com entradas `C:\\` e `/` → `nomePasta = ""` e,
    para um arquivo direto na raiz, caderno `Geral`.
  - **subpasta ilegível não aborta o lote (obrigatório):** `vi.mock` de
    `node:fs/promises` fazendo `readdir` **lançar numa subpasta específica** (e
    funcionar na raiz e nas demais) → confere que o lote conclui, importa os
    arquivos das subpastas legíveis e não propaga erro. (A verificação da string
    exata do `console.warn` permanece opcional.)
  - PDF sem texto (reusa `tests/fixtures/sem-texto.pdf`) entra como documento.
- `tests/main/ipc-pasta.test.ts` (novo, espelha `ipc.test.ts`): com o
  `dialog`/serviço mockados, confirma que cancelar devolve `null`, que o handler
  repassa o resultado do serviço, e que um erro inesperado do serviço vira a
  mensagem genérica de `mensagemAmigavelPasta`.
- `tests/main/storage.test.ts` (estender): `caminhosOrigemImportados` com
  documentos com/sem `caminhoOrigem` e a normalização de caixa no Windows (via
  stub de `process.platform` ou testando `normalizarCaminhoOrigem` diretamente).
- Util de texto da UI (`resumoLoteTexto`): função pura testável — a precedência
  completa: (1) `limiteExcedido: "arquivos"` retorna só a mensagem de limite;
  (2) `importados === 0 && ignoradosPorDuplicata > 0` → "Nenhum arquivo novo…";
  (3) frase base com cada contador, singular/plural, e o sufixo de
  `"profundidade"`.

Integração: a varredura + persistência já é um teste de integração realista via
`importarPasta` com `baseDir` temporário (lê fixtures do disco, grava JSON em
tmpdir, relê). Não há IA no caminho, então nada de Ollama a mockar aqui.

O que **não** dá para unit-testar: o `dialog.showOpenDialog` real (interação do
SO) — fica mockado. A robustez de "subpasta ilegível" **é** testada (via mock de
`readdir`, acima); só a verificação do texto literal do `console.warn` fica como
best-effort opcional.

### Resumo das decisões (para o planner/coder)

> **Fonte das decisões:** `c:\Dev\tasks\roadmap-importar-pasta.md` (FORA do
> worktree) e `SPEC.md` (raiz do worktree). O roadmap **NÃO** está em
> `.worktrees\importpasta\tasks\` — ao reabri-lo para desempate, use o caminho
> absoluto completo acima, não procure dentro do worktree.

- **Regra de re-importação:** pular (não duplicar) todo arquivo cujo
  `caminhoOrigem` normalizado já exista em um documento salvo; detecção via novo
  `caminhosOrigemImportados()` sobre `carregarTodos`, normalizando separadores e
  (no Windows) caixa; o conjunto é atualizado dentro do próprio lote.
- **Limites:** 50 MB por arquivo (existente; excedente vira `falhas`);
  `PASTA_PROFUNDIDADE_MAXIMA = 10` (poda + sinaliza, não trava);
  `PASTA_MAX_ARQUIVOS_LOTE = 500` (parada segura, nada criado, sinaliza).
- **Derivação de caderno:** `derivarCadernoComposto(nomePastaEscolhida,
  caminhoRelativo)` em `notebooks.ts`; subpastas juntadas com `" — "`
  (`SEPARADOR_CADERNO`, declarado **em `notebooks.ts`**, não em `constants.ts`);
  arquivo na raiz → nome da pasta escolhida (com guard de raiz de drive →
  `Geral`); `montarCaderno` faz id/nome.
- **Testabilidade dos tetos:** `varrerPasta`/`importarPasta` aceitam um parâmetro
  opcional `limites?: { profundidadeMaxima?; maxArquivosLote? }`, omitido em
  produção (cai nos defaults de `constants.ts`) e usado nos testes para exercitar
  poda e parada com números baixos.
- **Shape do resultado do lote:** `ResultadoImportacaoPasta { importados,
  ignoradosPorFormato, ignoradosPorDuplicata, falhas, cadernosTocados: string[],
  limiteExcedido: "arquivos" | "profundidade" | null }`.
- **IPC:** canal `pasta:importar`; `AppApi.importarPasta(): Promise<Resultado...
  | null>`; handler no estilo de `importarArquivo`; serviço `pasta.ts`
  (varredura + orquestração) + `varrerPasta` + `caminhosOrigemImportados`.
- **UI/wiring:** botão "Escolher pasta" em `Importar.tsx`, resumo pt-BR via
  `resumoLoteTexto`; `App.tsx` passa `onLoteImportado` que incrementa
  `versaoHistorico`; o lote não define documento ativo nem troca de aba.

### Arquivos tocados

- `src/shared/constants.ts` — `PASTA_PROFUNDIDADE_MAXIMA`,
  `PASTA_MAX_ARQUIVOS_LOTE` (os tetos defensivos; **não** `SEPARADOR_CADERNO`).
- `src/shared/notebooks.ts` — `derivarCadernoComposto` + `SEPARADOR_CADERNO`
  (declarado aqui, junto de `CADERNO_*`, para não quebrar a regra de imports do
  módulo).
- `src/shared/types.ts` — `ResultadoImportacaoPasta`.
- `src/shared/ipc.ts` — canal `importarPasta` + método na `AppApi` + import do tipo.
- `src/main/preload.ts` — `importarPasta`.
- `src/main/services/pasta.ts` — **novo**: `varrerPasta`, `importarPasta`,
  interfaces internas.
- `src/main/services/storage.ts` — `caminhosOrigemImportados` +
  `normalizarCaminhoOrigem`.
- `src/main/ipc/index.ts` — handler `importarPasta` + `mensagemAmigavelPasta`.
- `src/renderer/views/Importar.tsx` — botão + estados + `resumoLoteTexto`.
- `src/renderer/App.tsx` — prop/wiring `onLoteImportado`.
- Testes: `tests/main/pasta.test.ts`, `tests/main/ipc-pasta.test.ts` (novos);
  estender `tests/shared/notebooks.test.ts`, `tests/main/storage.test.ts`,
  `tests/shared/constants.test.ts`; fixtures de árvore em
  `tests/fixtures/` (ex.: `tests/fixtures/arvore/...`) ou geradas em `tmpdir`.
```

---

## Respostas à revisão de design

Revisão lida: `tasks/design-review.json` (veredito `CHANGES_REQUESTED`) e o
documento `tasks/design-review.md`. Todos os 11 achados foram verificados contra
o código real do worktree (`App.tsx`, `notebooks.ts`, `constants.ts`,
`storage.ts`, `ipc.ts`, `ipc/index.ts`, `files.ts`, `Importar.tsx`) e estavam
corretos. Resposta a cada um:

1. **[HIGH] Wiring em `App.tsx` — "passada sempre" contradiz o código.**
   **Endereçado.** Seção "Wiring" reescrita: `Importar` só monta na aba Importar;
   `onLoteImportado` vai **fora** do spread condicional (passada nos dois modos,
   ao contrário de `onConfirmarCaderno`, condicional a `documento === null`);
   adicionado o JSX concreto e a regra de que "Escolher pasta" e o resumo do lote
   ficam visíveis nos modos importação **e** reabertura.

2. **[HIGH] `derivarCadernoComposto` importaria `constants.ts` em `notebooks.ts`.**
   **Endereçado.** `SEPARADOR_CADERNO` passa a ser declarado **dentro de
   `notebooks.ts`** (junto de `CADERNO_*`); removida a constante de `constants.ts`
   e a afirmação de novo import. Seção "Derivação", "Limites", "Resumo das
   decisões" e "Arquivos tocados" atualizadas; o renderer, se precisar, importa de
   `@shared/notebooks`.

3. **[MEDIUM] Caminho do roadmap inexistente no worktree.**
   **Endereçado.** Cabeçalho e "Resumo das decisões" apontam agora o caminho real
   `c:\Dev\tasks\roadmap-importar-pasta.md` (e `SPEC.md` na raiz do worktree).

4. **[MEDIUM] Ambiguidade de profundidade (off-by-one).**
   **Endereçado.** Fixada uma definição operacional única (profundidade = nº de
   subpastas entre a raiz, que é 0, e a pasta corrente; desce se ≤ teto; 1ª
   subpasta de profundidade 11 com teto 10 é a primeira podada). Algoritmo, CA8
   (com exemplo numérico) e o comentário da constante atualizados.

5. **[MEDIUM] Dedup intra-lote não determinística.**
   **Endereçado.** Declarado: em colisão de chave normalizada no mesmo lote vence
   o primeiro na ordem de `caminhoRelativo` (`localeCompare`); os demais contam em
   `ignoradosPorDuplicata`. Documentado na persistência e no passo 5, com teste
   obrigatório.

6. **[MEDIUM] Raiz de drive no Windows não cai em "Geral".**
   **Endereçado.** O passo 1 trata explicitamente o guard `/^[A-Za-z]:$/` (e vazio
   no POSIX) → `nomePasta = ""` → `Geral`; a derivação do nome saiu de
   `derivarCadernoComposto` para o passo 1. Teste de `C:\` e `/` adicionado.

7. **[MEDIUM] Precedência de `resumoLoteTexto` não especificada.**
   **Endereçado.** `resumoLoteTexto` reescrita como early returns ordenados:
   (1) `limiteExcedido: "arquivos"` → só a mensagem de limite; (2) só duplicatas;
   (3) frase base + sufixos, com `"profundidade"` sempre por último.

8. **[MEDIUM] Testabilidade do teto de arquivos.**
   **Endereçado (opção A).** Adicionado o parâmetro opcional
   `limites?: { profundidadeMaxima?; maxArquivosLote? }` a `varrerPasta`/
   `importarPasta`, omitido em produção. O teste de parada segura usa
   `maxArquivosLote: 2` sobre 3 arquivos — determinístico e barato, sem gerar 501
   arquivos.

9. **[NIT] Teste de subpasta ilegível era opcional.**
   **Endereçado.** O teste "subpasta ilegível não aborta o lote" (via `vi.mock` de
   `readdir`) passa a ser **obrigatório**; só a verificação do texto literal do
   `console.warn` fica best-effort.

10. **[NIT] `mensagemAmigavelPasta` sem erros tipados.**
    **Endereçado.** Nota adicionada: o fluxo de pasta não tem erros tipados a
    mapear (formato/tamanho viram contagens); a genérica cobre o único caminho de
    rejeição (raiz ilegível).

11. **[NIT] Frase "em N cadernos" estranha quando só houve duplicatas.**
    **Endereçado.** `resumoLoteTexto` ganha o caso dedicado "Nenhum arquivo novo:
    N já importado(s) antes." (precedência 2); passo 6 explica que reimportar dá
    `cadernosTocados: []`.

---

## Respostas à revisão de design — 2ª rodada

Revisão lida: `tasks/design-review.json` (veredito `CHANGES_REQUESTED`:
1 MEDIUM + 3 NIT) e `tasks/design-review.md`. Os quatro achados foram verificados
contra o código real do worktree e estavam corretos; nenhum exige mudança
arquitetural — todos são esclarecimentos de documentação, alinhados ao roadmap.
Resposta a cada um:

1. **[MEDIUM] Caminho do roadmap inconsistente/ambíguo dentro do documento.**
   **Endereçado.** Adicionada ao topo de "Resumo das decisões" uma linha única
   que fixa o caminho absoluto `c:\Dev\tasks\roadmap-importar-pasta.md` (FORA do
   worktree) e avisa explicitamente que o roadmap **não** está em
   `.worktrees\importpasta\tasks\`. O cabeçalho do documento também foi reforçado
   para dizer que toda menção a "o roadmap" se refere a esse caminho absoluto.
   Assim nenhuma menção solta sobra sem âncora.

2. **[NIT] `cadernoId` composto não é truncado (só o `cadernoNome`).**
   **Endereçado.** Nota acrescentada em "Derivação do caderno": `montarCaderno`
   trunca o `cadernoNome` (200), mas `normalizarNomeCaderno` não trunca o id; como
   o id só agrupa documentos e nunca vira nome de arquivo (docs são `<uuid>.json`),
   um id longo é aceitável, e a profundidade máxima (10) o limita na prática.

3. **[NIT] Colisão de `cadernoId` por normalização não discutida.**
   **Endereçado.** Nota acrescentada em "Invariantes": a unicidade do caderno é
   por `cadernoId` normalizado; caminhos que normalizam para o mesmo id agrupam no
   mesmo caderno com o `cadernoNome` do representante (herdado de `listarCadernos`,
   aceitável nesta fatia). Registrado também que a colisão cruzada entre matérias
   do roadmap resolve em ids distintos justamente por essa semântica de id.

4. **[NIT] Lote descarta a sugestão de caderno de `importarArquivo`.**
   **Endereçado.** Frase acrescentada em "Decisão sobre `criarDocumento`": o lote
   ignora `cadernoIdSugerido`/`cadernoNomeSugerido` (sugestão da pasta-mãe) e usa
   `derivarCadernoComposto`; reusar `importarArquivo` inteiro é intencional (menos
   superfície duplicada), e o custo da sugestão descartada é inócuo.
