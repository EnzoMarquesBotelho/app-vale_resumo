# Design Review — Plano de estudo guiado, Fatia 2/4 (3ª rodada)

> Revisão fresca de `tasks/design-f2.md` (3ª versão), sem o contexto que o
> produziu. Critério: se o design não se sustenta sozinho e sem ambiguidade,
> não está pronto para implementar. Verdito mecânico: qualquer HIGH ou MEDIUM
> ⇒ CHANGES_REQUESTED.
>
> Esta revisão leu o **código real** do worktree para verificar as suposições,
> não apenas o texto do design. Ver as seções "Suposições Verificadas" e
> "Suposições Não Verificadas / Erradas" ao fim.

---

## Veredito

**CHANGES_REQUESTED** — 2 MEDIUM, 0 HIGH, 4 NIT.

As duas peças mais arriscadas pedidas pelo enunciado — a **régua base/novo** e o
**bloco de persistência** — estão, no mérito, **corretas e bem especificadas**
(ver abaixo). Os dois MEDIUM estão ambos na **distribuição por dias** (§7.3/§7.5):
um limite mal definido entre "cabe tudo" e "não cabe" por fragmentação, e uma
regra de piso no algoritmo que pode entrar em laço com a regra de reconciliação
de minutos. Nenhum bloqueia a régua nem a persistência; são refinamentos no
algoritmo de alocação.

---

## Findings

### MEDIUM-1 — Fronteira "cabe tudo" × "não cabe por fragmentação" fica subespecificada (§7.3 passos 5 e 7; §7.5)

**Problema.** O passo 5 garante dois invariantes de saída simultâneos:
`Σ minutosTopico === capacidadeTotal` **e** todo `minutosTopico >= 15`. Ou seja,
depois do passo 5 a soma dos minutos-alvo é **exatamente** a capacidade total dos
dias. Mas o passo 7 **desperdiça** a folga de fim de dia quando `folga < 15`
("capacidade morta aceita"). Logo, sempre que houver qualquer fragmentação (uma
folga de 1–14 min em qualquer dia), os blocos efetivamente colocados somam
**menos** que `capacidadeTotal`, e por conservação os minutos que sobram viram
**resíduo** → o(s) tópico(s) com resíduo ≥15 são contados em `topicosForaDoPlano`
→ `aviso: nao_cabe`.

Consequência: o caso que a tabela §7.5 chama de **"Cabe tudo (todos alvo >= 15 e
minutos couberam nos dias)" → sem aviso** é, na prática, **raro** — só ocorre
quando a fragmentação total é zero (nenhuma folga <15 em nenhum dia). O design
apresenta "cabe tudo, sem aviso" como o caso normal esperado, mas o algoritmo o
torna a exceção. Pior: o design **não define** a condição exata sob a qual a
linha "cabe tudo" se aplica, então o implementador não consegue escrever o teste
que distingue "cabe tudo" de "não cabe por fragmentação" — não há predicado
preciso para `aviso === undefined`.

Há ainda uma tensão de intenção: tratar uma folga de, digamos, 10 minutos num dia
como "um tópico ficou de fora" pode **exagerar** o aviso honesto (o intent quer
honestidade, não alarme por 10 minutos perdidos).

**Fix concreto.** Escolher e fixar **uma** regra explícita, por exemplo:

1. **Dimensionar o orçamento pela capacidade *efetiva*, não pela total.** No
   passo 2, em vez de `capacidadeTotal = D * capacidadeDia`, usar uma capacidade
   que já desconte a fragmentação previsível — ou, mais simples e determinístico:
   calcular os minutos-alvo (passos 2–5) sobre `capacidadeTotal`, **mas** definir
   `nao_cabe` **apenas** quando o passo 4 removeu tópicos **ou** quando o resíduo
   de um tópico ao fim do passo 7 for `>= MINUTOS_BLOCO_MIN`. Resíduo de um tópico
   `< 15` ao fim NÃO conta como "fora" (o tópico foi essencialmente todo
   alocado); apenas a folga morta é perdida, sem marcar tópico.

   Então reescrever o passo 8 como: `K = (tópicos removidos no passo 4/5) +
   (tópicos cujo resíduo ao fim do passo 7 é >= 15)`. Deixar explícito que um
   resíduo `< 15` ao fim é descartado como folga aceitável e **não** dispara
   `nao_cabe`.

2. **Definir o predicado de "cabe tudo".** Acrescentar à §7.5, na linha "Cabe
   tudo", a condição formal: _"nenhum tópico removido no passo 4/5 E nenhum tópico
   com resíduo >= 15 ao fim do passo 7"_. Qualquer outra coisa ⇒ `nao_cabe`.

Sem isso, o teste do §12 "cabe → `mistura` presente, sem aviso" não tem uma
entrada construível com confiança (o autor do teste não sabe que combinação de
`horasPorDia`/`D`/tópicos garante zero fragmentação).

---

### MEDIUM-2 — O laço de reconciliação piso×largest-remainder (passo 5) pode não convergir como descrito, e sua terminação não é provada (§7.3 passo 5)

**Problema.** O passo 5 diz: após o largest-remainder, "re-verifica-se o piso: se
algum `minutosTopico < 15`, remove-se o de menor prioridade e repete-se **do passo
4**; converge porque cada iteração reduz o nº de tópicos." Dois problemas:

1. **A justificativa de terminação está incompleta.** "Cada iteração reduz o nº de
   tópicos" só garante terminação se o laço *sempre* remover ao menos um tópico por
   volta. Mas o gatilho da re-verificação é `minutosTopico < 15` *depois* do
   largest-remainder. O passo 4 já removeu todos com `alvo < 15`, então ao entrar
   no largest-remainder todo `alvo >= 15`. O `Math.floor(alvo)` só cai abaixo de 15
   se `alvo ∈ [15,16)`, e o largest-remainder devolve +1 a alguns. O design afirma
   que, se mesmo assim algum ficar <15, remove-se e repete. Isso é plausível, mas o
   documento **não demonstra** que a remoção escolhida (menor prioridade) é
   necessariamente um tópico com `minutosTopico < 15` — pode-se remover um tópico
   de baixa prioridade que **cabia** (≥15) e deixar o problemático (alta
   prioridade, 14 min) no plano, caindo em laço sem resolver o `<15`.

2. **Interação com o passo 4.** Repetir "do passo 4" re-executa a remoção por
   `alvo < 15`. Mas, com um tópico a menos, `orcCamada` é o mesmo e `somaPesos`
   diminui, então os `alvo` dos remanescentes **sobem** — o que pode fazer um
   tópico antes limítrofe subir acima de 15 e **não** ser removido, e o problema do
   `floor→14` reaparecer em outro tópico. A convergência real depende de detalhes
   que o design não fixa.

**Fix concreto.** Simplificar para um invariante de terminação demonstrável.
Opção recomendada: **tornar o piso de 15 uma restrição do próprio
largest-remainder**, não um pós-passo iterativo:

- Após o largest-remainder, se existir algum `minutosTopico < 15`, remover
  **exatamente o(s) tópico(s) com `minutosTopico < 15`** (não "o de menor
  prioridade"), recomputar e repetir. Como cada volta remove ao menos um tópico
  cujo valor era <15, e nunca reintroduz tópicos, o laço remove ≥1 por iteração e
  termina em ≤ (nº de tópicos da camada) voltas. Documentar esse limite superior
  explícito.

Alternativamente, provar no documento por que "remover o de menor prioridade"
sempre elimina um `<15` (e não um tópico que cabia), ou trocar o critério de
remoção do passo 5 para "menor prioridade **entre os que estão <15**". Qualquer
uma resolve, desde que o documento declare o invariante "cada iteração remove ≥1
tópico" de forma que o leitor não precise reconstruí-lo.

---

### NIT-1 — `capacidadeTotal` usa `D = datasDisponiveis.length`, mas o orçamento por camada é repartido antes de conhecer a fragmentação (§7.3 passos 2–5)

**Problema.** Decorre do MEDIUM-1: `capacidadeTotal = D * capacidadeDia` trata a
capacidade como um bloco contínuo, mas a alocação por dia (passo 7) é
descontínua (cada dia é um balde de `capacidadeDia`). Repartir o orçamento
assumindo um contínuo e depois alocar em baldes fragmentados é a origem da folga
morta. Não é um bug, mas o documento se beneficiaria de nomear essa aproximação
("tratamos a capacidade como contínua ao orçar; a fragmentação por dia é
reconciliada como folga aceita/`nao_cabe` no passo 7").

**Fix.** Uma frase no início do §7.3 declarando a aproximação contínuo→baldes e
remetendo ao tratamento de resíduo (após resolver o MEDIUM-1).

---

### NIT-2 — `dificuldadeBase` = média com `facil→0` pode subdimensionar a base numa camada de um só tópico (§6.1, §8.3)

**Problema.** `nivelParaPeso` mapeia `facil→0`. A `dificuldadeBase` passada à
régua é a **média** desses pesos sobre os tópicos base. Logo, uma base com um
único tópico "fácil" dá `dificuldadeBase = 0`, e o passo 3 da régua não aplica
nenhum empurrão — coerente. Mas o mesmo mapeamento é reutilizado no peso de
distribuição `w = 1 + dificuldade` (passo 3 do §7.3), onde `facil→0` vira `w=1` e
`dificil→1` vira `w=2`: aqui o fácil **não** zera (vira 1), então os dois usos de
`nivelParaPeso` têm semânticas sutilmente diferentes (na régua, `facil` é neutro
absoluto; na distribuição, `facil` ainda recebe peso-base 1). Isso é
provavelmente intencional e correto, mas o design não chama a atenção para o fato
de o **mesmo** número ser consumido de dois jeitos.

**Fix.** Uma nota em §8.3 ou §1.2: "`nivelParaPeso` produz o peso em [0,1]; a
régua o usa como intensidade (0 = neutro), a distribuição o usa deslocado (`1 +
peso`, de modo que fácil ainda recebe tempo). São dois consumos deliberados do
mesmo número." Evita que o implementador "corrija" uma suposta inconsistência.

---

### NIT-3 — Ordem de aplicação de `ehIsoPlausivel` vs. o contrato de `dataArquivo` do `TopicoPlano` (§5.3)

**Problema.** `TopicoPlano.dataArquivo` é saneado com `ehIsoPlausivel`
(verificado: a função existe em `@shared/cronologia` e é estrita, só aceita a
forma canônica de `toISOString()`). Mas os tópicos **sugeridos** pela UI (§8.2)
preenchem `dataArquivo = ResumoDocumentoSalvo.dataArquivo`, que a fatia 1 garante
ser ISO canônica UTC. O caminho feliz passa. O design não diz o que acontece com
a **ordenação cronológica** quando `dataArquivo` é omitida por ter falhado em
`ehIsoPlausivel`: o tópico cai no grupo "sem data" de `ordenarCronologicamente`
(vai ao final). Isso é o comportamento correto herdado da fatia 1, mas convém
declarar que a omissão de `dataArquivo` no saneamento **não** é erro e apenas
empurra o tópico para o fim da ordem automática.

**Fix.** Uma linha na tabela §5.3 (campo `dataArquivo`) ou em §11: "omitida se
inválida ⇒ tópico ordenado como 'sem data' (ao final), nunca erro."

---

### NIT-4 — A prévia pós-salvar depende de `calcularPlano` nunca ver `plano === undefined`, mas a UI chama logo após salvar (§8.2, §8.3)

**Problema.** §8.3 decide (corretamente) que `calcularPlano` **lança**
`DadosProvaInvalidosError("Monte o plano de estudo antes de ver a prévia.")`
quando `prova.plano === undefined`. §8.2 diz que a UI, **após salvar**, chama
`calcularPlano(provaId)` para a prévia. O caminho feliz é consistente (salvar
grava `plano`, então a prévia seguinte o encontra). Mas o design não trata a
corrida: se `salvarPlano` falhar (ex.: saneamento lançou `DadosProvaInvalidosError`
por "Informe ao menos um assunto") e a UI, ainda assim, disparar a prévia, o
usuário verá a mensagem genérica "Monte o plano antes de ver a prévia", que é
**enganosa** (ele acabou de tentar montar). Não é um bug de lógica pura, mas um
detalhe de orquestração da UI que o design deveria fixar.

**Fix.** Em §8.2, declarar explicitamente: "a prévia só é chamada **após**
`salvarPlano` resolver com sucesso (a `Prova` retornada); se `salvarPlano`
rejeitar, exibir a mensagem de erro do saneamento e **não** chamar
`calcularPlano`."

---

## Suposições Verificadas (lidas no código real do worktree)

1. **`ordenarCronologicamente` aceita `ordemManual?: ReadonlyMap<string, number>`
   e desempata por `id.localeCompare`.** ✔ Verificado em
   `src/shared/cronologia.ts` — assinatura e regras 1–4 batem exatamente com o
   que o design descreve (semântica de prefixo, grupo manual primeiro).
2. **`ehIsoPlausivel` existe em `@shared/cronologia` e é estrita (round-trip de
   `toISOString()`).** ✔ Verificado — a importação planejada em §5.3/§11 é válida.
3. **`agenda.ts` exporta `diaParaNumero`, `numeroParaDia`, `diferencaDias`,
   `diasRestantes`; NÃO existe `datasEntre`.** ✔ Verificado — `datasEntre` é de
   fato novo (§7.6), e reusa `diaParaNumero`/`numeroParaDia` como o design afirma.
4. **`provas.ts` usa spread condicional `...(prova.vinculo.tipo === "caderno" ?
   { cadernoNome } : {})` em `listarProvas` e `...(s.concluida === true ?
   { concluida: true } : {})` em `salvarSessoes`.** ✔ Verificado — a correção do
   NIT-3 da rodada anterior está certa; os exemplos agora citados existem.
5. **`escreverProva` é atômico (`.tmp` + `rename`); `carregarProva` faz
   `JSON.parse` tolerante.** ✔ Verificado — o campo `plano?` opcional cai
   naturalmente, sem mudança de parsing.
6. **`hojeLocal()` é exportado de `provas.ts`.** ✔ Verificado — e é importado no
   handler.
7. **`DadosProvaInvalidosError` e `mensagemAmigavelProva` existem em
   `ipc/index.ts` e tratam esse erro.** ✔ Verificado (`mensagemAmigavelProva`
   definido na linha ~273, usado em todos os `catch` dos handlers de prova).
8. **`ResumoDocumentoSalvo` tem `id`, `nome`, `cadernoNome`, `dataArquivo?` e
   NÃO tem `titulo`.** ✔ Verificado — a correção do MEDIUM-5 (usar `.nome`, não
   `.titulo`) está certa.
9. **`listarDocumentos: (cadernoId?: string) => Promise<ResumoDocumentoSalvo[]>`
   existe em `AppApi`/`IPC_CHANNELS`.** ✔ Verificado.
10. **`Prova` NÃO tem hoje um campo `plano?`.** ✔ Verificado em `types.ts` — a
    adição é genuinamente aditiva e retrocompatível.
11. **`Agenda.tsx` tem o bloco `provaSelecionada !== null` com um `<header>` e o
    botão "Editar prova".** ✔ Verificado (linha ~560) — o encaixe do botão
    "Montar/Editar plano" ao lado de "Editar prova" é factível exatamente como
    descrito em §8.2.
12. **`constants.ts` segue o padrão de constantes nomeadas com doc-comment
    (`INTERVALOS_REVISAO_PADRAO`, `DIAS_ANTES_MAX`, etc.).** ✔ Verificado — as
    novas constantes (`HORIZONTE_DIAS`, `PISO_BASE`, `TETO_BASE`,
    `PESO_DIFICULDADE`, `MINUTOS_BLOCO_MIN`) encaixam no padrão.
13. **Aritmética da régua.** Recomputei os valores da tabela §6.4 com
    `PISO=0.15`, `TETO=0.80`, `HORIZONTE=30`, `PESO_DIF=0.5`:
    - hoje (`dr=0`): `prox=1` → `baseBruta=0.15` ✔
    - amanhã (`dr=1`): `prox=0.9667` → `baseBruta=0.1717` ✔
    - 15 dias: `prox=0.5` → `0.475` ✔
    - ≥30 dias: `prox=0` → `0.80` ✔
    - 15 dias + dif 1: `0.475 + 0.5·1·(0.80−0.475)=0.6375` ✔
    Todos batem. A fórmula é monótona em `diasRestantes` e em `dificuldadeBase`, e
    com ambos os lados > 0 mantém `fracaoBase ∈ [0.15, 0.80]`, de modo que
    `fracaoNovo > 0` sempre — **o HIGH-1 das rodadas anteriores está de fato
    corrigido**, e o invariante é testável como o §12 promete.
14. **Nada usa Ollama.** ✔ Confirmado por leitura: todas as peças desta fatia são
    aritmética pura (`plano.ts`, `slug.ts`, `datasEntre`), saneamento/disco
    (`provas.ts`), orquestração (`planoCalculo.ts`) e UI via `getApi()`. Nenhum
    canal novo é de geração; nenhum importa o cliente do Ollama.

## Suposições Não Verificadas / Erradas

1. **Baseline de testes diverge entre fontes (não é erro do design, mas pendência
   real).** `AGENTS.md` diz **514 testes** (verificado na linha 65) e
   `tasks/roadmap-plano-estudo-guiado-f1.md` §4 diz **614 testes** (verificado).
   O design (§14) acerta ao recusar afirmar um número de memória e ao mandar
   reconciliar via `npm test`. **Não verifiquei** a contagem real rodando a suíte
   (fora do escopo desta revisão de design); a pendência fica registrada, mas não
   bloqueia — o design já a trata honestamente.
2. **Comportamento de `ordenarCronologicamente` com `ReadonlyMap` reconstruído a
   partir de `ordemManual: string[]`** (índice = posição no array). A função
   aceita o mapa; **não verifiquei** por teste que a reconstrução `id → índice`
   produz a ordem pretendida com ids ausentes/duplicados, porque o
   `planoCalculo.ts` que faz a reconstrução **ainda não existe** (é código a
   escrever). O contrato da fatia 1, porém, suporta o uso. Sem achado.
3. **Encaixe visual/acessibilidade do formulário na Agenda e a "sensação" do
   plano com dados reais** — por natureza não verificável por leitura de código
   nem por teste automatizado; o design já o declara como verificação manual
   (§12, §14). Sem achado.

---

## Resumo para o loop

- A **régua base/novo** (peça mais arriscada do enunciado) está **correta**: forma
  fechada, contínua, monótona, com piso/teto nomeados, invariante "o novo nunca
  zera" e tabela de borda recomputada e conferida. **Aprovada no mérito.**
- O **bloco aditivo `plano?` em `Prova`** está com forma exata, tipos,
  opcionalidade, saneamento (clamp vs. erro), retrocompat por spread condicional
  e serve às fatias 3–4. **Aprovado no mérito.**
- A **persistência/edição da ordem cronológica manual** está decidida e
  **recomendada** corretamente: contrato (array de ids) entra nesta fatia; UI de
  reordenar escorrega para fatia dedicada. **OK.**
- **Nada usa Ollama.** **Confirmado.**
- Convenções do AGENTS.md (pt-BR, sem dep nova, `getApi()`, puro em `src/shared`,
  persistência atômica) — **respeitadas.**

Os dois MEDIUM são ambos no algoritmo de distribuição (§7.3): (1) o limite entre
"cabe tudo" e "não cabe por fragmentação" não tem predicado explícito, tornando o
caso "sem aviso" raro e o teste correspondente não-construível com confiança; e
(2) o laço de reconciliação de minutos com o piso de 15 não tem terminação
demonstrada sem reconstrução pelo leitor. Resolvidos esses dois pontos (mais os 4
NIT, opcionais), o design fica pronto para implementar.
