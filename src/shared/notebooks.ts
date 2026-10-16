/**
 * Lógica pura de cadernos (notebooks), compartilhada entre main e renderer.
 *
 * Sem dependências de Node/Electron: só funções totais e constantes, para
 * poder ser usada e testada isoladamente. Pode importar apenas tipos
 * (`import type`) de `./types`; `types.ts` nunca importa daqui (evita ciclo).
 */

/** Id normalizado do caderno padrão (fallback), usado para agrupar. */
export const CADERNO_GERAL_ID = "geral";
/** Nome de exibição do caderno padrão (fallback). */
export const CADERNO_GERAL_NOME = "Geral";
/** Teto defensivo para o comprimento do nome de exibição do caderno. */
export const CADERNO_NOME_MAX = 200;
/**
 * Separador de exibição entre segmentos de um caderno composto (ex.:
 * "Cálculo — Teórica"). Declarado AQUI (não em `constants.ts`) para manter a
 * regra do módulo: `notebooks.ts` só importa tipos de `./types` e permanece
 * autocontido. O renderer, se precisar do literal, importa de `@shared/notebooks`.
 */
export const SEPARADOR_CADERNO = " — ";

/**
 * Normaliza um nome bruto de caderno em um `cadernoId` estável, usado para
 * agrupar documentos. Remove acentos, baixa a caixa e troca sequências de
 * caracteres não `[a-z0-9]` por um único hífen. Entradas vazias ou que só
 * contêm símbolos caem no id do caderno padrão (`geral`).
 *
 * @param bruto nome bruto (nome de pasta, texto digitado ou vazio).
 * @returns o id normalizado do caderno.
 */
export function normalizarNomeCaderno(bruto: string): string {
  const aparado = bruto.trim();
  if (aparado === "") return CADERNO_GERAL_ID;

  const semAcentos = aparado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const id = semAcentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return id === "" ? CADERNO_GERAL_ID : id;
}

/**
 * Deriva o nome de exibição (`cadernoNome`) a partir de um nome bruto:
 * aparado e truncado em `CADERNO_NOME_MAX`. Preserva acentos e caixa (é a
 * grafia que o usuário vê). Vazio após o trim vira o nome do caderno padrão.
 *
 * @param bruto nome bruto escolhido/derivado.
 * @returns o nome de exibição do caderno.
 */
export function derivarNomeExibicaoCaderno(bruto: string): string {
  const aparado = bruto.trim();
  if (aparado === "") return CADERNO_GERAL_NOME;
  return aparado.slice(0, CADERNO_NOME_MAX);
}

/**
 * Monta o par coerente `{ cadernoId, cadernoNome }` a partir de um nome bruto.
 * Único ponto que combina id normalizado e nome de exibição: quando o bruto
 * não produz um id significativo (cai no fallback `geral` — vazio ou
 * só-símbolos), o par cai no caderno padrão (`geral`/`Geral`).
 *
 * @param bruto nome bruto escolhido/derivado.
 * @returns o par id/nome coerente do caderno.
 */
export function montarCaderno(bruto: string): {
  cadernoId: string;
  cadernoNome: string;
} {
  const cadernoId = normalizarNomeCaderno(bruto);
  const cadernoNome =
    cadernoId === CADERNO_GERAL_ID
      ? CADERNO_GERAL_NOME
      : derivarNomeExibicaoCaderno(bruto);
  return { cadernoId, cadernoNome };
}

/**
 * Deriva o caderno sugerido a partir do caminho absoluto de um arquivo,
 * usando a pasta-mãe (penúltimo segmento) como palpite literal. Função pura:
 * não toca o disco. Entradas degeneradas (arquivo na raiz, caminho sem
 * pasta-mãe, ou pasta-mãe que é só uma letra de drive) caem no caderno padrão.
 *
 * @param caminhoAbsoluto caminho absoluto do arquivo (aceita `/` e `\`).
 * @returns o par id/nome do caderno sugerido.
 */
export function derivarCadernoDeCaminho(caminhoAbsoluto: string): {
  cadernoId: string;
  cadernoNome: string;
} {
  const segmentos = caminhoAbsoluto.split(/[\\/]+/).filter((s) => s !== "");
  if (segmentos.length < 2) {
    return { cadernoId: CADERNO_GERAL_ID, cadernoNome: CADERNO_GERAL_NOME };
  }
  const candidato = segmentos[segmentos.length - 2];
  if (/^[A-Za-z]:$/.test(candidato)) {
    return { cadernoId: CADERNO_GERAL_ID, cadernoNome: CADERNO_GERAL_NOME };
  }
  return montarCaderno(candidato);
}

/**
 * Deriva o caderno composto a partir do caminho de um arquivo relativo à pasta
 * escolhida. As subpastas entre a pasta escolhida e o arquivo são juntadas com
 * `SEPARADOR_CADERNO` (" — "); quando o arquivo está direto na pasta escolhida
 * (sem subpasta), usa o `nomePastaEscolhida` como caderno. Função pura: não
 * toca o disco.
 *
 * @param nomePastaEscolhida nome (basename) já saneado da pasta escolhida pelo
 *   usuário (raiz de drive/raiz POSIX já reduzidas a "" pelo chamador, caindo
 *   em `Geral`).
 * @param caminhoRelativo caminho do arquivo relativo à pasta escolhida
 *   (ex.: "Cálculo/Teórica/x.pdf"; aceita "/" e "\").
 * @returns o par id/nome coerente do caderno.
 */
export function derivarCadernoComposto(
  nomePastaEscolhida: string,
  caminhoRelativo: string,
): { cadernoId: string; cadernoNome: string } {
  const segmentos = caminhoRelativo.split(/[\\/]+/).filter((s) => s !== "");
  // Descarta o último segmento (o nome do arquivo); o resto são as subpastas.
  const subpastas = segmentos.slice(0, -1);
  const bruto =
    subpastas.length === 0
      ? nomePastaEscolhida
      : subpastas.join(SEPARADOR_CADERNO);
  return montarCaderno(bruto);
}
