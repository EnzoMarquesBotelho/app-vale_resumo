# Roadmap — Plano de estudo guiado, Fatia 3/4 (Quiz diagnóstico)

> Decisões CONFIRMADAS e entregues. Detalhe completo em `tasks/design-f3.md`
> (não reescrito aqui). Branch `feat/plano-f3-diagnostico`, base master
> `b4b6cc2`, implementação até `e533d17`. 781 testes (673 → 781), zero dep nova.
> Herda: `roadmap-plano-estudo-guiado-f1.md` §5.3 e `design-f2.md` /
> `roadmap-plano-estudo-guiado-f2.md`.

## Resumo

Diagnóstico **opcional**: quiz curto, só de múltipla escolha, gerado pelo Ollama
a partir dos documentos dos assuntos do plano. Uma função pura classifica o
resultado (`lacuna_base`, `dificuldade_novo`, `sem_dificuldade`, `inconclusivo`)
e esse veredito entra como insumo opcional da régua base/novo da fatia 2.
Sem diagnóstico (ou inconclusivo/sem dificuldade/desatualizado) o plano é
idêntico ao da fatia 2.

## Decisões (pontos 1–9)

1. **Tópico sem documento.** Só entram assuntos ligados a documento COM texto.
   Manual (`manual:`) e documento ausente/ilegível/vazio ficam de fora, com aviso
   na UI e registro em `ignorados[]` (`manual`/`sem_texto`/`nao_gerou`). Exige ao
   menos um assunto de BASE com texto; senão `DiagnosticoIndisponivelError`
   ANTES de chamar a IA (botão já desabilitado com o motivo). Nunca se pede à
   IA que invente perguntas só pelo título.
2. **Orçamento e formato.** Só múltipla escolha (correção mecânica via
   `quizScore`; `avaliacao.ts` não é usado). Até 3 assuntos por camada × 3
   perguntas = até 18 perguntas, 6 chamadas (até 12 com a corretiva), sempre no
   caminho curto do `gerarQuiz` (pede 5, mantém 3; texto cortado em 12000
   caracteres, sem condensação). Constantes `DIAG_*` em `constants.ts`.
3. **Rótulo herdado.** Cada pergunta é carimbada com `{topicoId, camada}` a
   partir de `TopicoPlano.novo`. A IA nunca vê nem devolve rótulo.
4. **Classificação e limiares.** `classificarDiagnostico` pura: mínimo de 3
   respostas por camada (`MIN_RESPOSTAS_CAMADA`); limiar 3/5 comparado por
   INTEIROS (`acertos*5 < total*3`, estrito: exatamente 0,6 não é baixo). Base
   não medida → `inconclusivo`; base baixa → `lacuna_base`; senão novo medido e
   baixo → `dificuldade_novo`; senão `sem_dificuldade`. Intensidade contínua em
   [0,1], **encolhida pela amostra** (`min(1, total/9)`; decisão do usuário —
   amostra pequena reduz a confiança, não o ruído do chute).
5. **Entrada na distribuição.** Param opcional `diagnostico?` que só desloca
   `fracaoBase` (±`PESO_DIAGNOSTICO`=0,5 · intensidade da folga até teto/piso).
   Ausente ou intensidade 0 → resultado idêntico ao da fatia 2; o novo nunca
   zera. `calcularPlano` só anexa `diagnosticoAplicado` quando a mistura de fato
   mudou (a UI nunca diz "plano ajustado" sem ajuste real).
6. **Obrigatório vs opcional.** Opcional e incentivado (card na Agenda, sem
   bloqueio). Na 1ª prova (tudo base) o card e o texto NÃO prometem ajuste.
7. **Erros, parcial e limiar mínimo.** Offline ≠ falha de geração
   (`mensagemAmigavelDiagnostico`, texto próprio sem "reduza a quantidade").
   Válido se houver ≥ 3 perguntas de base; menos perguntas que o pedido → aviso
   de parcial próprio. Falha no meio com algo gerado → para, restantes viram
   `nao_gerou`; base < 3 → aborta cedo (sem gastar chamadas nos assuntos novos).
8. **Refazer e validade.** Refazer sempre; só substitui após sucesso. Validade
   por `assinaturaPlano` (ordinal + ids não manuais + `novo`): mudou → estado
   `desatualizado`, não aplica. Horas/dia, dias/semana, dificuldade, checkpoint,
   ordem manual e data da prova NÃO invalidam. Sem expiração por tempo.
   `Prova.diagnostico?` é irmão de `plano` (sobrevive a `salvarPlano`); o
   resultado é derivado, não persistido.
9. **O que a IA NÃO faz.** Não ordena, não infere pré-requisitos, não rotula
   base/novo, não classifica, não corrige, não distribui minutos. Só gera texto
   de perguntas/alternativas.

## Casos de borda

| Caso | Tratamento | Coberto? |
|---|---|---|
| Camada sem perguntas (novo na 1ª prova) / base sem perguntas | classifica só pela base / `inconclusivo` | ✅ |
| < 3 respostas por camada; taxa exatamente 0,6 | camada "não medida"; limiar estrito por inteiros | ✅ |
| Tudo certo / tudo errado | `sem_dificuldade` / `lacuna_base` i=1 | ✅ |
| 1ª prova; base no teto; prova hoje com `dificuldade_novo`; um lado vazio | plano inalterado, sem `diagnosticoAplicado`, frase honesta | ✅ |
| Documento ilegível/ausente; tópico manual; sem base com texto | `sem_texto`/`manual` com aviso; indisponível antes da IA | ✅ |
| Geração parcial; falha no meio; offline × falha | parcial válido com base ≥ 3; restantes `nao_gerou`; mensagens distintas | ✅ |
| Plano mudou depois / durante a geração | `desatualizado` / descarta com erro claro | ✅ |
| Duplo clique; prova/plano antigos; bloco corrompido | guard em memória; carregam como hoje; descarta/volta a pendente | ✅ |
| Prova já passada | card oculto; `calcularPlano` não aplica | ✅ |
| Cancelar geração em andamento / timeout total | o aluno só espera | ❌ NÃO coberto |
| Só o início do documento é medido (corte 12000) e amostra de ≤ 3 assuntos/camada | por desenho; UI diz "amostra" | ❌ NÃO coberto |
| Pergunta ambígua/alternativa errada; viés de posição da correta | só valida a forma (1 correta); sem embaralhar | ❌ NÃO coberto (limite do modelo local) |
| Chute (ruído de amostra pequena) | não reduzido; só o efeito no plano é atenuado | ❌ NÃO coberto |
| Ajuste por assunto individual; expiração; perguntas abertas | fora de escopo | ❌ NÃO coberto |
| Corrida `salvarPlano` × `salvarDiagnostico` | mitigada pela assinatura | ❌ NÃO coberta formalmente |
| Latência e qualidade reais do `llama3.1` | não medidas | ❌ NÃO verificado (manual) |

## Ajustes para a Fatia 4 (checkpoints)

Derivados do que a fatia 3 fixou (conferir ao desenhar a 4):

- A fatia 3 NÃO usou `avaliarLote`; o roadmap f1 citava o reuso — não há
  dependência da 4 nisso. A 4 reusa `gerarExercicios` + `avisoGeracaoParcial`.
- `ArtefatoLote` ganhou `"diagnostico"` (aditivo); a 4 pode acrescentar o seu
  artefato do mesmo jeito, filtrando por igualdade no renderer.
- `Prova.diagnostico?` é irmão de `plano`: o checkpoint deve seguir o padrão
  aditivo (campo opcional + `...prova` preservando) e NÃO ser aninhado em
  `PlanoEstudo` (um `salvarPlano` o apagaria).
- `checkpoint` ausente = tratar como `lembrete` (nada gerado sem opt-in), regra
  da f2 mantida.
- `avisoGeracaoParcial` termina em "reduza a quantidade": só serve na 4 se a
  quantidade for configurável; senão repetir o desvio da f3 (frase própria).
- Padrão de erro: `mensagemAmigavelX` pura e exportada, sem repassar
  `GeracaoFalhouError.message` quando a quantidade não é do aluno.
- Cancelar geração segue NÃO coberto; se a 4 gerar várias listas em sequência,
  avaliar botão cancelar/timeout total.
- Posição na Agenda: card do diagnóstico fica após `PlanoEstudo` e antes da Dica
  do dia; a UI do checkpoint deve se encaixar sem duplicar prévias.
