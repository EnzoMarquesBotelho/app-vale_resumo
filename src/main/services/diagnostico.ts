/**
 * Orquestração (no main) da geração do quiz diagnóstico do plano de estudo.
 *
 * A IA só GERA perguntas de múltipla escolha (reuso de `gerarQuiz`, sem
 * alterá-lo). O rótulo base/novo de cada pergunta é HERDADO do tópico do plano
 * (`TopicoPlano.novo`), nunca da IA; a correção e a classificação são puras
 * (`@shared/diagnostico`). A chamada ao modelo é injetável (`gerar`) para os
 * testes mockarem o Ollama.
 */
import {
  DIAG_PEDIDO_POR_TOPICO,
  DIAG_PERGUNTAS_POR_TOPICO,
  DIAG_TEXTO_MAX,
  MIN_RESPOSTAS_CAMADA,
} from "@shared/constants";
import { assinaturaPlano, ehTopicoManual, planejarDiagnostico } from "@shared/diagnostico";
import type { AoProgresso } from "@shared/geracaoLotes";
import type {
  DiagnosticoPlano,
  PerguntaDiagnostico,
  PerguntaMultipla,
  PlanoEstudo,
  TopicoIgnorado,
  TopicoPlano,
} from "@shared/types";
import { GeracaoFalhouError, OllamaIndisponivelError } from "./ollama.js";
import { ordenarTopicosDoPlano } from "./planoCalculo.js";
import { DadosProvaInvalidosError, ProvaNaoEncontradaError } from "./provas.js";
import { QuizInvalidoError, SemTextoParaQuizError, gerarQuiz } from "./quiz.js";
import type { GerarTexto } from "./resumo.js";

/** Não há tópico de base com material para criar perguntas. */
export class DiagnosticoIndisponivelError extends Error {
  readonly code = "DIAGNOSTICO_INDISPONIVEL" as const;
  constructor() {
    super(
      "O diagnóstico precisa de ao menos um assunto de base com material importado. " +
        "Os assuntos digitados à mão não têm texto para eu criar perguntas. " +
        "O plano continua valendo com a dificuldade que você informou.",
    );
    this.name = "DiagnosticoIndisponivelError";
  }
}

/** Menos perguntas de base do que o mínimo para medir a base. */
export class DiagnosticoInsuficienteError extends Error {
  readonly code = "DIAGNOSTICO_INSUFICIENTE" as const;
  constructor() {
    super(
      "Não consegui montar perguntas suficientes sobre a base. Tente de novo em instantes.",
    );
    this.name = "DiagnosticoInsuficienteError";
  }
}

/** Já existe uma geração de diagnóstico em andamento para a mesma prova. */
export class DiagnosticoEmAndamentoError extends Error {
  readonly code = "DIAGNOSTICO_EM_ANDAMENTO" as const;
  constructor() {
    super("Já estou preparando o diagnóstico desta prova.");
    this.name = "DiagnosticoEmAndamentoError";
  }
}

const MENSAGEM_GENERICA = "Não foi possível preparar o diagnóstico. Tente novamente.";
const MENSAGEM_GERACAO_FALHOU =
  "A geração das perguntas falhou ou demorou demais. Tente novamente ou use um modelo mais leve.";

/**
 * Traduz um erro da geração do diagnóstico numa frase pronta para a UI. Pura e
 * total (nunca lança). Só `OllamaIndisponivelError` fala em "offline"; a falha
 * de geração NÃO repassa a mensagem original (que sugere "reduzir a
 * quantidade", falso aqui, onde a quantidade é fixa).
 */
export function mensagemAmigavelDiagnostico(erro: unknown): string {
  if (erro instanceof OllamaIndisponivelError) return erro.message;
  if (erro instanceof GeracaoFalhouError) return MENSAGEM_GERACAO_FALHOU;
  if (
    erro instanceof DiagnosticoIndisponivelError ||
    erro instanceof DiagnosticoInsuficienteError ||
    erro instanceof DiagnosticoEmAndamentoError ||
    erro instanceof DadosProvaInvalidosError ||
    erro instanceof ProvaNaoEncontradaError
  ) {
    return erro.message;
  }
  return MENSAGEM_GENERICA;
}

export interface GerarDiagnosticoParams {
  plano: PlanoEstudo;
  /** `null` = documento ausente, ilegível ou sem texto. */
  carregarTexto: (documentoId: string) => Promise<string | null>;
  /** Injetável: mock do Ollama nos testes. */
  gerar?: GerarTexto;
  /** `(topicosProntos, topicosPlanejados)`. */
  aoProgresso?: AoProgresso;
  /** ISO 8601, injetado (sem relógio aqui). */
  agora: string;
}

/**
 * Gera o diagnóstico (pendente) do plano.
 *
 * @throws {DiagnosticoIndisponivelError} sem tópico de base com texto (antes de chamar a IA).
 * @throws {DiagnosticoInsuficienteError} base com menos de 3 perguntas.
 * @throws {OllamaIndisponivelError} Ollama offline (propagado).
 * @throws {GeracaoFalhouError} falha de geração sem perguntas de base suficientes.
 */
export async function gerarDiagnostico({
  plano,
  carregarTexto,
  gerar,
  aoProgresso = () => {},
  agora,
}: GerarDiagnosticoParams): Promise<DiagnosticoPlano> {
  const ordenados = ordenarTopicosDoPlano(plano);

  // Texto de cada tópico NÃO manual; qualquer falha de leitura = sem texto.
  const textos = new Map<string, string>();
  for (const t of ordenados) {
    if (ehTopicoManual(t.id)) continue;
    let bruto: string | null = null;
    try {
      bruto = await carregarTexto(t.id);
    } catch {
      bruto = null;
    }
    const texto = bruto === null ? "" : bruto.slice(0, DIAG_TEXTO_MAX).trim();
    if (texto.length > 0) textos.set(t.id, texto);
  }

  const planejado = planejarDiagnostico(ordenados, new Set(textos.keys()));
  if (planejado.indisponivel) throw new DiagnosticoIndisponivelError();

  const ignorados: TopicoIgnorado[] = [...planejado.ignorados];
  const sequencia: TopicoPlano[] = [...planejado.base, ...planejado.novo];
  const total = sequencia.length;
  const acumuladas: PerguntaDiagnostico[] = [];
  let falhaDeGeracao: GeracaoFalhouError | undefined;

  const marcarNaoGerou = (t: TopicoPlano): void => {
    ignorados.push({ id: t.id, titulo: t.titulo, motivo: "nao_gerou" });
  };

  for (let i = 0; i < sequencia.length; i++) {
    const t = sequencia[i];
    try {
      const quiz = await gerarQuiz({
        texto: textos.get(t.id) ?? "",
        modo: "multipla",
        quantidade: DIAG_PEDIDO_POR_TOPICO,
        ...(gerar !== undefined ? { gerar } : {}),
      });
      const multiplas = quiz.perguntas
        .filter((p): p is PerguntaMultipla => p.tipo === "multipla")
        .slice(0, DIAG_PERGUNTAS_POR_TOPICO);
      if (multiplas.length === 0) {
        marcarNaoGerou(t);
      } else {
        for (const p of multiplas) {
          acumuladas.push({
            ...p,
            topicoId: t.id,
            camada: t.novo ? "novo" : "base",
          });
        }
      }
    } catch (erro) {
      if (erro instanceof QuizInvalidoError || erro instanceof SemTextoParaQuizError) {
        marcarNaoGerou(t);
      } else if (erro instanceof GeracaoFalhouError && acumuladas.length > 0) {
        // Entrega o parcial: este e os não processados ficam de fora.
        falhaDeGeracao = erro;
        for (const restante of sequencia.slice(i)) marcarNaoGerou(restante);
        break;
      } else {
        throw erro;
      }
    }
    aoProgresso(i + 1, total);

    // Aborto antecipado: base inviável não justifica gastar chamadas no novo.
    const terminouBase = i + 1 === planejado.base.length;
    if (
      terminouBase &&
      acumuladas.filter((p) => p.camada === "base").length < MIN_RESPOSTAS_CAMADA
    ) {
      throw new DiagnosticoInsuficienteError();
    }
  }

  const perguntasBase = acumuladas.filter((p) => p.camada === "base").length;
  if (perguntasBase < MIN_RESPOSTAS_CAMADA) {
    if (falhaDeGeracao !== undefined) throw falhaDeGeracao;
    throw new DiagnosticoInsuficienteError();
  }

  return {
    assinatura: assinaturaPlano(plano),
    geradoEm: agora,
    perguntas: acumuladas,
    pedido: total * DIAG_PERGUNTAS_POR_TOPICO,
    ignorados,
  };
}
