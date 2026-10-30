/**
 * Nome automático da prova a partir do caderno e do tipo. Lógica PURA.
 * "Automático vs do usuário" é estado efêmero do formulário (não persistido).
 */
import { ROTULOS_TIPO_PROVA } from "./tipoProva";
import type { TipoProva } from "./types";

export interface EntradaNomeProva {
  /** Caderno vinculado (o chamador passa undefined se o vínculo é abrangente). */
  cadernoNome?: string | null;
  tipo?: TipoProva | null;
}

export const SEPARADOR_NOME_PROVA = " — ";
/** Igual ao TITULO_MAX do main. */
export const NOME_PROVA_MAX = 200;

export function nomeProva(e: EntradaNomeProva): string {
  const partes: string[] = [];
  const caderno = typeof e.cadernoNome === "string" ? e.cadernoNome.trim() : "";
  if (caderno !== "") partes.push(caderno);
  if (e.tipo !== undefined && e.tipo !== null && e.tipo in ROTULOS_TIPO_PROVA) {
    partes.push(ROTULOS_TIPO_PROVA[e.tipo]);
  }
  return partes.join(SEPARADOR_NOME_PROVA).slice(0, NOME_PROVA_MAX);
}

export interface EstadoTitulo {
  titulo: string;
  editado: boolean;
}

/**
 * O aluno digitou/apagou no campo. Criar: vazio retoma o automático
 * (`editado=false`). Editar: `editado=true` sempre (o título nunca muda sozinho).
 */
export function tituloAposDigitar(
  valor: string,
  modo: "criar" | "editar",
): EstadoTitulo {
  return {
    titulo: valor,
    editado: modo === "editar" ? true : valor.trim() !== "",
  };
}

/** Caderno/tipo mudaram. Se `editado`, devolve o MESMO estado (mesma referência). */
export function tituloAposMudanca(
  estado: EstadoTitulo,
  e: EntradaNomeProva,
): EstadoTitulo {
  if (estado.editado) return estado;
  return { titulo: nomeProva(e), editado: false };
}
