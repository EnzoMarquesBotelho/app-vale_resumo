import { useCallback, useEffect, useRef, useState } from "react";
import {
  escolherCheckpointAutomatico,
  fraseLembreteCheckpoint,
  tentadosDaProva,
} from "@shared/checkpoints";
import type { VisaoCheckpoints } from "@shared/checkpoints";
import type { CheckpointGerado, PreferenciaCheckpoint, Prova } from "@shared/types";
import { getApi } from "../api";
import { iniciarReconsultaCheckpoints } from "./checkpointsReconsulta";

/**
 * Card dos checkpoints pré-prova: listas curtas de exercícios ao longo do
 * plano, sobre os assuntos que o aluno já deveria ter estudado. Em "lembrete"
 * nada é gerado sem o aluno pedir; em "automático", ao abrir a prova o app
 * prepara no máximo UMA lista (a do checkpoint mais recente que já chegou).
 * Quando, quais assuntos e em que estado é lógica pura (`@shared/checkpoints`);
 * a IA só gera os exercícios no main. Fala com o main APENAS via `getApi()`.
 */

/** Intervalo de reconsulta enquanto o main prepara uma lista (reaberta no meio). */
const INTERVALO_RECONSULTA_MS = 5000;

/**
 * Tentativas automáticas desta sessão do app (chave `${provaId}:${checkpointId}`).
 * Adicionada ANTES do `await` e mantida após sucesso ou falha: evita laço depois
 * de uma falha. Vive até reiniciar o app.
 */
const tentadosGlobal = new Set<string>();

/** Esquece as tentativas automáticas de uma prova (o aluno consentiu de novo). */
function limparTentados(provaId: string): void {
  const prefixo = `${provaId}:`;
  for (const chave of [...tentadosGlobal]) {
    if (chave.startsWith(prefixo)) tentadosGlobal.delete(chave);
  }
}

/** Extrai uma frase amigável do erro vindo do IPC. */
function mensagemDeErro(e: unknown): string {
  const padrao = "Não foi possível preparar a lista. Tente novamente.";
  if (!(e instanceof Error) || e.message.length === 0) return padrao;
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : padrao;
}

/** Cópia do mapa sem a chave dada. */
function semChave(erros: Record<string, string>, chave: string): Record<string, string> {
  return Object.fromEntries(Object.entries(erros).filter(([k]) => k !== chave));
}

/**
 * Estado e ações dos checkpoints de uma prova (já com `plano`). Usado UMA vez
 * pela linha do tempo. `aoAtualizar` recebe a prova atualizada após gerar,
 * concluir ou trocar a preferência.
 */
export function useCheckpoints(prova: Prova, aoAtualizar: (prova: Prova) => void) {
  const [visao, setVisao] = useState<VisaoCheckpoints | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [erroPreferencia, setErroPreferencia] = useState<string | null>(null);

  // Sempre a versão mais recente do callback, sem religar efeitos a cada render.
  const aoAtualizarRef = useRef(aoAtualizar);
  useEffect(() => {
    aoAtualizarRef.current = aoAtualizar;
  });

  // Carga da visão: de novo sempre que a prova muda (toda ação carimba `atualizadoEm`).
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const v = await getApi().calcularCheckpoints(prova.id);
        if (ativo) {
          setVisao(v);
          setErroCarga(null);
        }
      } catch (e) {
        if (ativo) {
          setVisao(null);
          setErroCarga(mensagemDeErro(e));
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [prova.id, prova.atualizadoEm]);

  // Prova reaberta com uma geração em andamento no main: reconsulta a cada 5 s e,
  // ao terminar, recarrega a prova. O intervalo é limpo ao desmontar (trocar/fechar
  // a prova), ao terminar (`emGeracao` volta a ficar ausente) e a cada mudança.
  const emGeracao = visao?.emGeracao;
  useEffect(() => {
    if (emGeracao === undefined) return;
    return iniciarReconsultaCheckpoints({
      consultar: () => getApi().calcularCheckpoints(prova.id),
      aoVisao: setVisao,
      aoTerminar: async () => {
        const atualizada = await getApi().carregarProva(prova.id);
        aoAtualizarRef.current(atualizada);
      },
      aoErro: (e) => setErroCarga(mensagemDeErro(e)),
      intervaloMs: INTERVALO_RECONSULTA_MS,
    });
  }, [emGeracao, prova.id]);

  const recarregarVisao = useCallback(async (): Promise<void> => {
    try {
      setVisao(await getApi().calcularCheckpoints(prova.id));
      setErroCarga(null);
    } catch (e) {
      setErroCarga(mensagemDeErro(e));
    }
  }, [prova.id]);

  const gerar = useCallback(
    async (checkpointId: string, abrirDepois: boolean): Promise<void> => {
      setErros((atual) => semChave(atual, checkpointId));
      setGerandoId(checkpointId);
      try {
        const atualizada = await getApi().gerarCheckpoint(prova.id, checkpointId);
        aoAtualizarRef.current(atualizada);
        if (abrirDepois) setAberto(checkpointId);
      } catch (e) {
        setErros((atual) => ({ ...atual, [checkpointId]: mensagemDeErro(e) }));
        // Falha não devolve a prova: reconsulta para limpar `emGeracao`.
        await recarregarVisao();
      } finally {
        setGerandoId(null);
      }
    },
    [prova.id, recarregarVisao],
  );

  // Gatilho automático: ao abrir a prova (ou ao trocar para automático), prepara
  // no máximo uma lista. O Set de módulo garante uma tentativa por sessão.
  useEffect(() => {
    if (visao === null || gerandoId !== null) return;
    const id = escolherCheckpointAutomatico({
      itens: visao.itens,
      hoje: visao.hoje,
      preferencia: visao.preferencia,
      bloco: visao.bloco,
      emGeracao: visao.emGeracao,
      tentados: tentadosDaProva(tentadosGlobal, prova.id),
    });
    if (id === undefined) return;
    tentadosGlobal.add(`${prova.id}:${id}`);
    void gerar(id, false);
  }, [visao, gerandoId, prova.id, gerar]);

  async function trocarPreferencia(pref: PreferenciaCheckpoint): Promise<void> {
    if (visao === null || pref === visao.preferencia || trocando) return;
    setErroPreferencia(null);
    setTrocando(true);
    // O aluno acabou de consentir de novo: esquece falhas automáticas anteriores.
    limparTentados(prova.id);
    try {
      const atualizada = await getApi().definirPreferenciaCheckpoint(prova.id, pref);
      aoAtualizarRef.current(atualizada);
    } catch (e) {
      setErroPreferencia(mensagemDeErro(e));
    } finally {
      setTrocando(false);
    }
  }

  async function concluir(checkpointId: string): Promise<void> {
    if (concluindo !== null) return;
    setErros((atual) => semChave(atual, checkpointId));
    setConcluindo(checkpointId);
    try {
      const atualizada = await getApi().concluirCheckpoint(prova.id, checkpointId);
      aoAtualizarRef.current(atualizada);
    } catch (e) {
      setErros((atual) => ({ ...atual, [checkpointId]: mensagemDeErro(e) }));
    } finally {
      setConcluindo(null);
    }
  }

  const ocupado = gerandoId !== null || visao?.emGeracao !== undefined;

  // Destaque do lembrete: MESMA regra de candidato do automático (o checkpoint
  // mais recente que já chegou), para nunca destacar um antigo quando há um mais
  // recente já pronto. `bloco: "atual"` só para a função não se recusar.
  const candidatoId =
    visao !== null && visao.preferencia === "lembrete"
      ? escolherCheckpointAutomatico({
          itens: visao.itens,
          hoje: visao.hoje,
          preferencia: "automatico",
          bloco: "atual",
          emGeracao: undefined,
          tentados: new Set(),
        })
      : undefined;
  const candidato = visao?.itens.find((i) => i.id === candidatoId);
  const fraseLembrete =
    visao !== null && candidato !== undefined
      ? fraseLembreteCheckpoint(candidato, visao.diasRestantes)
      : "";

  const geradoDe = (id: string): CheckpointGerado | undefined =>
    visao?.bloco === "atual"
      ? prova.checkpoints?.itens.find((i) => i.id === id)
      : undefined;

  return {
    visao,
    erroCarga,
    gerandoId,
    erros,
    aberto,
    setAberto,
    concluindo,
    trocando,
    erroPreferencia,
    ocupado,
    candidato,
    fraseLembrete,
    geradoDe,
    gerar,
    concluir,
    trocarPreferencia,
  };
}

export type EstadoCheckpoints = ReturnType<typeof useCheckpoints>;
