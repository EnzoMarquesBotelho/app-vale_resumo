/**
 * Tipo de prova (1ª, 2ª, final, ENEM, ENADE): rótulos, ordinal derivado e
 * regras puras de formulário. Lógica PURA (sem Electron/disco/IA).
 */
import type { OrdinalProva, PlanoEstudo, TipoProva } from "./types";

/** Ordem de exibição no select. */
export const TIPOS_PROVA: readonly TipoProva[] = [
  "primeira",
  "segunda",
  "final",
  "enem",
  "enade",
];

export const ROTULOS_TIPO_PROVA: Record<TipoProva, string> = {
  primeira: "1ª prova",
  segunda: "2ª prova",
  final: "Prova final",
  enem: "ENEM",
  enade: "ENADE",
};

export function ehTipoProva(v: unknown): v is TipoProva {
  return typeof v === "string" && (TIPOS_PROVA as readonly string[]).includes(v);
}

/** ENEM e ENADE contam como "primeira" para o plano (todo o conteúdo é base). */
export function ordinalDeTipo(t: TipoProva): OrdinalProva {
  switch (t) {
    case "segunda":
      return "segunda";
    case "final":
      return "final";
    default:
      return "primeira";
  }
}

/**
 * Novo plano com o ordinal trocado. `primeira` força `novo=false`. Não mexe em
 * `atualizadoEm`. Mesmo ordinal ⇒ devolve a MESMA referência.
 */
export function aplicarOrdinalAoPlano(
  plano: PlanoEstudo,
  ordinal: OrdinalProva,
): PlanoEstudo {
  if (plano.ordinal === ordinal) return plano;
  return {
    ...plano,
    ordinal,
    topicos:
      ordinal === "primeira"
        ? plano.topicos.map((t) => ({ ...t, novo: false }))
        : plano.topicos.map((t) => ({ ...t })),
  };
}

/** `true` se trocar para `novoTipo` descartaria marcações "novo" do plano. */
export function tipoDescartaNovos(
  plano: PlanoEstudo | undefined,
  novoTipo: TipoProva,
): boolean {
  if (plano === undefined) return false;
  if (ordinalDeTipo(novoTipo) !== "primeira") return false;
  if (plano.ordinal === "primeira") return false;
  return plano.topicos.some((t) => t.novo);
}

/** Estado do vínculo no formulário (só o que a regra precisa). */
export interface EstadoVinculoForm {
  tipoVinculo: "caderno" | "abrangente";
  /** "" = nenhum caderno escolhido. */
  cadernoNome: string;
  /** `true` depois que o ALUNO mexeu no vínculo (a pré-seleção não marca). */
  tocado: boolean;
}

/**
 * Vínculo resultante de escolher `tipo`. Só devolve "abrangente" quando o tipo
 * é ENEM/ENADE E o vínculo está intocado E sem caderno; senão mantém o atual.
 */
export function vinculoAposEscolherTipo(
  atual: EstadoVinculoForm,
  tipo: TipoProva | "",
): "caderno" | "abrangente" {
  if (
    (tipo === "enem" || tipo === "enade") &&
    !atual.tocado &&
    atual.cadernoNome === ""
  ) {
    return "abrangente";
  }
  return atual.tipoVinculo;
}
