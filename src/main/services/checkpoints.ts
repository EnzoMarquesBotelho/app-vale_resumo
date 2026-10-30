/**
 * Orquestração (no main) dos checkpoints pré-prova do plano de estudo.
 *
 * A IA só GERA a lista de exercícios (reuso integral de `gerarExercicios`);
 * quando, quais assuntos e em que estado é lógica pura (`@shared/checkpoints`).
 * A chamada ao modelo é injetável (`gerar`) para os testes mockarem o Ollama.
 */
import { diferencaDias } from "@shared/agenda";
import {
  MENSAGEM_CHECKPOINT_INDISPONIVEL,
  planejarCheckpoints,
  planejarTextoCheckpoint,
  montarTextoBaseCheckpoint,
  preferenciaEfetiva,
  resolverEstadosCheckpoints,
} from "@shared/checkpoints";
import type {
  CheckpointPlanejado,
  CheckpointVisao,
  VisaoCheckpoints,
} from "@shared/checkpoints";
import {
  CHECKPOINT_MINIMO_EXERCICIOS,
  CHECKPOINT_MODO,
  CHECKPOINT_QUANTIDADE,
  CHECKPOINT_TEXTO_MAX,
} from "@shared/constants";
import type { AoProgresso } from "@shared/geracaoLotes";
import type { CheckpointGerado, Prova } from "@shared/types";
import { GeracaoFalhouError, OllamaIndisponivelError } from "./ollama.js";
import {
  ExerciciosInvalidosError,
  SemTextoParaExerciciosError,
  gerarExercicios,
} from "./parse.js";
import { montarPlanoCalculado } from "./planoCalculo.js";
import { DadosProvaInvalidosError, ProvaNaoEncontradaError } from "./provas.js";
import type { GerarTexto } from "./resumo.js";

const MENSAGEM_INDISPONIVEL = MENSAGEM_CHECKPOINT_INDISPONIVEL;


/** Nenhum assunto do ponto tem material para criar exercícios. */
export class CheckpointIndisponivelError extends Error {
  readonly code = "CHECKPOINT_INDISPONIVEL" as const;
  constructor() {
    super(MENSAGEM_INDISPONIVEL);
    this.name = "CheckpointIndisponivelError";
  }
}

/** Menos exercícios do que o mínimo para valer como lista. */
export class CheckpointInsuficienteError extends Error {
  readonly code = "CHECKPOINT_INSUFICIENTE" as const;
  constructor(entregues: number) {
    super(
      `Só consegui montar ${entregues} exercícios, poucos para uma lista. ` +
        "Tente novamente em instantes.",
    );
    this.name = "CheckpointInsuficienteError";
  }
}

/** O estado do checkpoint não permite gerar (futuro/indisponível/feito/desconhecido). */
export class CheckpointNaoDisponivelError extends Error {
  readonly code = "CHECKPOINT_NAO_DISPONIVEL" as const;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CheckpointNaoDisponivelError";
  }
}

/** Já existe uma geração de checkpoint em andamento para a mesma prova. */
export class CheckpointEmAndamentoError extends Error {
  readonly code = "CHECKPOINT_EM_ANDAMENTO" as const;
  constructor() {
    super("Já estou preparando uma lista desta prova.");
    this.name = "CheckpointEmAndamentoError";
  }
}

const MENSAGEM_GENERICA = "Não foi possível preparar a lista. Tente novamente.";
const MENSAGEM_GERACAO_FALHOU =
  "A geração da lista de exercícios falhou ou demorou demais. Tente novamente ou use um modelo mais leve.";
const MENSAGEM_JSON_INVALIDO =
  "Não consegui montar a lista de exercícios agora. Tente novamente.";

/**
 * Traduz um erro da geração do checkpoint numa frase pronta para a UI. Pura e
 * total (nunca lança). Só `OllamaIndisponivelError` fala em "offline"; a falha
 * de geração NÃO repassa a mensagem original (que sugere "reduzir a
 * quantidade", falso aqui, onde a quantidade é fixa).
 */
export function mensagemAmigavelCheckpoint(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) return erro.message;
  if (erro instanceof GeracaoFalhouError) return MENSAGEM_GERACAO_FALHOU;
  if (erro instanceof ExerciciosInvalidosError) return MENSAGEM_JSON_INVALIDO;
  if (erro instanceof SemTextoParaExerciciosError) return MENSAGEM_INDISPONIVEL;
  if (
    erro instanceof CheckpointIndisponivelError ||
    erro instanceof CheckpointInsuficienteError ||
    erro instanceof CheckpointNaoDisponivelError ||
    erro instanceof CheckpointEmAndamentoError ||
    erro instanceof DadosProvaInvalidosError ||
    erro instanceof ProvaNaoEncontradaError
  ) {
    return erro.message;
  }
  return MENSAGEM_GENERICA;
}

/**
 * Converte um ISO 8601 na data-calendário LOCAL "YYYY-MM-DD" (igual a
 * `hojeLocal`); `null` se inválido.
 */
export function dataLocalDeIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ano = d.getFullYear().toString().padStart(4, "0");
  const mes = (d.getMonth() + 1).toString().padStart(2, "0");
  const dia = d.getDate().toString().padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/**
 * Monta a visão dos checkpoints (síncrona, sem IA). Os pontos são calculados
 * sobre o plano de referência: `montarPlanoCalculado(prova, dataBase)`, em que
 * `dataBase` é a data local do salvamento do questionário (limitada a `hoje`).
 */
export function montarVisaoCheckpoints(
  prova: Prova,
  hoje: string,
  emGeracao?: string,
): VisaoCheckpoints {
  const diasRestantes = diferencaDias(prova.data, hoje);
  const plano = prova.plano;
  if (plano === undefined) {
    return {
      hoje,
      diasRestantes,
      preferencia: "lembrete",
      bloco: "nenhum",
      itens: [],
      motivoVazio: "sem_topicos",
    };
  }
  const salvoEm = dataLocalDeIso(plano.atualizadoEm) ?? hoje;
  const dataBase = salvoEm < hoje ? salvoEm : hoje;
  const planejamento = planejarCheckpoints({
    planoReferencia: montarPlanoCalculado(prova, dataBase),
    dataProva: prova.data,
    dataBase,
    hoje,
  });
  const { bloco, itens } = resolverEstadosCheckpoints({
    planejados: planejamento.checkpoints,
    bloco: prova.checkpoints,
    plano,
    hoje,
  });
  return {
    hoje,
    diasRestantes,
    preferencia: preferenciaEfetiva(plano),
    bloco,
    itens,
    ...(itens.length === 0 && planejamento.motivoVazio !== undefined
      ? { motivoVazio: planejamento.motivoVazio }
      : {}),
    ...(emGeracao !== undefined ? { emGeracao } : {}),
  };
}

function ddmm(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * Confere se o checkpoint pode ser gerado agora (estado `devido`, `atrasado`
 * ou `pronto`) e o devolve.
 *
 * @throws {CheckpointNaoDisponivelError} id desconhecido ou estado que não permite.
 */
export function exigirCheckpointGeravel(
  visao: VisaoCheckpoints,
  checkpointId: string,
): CheckpointVisao {
  const item = visao.itens.find((i) => i.id === checkpointId);
  if (item === undefined) {
    throw new CheckpointNaoDisponivelError(
      "Não encontrei esse checkpoint no plano atual.",
    );
  }
  switch (item.estado) {
    case "devido":
    case "atrasado":
    case "pronto":
      return item;
    case "futuro":
      throw new CheckpointNaoDisponivelError(
        `Esta lista só fica disponível em ${ddmm(item.data)}.`,
      );
    case "feito":
      throw new CheckpointNaoDisponivelError("Esta lista já foi concluída.");
    case "indisponivel":
    default:
      throw new CheckpointNaoDisponivelError(MENSAGEM_INDISPONIVEL);
  }
}

export interface GerarListaCheckpointParams {
  checkpoint: CheckpointPlanejado;
  /** `null` = documento ausente, ilegível ou sem texto. */
  carregarTexto: (documentoId: string) => Promise<string | null>;
  /** Injetável: mock do Ollama nos testes. */
  gerar?: GerarTexto;
  /** Repassado a `gerarExercicios` (no caminho curto, chamado 1x no fim). */
  aoProgresso?: AoProgresso;
  /** ISO 8601, injetado (sem relógio aqui). */
  agora: string;
}

/**
 * Gera a lista de exercícios de um checkpoint.
 *
 * @throws {CheckpointIndisponivelError} sem assunto com texto (antes de chamar a IA).
 * @throws {CheckpointInsuficienteError} menos de 3 exercícios.
 * @throws {OllamaIndisponivelError} Ollama offline (propagado).
 * @throws {GeracaoFalhouError} falha de geração (propagado).
 * @throws {ExerciciosInvalidosError} JSON inválido mesmo após a corretiva.
 */
export async function gerarListaCheckpoint({
  checkpoint,
  carregarTexto,
  gerar,
  aoProgresso,
  agora,
}: GerarListaCheckpointParams): Promise<CheckpointGerado> {
  const textos = new Map<string, string>();
  for (const t of checkpoint.topicos) {
    if (t.manual) continue;
    let bruto: string | null = null;
    try {
      bruto = await carregarTexto(t.id);
    } catch {
      bruto = null;
    }
    const texto = bruto === null ? "" : bruto.trim();
    if (texto.length > 0) textos.set(t.id, texto);
  }

  const planejado = planejarTextoCheckpoint(
    checkpoint.topicos,
    new Set(textos.keys()),
  );
  if (planejado.indisponivel) throw new CheckpointIndisponivelError();

  const textoBase = montarTextoBaseCheckpoint(
    planejado.selecionados.map((t) => ({
      titulo: t.titulo,
      texto: textos.get(t.id) ?? "",
    })),
    CHECKPOINT_TEXTO_MAX,
  );
  if (textoBase.trim().length === 0) throw new CheckpointIndisponivelError();

  const exercicios = await gerarExercicios({
    texto: textoBase,
    modo: CHECKPOINT_MODO,
    quantidade: CHECKPOINT_QUANTIDADE,
    ...(gerar !== undefined ? { gerar } : {}),
    ...(aoProgresso !== undefined ? { aoProgresso } : {}),
  });
  if (exercicios.length < CHECKPOINT_MINIMO_EXERCICIOS) {
    throw new CheckpointInsuficienteError(exercicios.length);
  }

  return {
    id: checkpoint.id,
    geradoEm: agora,
    topicos: planejado.selecionados.map((t) => ({ id: t.id, titulo: t.titulo })),
    ignorados: planejado.ignorados,
    pedido: CHECKPOINT_QUANTIDADE,
    exercicios,
  };
}
