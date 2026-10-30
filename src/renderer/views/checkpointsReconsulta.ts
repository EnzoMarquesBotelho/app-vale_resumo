import type { VisaoCheckpoints } from "@shared/checkpoints";
import type { Prova } from "@shared/types";

/**
 * Reconsulta periódica da visão dos checkpoints enquanto o main prepara uma
 * lista (prova reaberta no meio da geração). Sem DOM nem React, para ser
 * testável com timers falsos. Devolve a função que CANCELA tudo (chamada ao
 * desmontar o card, ao trocar/fechar a prova ou quando `emGeracao` some).
 *
 * A cada tick consulta a visão e a entrega a `aoVisao`. Quando `emGeracao`
 * volta a ficar ausente, para o intervalo e chama `aoTerminar` (o card recarrega
 * a prova). Depois de cancelado, nada mais é entregue.
 */
export function iniciarReconsultaCheckpoints(p: {
  consultar: () => Promise<VisaoCheckpoints>;
  aoVisao: (visao: VisaoCheckpoints) => void;
  aoTerminar: () => Promise<void> | void;
  aoErro: (erro: unknown) => void;
  intervaloMs: number;
}): () => void {
  let ativo = true;
  const timer = setInterval(() => {
    void (async () => {
      try {
        const visao = await p.consultar();
        if (!ativo) return;
        p.aoVisao(visao);
        if (visao.emGeracao === undefined) {
          ativo = false;
          clearInterval(timer);
          await p.aoTerminar();
        }
      } catch (erro) {
        if (ativo) p.aoErro(erro);
      }
    })();
  }, p.intervaloMs);
  return () => {
    ativo = false;
    clearInterval(timer);
  };
}

/**
 * Setter funcional da Agenda: só aplica a prova devolvida se ela ainda é a
 * selecionada (uma geração que termina depois de o aluno trocar ou fechar a
 * prova não pode sobrescrever a seleção atual).
 */
export function aplicarSeMesmaProva(
  atual: Prova | null,
  recebida: Prova,
): Prova | null {
  return atual?.id === recebida.id ? recebida : atual;
}
