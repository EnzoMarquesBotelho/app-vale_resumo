# Roadmap — Unificação Agenda de revisão + Plano de estudo

> Decisões confirmadas com o usuário. Design completo em
> `design-unificacao-agenda-plano.md`. Implementação: `9664187` (branch
> `feat/unifica-agenda-plano`, sobre a master `133c99e`). 1015 testes.

## Pedido do usuário

"Vamos juntar esses dois sistemas no plano de estudo porque não faz sentido
serem passos separados." Além disso: vincular um caderno já coloca o nome da
prova; escolher 1ª/2ª/final/ENEM/ENADE também vai para o nome; impedir datas
que já ocorreram (a partir de hoje, só de amanhã em diante).

## Decisões confirmadas

1. **Uma lista só por prova** (linha do tempo derivada, nunca persistida):
   estudo + revisão + checkpoint, ordenados por data. Prova sem plano mantém a
   Agenda de revisão de sempre.
2. **Fusão só na MESMA data**: revisão no dia de um checkpoint aparece junto
   dele. É só exibição; a sessão salva nunca é alterada.
3. **Estudo é só leitura** (muda editando o plano). Revisão mantém marcar/mover/
   remover/adicionar/"Regerar revisões sugeridas". Checkpoint mantém seu ciclo.
4. **Tipo de prova** (`Prova.tipo?`, aditivo): 1ª, 2ª, final, ENEM, ENADE. Fonte
   única do ordinal; o questionário não pergunta de novo quando há tipo.
5. **ENEM/ENADE valem como 1ª prova no plano** (todo o conteúdo é base).
6. **Tipo e vínculo são independentes**: ENEM/ENADE só sugerem "abrangente" se
   nenhum caderno foi escolhido.
7. **Nome automático** (caderno + tipo, ex.: "Cálculo — 2ª prova"); nunca
   sobrescreve o que o aluno digitou; em edição de prova existente só muda por
   clique em "Usar sugestão".
8. **Data mínima = amanhã**, validada no main (autoridade) e na UI. Prova antiga
   com data passada continua abrindo e pode ser salva sem mudar a data.
9. Trocar para 1ª/ENEM/ENADE uma prova com assuntos "novo" exige confirmação.
10. Zero dependência nova, sem canal IPC novo, IA intocada.

## Casos de borda

| Caso | Situação |
|---|---|
| Revisão e checkpoint na mesma data (inclui sessão manual e duas sessões) | Coberto |
| Revisão 1 dia antes/depois do checkpoint | Coberto (não funde, por decisão) |
| Mover/remover sessão fundida | Coberto (nada se perde) |
| Prova sem plano / prova antiga sem `tipo` / `tipo` corrompido em disco | Coberto |
| Montar plano com sessões editadas à mão | Coberto (sessões intactas) |
| Trocar tipo com diagnóstico/checkpoints já feitos | Coberto (ficam "desatualizados") |
| ENEM + caderno já escolhido | Coberto (caderno preservado) |
| Título digitado à mão; apagar título (criação x edição) | Coberto |
| Data hoje/passada ao criar ou editar; virada do dia; fuso local | Coberto |
| Prova antiga com data passada | Coberto (abre; salvar sem mudar a data) |
| `calcularPlano`/`calcularCheckpoints` falham | Coberto (alerta + lista parcial) |
| Sessão movida para depois da prova | Parcial (UI impede; o main não) |
| Sessões passadas somem no próximo salvamento (inclusive concluídas) | NÃO coberto (herdado) |
| Marcar bloco de estudo como feito / medir o que foi estudado | NÃO coberto |
| Concluir checkpoint marcar a revisão fundida | NÃO coberto (decisão) |
| Fundir revisão e checkpoint a ±N dias | NÃO coberto (decisão) |
| Lista longa (prova a 90+ dias): agrupar/colapsar por semana | NÃO coberto |
| Atualizar a lista ao virar o dia sem interação | NÃO coberto |
| Testes de componente React | NÃO coberto (verificação manual) |
| Lista curada de assuntos ENEM/ENADE; busca online | Fora de escopo |
| Remover o plano e voltar ao modo legado | Fora de escopo |

## Verificação manual do usuário

Encaixe visual da linha do tempo na Agenda, temas claro/escuro, teclado e o
comportamento com as provas reais já cadastradas.
