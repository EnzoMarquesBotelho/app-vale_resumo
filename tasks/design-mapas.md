# Design — Fatia: Mapas Mentais

> Design técnico da fatia de **mapas mentais** (mapas mentais hierárquicos
> gerados por IA local + visualização navegável). Fonte da verdade:
> `tasks/roadmap-mapas-mentais.md`, `SPEC.md` e as convenções já consolidadas
> nas fatias anteriores (resumo, flashcards, exercícios, cadernos). As decisões
> de produto já estão confirmadas com o usuário; este documento define o **COMO**
> implementar, não o **SE**.
>
> Baseline a preservar: 170 testes passando, `npm run build` e `npm run lint`
> limpos. Nada aqui pode regredir isso.

## Visão geral

A partir do texto já importado de um documento, a IA local (Ollama) gera um
**mapa mental hierárquico** — um nó central (tema), ramos (subtemas) e
sub-ramos (detalhes), com rótulos curtos e profundidade de até ~4 níveis. O
resultado é mais um **artefato** do documento, salvo no mesmo arquivo JSON ao
lado de `resumo`, `flashcards` e `exercicios`, e reabrível pelo Histórico de dois
níveis. A geração reusa exatamente o mesmo padrão tolerante de flashcards/
exercícios: o modelo devolve JSON estruturado, um parser tolerante
(`extrairBlocoJson`) extrai o bloco, um validador de schema o normaliza, e há
**uma** re-tentativa corretiva antes de falhar com mensagem amigável. Textos
grandes reusam a estratégia de chunking do resumo.

A fatia segue a arquitetura em camadas já estabelecida e **não introduz padrões
novos**:

- **shared** (`src/shared`): tipos de domínio, prompts e contrato de IPC — puros,
  sem Node/Electron.
- **main** (`src/main`): serviço de geração/parsing, handler IPC resolvendo o
  modelo via `modeloParaGeracao()`, persistência em `storage.ts`.
- **renderer** (`src/renderer`): nova aba "Mapa mental" com a visualização em
  árvore, chamando o main **apenas** via `getApi()`.

Interação **nesta fatia**: navegável, **não editável** — expandir/colapsar
ramos, zoom (in/out) e pan (arrastar). Sem edição de nós. O usuário confirmou a
"opção A" (um visual clássico, bonito e confortável) mantendo a visualização
navegável. Edição manual, exportação e grafo livre estão **fora de escopo**.

Stack travada (não muda): Electron + React + TypeScript + Vite (electron-vite),
IPC tipado via `contextBridge`/preload, persistência JSON local em
`app.getPath('userData')`, Vitest com a chamada HTTP do Ollama mockada, IA local
via Ollama em `http://localhost:11434`.

---

## 1. Modelo de dados da árvore e o artefato compartilhado

### 1.1 Nó da árvore e artefato

Em `src/shared/types.ts`, adicionar (ao lado de `Resumo`/`Flashcard`/`Exercicio`):

```ts
/**
 * Um nó da árvore do mapa mental. A árvore é estritamente hierárquica
 * (cada nó tem no máximo um pai), espelhando a estrutura tema → ramos →
 * sub-ramos. `id` é único dentro de um mesmo mapa e serve de `key` estável
 * na UI e para controlar expandir/colapsar.
 */
export interface NoMapaMental {
  /** Id único do nó dentro do mapa (ex.: "n0", "n1", ...). */
  id: string;
  /** Rótulo curto exibido no nó (texto em português). */
  rotulo: string;
  /** Filhos diretos (ramos). Vazio em uma folha. */
  filhos: NoMapaMental[];
}

/**
 * Mapa mental gerado a partir de um documento. É a raiz da árvore mais os
 * metadados de geração, análogo a `Resumo`. O nó `raiz` é o tema central.
 */
export interface MapaMental {
  /** Documento de origem (preenchido ao salvar; "" até persistir). */
  documentoId: string;
  /** Nó central da árvore (o tema). */
  raiz: NoMapaMental;
  /** Data de geração em formato ISO 8601. */
  geradoEm: string;
}
```

Decisão de modelagem: a árvore é **aninhada** (`filhos: NoMapaMental[]`), não uma
lista plana de arestas. Isso é o que o modelo naturalmente produz em JSON,
elimina a classe inteira de bugs de "aresta órfã/ciclo" na representação (um nó
só pode aparecer uma vez na árvore depois da validação) e casa com o render
recursivo. Multi-pai/grafo livre está fora de escopo, então não há necessidade
de uma estrutura de arestas separada.

Os `id`s são **atribuídos pelo serviço de parsing no main** (ex.: `n0` para a
raiz, depois numeração por ordem de visita), **não** pedidos ao modelo — o modelo
é ruim em manter ids únicos, e a UI só precisa de ids estáveis dentro de uma
sessão de visualização. Isso mantém o prompt simples (só rótulos + filhos) e
torna o schema de entrada da IA menor e mais fácil de acertar.

### 1.2 Encaixe no `DocumentoSalvo`

Em `DocumentoSalvo` e `ResumoDocumentoSalvo` (ambos em `types.ts`), seguir
exatamente o padrão dos outros artefatos:

```ts
// Em DocumentoSalvo:
  /** Mapa mental gerado, se houver. */
  mapaMental?: MapaMental;

// Em ResumoDocumentoSalvo:
  /** `true` se o documento tem um mapa mental salvo. */
  temMapaMental: boolean;
```

Artefato ausente continua sendo `undefined` (spread condicional já usado em
`storage.ts`); nada é gravado como `mapaMental: undefined`. Documentos antigos
sem a chave simplesmente não têm mapa mental — nenhuma migração é necessária
(diferente da fatia de cadernos, este campo é puramente aditivo e opcional).

### 1.2.1 Imports de tipo a adicionar (checklist exato)

Os tsconfigs têm `verbatimModuleSyntax: true` e `noUnusedLocals: true`, então
cada arquivo que passa a referenciar os novos tipos precisa importá-los como
`import type`, e sem sobras. Os arquivos de interesse hoje importam listas
explícitas de `@shared/types` (verificado no worktree); os novos tipos entram
nessas listas, em ordem alfabética como as já existentes:

| Arquivo | Import de tipo a adicionar | Usado por |
|---|---|---|
| `src/shared/ipc.ts` | `MapaMental`, `NoMapaMental` (na lista `from "./types"`) | assinaturas `gerarMapaMental` (→ `NoMapaMental`) e `salvarMapaMental` (param `MapaMental`) em `AppApi` |
| `src/main/services/storage.ts` | `MapaMental` (na lista `from "@shared/types"`) | param de `salvarMapaMental(id, mapaMental: MapaMental, baseDir?)` |
| `src/main/ipc/index.ts` | `MapaMental`, `NoMapaMental` (na lista `from "@shared/types"`) | tipo de retorno do handler `gerarMapaMental` (`NoMapaMental`) e o `mapa: MapaMental` no handler `salvarMapaMental` |
| `src/main/services/mapa.ts` (novo) | `MapaMental`, `NoMapaMental` | tipos de domínio do serviço |
| `src/main/preload.ts` | nenhum novo import de tipo | os métodos novos são tipados via `AppApi` já importado |
| `src/renderer/views/MapaMental.tsx` (novo) | `MapaMental`, `NoMapaMental`; `ArquivoImportado` | props e estado |

`DocumentoSalvo` já é importado em `ipc.ts`, `storage.ts` e `ipc/index.ts` — não
precisa ser readicionado; só `MapaMental`/`NoMapaMental` são novos nessas listas.

### 1.3 Limites estruturais (constantes compartilhadas)

Em `src/shared/constants.ts`, adicionar os tetos que o validador e o prompt
compartilham (fonte única da verdade, como `QUANTIDADE_*`):

```ts
/** Profundidade máxima da árvore do mapa mental (raiz = nível 1). */
export const MAPA_PROFUNDIDADE_MAXIMA = 4;
/** Número máximo de nós no mapa inteiro (defesa contra respostas gigantes). */
export const MAPA_MAX_NOS = 200;
/** Comprimento máximo do rótulo de um nó (caracteres); truncado com reticência
 * na fronteira de palavra ao validar (ver 2.3). */
export const MAPA_ROTULO_MAX = 120;
/** Máximo de filhos diretos por nó (poda defensiva de leques enormes). */
export const MAPA_MAX_FILHOS_POR_NO = 12;
```

Esses valores foram escolhidos para o caso de uso de material de faculdade: 4
níveis e ~200 nós cabem um mapa rico sem virar sopa visual; 120 caracteres
tolera um rótulo "frase curta" sem permitir que o modelo despeje um parágrafo;
12 filhos por nó evita leques ilegíveis. São tetos de **poda defensiva**, não
alvos — o prompt pede rótulos curtos e ~4 níveis.

---

## 2. Geração + parsing + validação de schema + re-tentativa corretiva

Novo serviço `src/main/services/mapa.ts`, espelhando `parse.ts`. A chamada ao
modelo é injetável (`gerar?: GerarTexto`) exatamente como nos outros serviços,
para os testes mockarem o Ollama.

### 2.1 Prompts (`src/shared/prompts.ts`)

Adicionar dois builders, no mesmo estilo dos existentes:

```ts
export function montarPromptMapaMental(texto: string): string;
export function montarPromptCorrigirMapaMental(respostaAnterior: string): string;
```

`montarPromptMapaMental` instrui (em português) a devolver **apenas** JSON no
formato aninhado, com o tema central na raiz, rótulos curtos e profundidade de
até `MAPA_PROFUNDIDADE_MAXIMA` níveis. Formato pedido ao modelo (sem ids — o
main os atribui):

```json
{ "raiz": { "rotulo": "Tema central",
            "filhos": [ { "rotulo": "Ramo", "filhos": [] } ] } }
```

O prompt declara explicitamente: rótulos curtos (poucas palavras), no máximo ~4
níveis, sem comentários nem texto fora do JSON. `montarPromptCorrigirMapaMental`
reapresenta o formato e a resposta anterior pedindo só o JSON corrigido —
idêntico em espírito a `montarPromptCorrigirFlashcards`.

### 2.2 Parsing tolerante + validação de schema

Reusar `extrairBlocoJson` de `parse.ts` (exportá-la já está; o novo módulo a
importa). Decisão: **reusar, não duplicar** o extrator — ele já é testado e
tolerante a cercas ```json``` e texto ao redor. A validação específica do mapa
mora em `mapa.ts`:

```ts
export function parseMapaMental(resposta: string): NoMapaMental | null;
```

Fluxo de `parseMapaMental` (função pura, sem efeitos — fácil de testar em
isolamento):

1. `extrairBlocoJson(resposta)`; se `null`, devolve `null`.
2. `JSON.parse` dentro de `try/catch`; falha → `null`.
3. Normaliza a forma de entrada: aceita `{ "raiz": {...} }` **ou** um nó solto
   `{ "rotulo": ..., "filhos": [...] }` na raiz (tolerância, como flashcards
   aceita objeto ou array direto). Regra de normalização, explícita:
   - Se o topo for um **objeto não-nulo** com a chave `raiz`, o candidato à raiz
     é `valor.raiz`; senão o candidato é o próprio topo.
   - Se o candidato à raiz **não for um objeto não-nulo** (ex.: `{"raiz": "texto"}`,
     `{"raiz": null}`, `{"raiz": 42}`, um topo que é `array`, `string`, `number`,
     `null` ou `undefined`), trata como **inválido → devolve `null`** (dispara a
     re-tentativa corretiva). Não tentamos "resgatar" um array do topo escolhendo
     um elemento: um mapa tem uma raiz única.
   Só um candidato que seja objeto não-nulo segue para a sanitização recursiva do
   passo 4; o passo 5 ainda o reprova se, após sanear, faltar rótulo válido.
4. **Sanitiza e valida recursivamente** a árvore (ver 2.3), atribuindo ids.
5. Se, após a sanitização, a raiz não tiver rótulo válido, devolve `null`
   (dispara a re-tentativa corretiva no orquestrador).

### 2.3 Regras de validação/sanitização (recursivas)

A sanitização é **tolerante por padrão** (descarta o inválido e mantém o resto),
igual ao filtro de flashcards/exercícios inválidos, exceto quando o resultado
fica vazio demais para ser um mapa. Para cada nó, em ordem:

- **Rótulo**: precisa ser `string` com `trim().length > 0`. Rótulo ausente/
  vazio/não-string → o nó é **descartado** (e com ele sua subárvore). `rotulo`
  é aparado (`trim`) e, se exceder `MAPA_ROTULO_MAX`, **truncado com reticência**:
  corta no limite, recua até a **última fronteira de palavra** (último espaço)
  quando houver uma dentro do limite, apara o espaço e anexa `…`. Se não houver
  espaço no trecho (uma única palavra longa), corta em `MAPA_ROTULO_MAX - 1` e
  anexa `…` mesmo assim. Assim o nó nunca exibe um fragmento sem sinal de corte: o
  `…` comunica que houve corte (o `<title>` SVG repete este rótulo saneado — ver
  4.4). O comprimento final (incluindo `…`) nunca passa de `MAPA_ROTULO_MAX`.
- **Filhos**: se `filhos` não for array, trata como `[]`. Cada filho é
  sanitizado recursivamente; filhos inválidos são descartados.
- **Profundidade**: nós abaixo de `MAPA_PROFUNDIDADE_MAXIMA` são **podados**
  (os filhos excedentes são descartados, o nó-pai vira folha). A raiz é o
  nível 1.
- **Leque**: se um nó tiver mais de `MAPA_MAX_FILHOS_POR_NO` filhos **válidos**,
  mantém os primeiros `MAPA_MAX_FILHOS_POR_NO` e descarta o excedente.
- **Tamanho total**: a travessia conta nós; ao atingir `MAPA_MAX_NOS`, para de
  aceitar novos nós (poda o restante). Garante terminação mesmo com entrada
  patológica.
- **Ciclos / nós repetidos**: como a entrada é uma árvore aninhada em JSON, um
  JSON válido **não pode** referenciar o mesmo objeto duas vezes (não há
  ponteiros). Mesmo assim, a travessia é estritamente **top-down com um teto de
  profundidade e um teto de nós**, então qualquer auto-aninhamento acidental é
  cortado pela poda de profundidade/tamanho — não há recursão sem fundo. A
  atribuição de ids é sequencial na travessia, garantindo unicidade por
  construção (nenhum id vem do modelo).

Os ids são atribuídos **após** a poda, na travessia em pré-ordem: `n0` para a
raiz, incrementando. Assim os ids são densos e estáveis para a sessão de
visualização.

### 2.4 Orquestração + contrato de re-tentativa

```ts
export interface GerarMapaMentalParams {
  texto: string;
  gerar?: GerarTexto; // default: generate do ollama.js
  // Default: tamanhoMaximoChunkCaracteres. Rege o gate de chunking do mapa E é
  // repassado a gerarResumo, para que o mesmo limite valha nas duas etapas.
  tamanhoChunk?: number;
}
export async function gerarMapaMental(
  params: GerarMapaMentalParams,
): Promise<MapaMental>;
```

Fluxo (idêntico em espírito a `gerarFlashcards`, com o passo de chunking do
resumo quando necessário):

1. Se `texto.trim()` vazio → lança `SemTextoParaMapaMentalError`.
2. **Preparo do texto grande**: se o texto couber em um chunk
   (`dividirEmChunks(texto, tamanhoChunk).length <= 1`), usa o texto direto. Se
   for grande, reusa a estratégia do resumo: resume o conteúdo em um texto-base
   coerente **antes** de pedir o mapa. Decisão: para o mapa, um texto gigante é
   primeiro condensado via
   `gerarResumo({ texto, modo: "longo", gerar, tamanhoChunk })` — **o mesmo
   `tamanhoChunk` do mapa é repassado explicitamente ao resumo** — e o mapa é
   gerado sobre esse resumo. Motivo: um mapa mental é por natureza uma síntese;
   pedir a árvore sobre o material inteiro estouraria a janela de contexto, e um
   map→reduce de árvores (fundir sub-árvores) é complexo e sujeito a erro.
   Condensar primeiro reusa código já testado e dá um mapa coerente de uma só
   árvore. Esse acoplamento é explícito: `mapa.ts` importa `gerarResumo` de
   `resumo.ts`.

   **Contrato fixado (resolve ambiguidade do limite):**
   - **Um único `tamanhoChunk` rege as duas etapas.** `GerarMapaMentalParams.tamanhoChunk`
     (default `tamanhoMaximoChunkCaracteres`) é usado tanto no gate
     `dividirEmChunks(texto, tamanhoChunk)` do mapa quanto repassado a
     `gerarResumo`. Em teste, injetar um `tamanhoChunk` pequeno força o caminho
     "grande" **e** faz o resumo chunkar com o mesmo limite, tornando a
     sequência de prompts determinística: para N chunks, `gerar` é chamado N
     vezes (map) + 1 vez (reduce) para o resumo, e **1 vez** para o prompt do
     mapa (ou 2, se a 1ª resposta do mapa for malformada e disparar a
     re-tentativa corretiva).
   - **O texto-base do mapa é o resumo como está — passo único, sem re-chunk.**
     Após condensar, o resumo retornado por `gerarResumo` vira o argumento de
     `montarPromptMapaMental` **inteiro**, sem passar de novo pelo gate de
     chunking. Isso herda exatamente o mesmo limite conhecido já aceito e
     documentado em `resumo.ts` (o "reduce de passo único": para dezenas de
     chunks o prompt de combinação pode crescer, mas é suficiente para material
     de faculdade típico). Não re-chuncamos o resumo: um map→reduce de árvores
     está fora de escopo e seria complexidade nova. Escolhemos esta regra única
     e explícita em vez de deixar o caminho indefinido.
3. **1ª tentativa**: `gerar(montarPromptMapaMental(base))` →
   `parseMapaMental(resposta)`. Se `≠ null`, monta e devolve o `MapaMental`.
4. **2ª tentativa (corretiva, única)**:
   `gerar(montarPromptCorrigirMapaMental(primeira))` → `parseMapaMental`. Se
   `≠ null`, devolve.
5. Se ainda `null` → lança `MapaMentalInvalidoError`.

`gerarMapaMental` devolve `{ documentoId: "", raiz, geradoEm: new Date().toISOString() }`;
`documentoId` é preenchido ao persistir (mesma convenção de `Resumo` no
renderer, onde `documentoId` é setado no `onGerado`).

### 2.5 Erros (classes com `code` estável)

Em `mapa.ts`, no mesmo molde dos erros existentes:

| Erro | `code` | Condição | Recuperável? | Mensagem ao usuário |
|---|---|---|---|---|
| `SemTextoParaMapaMentalError` | `SEM_TEXTO_PARA_MAPA_MENTAL` | `texto` vazio após `trim` | Sim (importar conteúdo) | "Não há texto para gerar o mapa mental. Importe um arquivo com conteúdo." |
| `MapaMentalInvalidoError` | `MAPA_MENTAL_INVALIDO` | parsing falhou mesmo após a re-tentativa | Sim (gerar de novo) | "A IA não devolveu um mapa mental em um formato válido. Tente gerar novamente." |
| `OllamaIndisponivelError` (propagado de `ollama.ts`) | `OLLAMA_INDISPONIVEL` | Ollama offline | Sim (subir o Ollama) | mensagem própria do erro |

Erros inesperados (ex.: falha de rede não mapeada) caem na mensagem genérica do
handler (ver 3.1). Nenhum erro de geração derruba o processo: todos viram
rejeição do IPC com frase pronta para o usuário.

**Logging**: seguir o padrão atual do projeto — os serviços **não** logam
rotina; falhas esperadas viram exceções tipadas tratadas no handler. Só o nível
de persistência best-effort loga (`console.warn`) quando pula um arquivo
corrompido (padrão de `migrarCadernos`), e aqui não há migração. Não adicionar
logging novo no caminho de geração (consistência com `parse.ts`/`resumo.ts`).

---

## 3. IPC, resolução de modelo, persistência, preload e API do renderer

### 3.1 Canal e handler (`src/shared/ipc.ts` + `src/main/ipc/index.ts`)

Adicionar o canal e os canais de persistência ao `IPC_CHANNELS`:

```ts
/** Gera o mapa mental (árvore hierárquica) a partir de um texto. */
gerarMapaMental: "mapamental:gerar",
/** Salva o mapa mental gerado em um documento existente. */
salvarMapaMental: "documento:salvar-mapa-mental",
```

Assinaturas em `AppApi` (contrato tipado):

```ts
/**
 * Gera um mapa mental (árvore tema → ramos → sub-ramos) a partir do `texto`.
 * Parsing tolerante com uma re-tentativa corretiva, como flashcards/exercícios.
 * @returns a árvore raiz do mapa mental gerado.
 */
gerarMapaMental: (texto: string) => Promise<NoMapaMental>;
/** Salva o mapa mental gerado no documento `id` e devolve o registro. */
salvarMapaMental: (id: string, mapa: MapaMental) => Promise<DocumentoSalvo>;
```

Decisão de forma de retorno: `gerarMapaMental` resolve com o **`NoMapaMental`
raiz** (não o `MapaMental` inteiro), espelhando `gerarFlashcards` que devolve o
array de dados e deixa o renderer montar o artefato com `documentoId`/`geradoEm`
ao salvar. Isso mantém o renderer no controle da persistência, igual às telas
existentes.

**Contrato de nulidade (explícito):** o retorno é **não-nulo** —
`Promise<NoMapaMental>`, nunca `NoMapaMental | null`. O serviço `gerarMapaMental`
**sempre lança** em falha (`SemTextoParaMapaMentalError` para texto vazio,
`MapaMentalInvalidoError` quando o parsing falha mesmo após a re-tentativa
corretiva, `OllamaIndisponivelError` propagado) e **não** tem caminho de sucesso
que resolva com `null`/`undefined`. O handler devolve `mapa.raiz`, que é sempre
uma raiz válida. Portanto não há caso nulo a tratar na view: o guard `?? null` /
`!= null` no fluxo `gerar()` (seção 4.3) é **apenas defesa simétrica** com as
telas existentes (`Resumo.tsx` faz `resultado ?? null` da mesma forma) e **nunca
dispara na prática**. View, `AppApi` e serviço compartilham este único contrato;
um implementador **não** deve alterar o tipo para `NoMapaMental | null`.

Handler em `registerIpcHandlers`, idêntico ao de flashcards:

```ts
ipcMain.handle(
  IPC_CHANNELS.gerarMapaMental,
  async (_event, texto: string): Promise<NoMapaMental> => {
    try {
      const model = await modeloParaGeracao(); // evita "model not found"
      const mapa = await gerarMapaMental({
        texto,
        gerar: (prompt) => generate({ prompt, model }),
      });
      return mapa.raiz;
    } catch (erro) {
      throw new Error(mensagemAmigavelMapaMental(erro));
    }
  },
);
```

E `salvarMapaMental` espelhando `salvarResumo` (chama `storage.salvarMapaMental`
e devolve o `DocumentoSalvo` atualizado, convertendo erro conhecido via
`mensagemAmigavelPersistencia`).

Nova função `mensagemAmigavelMapaMental(erro)` no mesmo arquivo, no padrão das
irmãs: trata `OllamaIndisponivelError`, `SemTextoParaMapaMentalError`,
`MapaMentalInvalidoError` (cada um devolve `erro.message`), e cai em "Não foi
possível gerar o mapa mental. Tente novamente." para o resto.

**Pontos críticos obrigatórios**:

- A resolução do modelo passa **sempre** por `modeloParaGeracao()` — nunca manda
  o modelo selecionado cru. Isso garante que nunca se envie um modelo não
  instalado (reconcilia para uma variante da mesma família ou o primeiro
  instalado).
- O handler **não** valida o `texto` de entrada além do que o serviço já faz
  (`SemTextoParaMapaMentalError` para vazio). O renderer só habilita a geração
  quando `temTexto` é verdadeiro, mas a validação canônica (invariante "não gerar
  sobre texto vazio") é do **serviço** `mapa.ts`, não da UI — a UI só antecipa o
  feedback. Mesma divisão de responsabilidade documentada em `Exercicios.tsx`
  (clamp de quantidade).

### 3.2 Persistência (`src/main/services/storage.ts`)

Adicionar, idêntico a `salvarResumo`:

```ts
export async function salvarMapaMental(
  id: string,
  mapaMental: MapaMental,
  baseDir?: string,
): Promise<DocumentoSalvo> {
  const documento = await carregarDocumento(id, baseDir);
  return salvarDocumento({ ...documento, mapaMental }, baseDir);
}
```

E incluir `temMapaMental` nos `ResumoDocumentoSalvo` que `listarDocumentos`
produz:

```ts
temMapaMental: documento.mapaMental !== undefined,
```

Decisão (alinha com os irmãos): o critério é **somente** `!== undefined`,
idêntico a `temResumo`. O mapa mental, como o resumo, é um **objeto único** (não
um array), então não cabe a checagem `.length > 0` que `temFlashcards`/
`temExercicios` usam para arrays vazios. E não checamos `.raiz !== undefined`:
`gerarMapaMental` nunca resolve sem uma raiz válida (seção 2.4) e
`salvarMapaMental` só grava o `MapaMental` gerado, então um `mapaMental` presente
sempre tem `raiz` — a checagem extra seria redundante e ruído, além de divergir
do critério de `temResumo` sem motivo. A invariante "mapa salvo ⇒ raiz válida" é
garantida na **camada de geração/serviço**, não aqui.

`DocumentoNaoEncontradoError` já cobre o caso de id ausente (propagado via
`mensagemAmigavelPersistencia`). A escrita atômica (`.tmp` + `rename`) e o
spread condicional já existentes cobrem o novo campo sem mudança adicional. Não
há migração: `mapaMental` ausente em documentos antigos é o estado natural.

### 3.3 Preload (`src/main/preload.ts`)

Adicionar os dois métodos ao objeto `api`, no mesmo estilo (sem lógica, só
`ipcRenderer.invoke`):

```ts
gerarMapaMental: (texto) =>
  ipcRenderer.invoke(IPC_CHANNELS.gerarMapaMental, texto),
salvarMapaMental: (id, mapa) =>
  ipcRenderer.invoke(IPC_CHANNELS.salvarMapaMental, id, mapa),
```

### 3.4 API do renderer (`src/renderer/api.ts` + chamadas)

Nenhuma mudança em `api.ts` em si: `getApi()` já devolve `PreloadApi` tipado, que
agora inclui os novos métodos via `AppApi`. **Todas** as chamadas da nova view
usam `getApi().gerarMapaMental(...)` / `getApi().salvarMapaMental(...)` — nunca
`window.api?.` com optional chaining. Uma ponte ausente vira o erro visível
`ERRO_API_INDISPONIVEL`, capturado pelo `catch` da view (mesmo padrão das outras
telas).

---

## 4. Visualização — decisão de abordagem e implementação

### 4.1 Decisão: render SVG próprio (sem nova dependência)

Avaliei duas opções:

- **(A) Biblioteca de grafo (ex.: `reactflow`/`react-flow`)**: traz canvas com
  zoom/pan/arrastar prontos. Contras decisivos aqui: (1) é pesada e orientada a
  **grafos editáveis com handles e arestas arbitrárias** — exatamente o que está
  **fora de escopo** desta fatia (navegável, não editável, árvore, não grafo);
  (2) adiciona uma dependência de runtime grande ao app offline, com seu próprio
  CSS e tema, que teria de ser forçado a casar com os tokens escuros de
  `styles.css`; (3) nenhum teste automatizado cobre UI neste projeto (sem harness
  de componente), então o "ganho de produtividade" da lib não é verificável pela
  nossa suíte e vira risco de regressão de bundle/estilo.
- **(B) Render SVG próprio**: um layout de árvore determinístico desenhado em
  `<svg>` com React, usando os tokens de design existentes. Prós: zero
  dependências novas (preserva o `package.json` enxuto e o requisito offline sem
  justificar peso), controle total do visual "clássico e bonito" pedido
  (opção A), e o layout de árvore hierárquica é um algoritmo pequeno e
  determinístico — testável como função pura se quisermos.

**Decisão: (B), render SVG próprio.** Ela atende a todos os requisitos
confirmados (árvore hierárquica, navegável, visual clássico consistente com os
tokens), não adiciona dependência (nada a fixar/justificar), e evita puxar uma
lib de grafo editável para fazer o oposto do que ela foi feita. Se uma fatia
futura introduzir **edição** de nós (arrastar/reposicionar/persistir), aí sim
vale reavaliar uma lib dedicada — mas isso é fora de escopo agora.

Consequência: **nenhuma dependência nova** é adicionada ao `package.json`. O
`package-lock.json` e a contagem de dependências ficam inalterados.

### 4.2 Layout da árvore (algoritmo)

Função pura de layout em **`src/shared/mapaLayout.ts`**, separada do componente
para poder ser testada e para manter o componente focado em render. Decisão de
localização: fica em `src/shared` (não em `src/renderer`) porque `calcularLayout`
é **lógica pura, sem DOM nem React** — pertence ao mesmo lar de `notebooks.ts`/
`prompts.ts` (lógica compartilhada e trivialmente testável no vitest `node`). O
`tsconfig.web.json` inclui `src/renderer/**` e `tests/**`, então o teste importa
de `@shared/mapaLayout` sem configuração nova. A assinatura:

```ts
export interface NoPosicionado {
  id: string;
  rotulo: string;
  nivel: number;      // 1 = raiz
  x: number; y: number;
  filhosIds: string[];
}
export interface LayoutMapa {
  nos: NoPosicionado[];
  arestas: { de: string; para: string }[];
  largura: number; alturaConteudo: number;
}
export function calcularLayout(
  raiz: NoMapaMental,
  expandidos: Set<string>, // ids com filhos visíveis
): LayoutMapa;
```

Decisão de orientação: **layout horizontal** (raiz à esquerda, ramos crescendo
para a direita, um nível por coluna). Motivo: rótulos são textos em português
(largura variável) e leem melhor na horizontal; a altura cresce com o número de
folhas e o container rola na vertical — comportamento previsível e simples. Um
layout radial seria mais "chamativo" mas é mais difícil de posicionar rótulos
legíveis e de testar; o horizontal entrega o visual clássico pedido sem essa
complexidade.

Algoritmo (clássico "tidy tree" simplificado):
- `x` por nível: `x = (nivel - 1) * (larguraColuna)`.
- `y` das folhas: distribuídas sequencialmente (um passo fixo `alturaLinha` por
  folha visível); `y` de um nó interno = média dos `y` dos seus filhos visíveis.
- Só nós **visíveis** entram no layout: um nó colapsado não contribui com os
  filhos (eles saem do cálculo), então colapsar reflui o layout.
- As arestas são curvas suaves (path SVG com curva de Bézier cúbica entre o
  centro-direita do pai e o centro-esquerda do filho), para o "linhas suaves"
  pedido.

Isso é determinístico e **testável em isolamento** (dado uma árvore e um
conjunto de expandidos, as posições são função pura das entradas) — o único
pedaço da UI que vale cobrir por teste; ver seção 6.

### 4.3 Componente da view (`src/renderer/views/MapaMental.tsx`)

Props no mesmo molde das outras telas (`arquivo`, `*Salvo`, `onGerado`):

```ts
interface MapaMentalProps {
  arquivo: ArquivoImportado | null;
  mapaMentalSalvo?: MapaMental | null;
  onGerado?: (mapa: MapaMental) => void;
}
```

Estado local (inicializado do salvo, remontado por `key` por documento como as
outras views):
- `raiz: NoMapaMental | null` (do `mapaMentalSalvo?.raiz` ou do resultado gerado).
- `gerando: boolean`, `erro: string | null`.
- `expandidos: Set<string>` — ids com filhos visíveis. Default ao carregar: a
  raiz e seus filhos diretos expandidos (os níveis mais profundos começam
  colapsados, para o mapa abrir legível). Clicar num nó com filhos alterna seu
  id no conjunto.
- `zoom: number` (ex.: 0.5–2, passo 0.1), `pan: { x, y }`.

Interações (navegável, **sem edição**):
- **Expandir/colapsar**: clique no nó alterna `expandidos`. Um indicador visual
  (ex.: `+`/`−` ou contador de filhos ocultos) mostra que há subárvore.
- **Zoom**: botões `＋`/`－` e `Redefinir`, aplicando `transform: scale()` ao
  grupo SVG; opcionalmente `wheel` com `ctrl` (sem capturar o scroll normal).
- **Pan**: arrastar o fundo (mousedown no SVG + mousemove) desloca `pan`. O
  cursor vira `grab`/`grabbing`. Arrastar **não** move nós (sem reposicionar —
  isso é edição, fora de escopo).

Fluxo de geração (idêntico às telas irmãs):
```ts
async function gerar() {
  if (!temTexto) return;
  setErro(null); setRaiz(null); setGerando(true);
  try {
    const raizGerada = await getApi().gerarMapaMental(arquivo.texto);
    setRaiz(raizGerada ?? null);
    if (raizGerada != null && onGerado) {
      onGerado({ documentoId: "", raiz: raizGerada,
                 geradoEm: new Date().toISOString() });
    }
  } catch (e) { setErro(mensagemDeErro(e)); }
  finally { setGerando(false); }
}
```
Com o mesmo helper local `mensagemDeErro` que as outras views usam (remove o
prefixo `Error:` do IPC). O `temTexto` segue a mesma derivação das outras telas.
O `raizGerada ?? null` / `raizGerada != null` acima é **defesa simétrica** com as
telas irmãs: pelo contrato de 3.1 `gerarMapaMental` nunca resolve com nulo (só
lança), então esses guards nunca disparam — mantê-los só preserva o mesmo molde
de `Resumo.tsx` e não implica um caminho de sucesso nulo.

### 4.4 Visual (consistência com os tokens de `styles.css`)

Novas regras em `src/renderer/styles.css`, usando **apenas** os custom
properties existentes (nada de cores hard-coded fora do padrão):

- Container `.mapa` com `.mapa-controles` (botões de zoom/redefinir, reusando o
  estilo de `button` global) e `.mapa-canvas` (o `<svg>`, com `overflow: hidden`,
  `cursor: grab`, borda `--cor-borda`, fundo `--cor-superficie-2`, raio
  `--raio-md`).
- Cor dos nós por **profundidade** (requisito "cores/contraste por nível"): a
  raiz usa `--cor-primaria` (destaque de marca); nível 2 `--cor-superficie` com
  borda `--cor-borda-forte`; níveis 3–4 `--cor-superficie-2` com texto
  `--cor-texto-suave`. Isso cria a hierarquia visual pedida reaproveitando a
  paleta — sem introduzir cores novas. Texto sempre `--cor-texto`/
  `--cor-texto-suave` para contraste no tema escuro.
- Nós são `<g>` com um `<rect rx>` (cantos arredondados ~`--raio-sm`) e um
  `<text>` centralizado. O rótulo já chega **saneado e truncado com reticência na
  fronteira de palavra** (`MAPA_ROTULO_MAX`, validação no main, seção 2.3), então
  a UI renderiza `no.rotulo` como veio — não há segundo truncamento no renderer.
  Um `<title>` SVG dentro do `<g>` repete `no.rotulo` para hover/leitor de tela;
  como o rótulo persistido já é o valor exibido, `<title>` e `<text>` coincidem
  (o `…` sinaliza o corte quando houve). Decisão de modelo: **não** guardamos o
  texto original pré-truncamento num campo extra — o artefato fica mínimo
  (`NoMapaMental` só tem `id`/`rotulo`/`filhos`), o `…` já comunica o corte, e o
  rótulo-fonte é curto por construção (o prompt pede poucas palavras; 120 é teto
  defensivo que raramente dispara).
- Arestas: `<path>` com `stroke: --cor-borda-forte`, sem preenchimento, curva
  suave.

Acessibilidade: o `<svg>` recebe `role="img"` e um `aria-label` descritivo
("Mapa mental: <tema>"). Como é uma visualização densa, abaixo do canvas há um
resumo textual simples (lista aninhada `<ul>` dos rótulos) marcado para leitores
de tela — garante que o conteúdo do mapa seja acessível mesmo sem interação com o
SVG. Botões de zoom têm `aria-label`. (Validação completa de WCAG exige teste
manual com tecnologia assistiva; aqui garantimos as bases.)

### 4.5 Integração na casca (`src/renderer/App.tsx`)

- Adicionar a aba à constante `ABAS`: `{ id: "mapa", rotulo: "Mapa mental",
  icone: "🗺️" }`, posicionada após "exercicios" e antes de "historico" (fluxo
  natural: gerar artefatos → ver histórico). O tipo `Aba` ganha `"mapa"`.
- Incluir `"mapa"` no conjunto de abas de geração (`ehAbaGeracao`,
  `abaDesabilitada`) para que a aba fique desabilitada sem texto e caia de volta
  para "importar", exatamente como as outras telas de geração.
- Renderizar `<MapaMental>` quando `abaExibida === "mapa"`, com `key={`mapa-${chaveDocumento}`}`,
  `arquivo`, `mapaMentalSalvo={documento?.mapaMental ?? null}` e
  `onGerado={temTexto ? (m) => void salvarMapaMental(m) : undefined}`.
- Novo handler `salvarMapaMental(mapa)` no App, no padrão de `salvarResumo`:
  usa `persistirArtefato("mapa mental", () => getApi().salvarMapaMental(documento.id, { ...mapa, documentoId: documento.id }))`.
  Reusa o estado `avisoPersistencia` e `versaoHistorico` já existentes — falha de
  save não bloqueia a visualização (mapa continua na tela, só não persistiu).

### 4.6 Histórico (`src/renderer/views/Historico.tsx`)

Incluir o mapa mental na função `etiquetas`: `if (resumo.temMapaMental) partes.push("Mapa mental");`.
Nada mais muda — o Histórico de dois níveis (cadernos → documentos) já reabre o
`DocumentoSalvo` completo via `carregarDocumento`, e `aoReabrir` em `App.tsx` já
passa `documento.mapaMental` para a view por `mapaMentalSalvo`. A reabertura de um
mapa salvo é, portanto, coberta pelo caminho existente sem código novo além da
etiqueta.

---

## 5. Casos de borda

- **Texto vazio / sem texto extraível**: a aba fica desabilitada (UI) e o serviço
  lança `SemTextoParaMapaMentalError` (defesa canônica). Mensagem clara, sem
  crash.
- **Ollama offline**: `generate` lança `OllamaIndisponivelError`, propagado →
  mensagem amigável. O badge global de status do Ollama já alerta o usuário.
- **Modelo selecionado não instalado**: `modeloParaGeracao()` reconcilia para
  uma variante instalada antes de chamar; se nada estiver instalado, a geração
  falha com a mensagem de Ollama indisponível (sem "model not found" cru).
- **JSON malformado / cercado por texto / truncado**: `extrairBlocoJson` já
  trata cercas e texto ao redor; JSON truncado (bloco não fechado) devolve
  `null` → re-tentativa corretiva → se ainda falhar, `MapaMentalInvalidoError`.
- **Árvore vazia / só raiz sem rótulo**: `parseMapaMental` devolve `null` →
  re-tentativa; se persistir, erro amigável. Uma raiz válida **sem filhos** é
  aceita (um mapa de um nó é degenerado mas válido; a UI mostra o nó central).
- **Rótulos gigantes / parágrafos**: truncados em `MAPA_ROTULO_MAX` na validação,
  com reticência na fronteira de palavra (o `…` sinaliza o corte); o `<title>`
  SVG repete o rótulo saneado para hover/leitor de tela.
- **Resposta gigante (leque/profundidade/tamanho explosivos)**: podada por
  `MAPA_MAX_FILHOS_POR_NO`, `MAPA_PROFUNDIDADE_MAXIMA` e `MAPA_MAX_NOS` — a
  travessia termina sempre.
- **Texto muito grande**: condensado via `gerarResumo(modo: "longo")` antes de
  gerar o mapa (seção 2.4), reusando o chunking testado.
- **Falha ao salvar o mapa**: aviso não-intrusivo (`avisoPersistencia`); o mapa
  segue visível na sessão, só não persiste. Mesmo contrato dos outros artefatos.
- **Reabrir documento sem mapa**: `mapaMentalSalvo` é `null`; a view mostra o
  estado inicial (botão "Gerar mapa mental"), sem erro.
- **Nós colapsados no layout**: subárvores colapsadas saem do cálculo de
  posição; expandir/colapsar reflui de forma determinística.

---

## 6. Testabilidade

Alinhado à estratégia do projeto (unidade na camada de serviços + parsing +
persistência; UI é verificação manual, sem harness de componente). **Os testes
não dependem da pasta `Facul`** — tudo roda em memória ou em `baseDir`
temporário, e o Ollama é mockado. Novos testes a adicionar (mantendo e
ampliando a baseline de 170):

- **`tests/main/mapa.test.ts`** (análogo a `parse.test.ts`):
  - `parseMapaMental`: objeto `{raiz}` bem-formado; nó solto na raiz; cercado por
    texto/```json```; JSON truncado → `null`; JSON inválido → `null`; raiz sem
    rótulo → `null`.
  - Sanitização: descarta nós sem rótulo (e sua subárvore); apara/trunca rótulos
    em `MAPA_ROTULO_MAX`; poda profundidade além de `MAPA_PROFUNDIDADE_MAXIMA`;
    poda leque além de `MAPA_MAX_FILHOS_POR_NO`; respeita `MAPA_MAX_NOS`; ids
    únicos e densos atribuídos pela travessia.
  - `gerarMapaMental`: texto vazio → `SemTextoParaMapaMentalError`; sucesso em
    uma chamada; re-tentativa corretiva no 1º JSON malformado (2 chamadas);
    `MapaMentalInvalidoError` após falha persistente; propaga erro do gerador
    (Ollama offline); caminho de texto grande chama o resumo antes (injetando um
    `tamanhoChunk` pequeno — o mesmo valor rege o gate do mapa e o chunking do
    resumo — e mockando `gerar` para asserir a sequência determinística: N
    prompts de map + 1 de reduce do resumo, depois 1 prompt do mapa sobre o
    resumo condensado).
- **`tests/main/ipc-mapa.test.ts`** (análogo a `ipc-flashcards.test.ts`):
  registra o canal; gera chamando o Ollama mockado e resolve o modelo via
  `modeloParaGeracao` (assere `params.model`); re-tentativa; `MapaMentalInvalidoError`
  → mensagem amigável; falha genérica → mensagem genérica.
- **`tests/main/ipc-storage.test.ts`** (estender): `salvarMapaMental`
  round-trip (salvar → `carregarDocumento` traz o `mapaMental` igual);
  `listarDocumentos` reporta `temMapaMental` corretamente; documento inexistente
  → `DocumentoNaoEncontradoError` → mensagem amigável.
- **`tests/shared/prompts.test.ts`** (estender): `montarPromptMapaMental` contém
  o texto e o formato JSON pedido; `montarPromptCorrigirMapaMental` reapresenta a
  resposta anterior e o formato.
- **`tests/shared/mapaLayout.test.ts`** (novo, teste puro de função — não precisa
  de harness de componente): `calcularLayout` (de `@shared/mapaLayout`) posiciona
  raiz à esquerda, níveis em colunas, folhas sem sobreposição; nós colapsados
  saem do layout; árvore de um nó funciona.

A **view** `MapaMental.tsx` em si (SVG, eventos de mouse, zoom/pan) é
**verificação manual** — consistente com o projeto, que não testa componentes
React. Por isso o layout foi extraído como função pura: concentra a lógica
testável fora do componente.

Antes de concluir a implementação: `npm run build` (inclui `tsc --noEmit`) e
`npm test` verdes, `npm run lint` limpo, baseline de 170 testes preservada e
ampliada.

---

## 7. Resumo das decisões travadas

1. **Modelo**: árvore aninhada `NoMapaMental { id, rotulo, filhos[] }`; artefato
   `MapaMental { documentoId, raiz, geradoEm }`; ids atribuídos no main, não pelo
   modelo. Campo opcional `mapaMental` em `DocumentoSalvo`; `temMapaMental` em
   `ResumoDocumentoSalvo`. Sem migração (campo aditivo).
2. **Limites**: `MAPA_PROFUNDIDADE_MAXIMA=4`, `MAPA_MAX_NOS=200`,
   `MAPA_ROTULO_MAX=120`, `MAPA_MAX_FILHOS_POR_NO=12` em `constants.ts`.
3. **Geração**: `src/main/services/mapa.ts` reusando `extrairBlocoJson`,
   validação/sanitização recursiva tolerante, **uma** re-tentativa corretiva;
   texto grande é condensado via `gerarResumo` antes.
4. **IPC**: canais `mapamental:gerar` e `documento:salvar-mapa-mental`; handler
   resolve o modelo via `modeloParaGeracao()`; preload + `AppApi` atualizados;
   renderer chama só por `getApi()` (sem optional chaining).
5. **Persistência**: `storage.salvarMapaMental` espelhando `salvarResumo`;
   escrita atômica e spread condicional já cobrem o novo campo.
6. **Visualização**: **render SVG próprio** (sem nova dependência), layout de
   árvore **horizontal** determinístico em **`src/shared/mapaLayout.ts`** (função
   pura testável, sem DOM), cores por nível via tokens de `styles.css`, navegável
   (expandir/colapsar, zoom, pan), **não editável**.
7. **Histórico**: etiqueta "Mapa mental"; reabertura coberta pelo caminho
   existente.
8. **Dependências**: nenhuma adicionada — `package.json`/lock inalterados.

---

## Respostas às conclusões da revisão

Revisão lida: `tasks/design-mapas-review.json` (veredito **CHANGES_REQUESTED**:
1 HIGH, 3 MEDIUM, 3 NIT) e o documento `tasks/design-mapas-review.md`. Todos os
7 findings foram **endereçados** nesta revisão do design — nenhum foi adiado ou
ignorado, pois cada um era um ponto concreto de implementação alinhado às
decisões confirmadas do roadmap. Antes de revisar, conferi no worktree que
`gerarResumo` aceita `tamanhoChunk` e tem reduce de passo único (`resumo.ts`), e
que `storage.ts`/`ipc/index.ts`/`ipc.ts` importam listas explícitas de
`@shared/types` sem os novos tipos.

1. **[HIGH] `tamanhoChunk` do mapa vs. resumo + caminho do texto grande indefinido**
   (seção 2.4) — **endereçado.** Fixei uma regra única: o mesmo `tamanhoChunk` do
   mapa é **repassado explicitamente** a `gerarResumo({ texto, modo: "longo",
   gerar, tamanhoChunk })`, regendo as duas etapas; e declarei que o texto-base
   do mapa é **o resumo como está, em passo único, sem re-chunk**, herdando o
   limite conhecido ("reduce de passo único") já documentado em `resumo.ts`.
   Documentei a sequência determinística de prompts (N map + 1 reduce do resumo,
   depois 1 do mapa) e ajustei o teste de "texto grande" na seção 6. Também
   anotei o default/semântica no comentário de `GerarMapaMentalParams`.

2. **[MEDIUM] Forma de retorno não-nula vs. guard `?? null`** (seções 3.1, 4.3) —
   **endereçado.** Adicionei um "Contrato de nulidade" explícito em 3.1: o
   retorno é `NoMapaMental` (nunca `| null`); o serviço só lança em falha e não
   há caminho de sucesso nulo. Em 4.3 marquei o `?? null`/`!= null` como defesa
   simétrica com `Resumo.tsx` que nunca dispara, instruindo a não alterar o tipo
   para `NoMapaMental | null`.

3. **[MEDIUM] Imports de tipo não enumerados** (seções 1.2, 3.2) — **endereçado.**
   Adicionei a tabela "1.2.1 Imports de tipo a adicionar (checklist exato)"
   nomeando onde cada `import type` entra: `MapaMental` + `NoMapaMental` em
   `src/shared/ipc.ts`; `MapaMental` em `storage.ts`; `MapaMental` + `NoMapaMental`
   em `src/main/ipc/index.ts` (e no novo `mapa.ts`/view), notando
   `verbatimModuleSyntax`/`noUnusedLocals` e que `DocumentoSalvo` já está
   importado.

4. **[MEDIUM] Critério de `temMapaMental` divergente** (seção 3.2) —
   **endereçado.** Simplifiquei para `temMapaMental: documento.mapaMental !==
   undefined`, idêntico a `temResumo` (ambos objeto único), removendo o
   `.raiz !== undefined` redundante, com a justificativa de que a invariante
   "mapa salvo ⇒ raiz válida" é garantida na camada de geração.

5. **[NIT] Localização de `layout.ts` em aberto** (seções 4.2, 6) —
   **endereçado.** Cravei **`src/shared/mapaLayout.ts`** (lógica pura, sem DOM,
   mesmo lar de `notebooks.ts`/`prompts.ts`), com o motivo em uma frase; o teste
   vira `tests/shared/mapaLayout.test.ts` importando de `@shared/mapaLayout`.
   Atualizei as seções 4.2, 6 e o resumo 7.

6. **[NIT] Truncamento em 120 pode cortar no meio da palavra** (seções 1.3, 2.3,
   4.4) — **endereçado.** Defini o truncamento: corta em `MAPA_ROTULO_MAX`, recua
   à última fronteira de palavra quando houver (senão em `MAX-1`), e anexa `…`,
   com comprimento final ≤ `MAPA_ROTULO_MAX`. Como o artefato guarda só o rótulo
   saneado, ajustei 4.4 e o caso de borda em 5 para que o `<title>` repita esse
   rótulo (o `…` sinaliza o corte), em vez de prometer um texto original que não
   é persistido — mantendo `NoMapaMental` mínimo.

7. **[NIT] Normalização da raiz não cobre `{raiz: <não-objeto>}` nem topo-array**
   (seção 2.2, passo 3) — **endereçado.** Tornei a regra explícita: se o
   candidato à raiz não for um objeto não-nulo (incluindo topo em array, string,
   number, null), trata como inválido → `null`, disparando a re-tentativa.
