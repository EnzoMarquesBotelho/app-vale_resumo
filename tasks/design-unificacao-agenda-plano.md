# Design — Unificação Agenda de revisão + Plano de estudo (linha do tempo única) e fluxo de criação da prova

> Fase de DESIGN (sem código de produção). Base: `master` em `133c99e`, 945 testes.
> Fontes lidas: `AGENTS.md`, `docs/intent/plano-estudo-guiado.md`, `tasks/roadmap-plano-estudo-guiado-f2/f3/f4.md`,
> `tasks/roadmap-agenda-provas.md`, `tasks/design-f2.md`/`design-f4.md` (resumos), e o código atual de
> `src/shared/{types,agenda,plano,checkpoints,diagnostico,constants,ipc}.ts`,
> `src/main/services/{provas,planoCalculo,checkpoints}.ts`, `src/main/ipc/index.ts`,
> `src/renderer/views/{Agenda,PlanoEstudo,PlanoPrevia,Diagnostico,Checkpoints}.tsx`.

## 0. Visão geral

A unificação é feita como uma **visão derivada**, não como migração de dados. Nada do que está em disco muda de
lugar: `Prova.sessoes`, `Prova.plano`, `Prova.diagnostico` e `Prova.checkpoints` continuam exatamente onde estão.
Uma função PURA nova (`src/shared/linhaDoTempo.ts`) recebe as sessões persistidas, os dias de estudo calculados
(`PlanoCalculado.dias`), os checkpoints já resolvidos (`CheckpointVisao[]`) e o `hoje`, e devolve **uma lista única
por data** com itens tipados (`estudo`, `revisao`, `checkpoint`). A tela Agenda, quando a prova tem plano, troca os
dois blocos (card "Checkpoints" e lista "Agenda de revisão") por um componente `LinhaDoTempo`. Prova sem plano
mantém o bloco atual **sem uma linha de diff**.

O que é novo em dados é só **um campo opcional e aditivo**: `Prova.tipo?: TipoProva` (`primeira | segunda | final |
enem | enade`). Ele alimenta (a) o nome automático da prova e (b) o ordinal do plano, eliminando a pergunta repetida
no questionário. A data mínima (amanhã) passa a ser exigida no main ao criar/editar e espelhada na UI.

Stack travada: Electron + React + TypeScript, Vite, Vitest, IPC via `getApi()`. **Nenhuma dependência nova.**
Nenhum canal IPC novo (só tipos de `criarProva`/`editarProva` ganham `tipo`).

> **NOTA DO ORQUESTRADOR (design-loop ENCERRADO por decisão do usuário após o
> 2º ciclo; ler antes de implementar):** a 2ª revisão
> (`.agents/tasks/unifica-agenda-plano/design-gate.json`) ficou com 2 MEDIUM +
> 4 NIT, 0 HIGH. Arquitetura (visão derivada, `Prova.tipo?` aditivo, função
> pura `linhaDoTempo.ts`, data mínima no main) APROVADA — NÃO reabrir.
>
> **DECISÕES DO USUÁRIO (vinculantes):**
> - **ENEM e ENADE contam como "primeira"** para efeito do plano (todo o
>   conteúdo é base, sem "novo"). Aprovado.
> - **Trocar o tipo para 1ª prova, ENEM ou ENADE descarta a marcação "novo" dos
>   assuntos, e a UI pede confirmação antes.** Aprovado.
>
> **Aplicar na implementação exatamente assim:**
> - **MEDIUM 1 (contradição bloco legado × min/max):** o bloco legado "Agenda
>   de revisão" (prova SEM plano, e prova PASSADA) fica INTOCADO, sem diff,
>   como diz §0/§8. As datas mínima/máxima das revisões valem SÓ dentro de
>   `LinhaDoTempo`. Corrigir §5.5/§7 para não dizer "em ambos os modos". Em
>   prova passada não há min/max (a linha do tempo nem é renderizada).
> - **MEDIUM 2 (guarda de prova passada):** renderizar `LinhaDoTempo` somente
>   com `plano !== undefined && !montandoPlano && estado !== "passada"` (mesma
>   guarda que a Agenda já usa para Diagnóstico/Checkpoints). Prova passada usa
>   o bloco legado. O hook `useCheckpoints` só dispara com a linha do tempo
>   montada. Corrigir §9.1.
> - **NIT 3 (validação de formato em `validarDataProva`):** especificar regex
>   `^\d{4}-\d{2}-\d{2}$` + round-trip `diaParaNumero`/`numeroParaDia`, ou
>   exportar a `dataValida` do main para `src/shared/dataProva.ts` (a privada
>   hoje não é alcançável pela função pura).
> - **NIT 4 (intervalos de prova passada):** registrar em §13 como "herdado,
>   NÃO coberto" que editar `intervalos` de prova passada apaga as sessões
>   (comportamento atual preservado), ou bloquear — escolher o mais simples e
>   declarar.
> - **NIT 5 (extração do hook `useCheckpoints`):** critério de aceitação: os
>   testes existentes de reconsulta (`tests/renderer/checkpoints-reconsulta`)
>   passam SEM alterar `checkpointsReconsulta.ts`.
> - **NIT 6 (baseline de testes):** o design cita 945; o `AGENTS.md` cita 781.
>   A contagem real vem do `npm test` na implementação; reconciliar
>   `AGENTS.md`, `PROGRESSO.md` e `todo.md` com ela.

## 1. Decisões-chave (resumo)

| # | Decisão |
|---|---|
| K1 | Linha do tempo = função pura `montarLinhaDoTempo`; **derivada, nunca persistida**. Prova sem plano não passa por ela na UI (bloco legado intacto). |
| K2 | **Fusão revisão×checkpoint só na MESMA data (janela 0 dia).** Sugerida ou manual, tanto faz. Fusão é só de exibição: a sessão persistida nunca é alterada, movida, apagada ou deduplicada. |
| K3 | Bloco de estudo é **somente leitura** (vem do questionário; para mudar, "Editar plano"). Revisão mantém marcar feita / mover / remover. Checkpoint mantém seu ciclo (gerar/abrir/concluir). |
| K4 | "Regerar sugestões" continua, renomeado "Regerar revisões sugeridas", mesmo efeito de hoje (`regerarAgenda`); só mexe nas revisões, o plano de estudo se recalcula sozinho a cada abertura. |
| K5 | Montar plano em prova com sessões editadas à mão **não migra nada**: as sessões ficam como estão e aparecem na linha do tempo. |
| K6 | Fonte única da escolha de tipo/ordinal: **`Prova.tipo` (novo, opcional)**. `plano.ordinal` continua persistido como **cópia derivada** mantida pelo main (porque `assinaturaPlano`, `calcularPlano` e checkpoints já a leem e dados antigos já a têm). O questionário só pergunta o ordinal quando a prova não tem `tipo`. |
| K7 | **ENEM e ENADE contam como `primeira` para o plano** (todo o conteúdo é base, sem "novo"). Recomendação a confirmar com o usuário (§3.3). |
| K8 | `tipo` e `vinculo` são eixos independentes. Escolher ENEM/ENADE no formulário **pré-seleciona** "abrangente" só se o vínculo está intocado e sem caderno (`vinculoAposEscolherTipo`); caderno já escolhido é preservado; o main não acopla os dois. |
| K9 | Nome automático = função pura `nomeProva`. "Automático vs do usuário" é **estado efêmero do formulário** (sem campo persistido). Em edição de prova existente o título nunca muda sozinho. |
| K10 | Data mínima da prova = **amanhã**, validada no main (autoridade) e na UI (espelho), relógio local. Prova antiga com data passada abre normalmente; salvar sem mudar a data é permitido. |
| K11 | Sessões movidas à mão: **mínimo = hoje, máximo = data da prova**, aplicado na UI; o main segue como hoje (descarta passadas). Justificativa em §5.5. |
| K12 | Sem refatorar IA, régua, distribuição, diagnóstico ou `planejarCheckpoints`. |

## 2. Modelo de dados e migração

### 2.1 Tipos (em `src/shared/types.ts`)

```ts
/** Tipo de prova escolhido pelo aluno (define o nome automático e o ordinal do plano). */
export type TipoProva = "primeira" | "segunda" | "final" | "enem" | "enade";

export interface Prova {
  // ...campos atuais inalterados...
  /** OPCIONAL e ADITIVO. Ausente em provas antigas. */
  tipo?: TipoProva;
}
```

`OrdinalProva` não muda. `PlanoEstudo.ordinal` não muda. `ResumoProva` não muda.

### 2.2 Ordinal derivado (em `src/shared/tipoProva.ts`, puro)

```ts
export const TIPOS_PROVA: readonly TipoProva[];                 // ordem de exibição
export const ROTULOS_TIPO_PROVA: Record<TipoProva, string>;     // "1ª prova","2ª prova","Prova final","ENEM","ENADE"
export function ehTipoProva(v: unknown): v is TipoProva;
export function ordinalDeTipo(t: TipoProva): OrdinalProva;      // primeira→primeira, segunda→segunda, final→final, enem→primeira, enade→primeira
export function aplicarOrdinalAoPlano(plano: PlanoEstudo, ordinal: OrdinalProva): PlanoEstudo;

/** Estado do vínculo no formulário (só o que a regra precisa). */
export interface EstadoVinculoForm {
  tipoVinculo: "caderno" | "abrangente";
  cadernoNome: string;     // "" = nenhum caderno escolhido
  /** true depois que o ALUNO clicou num radio de vínculo ou escolheu um caderno (a pré-seleção automática NÃO marca). */
  tocado: boolean;
}
/**
 * Vínculo resultante de o aluno escolher `tipo` no select. Única regra de "ENEM/ENADE sugere abrangente".
 * Só devolve "abrangente" quando tipo ∈ {enem, enade} E !tocado E cadernoNome === "". Em todo outro caso devolve
 * `atual.tipoVinculo` (escolher 1ª/2ª/final, "Não definido" ou voltar atrás NUNCA desfaz o vínculo).
 */
export function vinculoAposEscolherTipo(atual: EstadoVinculoForm, tipo: TipoProva | ""): "caderno" | "abrangente";
```

Tabela de casos de `vinculoAposEscolherTipo`:

| `atual` (`tipoVinculo`, `cadernoNome`, `tocado`) | `tipo` | Saída |
|---|---|---|
| caderno, `""`, false | `enem` | `abrangente` |
| caderno, `""`, false | `enade` | `abrangente` |
| caderno, `"Cálculo"`, true | `enem` | `caderno` (caderno escolhido: nome preservado) |
| caderno, `"Cálculo"`, false (preenchido por outro caminho) | `enade` | `caderno` (`cadernoNome !== ""` basta) |
| caderno, `""`, true (aluno clicou em "Ligada a um caderno" sem escolher) | `enem` | `caderno` |
| abrangente, `""`, true | `primeira` | `abrangente` (não desfaz) |
| abrangente, `""`, false (veio de ENEM) | `segunda` | `abrangente` (não desfaz; o aluno volta manualmente) |
| caderno, `""`, false | `primeira` / `""` | `caderno` |

`aplicarOrdinalAoPlano`: devolve **novo** objeto; troca `ordinal`; se `ordinal === "primeira"`, força
`topicos[i].novo = false` (mesma regra de `sanearPlano`); **não** altera `atualizadoEm` (ver §2.4). Se o ordinal já é o
mesmo, devolve o objeto recebido (mesma referência).

### 2.3 Invariantes

- **I1 (coerência):** se `prova.tipo !== undefined` e `prova.plano !== undefined`, então
  `prova.plano.ordinal === ordinalDeTipo(prova.tipo)`. Dono: **main** (`salvarPlano` e `editarProva`). Motivo: o main é
  o único que grava; o renderer só sugere.
- **I2 (legado):** `tipo === undefined` com `plano` presente é estado válido (provas antigas). Nada é reescrito na leitura.
- **I3 (backfill só ao salvar plano):** `salvarPlano` em prova sem `tipo` grava `tipo = plano.ordinal` (os três
  ordinais são subconjunto de `TipoProva`). Assim, depois do primeiro "salvar plano", a prova passa a respeitar I1 e
  o questionário deixa de perguntar de novo. Nenhum outro caminho grava `tipo` sozinho.

### 2.4 Por que `plano.ordinal` não é removido nem ignorado

`assinaturaPlano` (que invalida diagnóstico e checkpoints), `calcularPlano` e `montarPlanoCalculado` leem
`plano.ordinal`; provas gravadas na fatia 2/3/4 já o têm. Removê-lo exigiria migração e quebraria o round-trip de
provas antigas. Mantê-lo como cópia mantida pelo main custa uma linha em dois pontos de escrita e preserva todas as
assinaturas existentes. **Trocar o ordinal continua invalidando o diagnóstico** (a assinatura inclui o ordinal) e os
checkpoints (mesma assinatura), sem código novo de invalidação.

`aplicarOrdinalAoPlano` não recarimba `plano.atualizadoEm` porque o aluno não respondeu o questionário de novo;
`atualizadoEm` ancora a `dataBase` dos checkpoints (D6 da fatia 4) e não deve ser empurrado por uma edição de tipo.

### 2.5 Persistência e leitura

- Escrita: spread condicional `...(tipo !== undefined ? { tipo } : {})`; nunca grava `tipo: undefined`. Remover o tipo
  (`null` em `editarProva`) apaga a chave. Mesma `escreverProva` atômica (`.tmp` + rename).
- Leitura (`carregarProva`): se a chave `tipo` existe e `!ehTipoProva(valor)` → `delete prova.tipo` (tolerante,
  igual a `diagnostico`/`checkpoints`); nunca lança. Chave ausente → prova volta byte-a-byte como antes.
- **I1 só é garantido por ESCRITA.** `carregarProva` não reconcilia `tipo` válido com `plano.ordinal` divergente (arquivo
  editado à mão): nada é corrigido nem lançado. Em divergência, a UI mostra o `tipo` e **o cálculo usa `plano.ordinal`**
  (é o que `assinaturaPlano`/`calcularPlano` já leem); a próxima escrita pelo main (`salvarPlano` ou `editarProva` com
  `tipo`) restaura I1. Teste de borda em §15.
- Nenhuma migração em lote. Nenhuma prova antiga perde `sessoes`, `plano`, `diagnostico` ou `checkpoints`.

## 3. Fluxo de criação: tipo, ordinal, vínculo, ENEM/ENADE

### 3.1 Formulário (Agenda.tsx)

Ordem dos campos: **Vínculo** (já existente) → **Tipo de prova** (novo, `select` com "Não definido" + 5 opções) →
**Título** → **Data** → **Intervalos**. Título depois do vínculo e do tipo porque ele é preenchido a partir deles.

Estado novo do formulário: `tipo: TipoProva | ""` e `tituloEditado: boolean`.

### 3.2 Regras (a, b, c do ponto 4)

- (a) Fonte única: `Prova.tipo`. Questionário (`PlanoEstudo.tsx`): se `prova.tipo !== undefined`, **não mostra** os
  radios de ordinal; mostra uma linha de leitura "Tipo de prova: ENEM (mude em Editar prova)" e usa
  `ordinalDeTipo(prova.tipo)` como ordinal inicial. Se `tipo` é `undefined` (prova antiga), os radios aparecem como
  hoje. O main sobrescreve o ordinal recebido por `ordinalDeTipo(prova.tipo)` quando há `tipo` (autoridade no main).
  **Onde, exatamente, em `salvarPlano(id, planoBruto: unknown, agora)`** (`sanearPlano` lê `p.ordinal` do bruto e não
  conhece `tipo`): (1) `carregarProva(id)`; (2) se `prova.tipo !== undefined` **e** `planoBruto` é objeto não nulo e não
  array, clonar raso `{...planoBruto, ordinal: ordinalDeTipo(prova.tipo)}` e passar o clone a `sanearPlano` (assim a
  regra `primeira ⇒ novo=false` do saneador já vale para ENEM/ENADE); (3) se `planoBruto` não é objeto, passar como está e
  deixar `sanearPlano` lançar como hoje (sem `tipo` não há o que sobrescrever); (4) após o saneamento, se
  `prova.tipo === undefined`, gravar `tipo = plano.ordinal` (I3). O renderer continua enviando o ordinal; o main é quem decide.
- (b) Retrocompatibilidade: prova antiga com `plano.ordinal` e sem `tipo` segue válida (I2); mesmos cálculos,
  mesmas assinaturas. Ao abrir "Editar prova", o select de tipo mostra "Não definido" (não adivinhamos). Se o aluno
  escolher um tipo, `editarProva` sincroniza o plano (§3.4).
- (c) ENEM/ENADE × `vinculo` abrangente: **independentes**. Na UI, escolher ENEM ou ENADE pré-seleciona "Prova
  abrangente" **somente** se o aluno ainda não mexeu no vínculo e nenhum caderno foi escolhido; se já há caderno (ou o
  aluno clicou num radio de vínculo), o vínculo e o nome do caderno **ficam** (ENEM + caderno é combinação válida).
  Regra única e testável em `vinculoAposEscolherTipo` (§2.2). A pré-seleção não marca `tocado`, e voltar a 1ª/2ª/final
  nunca desfaz o vínculo. Em **edição** de prova existente, `tocado = true` desde a abertura (nunca troca o vínculo
  sozinho). Escolher 1ª/2ª/final não mexe no vínculo. O main
  aceita qualquer combinação (ex.: `enade` + caderno; `primeira` + abrangente). `modoDistribuicao` segue como hoje;
  o texto do radio muda de "Prova abrangente (ENEM/ENADE)" para "Prova abrangente (todos os cadernos)".
  Motivo: o vínculo diz *de onde vêm os assuntos* (já usado por `PlanoEstudo` ao listar documentos); o tipo diz *qual
  prova é*. Acoplar os dois criaria casos sem saída (ENADE de um curso só).

### 3.3 ENEM/ENADE → `primeira` (recomendação, a confirmar com o usuário)

ENEM e ENADE não têm "prova anterior"; não existe "conteúdo novo desde a última prova". Tratamos como `primeira`:
todo o conteúdo é base (`novo=false`), a coluna "Novo" some do questionário (já ocorre para `primeira`) e a régua usa
o ramo de 1ª prova já implementado e testado nas fatias 2/3. **Consequências a comunicar:** (i) o diagnóstico
continua disponível, mas, como em qualquer 1ª prova, não altera a distribuição (a régua não tem lado "novo" para
rebalancear; ver f3, caso "1ª prova"); (ii) o aluno não consegue marcar assuntos como "novo" nessas provas. Alternativa
descartada: criar ordinais `enem`/`enade` — exigiria tocar `calcularPlano`, `assinaturaPlano`, diagnóstico e
checkpoints, contra o pedido de não mexer neles. **Não** há lista curada de assuntos ENEM/ENADE, **nada online**, **sem
promessa de "cai na prova"** (a copy do app continua orientando estudo, não previsão).

### 3.4 Edição de tipo em prova existente (`editarProva`)

`MudancasProva` ganha `tipo?: TipoProva | null` (`null` = remover). Regras:

Tipos (corrige a imprecisão de `Partial<Pick<…>>`, que não serve para `null`):

```ts
// src/main/services/provas.ts
export type MudancasProva =
  Partial<Pick<Prova, "titulo" | "data" | "vinculo" | "intervalos">> & { tipo?: TipoProva | null };
export interface NovaProva { /* campos atuais */ tipo?: TipoProva }
// src/shared/ipc.ts: os literais inline de criarProva/editarProva ganham `tipo?: TipoProva` e `tipo?: TipoProva | null`.
```

1. `tipo` ausente em `mudancas` → nada muda no tipo.
2. `tipo` válido → grava `tipo`; se a prova tem `plano` e `ordinalDeTipo(tipo) !== plano.ordinal`, grava
   `plano = aplicarOrdinalAoPlano(plano, ordinalDeTipo(tipo))`. Efeito automático (sem código novo): `estadoDiagnostico`
   passa a "desatualizado" e `estadoBlocoCheckpoints` a "desatualizado" (assinatura mudou).
3. `tipo === null` → apaga a chave `tipo`; `plano.ordinal` permanece como está (I2).
4. `tipo` inválido (não-nulo, não-`TipoProva`) → `DadosProvaInvalidosError("Escolha um tipo de prova válido.")`.
5. **Perda de `novo` (decisão do achado de revisão: opção "confirmar").** Trocar para ordinal `primeira` (1ª prova,
   ENEM, ENADE) força `topicos[].novo=false`, e a volta para `segunda`/`final` **não** restaura a marcação. Como isso é
   perda de dado do usuário disparada por um `select`, a UI **bloqueia o salvamento até confirmar**: quando
   `prova.plano?.topicos.some(t => t.novo)` e `ordinalDeTipo(novoTipo) === "primeira"` e o ordinal atual não é
   `primeira`, o formulário de edição mostra, em `role="alert"`, "Trocar para este tipo descarta a marcação de assuntos
   novos do plano (não dá para desfazer)." e o botão "Salvar" vira "Salvar e descartar marcação" (o aluno pode
   cancelar a troca do tipo). A decisão é função pura `tipoDescartaNovos(plano, novoTipo): boolean` em `tipoProva.ts`.
   O **main continua sendo a autoridade e aplica `aplicarOrdinalAoPlano` sem pedir confirmação** (a confirmação é de UI;
   chamadas diretas ao IPC são do próprio app). Alternativa descartada: preservar `novo` em disco e ignorá-lo quando
   `primeira` — exigiria mascarar `novo` em `montarPlanoCalculado` e em `assinaturaPlano`, tocando módulos que o pedido
   manda não mexer.
6. Troca `primeira` → `segunda`/`final` com plano existente: tópicos seguem `novo=false`. A UI mostra o aviso de status
   "O tipo mudou. Revise o plano para marcar o que é novo." (honesto e sem perda: nada havia marcado).

## 4. Nome automático (`src/shared/nomeProva.ts`, puro)

### 4.1 Contrato

```ts
export interface EntradaNomeProva {
  /** Caderno vinculado (só conta se o vínculo é "caderno"; o chamador passa undefined senão). */
  cadernoNome?: string | null;
  tipo?: TipoProva | null;
}
export const SEPARADOR_NOME_PROVA = " — ";           // travessão com espaços
export const NOME_PROVA_MAX = 200;                   // = TITULO_MAX do main
export function nomeProva(e: EntradaNomeProva): string;

export interface EstadoTitulo { titulo: string; editado: boolean }
/**
 * O aluno digitou/apagou no campo.
 * modo "criar": `editado = valor.trim() !== ""` (campo vazio retoma o automático).
 * modo "editar": `editado = true` SEMPRE (inclusive campo vazio; o main rejeita título vazio ao salvar).
 */
export function tituloAposDigitar(valor: string, modo: "criar" | "editar"): EstadoTitulo;
/** Caderno/tipo mudaram. Se `editado`, devolve o MESMO estado (mesma referência). */
export function tituloAposMudanca(estado: EstadoTitulo, e: EntradaNomeProva): EstadoTitulo;
```

Invariantes de `nomeProva`: total (nunca lança); `cadernoNome` é `trim`ado e vazio é ignorado; partes presentes são
unidas por `SEPARADOR_NOME_PROVA`; resultado truncado em 200; sem caderno e sem tipo → `""`; determinística.

### 4.2 Tabela de casos

| Entrada | Saída |
|---|---|
| `{cadernoNome:"Cálculo", tipo:"primeira"}` | `Cálculo — 1ª prova` |
| `{cadernoNome:"Cálculo", tipo:"segunda"}` | `Cálculo — 2ª prova` |
| `{cadernoNome:"Cálculo", tipo:"final"}` | `Cálculo — Prova final` |
| `{cadernoNome:"Cálculo", tipo:"enem"}` | `Cálculo — ENEM` |
| `{tipo:"enem"}` | `ENEM` |
| `{tipo:"enade"}` | `ENADE` |
| `{cadernoNome:"Cálculo"}` | `Cálculo` |
| `{cadernoNome:"  Física  ", tipo:"segunda"}` | `Física — 2ª prova` |
| `{}` / `{cadernoNome:"   "}` / `{cadernoNome:null, tipo:null}` | `` (vazio) |
| caderno de 250 caracteres + `tipo:"final"` | tamanho ≤ 200 |

### 4.3 Quando o título é "automático" vs "do usuário" (sem campo persistido)

| Situação | `editado` | Efeito |
|---|---|---|
| Formulário de **criação** abre | `false`, título `""` | Escolher caderno/tipo preenche. |
| Aluno digita qualquer texto não vazio | `true` | Mudar caderno/tipo **não** sobrescreve. |
| Aluno apaga tudo (campo vazio) **na criação** | `false` | O automático volta a seguir caderno/tipo (recomeço consciente). |
| Aluno apaga tudo **na edição** | `true` (exceção declarada: em edição o vazio NÃO retoma o automático) | O título nunca muda sozinho; salvar vazio é rejeitado pelo main (`sanearTitulo`); o botão "Usar sugestão" é o único caminho para o automático. |
| Formulário de **edição** abre | `true` sempre | O título nunca muda sozinho. Se `nomeProva(form) !== titulo` e a sugestão não é vazia, aparece o botão de texto "Usar “Cálculo — 2ª prova”" que aplica **só ao clique**. |
| Trocar vínculo para abrangente | (inalterado) | `cadernoNome` deixa de contar em `nomeProva`; se `editado=false` o título recalcula. |

O main **não** compõe nem altera título: `sanearTitulo` segue exigindo título não vazio. Isso mantém a regra "editar prova
existente não reescreve o título" garantida também no servidor.

## 5. Data mínima = amanhã

### 5.1 Contrato puro (`src/shared/dataProva.ts`)

```ts
/* Ordem de avaliação de validarDataProva (fixa):
 *  1. `data` com formato inválido (inclui "" e 2026-02-30) ⇒ { ok:false, motivo:"formato" }, SEMPRE, mesmo que
 *     `data === dataAtual`. `data` inválida NUNCA lança.
 *  2. `dataAtual !== undefined && data === dataAtual` ⇒ ok (prova antiga, inalterada).
 *  3. `data >= dataMinimaProva(hoje)` ⇒ ok; senão `nao_futura`.
 * `hoje` inválido LANÇA (via dataMinimaProva, contrato de diaParaNumero em agenda.ts:36-40): é erro de programação do
 * chamador (o main passa hojeLocal()), não entrada do usuário. Só lança quando a avaliação chega à etapa 3; nas etapas
 * 1 e 2 (retorno antecipado) `hoje` nem é lido. Os testes fixam esse comportamento. */
/** Data-calendário local de um Date (getFullYear/getMonth/getDate; NUNCA toISOString/UTC). */
export function dataLocalDe(d: Date): string;
/** hoje + 1 dia (virada de mês/ano/bissexto corretas). Lança se `hoje` for inválido (contrato de agenda.ts). */
export function dataMinimaProva(hoje: string): string;
export type ResultadoDataProva =
  | { ok: true }
  | { ok: false; motivo: "formato" | "nao_futura"; mensagem: string };
/**
 * `dataAtual` só em edição: se `data === dataAtual`, é "inalterada" e passa mesmo no passado.
 */
export function validarDataProva(p: { data: string; hoje: string; dataAtual?: string }): ResultadoDataProva;
/** "Escolha uma data a partir de amanhã (31/10/2026). Provas só podem ser marcadas em datas futuras." */
export function mensagemDataMinima(hoje: string): string;
```

`hojeLocal()` do main passa a delegar a `dataLocalDe(new Date())` (mesma saída de hoje; continua exportado).

### 5.2 Tabela de casos (`hoje = 2026-10-30` salvo indicado)

| `data` | `dataAtual` | Resultado |
|---|---|---|
| `2026-10-31` | — | ok |
| `2026-10-30` (hoje) | — | `nao_futura` |
| `2026-10-29` | — | `nao_futura` |
| `2026-11-30` | — | ok |
| `2027-01-01` com `hoje=2026-12-31` | — | ok (mínimo = 2027-01-01) |
| `2026-12-31` com `hoje=2026-12-31` | — | `nao_futura` |
| `2028-02-29` com `hoje=2028-02-28` | — | ok (bissexto) |
| `2026-03-01` com `hoje=2026-02-28` | — | ok |
| `2026-02-30` | — | `formato` |
| `""` | — | `formato` |
| `2026-03-01` | `2026-03-01` (prova antiga) | ok (inalterada) |
| `2026-03-05` (passada) | `2026-03-01` | `nao_futura` (mudou para passada) |
| `2026-10-30` (hoje) | `2026-03-01` | `nao_futura` |
| `2026-11-15` | `2026-03-01` | ok |

### 5.3 Main (`src/main/services/provas.ts`) — autoridade

- `criarProva(dados, hoje, baseDir)`: após `dataValida`, `validarDataProva({data, hoje})`; falha →
  `DadosProvaInvalidosError(mensagem)`. Nada é gravado.
- `editarProva(id, mudancas, hoje, baseDir)`: se `mudancas.data !== undefined` → `dataValida` (como hoje) e depois
  `validarDataProva({data: mudancas.data, hoje, dataAtual: prova.data})`. Data omitida ou igual à gravada passa mesmo
  que seja passada ou hoje (**regra da prova antiga**: não trava o aluno que só quer renomear ou trocar o vínculo, e
  bloqueia qualquer data passada *nova*).
- `hoje` já é injetado nas duas funções; os handlers continuam passando `hojeLocal()` (resolvido uma vez por chamada).
  Os handlers não mudam; `mensagemAmigavelProva` já devolve a `message` de `DadosProvaInvalidosError`.
- Fuso/virada do dia: tudo em data-calendário local (`dataLocalDe`); nenhuma conversão UTC.

### 5.4 UI (Agenda.tsx)

- `input[type=date]` da prova: `min={dataMinimaProva(hoje)}`, onde `hoje = dataLocalDe(new Date())` é calculado **a cada
  render** (não memoizado), então a virada do dia é refletida na próxima interação.
- `<form noValidate>` + validação própria em `salvarForm` com `validarDataProva` (a validação nativa de `min` bloquearia
  o envio de provas antigas com data passada). Erro inline em `<p role="alert">` ligado ao campo por `aria-describedby`;
  o `input` ganha `aria-invalid`. Em edição passa `dataAtual: prova.data`.
- O main continua sendo a autoridade: se o relógio virar entre o clique e o main, a mensagem do main aparece no mesmo
  `role="alert"` existente (`erro`).

### 5.5 Data das sessões movidas à mão

Mínimo **hoje** (não amanhã), máximo **a data da prova**. Justificativa: o app já aceita sessões em `hoje`
(`gerarAgenda` mantém `hoje`; `salvarSessoes` filtra `data >= hoje`), estudar hoje é legítimo, e o pedido do usuário
trata da data da *prova*. O plano de estudo é que começa em amanhã (`datasEntre(hoje, prova.data)`), e continua assim.
Aplicado só na UI (`min`/`max` nos `input[type=date]` das revisões, em ambos os modos). O **main não muda** em
`salvarSessoes` (preserva a regressão sem plano e não apaga em silêncio sessões legadas depois da prova). Sessão
adicionada nasce na data da prova, como hoje.

## 6. Linha do tempo (`src/shared/linhaDoTempo.ts`, puro)

### 6.1 Contrato

```ts
import type { BlocoEstudo, PlanoCalculado } from "./plano";
import type { CheckpointVisao } from "./checkpoints";
import type { SessaoRevisao } from "./types";

export type TipoItemLinha = "estudo" | "revisao" | "checkpoint";
export type SituacaoItem = "passado" | "hoje" | "futuro";

interface ItemBase {
  /**
   * Determinística para as MESMAS entradas: `e:<data>`, `r:<sessao.id>`, `c:<checkpoint.id>`.
   * NÃO é estável entre salvamentos: os ids de sessão são posicionais (`s${i}`, renumerados em `salvarSessoes`/
   * `recomputarAgenda`), então mover/remover uma revisão reatribui ids. Uso permitido: `key` do React dentro de UM
   * render. Proibido: guardar estado de UI (foco, "aberto", edição) indexado por `chave`/`sessao.id` entre salvamentos.
   */
  chave: string;
  data: string;                 // "YYYY-MM-DD"
  situacao: SituacaoItem;       // comparação lexicográfica de `data` com `hoje`
}
export interface ItemEstudo extends ItemBase { tipo: "estudo"; blocos: BlocoEstudo[]; minutosTotal: number }
export interface ItemRevisao extends ItemBase { tipo: "revisao"; sessao: SessaoRevisao }
export interface ItemCheckpoint extends ItemBase {
  tipo: "checkpoint";
  checkpoint: CheckpointVisao;
  /** Sessões persistidas na MESMA data (fusão). Ordem = ordem de entrada. Pode ser vazio. */
  revisoes: SessaoRevisao[];
}
export type ItemLinha = ItemEstudo | ItemRevisao | ItemCheckpoint;

export interface EntradaLinhaDoTempo {
  sessoes: readonly SessaoRevisao[];                 // Prova.sessoes (persistidas)
  plano: PlanoCalculado | undefined;                 // undefined = prova sem plano
  checkpoints: readonly CheckpointVisao[] | undefined;
  hoje: string;                                      // injetado; a função nunca lê o relógio
}
export function montarLinhaDoTempo(e: EntradaLinhaDoTempo): ItemLinha[];
```

### 6.2 Invariantes (testáveis, valem para toda entrada)

- **L1 Conservação de sessões:** a soma de `ItemRevisao` + `Σ ItemCheckpoint.revisoes.length` é igual a `sessoes.length`.
  Cada sessão aparece exatamente uma vez, **com os mesmos valores** (`manual`, `concluida`, `data`, `diasAntes`, `id`).
- **L2 Conservação de checkpoints:** um `ItemCheckpoint` por elemento de `checkpoints`, qualquer `estado`
  (inclusive `indisponivel`).
- **L3 Conservação de estudo:** um `ItemEstudo` por `plano.dias[i]` com `blocos.length > 0`; dia sem blocos é ignorado.
  `minutosTotal = Σ blocos.minutos`.
- **L4 Fusão só por data idêntica** (`sessao.data === checkpoint.data`), sem janela de tolerância. Vale para sugerida
  e manual, concluída ou não.
- **L5 Ordem:** `data` crescente; na mesma data `checkpoint` (com sua revisão fundida) < `revisao` < `estudo`; empates
  restantes mantêm a ordem de entrada (ordenação estável). Resultado não depende da ordem do array de entrada, exceto
  nesses empates.
- **L6 Pureza:** não muta as entradas, não lê relógio, determinística, total (nunca lança; datas já validadas pelo main).
- **L7 Sem plano:** `plano === undefined` e `checkpoints` vazio/`undefined` ⇒ só `ItemRevisao`, equivalente a `sessoes`
  ordenadas por data (mesma ordem relativa dos empates que a Agenda atual).
- **L8 `situacao`:** `data < hoje` ⇒ `passado`; `=` ⇒ `hoje`; `>` ⇒ `futuro`.
- **L9 Nenhum item de prova encerrada é inventado:** prova passada/hoje chega com `plano.dias = []` e checkpoints vazios
  (comportamento já existente de `montarPlanoCalculado`/`planejarCheckpoints`); a função não precisa de regra própria.

### 6.3 Por que janela 0 e não ±N dias

Com os padrões 7/3/1 e checkpoints 28/14/7/3, as coincidências reais são **exatamente** `d7` e `d3`: é o caso pedido
("checkpoint de 7 dias e revisão de 7 dias = mesmo item"). Uma janela de ±1 dia fundiria itens de datas diferentes (ex.:
revisão a 4 dias da prova com o checkpoint `d3`) e **deslocaria visualmente** a sessão para outra data, o que é fusão
com perda de informação. Com intervalos customizados que não coincidem, os dois itens aparecem
adjacentes na mesma lista, o que é honesto e suficiente. A constante não é configurável de propósito.

### 6.4 Tabela de casos (prova `2026-11-20`, `hoje 2026-11-02`)

Notação: `CP(data)` checkpoint; `CP(data)+[sid]` com revisão fundida; `R(data)` revisão avulsa; `E(data)` estudo.
Sessões padrão 7/3/1: `s0=11-13`, `s1=11-17`, `s2=11-19` (todas `manual:false`). Checkpoints: `d14=11-06`, `d7=11-13`, `d3=11-17`.

| # | Entradas | Saída (ordem) |
|---|---|---|
| T1 | `plano` indef., cps `[]`, sessões padrão | `R(11-13) R(11-17) R(11-19)` |
| T2 | sessões padrão + cps d14,d7,d3 | `CP(11-06) CP(11-13)+[s0] CP(11-17)+[s1] R(11-19)` |
| T3 | intervalos 10/5/2 ⇒ `11-10, 11-15, 11-18` + cps | `CP(11-06) R(11-10) CP(11-13) R(11-15) CP(11-17) R(11-18)` (sem fusão) |
| T4 | sessão **manual** em `11-13` + cp d7 | `CP(11-13)+[manual]`; `revisoes[0].manual===true` preservado |
| T5 | duas sessões em `11-13` (sugerida + manual) + cp d7 | `CP(11-13)+[ambas]`, ordem de entrada; nenhuma perdida |
| T6 | sessão em `11-12`, cp d7 em `11-13` | `R(11-12) CP(11-13)` (1 dia de diferença **não** funde) |
| T7 | `E(11-13)`, sessão `11-13`, cp `11-13` | `CP(11-13)+[s] E(11-13)` |
| T8 | `E(11-13)`, sessão `11-13`, sem cp nessa data | `R(11-13) E(11-13)` |
| T9 | sessão `11-13` `concluida:true` fundida | `revisoes[0].concluida===true` preservado |
| T10 | cp `indisponivel` com sessão na mesma data | item existe, `estado:"indisponivel"`, revisão fundida |
| T11 | só `plano.dias`, sem sessões, sem cps | só `E(...)` por dia, em ordem |
| T12 | sessão na data da prova (`11-20`, `diasAntes:0`) | último item `R(11-20)`; não existe `E(11-20)` |
| T13 | sessões desordenadas na entrada | saída ordenada por data (empate: ordem de entrada) |
| T14 | `hoje=11-13`; itens em 11-12, 11-13, 11-14 | `passado`, `hoje`, `futuro` |
| T15 | tudo vazio | `[]` |
| T16 | entradas congeladas (`Object.freeze` profundo) | não lança, entradas intactas |
| T17 | dia do plano com `blocos: []` | nenhum `ItemEstudo` para ele |
| T18 | prova passada: `dias=[]`, cps `[]`, sessões antigas | só `R(...)` com `situacao:"passado"` |
| T19 | propriedade (100 entradas pseudoaleatórias, semente fixa) | L1, L2, L3, L5 verificados |

## 7. Controles manuais herdados

| Item | Marcar feita | Mover | Remover | Notas |
|---|---|---|---|---|
| `estudo` (bloco calculado) | **Não** | **Não** | **Não** | Derivado do questionário e recalculado a cada abertura; não existe como sessão persistida. Para mudar: "Editar plano". O app não mede o que foi estudado (limitação já registrada na fatia 4; **não coberto**). |
| `revisao` avulsa | Sim (checkbox, `concluida`) | Sim (`input date`, `min=hoje`, `max=data da prova`, seta `manual:true`) | Sim (botão "Remover") | Exatamente o código atual (`alternarConcluida`, `moverSessao`, `removerSessao`) via `salvarSessoes`. |
| `revisao` fundida (dentro do `checkpoint`) | Sim | Sim | Sim | Sub-linha "Revisão de N dias" dentro do item, com os mesmos três controles. Mover para outra data **desfaz a fusão** (o checkpoint fica onde está). Remover apaga só a sessão; o checkpoint permanece. |
| `checkpoint` | n/a | **Não** (data = prova − 28/14/7/3) | **Não** | Ciclo próprio da fatia 4: gerar / gerar outra / abrir / marcar como concluída. Concluir checkpoint **não** marca a revisão fundida (são dois estados; cada um com seu controle) — ver "não coberto". |
| Lista | "Adicionar revisão" (cria sessão `manual:true` na data da prova, como hoje) | | "Regerar revisões sugeridas" (`regerarAgenda`, igual a hoje) | Regerar restaura sugeridas removidas, preserva manuais e concluídas; não toca em estudo nem em checkpoints. |

A decisão é deliberadamente simples: tudo o que **já é persistido como sessão** continua editável como hoje; o que é
**derivado** (estudo) ou tem **ciclo próprio** (checkpoint) não ganha controles que mentiriam sobre o que fazem.

## 8. Provas sem plano e migração de sessões

- **Sem plano:** a UI renderiza o bloco "Agenda de revisão" atual, **inalterado** (JSX, handlers, textos, classes).
  `criarProva`, `salvarSessoes`, `regerarAgenda` e `recomputarAgenda` não mudam de comportamento para quem não usa
  `tipo`. A única mudança observável é a regra de data mínima ao criar/editar (pedido explícito do usuário).
- **Montar plano em prova com sessões editadas à mão:** `salvarPlano` não toca em `sessoes` (já é assim:
  `{...prova, plano, atualizadoEm}`). As sessões (sugeridas, manuais, concluídas) passam a ser mostradas na linha do
  tempo; as que caem em data de checkpoint aparecem fundidas; nenhuma é movida ou apagada. **Não há etapa de migração.**
  Teste dedicado: `sessoes` deep-equal antes/depois de `salvarPlano` e de `editarProva(tipo)`.
- **Efeito colateral aceito e já existente:** `salvarSessoes` e `recomputarAgenda` descartam sessões com `data < hoje`
  no próximo salvamento (inclusive concluídas). Continua igual nos dois modos; está na lista "NÃO coberto" (§13).

## 9. UI/UX da Agenda

### 9.1 Ordem dos blocos na prova selecionada

A ordem real hoje é: cabeçalho → formulário do plano → Diagnóstico → Checkpoints → **Dica do dia** → Agenda de revisão
(a Dica fica *antes* da lista de sessões). A proposta mantém essa ordem e troca os dois últimos blocos de dados por um:

1. Cabeçalho da prova (Editar prova / Montar ou Editar plano) — inalterado.
2. Formulário do plano (`PlanoEstudo` + `PlanoPrevia` "O que estudar", só enquanto `montandoPlano`) — inalterado.
3. Card **Diagnóstico** (`Diagnostico.tsx`) — inalterado, depois do formulário e **antes da Dica do dia**.
4. **Dica do dia** — inalterada.
5. **Plano de estudo — linha do tempo** (`LinhaDoTempo`), **só quando a prova tem plano e `!montandoPlano`**. Substitui o
   card "Checkpoints" e o bloco "Agenda de revisão".
6. Prova **sem plano**: bloco "Agenda de revisão" atual no lugar do item 5.

"Sem duplicar prévias": enquanto `montandoPlano` está aberto, a linha do tempo fica oculta (mesma condição que já
esconde Diagnóstico e Checkpoints); a prévia "O que estudar" só existe dentro do formulário. A linha do tempo mostra o
plano consolidado fora do formulário.

### 9.2 `LinhaDoTempo.tsx` (novo)

- Cabeçalho `h4` "Plano de estudo" com a frase de uma linha "Estudo, revisões e checkpoints na mesma lista, por data."
- Barra de ações: "Adicionar revisão", "Regerar revisões sugeridas" (botões secundários, como hoje).
- Bloco "Quando preparar as listas dos checkpoints" (o `fieldset` Lembrar-me / Automático atual) logo abaixo do
  cabeçalho, mais o aviso "plano mudou… listas não valem mais" e a frase de lembrete do candidato (`fraseLembrete…`),
  tudo vindo do mesmo estado do hook de checkpoints.
- Lista: `<ol>` de dias; cada dia `<li>` com `<h5><time dateTime="…">dd/mm · dia da semana</time> [Hoje]</h5>` e uma
  `<ul>` dos itens do dia, na ordem L5.
- Item `estudo`: texto "Estudo · 90 min · Limites (40), Derivadas (50)"; sem controles.
- Item `revisao`: rótulo "Revisão de N dias" + (manual) + checkbox "feita" + `input date` + "Remover" (idêntico ao atual).
- Item `checkpoint`: o corpo atual do `<li>` do card (estado, "Cobre: …", ações, lista aberta com `ListaExercicios`),
  mais a sub-linha de revisão fundida quando houver.
- Estados vazios: sem itens ⇒ "Nada agendado. Use “Adicionar revisão” ou ajuste o plano."; falha de
  `calcularPlano`/`calcularCheckpoints` ⇒ `role="alert"` com a frase amigável e a lista mostra o que conseguiu (no pior
  caso, só as revisões, como hoje).

### 9.3 Reaproveitamento sem reescrever

- `Checkpoints.tsx`: refatoração **mecânica, sem mudar lógica**: extrair o estado e as ações (`visao`, `gerar`, `concluir`,
  `trocarPreferencia`, automático, reconsulta de 5 s) para o hook `useCheckpoints(prova, aoAtualizar)` e o corpo do `<li>`
  para o componente `CheckpointLinha`. `LinhaDoTempo` usa o hook uma única vez. O card `Checkpoints` deixa de ser
  renderizado pela Agenda (o arquivo fica com hook + componentes). `checkpointsReconsulta.ts` e seus testes não mudam.
- `Diagnostico.tsx`, `PlanoPrevia.tsx`, `ListaExercicios`: inalterados.
- `PlanoEstudo.tsx`: só a seção do ordinal (§3.2).
- `LinhaDoTempo` obtém `plano.dias` por `getApi().calcularPlano(prova.id)` e checkpoints pelo hook (`calcularCheckpoints`);
  o `hoje` usado na montagem é `visao.hoje` (relógio do main), com fallback `dataLocalDe(new Date())` enquanto carrega.
  Os dois são refeitos quando `prova.atualizadoEm` muda (toda ação grava e recarimba).

### 9.4 Acessibilidade e temas

Cores só por variáveis CSS existentes (`--cor-*`), nada de hex novo, para claro/escuro. O tipo do item é sempre dito em
texto ("Estudo", "Revisão", "Checkpoint"), nunca só por cor ou ícone. "Hoje" é texto. Controles com rótulo acessível
("Revisão de 13/11 feita", "Mover revisão de 13/11 para outra data", "Remover revisão de 13/11"). Ordem do DOM = ordem
de leitura = ordem cronológica. Foco visível herdado de `styles.css`. Status de preparo com `role="status"
aria-live="polite"` (como hoje). Classes novas `.linha-*` em `styles.css`. Validação completa de WCAG exige teste manual
com tecnologia assistiva; este design só especifica as práticas.

## 10. Tratamento de erros (por operação)

| Operação | Falha | Tipo | Quem recebe | Log |
|---|---|---|---|---|
| `criarProva` | título vazio / data inválida / vínculo inválido | recuperável, `DadosProvaInvalidosError` (como hoje) | renderer, frase pronta | sem log (erro do usuário) |
| `criarProva` | **data hoje/passada** | recuperável, `DadosProvaInvalidosError(mensagemDataMinima)` | renderer, frase pronta em `role="alert"`; nada gravado | sem log |
| `criarProva` / `editarProva` | `tipo` inválido | recuperável, `DadosProvaInvalidosError("Escolha um tipo de prova válido.")` | idem | sem log |
| `editarProva` | prova inexistente | `ProvaNaoEncontradaError` (como hoje) | frase pronta | como hoje |
| `editarProva` | data alterada para hoje/passada | recuperável, como acima | idem | sem log |
| `editarProva` | data omitida ou igual à gravada (mesmo passada) | **não é erro** | — | — |
| `salvarPlano` | ordinal ausente e prova sem `tipo` | `DadosProvaInvalidosError("Informe qual prova é.")` (como hoje) | idem | — |
| `carregarProva` | `tipo` corrompido em disco | recuperável, chave descartada em silêncio (leitura tolerante) | prova abre sem `tipo` | sem log (padrão de `diagnostico`/`checkpoints`) |
| `salvarSessoes` / `regerarAgenda` | como hoje | inalterado | | |
| Renderer: `calcularPlano` falha | recuperável | `role="alert"`; lista sem blocos de estudo | | |
| Renderer: `calcularCheckpoints` falha | recuperável (erro de carga já tratado em `Checkpoints`) | alerta; lista sem checkpoints | | |
| Escrita atômica falha | fatal para a chamada | erro genérico de persistência de `mensagemAmigavelProva` | | padrão atual |

Falhas inesperadas seguem o padrão atual dos handlers; este design não adiciona logs.

## 11. Validação de entradas externas

| Entrada | Obrigatório | Tipo/limite | Falha |
|---|---|---|---|
| `NovaProva.tipo` | Não | `TipoProva`; `undefined`/`null` = omitido | valor não nulo inválido ⇒ `DadosProvaInvalidosError` |
| `MudancasProva.tipo` | Não | `TipoProva \| null`; `null` remove | idem |
| `NovaProva.data` | Sim | `YYYY-MM-DD` válida **e ≥ amanhã** | erro tipado (frase pronta) |
| `MudancasProva.data` | Não | válida; se **mudou**, ≥ amanhã | idem; inalterada passa |
| `titulo` | Sim | trim, 1–200 (trunca), igual a hoje | igual a hoje |
| Ordinal do `salvarPlano` | Sim se não há `tipo` | com `tipo`, **sobrescrito** por `ordinalDeTipo` | igual a hoje |
| Datas de sessão (renderer) | — | `min=hoje`, `max=data da prova` só na UI | o main descarta passadas como hoje |

## 12. Arquivos

Novos: `src/shared/{tipoProva,nomeProva,dataProva,linhaDoTempo}.ts`; `src/renderer/views/LinhaDoTempo.tsx`.

Alterados:
- `src/shared/types.ts` (`TipoProva`, `Prova.tipo?`), `src/shared/ipc.ts` (assinaturas de `criarProva`/`editarProva`;
  **sem canal novo**).
- `src/main/services/provas.ts` (`tipo` em criar/editar/carregar, backfill em `salvarPlano`, data mínima, `hojeLocal`
  delegando a `dataLocalDe`). `MudancasProva`/`NovaProva` ganham `tipo` (§3.4) e os literais de `criarProva`/`editarProva` em
  `src/shared/ipc.ts` também. `src/main/ipc/index.ts`: **sem mudança funcional** (os handlers já passam `hojeLocal()`;
  só os tipos mudam). `src/main/preload.ts` e `src/renderer/api.ts`: sem mudança
  (conferir na implementação que nada tipa os campos de forma fechada).
- `src/renderer/views/Agenda.tsx` (formulário, `min`, título automático, `noValidate`, ramo plano/sem plano),
  `PlanoEstudo.tsx` (ordinal), `Checkpoints.tsx` (hook + componentes), `src/renderer/styles.css` (`.linha-*`).
- `src/main/services/{planoCalculo,checkpoints}.ts`, `src/shared/{plano,checkpoints,agenda}.ts`: **sem mudança**
  (`agenda.ts` só é importado).

## 13. Casos de borda — cobertos × NÃO cobertos

| Caso | Tratamento | Coberto? |
|---|---|---|
| Revisão e checkpoint na mesma data | item único, revisão fundida (L4) | ✅ |
| Sessão manual na data de um checkpoint | fundida, `manual` preservado, controles mantidos | ✅ |
| Duas sessões na data de um checkpoint | ambas em `revisoes` | ✅ |
| Revisão 1 dia antes/depois do checkpoint | **não** funde; itens adjacentes | ✅ (decisão) |
| Mover sessão fundida para outra data | desfaz a fusão; nada perdido | ✅ |
| Remover sessão fundida | só a sessão sai; checkpoint fica | ✅ |
| Prova sem plano | bloco legado inalterado + teste de regressão | ✅ |
| Montar plano com sessões editadas à mão | zero mudança em `sessoes` | ✅ |
| Prova antiga sem `tipo`, com `plano.ordinal` | válida; radios aparecem; cálculos idênticos | ✅ |
| `tipo` corrompido em disco | descartado na leitura | ✅ |
| Trocar tipo/ordinal com diagnóstico concluído | assinatura muda ⇒ diagnóstico e checkpoints "desatualizados" | ✅ |
| Trocar `segunda`/`final`→`primeira` (ou ENEM/ENADE) com assuntos marcados "novo" | UI exige confirmação explícita ("Salvar e descartar marcação"); só então `novo=false` | ✅ (confirmação) |
| Voltar `primeira`→`segunda`/`final` depois de descartar | tópicos ficam base; aviso para revisar o plano (a marcação descartada não volta) | ✅ (aviso) |
| ENEM + caderno já escolhido | vínculo e nome do caderno preservados (`vinculoAposEscolherTipo`) | ✅ |
| `tipo` válido divergente de `plano.ordinal` em disco (edição manual) | não reconcilia na leitura; cálculo usa `plano.ordinal`; escrita seguinte restaura I1 | ✅ |
| Apagar o título ao editar prova existente | continua "do usuário"; salvar vazio é rejeitado; só o botão "Usar sugestão" restaura o automático | ✅ |
| Foco/estado de UI por id de sessão entre salvamentos | proibido (ids posicionais); `chave` só como `key` de render | ✅ |
| ENEM/ENADE | ordinal `primeira`; sem "novo"; sem lista curada | ✅ (decisão a confirmar) |
| Título digitado à mão e depois mudar caderno/tipo | não sobrescreve | ✅ |
| Aluno apaga o título | volta ao automático | ✅ |
| Editar prova existente | título nunca muda sozinho; botão "Usar sugestão" explícito | ✅ |
| Data = hoje / passada ao criar | rejeitada no main (e na UI) | ✅ |
| Virada do dia com o formulário aberto | `min` recalculado a cada render; main rejeita data que virou "hoje" | ✅ |
| Fuso | data-calendário local (`dataLocalDe`), nunca UTC | ✅ |
| Prova antiga com data passada | abre, aparece "já ocorreu"; salvar sem mudar a data é aceito | ✅ |
| Editar prova antiga mudando a data para outra passada/hoje | rejeitada | ✅ |
| Prova hoje (`diasRestantes=0`) | sem estudo/checkpoints; só sessões | ✅ |
| Plano `nao_cabe` | estudo mostra o que coube; aviso do plano segue na prévia/Diagnóstico | ✅ |
| `calcularPlano`/`calcularCheckpoints` falham | alerta + lista parcial | ✅ |
| Dia do plano sem blocos | sem item | ✅ |
| Sessão movida para depois da prova | impedida na UI (`max`); **main não impede** | ⚠️ parcial (UI) |
| Sessões passadas somem no próximo salvamento (inclusive concluídas) | comportamento atual, inalterado nos dois modos | ❌ NÃO coberto (herdado) |
| Marcar bloco de estudo como feito / medir o que foi estudado | não existe; estudo é derivado | ❌ NÃO coberto |
| Concluir checkpoint marcar a revisão fundida | dois estados independentes | ❌ NÃO coberto (decisão de simplicidade) |
| Fundir revisões e checkpoints a ±N dias | só data idêntica | ❌ NÃO coberto (decisão) |
| Lista longa (prova a 90+ dias ⇒ dezenas de itens de estudo) | rolagem; sem agrupar por semana/colapsar | ❌ NÃO coberto |
| Atualizar a linha do tempo ao virar o dia sem interação | só ao reabrir/interagir | ❌ NÃO coberto (igual ao card de checkpoints) |
| Testes de componente React | o repo não tem; lógica foi extraída para o puro | ❌ NÃO coberto (verificação manual) |
| Lista curada de assuntos ENEM/ENADE; busca online | fora de escopo | ❌ por desenho |
| "Isto cai na prova" | nunca prometido | ❌ por desenho |
| Remover plano e voltar ao modo legado | não existe a ação hoje | ❌ fora de escopo |

## 14. O que NÃO muda (confirmação)

Geração por IA (prompts, `format:"json"`, parsers, corretiva, `modeloParaGeracao`); régua base/novo
(`calcularMisturaBaseNovo`); distribuição por dias (`calcularPlano`, `datasEntre`, dias úteis); classificação do
diagnóstico (`classificarDiagnostico`, `pontuarDiagnostico`) e `assinaturaPlano`; `planejarCheckpoints`/estados/automático;
`gerarAgenda`/`recomputarAgenda` e a dica do dia. A única interação com esses módulos é o ENEM/ENADE usar o ramo
`primeira` que **já existe e já é testado**.

## 15. Plano de testes (Vitest; Ollama continua mockado; nenhum teste usa a pasta `Facul`)

**Puro (`tests/shared/`)**
- `linhaDoTempo.test.ts`: tabela T1–T19 completa (inclui fusão T2/T4/T5/T6/T7/T10, preservação de manual/concluída
  T4/T9, imutabilidade T16, propriedade T19 com semente fixa).
- `nomeProva.test.ts`: tabela §4.2; `tituloAposDigitar`/`tituloAposMudanca` para cada linha de §4.3 (editado não
  sobrescreve; vazio retoma o automático; mesma referência quando `editado`).
- `dataProva.test.ts`: tabela §5.2 com `hoje` fixo, incluindo virada de mês/ano/bissexto e `dataLocalDe` com
  `new Date(2026, 9, 30, 23, 59)` e `new Date(2026, 9, 31, 0, 1)` (construtor local ⇒ independente de fuso do CI).
- `tipoProva.test.ts` (também): tabela completa de `vinculoAposEscolherTipo` (§2.2): caderno já escolhido + ENEM ⇒ `caderno`;
  vínculo intocado sem caderno + ENEM/ENADE ⇒ `abrangente`; voltar a 1ª prova não desfaz; `tocado=true` + ENEM ⇒ `caderno`.
  `tipoDescartaNovos`: plano com `novo` + `primeira`/`enem`/`enade` ⇒ true; plano sem `novo`, sem plano, ou ordinal atual
  já `primeira` ⇒ false; `segunda`→`final` ⇒ false.
- `nomeProva.test.ts` (também): `tituloAposDigitar("", "criar").editado===false`; `tituloAposDigitar("", "editar").editado===true`.
- `dataProva.test.ts` (também): ordem de avaliação: `data` inválida com `dataAtual` igual ⇒ `formato`; `data===dataAtual`
  com `hoje` inválido ⇒ ok sem lançar; `hoje` inválido na etapa 3 ⇒ lança; `data` inválida nunca lança.
- `tipoProva.test.ts`: `ordinalDeTipo` para os 5 tipos (**ENEM→primeira, ENADE→primeira**); `aplicarOrdinalAoPlano`
  (forca `novo=false` em `primeira`, mesma referência se igual, não toca `atualizadoEm`); **troca de ordinal muda
  `assinaturaPlano` e `estadoDiagnostico` vira "desatualizado"**.

**Main (`tests/main/`)**
- `provas-unificacao.test.ts` (diretório temporário, `hoje` injetado):
  - Data mínima: `hoje=2026-10-30` ⇒ criar com `10-30` e `10-29` **rejeita** (mensagem pt-BR), `10-31` **aceita**; virada do
    dia (mesma data aceita com `hoje=10-30` e rejeitada com `hoje=10-31`); `hojeLocal()` com `vi.useFakeTimers` +
    `vi.setSystemTime(new Date(2026, 9, 30, 23, 59))` e `(2026, 9, 31, 0, 1)`.
  - Edição: prova antiga semeada por JSON com data passada **abre** (`carregarProva`, `listarProvas` ⇒ `estado:"passada"`);
    `editarProva` só do título passa; com a mesma data passa; mudando a data para passada/hoje **rejeita**; para amanhã aceita
    e recomputa a agenda preservando manuais.
  - `tipo`: criar com/sem `tipo` (sem `tipo` ⇒ chave ausente no JSON); `tipo` inválido rejeita; `editarProva({tipo:null})`
    remove a chave.
  - Ordinal: `salvarPlano` com `tipo:"enem"` grava `plano.ordinal==="primeira"` e `novo=false` mesmo que o renderer
    mande `final`; sem `tipo`, backfill `tipo=plano.ordinal`; `editarProva({tipo:"final"})` com plano ⇒ `plano.ordinal`
    sincronizado, `plano.atualizadoEm` intacto, **diagnóstico concluído passa a "desatualizado" e checkpoints também**.
  - **`novo` ao trocar o tipo:** `segunda` com tópicos `novo=true` → `editarProva({tipo:"primeira"})` ⇒ todos `novo=false`
    e `plano.atualizadoEm` intacto; → `editarProva({tipo:"segunda"})` ⇒ `ordinal==="segunda"`, `novo` segue `false` (não
    restaura, comportamento documentado e confirmado pela UI); diagnóstico desatualizado nos dois sentidos.
  - **`salvarPlano` × `tipo`:** `planoBruto` não-objeto ⇒ `sanearPlano` lança como hoje; objeto com ordinal divergente e
    `tipo:"enade"` ⇒ gravado `primeira`; prova sem `tipo` ⇒ backfill `tipo=plano.ordinal`.
  - **Divergência em disco:** JSON com `tipo:"final"` e `plano.ordinal:"primeira"` ⇒ `carregarProva` devolve ambos como
    estão (sem lançar); `calcularPlano` usa `primeira`; `salvarPlano` seguinte grava `ordinal==="final"` (I1 restaurado).
  - **Round-trip de prova ANTIGA:** fixture JSON (sem `tipo`, com `sessoes` manuais/concluídas, `plano`, `diagnostico`,
    `checkpoints`) ⇒ `carregarProva` deep-equal ao arquivo; depois `editarProva` (título), `salvarSessoes`, `regerarAgenda`
    e `salvarPlano` ⇒ blocos preservados e nenhuma chave `tipo: undefined` gravada (exceto o backfill documentado no
    `salvarPlano`).
  - **Sessões preservadas:** `sessoes` deep-equal antes/depois de `salvarPlano` e de `editarProva({tipo})`.
  - `tipo` corrompido no JSON (`"xyz"`) ⇒ `carregarProva` descarta a chave sem lançar.
- `agenda-regressao-sem-plano.test.ts`: sequência `criarProva → salvarSessoes → regerarAgenda → editarProva(data)` sem `tipo`
  e sem plano produz **exatamente** os JSONs/objetos esperados (golden fixados a partir do comportamento atual);
  `montarLinhaDoTempo({plano:undefined, checkpoints:[]})` ≡ sessões ordenadas por data (L7).
- `ipc-agenda.test.ts` (ajuste): `criarProva`/`editarProva` recebem `hojeLocal()` e repassam `tipo`.
- **Migração dos testes existentes que criam provas hoje/passadas via `criarProva`** (ex.: em `provas.test.ts`,
  "ordena por data…" com `Hoje` e "prova passada aparece com estado 'passada'"): passam a semear a prova por um helper de
  teste que grava o JSON direto em `baseDir`. As asserções permanecem; só o caminho de semeadura muda. Os demais usam datas
  futuras e não são afetados. Este é o único ajuste esperado em testes existentes; o baseline não deve perder testes.

**Renderer (`tests/renderer/`)**: sem testes de componente (o repo não tem). Cobertura indireta via funções puras. Checklist
manual na entrega: criar prova (caderno → nome; tipo → nome; digitar à mão e trocar tipo ⇒ não sobrescreve); data de
hoje bloqueada no picker e na mensagem; prova antiga abre; montar plano ⇒ linha do tempo única; fusão d7/d3; mover,
marcar, remover e adicionar revisão; gerar/abrir/concluir checkpoint pela linha; tema claro/escuro; navegação por teclado.

**Gate:** `npm run build`, `npm run lint`, `npm test` verdes. Atualizar `tasks/PROGRESSO.md`, `tasks/todo.md`, `README.md`
no fim (regra do repositório), com a contagem real de testes.

## 16. Ordem de implementação (fatias verificáveis)

1. Puros + testes: `dataProva`, `tipoProva`, `nomeProva`, `linhaDoTempo` (sem tocar app).
2. Main: `tipo` (criar/editar/carregar), data mínima, `salvarPlano` com ordinal derivado; testes de main; ajustar a
   semeadura dos 2–3 testes antigos.
3. Formulário: tipo, título automático, `min`, `noValidate`, mensagens; `PlanoEstudo` sem pergunta repetida.
4. `Checkpoints.tsx` ⇒ hook + `CheckpointLinha`; `LinhaDoTempo`; ramo plano/sem plano em `Agenda.tsx`; CSS.
5. Verificação manual guiada, docs (3 arquivos), commit.

## 17. Pontos para sinalizar ao usuário

1. **ENEM/ENADE valem como "1ª prova" no plano** (sem "novo"; diagnóstico não rebalanceia o plano, como em toda 1ª prova).
2. Revisão e checkpoint só se fundem **na mesma data** (na prática, os de 7 e 3 dias antes).
3. Blocos de estudo **não são editáveis nem marcáveis**; revisões continuam com marcar/mover/remover.
4. "Regerar sugestões" fica, renomeado, e só afeta revisões.
5. Provas antigas com data passada continuam abrindo; só **novas** datas passadas/hoje são bloqueadas.
6. Sessões movidas à mão podem ser a partir de **hoje** (não de amanhã) e até a data da prova.
7. Trocar o tipo de uma prova que já tem plano para 1ª prova/ENEM/ENADE **descarta a marcação de assuntos "novo"**; a tela pede confirmação antes.
8. ENEM/ENADE só sugerem "prova abrangente" se você ainda não escolheu caderno; se já escolheu, o caderno e o nome ficam.

## 18. Respostas à revisão do design (loop 2)

| # | Sev. | Resposta |
|---|---|---|
| 1 | MEDIUM | **Corrigido.** `vinculoAposEscolherTipo` (pura, com `tocado`) em §2.2, regra reescrita em §3.2(c), tabela de casos e testes em §15, borda em §13. |
| 2 | MEDIUM | **Corrigido pela opção (b) (confirmação).** §3.4(5): UI bloqueia até confirmar quando há `novo` e o destino é `primeira`; `tipoDescartaNovos` pura; main segue autoridade. Opção (a) descartada com motivo (tocaria `montarPlanoCalculado`/`assinaturaPlano`). Teste `segunda→primeira→segunda` em §15; §13 atualizado. |
| 3 | NIT | **Corrigido.** `tituloAposDigitar(valor, modo)`; exceção declarada em §4.1/§4.3: em edição o vazio não retoma o automático. |
| 4 | NIT | **Corrigido.** Passo a passo do `salvarPlano` (clone raso do bruto, guarda para não-objeto, backfill pós-saneamento) em §3.2(a); testes em §15. |
| 5 | NIT | **Corrigido.** `MudancasProva = Partial<Pick<…>> & { tipo?: TipoProva \| null }`, `NovaProva.tipo?` e literais de `shared/ipc.ts` em §3.4; §12 passa a listar `provas.ts` e `ipc.ts` como edições de tipo (preload sem mudança). |
| 6 | NIT | **Corrigido.** Contrato de `chave` em §6.1: determinística por render, não estável entre salvamentos; uso restrito a `key` do React. |
| 7 | NIT | **Corrigido.** Ordem fixa de avaliação de `validarDataProva` e política de `hoje` inválido em §5.1; testes em §15. |
| 8 | NIT | **Corrigido.** "I1 só por escrita; divergência em disco ignorada, cálculo usa `plano.ordinal`" em §2.5; teste em §15. |

Pendências **não verificadas** pela revisão e herdadas: contagem exata de 945 testes (não executada na fase de design),
corpo de `Checkpoints.tsx` (extração mecânica depende de o componente não ter estado entrelaçado ao JSX; conferir na
fatia 4) e a ordem real dos blocos em `Agenda.tsx` (§9.1 foi descrita a partir de leitura do código na fase anterior).
