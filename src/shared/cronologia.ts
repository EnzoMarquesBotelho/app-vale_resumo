/**
 * Ordenação cronológica pura de documentos (base → novo).
 *
 * Lógica compartilhada sem Node/Electron/IA (padrão de `agenda.ts`): ordena uma
 * lista de documentos do mais antigo (base) ao mais recente (novo) de forma
 * 100% determinística, aceitando uma sobreposição manual opcional por
 * documento. Não lê o relógio real nem muta a entrada.
 */

/**
 * O mínimo que a ordenação precisa de um documento (estrutural, testável sem
 * mocks pesados). Serve tanto para `DocumentoSalvo` quanto para
 * `ResumoDocumentoSalvo` (ambos têm `id` + `dataArquivo?`).
 */
export interface ItemCronologico {
  /** Id único do documento. */
  id: string;
  /** Data do arquivo em ISO 8601, ou ausente/indefinida. */
  dataArquivo?: string;
}

/** Parâmetros de `ordenarCronologicamente`. */
export interface OrdenarCronologicamenteParams<T extends ItemCronologico> {
  /** Itens a ordenar (não é mutado). */
  itens: T[];
  /**
   * Sobreposição manual opcional: id → posição desejada (inteiro; menor = mais
   * à base/início). Ids ausentes do mapa seguem a ordem automática por data.
   * Quando vazio/omitido, a ordenação é 100% por data.
   */
  ordemManual?: ReadonlyMap<string, number>;
}

/**
 * Ordena do mais antigo (base) ao mais recente (novo). Pura, estável,
 * determinística; devolve um NOVO array (não muta a entrada) e não lê
 * `Date.now()`.
 *
 * Regras (semântica de PREFIXO):
 * 1. Grupo manual é a chave primária: itens com índice manual (`ordemManual`)
 *    formam um bloco à frente de todos os itens sem índice. Dentro do grupo
 *    ancorado, ordena pelo VALOR do índice manual (menor primeiro); desempate
 *    pela data (regra 2) e depois por `id`.
 * 2. Ambos com data: mais antiga primeiro (comparação lexicográfica de ISO);
 *    desempate por `id`.
 * 3. Um com data, outro sem: o com data vem antes.
 * 4. Ambos sem data: desempate por `id`.
 */
export function ordenarCronologicamente<T extends ItemCronologico>(
  params: OrdenarCronologicamenteParams<T>,
): T[] {
  const { itens, ordemManual } = params;

  const grupoManual = (x: T): number =>
    ordemManual !== undefined && ordemManual.has(x.id) ? 0 : 1;

  /** Desempate por data (com data vem antes do sem data) e depois por `id`. */
  const compararPorData = (a: T, b: T): number => {
    const da = a.dataArquivo;
    const db = b.dataArquivo;
    if (da !== undefined && db !== undefined) {
      const cmp = da.localeCompare(db);
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    }
    if (da !== undefined) return -1; // a tem data, b não → a antes
    if (db !== undefined) return 1; // b tem data, a não → b antes
    return a.id.localeCompare(b.id); // ambos sem data
  };

  // Ordena sobre uma cópia: a pureza não depende da estabilidade do `sort`,
  // porque todo empate termina em `id.localeCompare` (determinístico).
  return itens.slice().sort((a, b) => {
    const ga = grupoManual(a);
    const gb = grupoManual(b);
    if (ga !== gb) return ga - gb;

    if (ga === 0 && ordemManual !== undefined) {
      // Dentro do bloco ancorado: valor do índice manual (menor primeiro).
      const ma = ordemManual.get(a.id) ?? 0;
      const mb = ordemManual.get(b.id) ?? 0;
      if (ma !== mb) return ma - mb;
    }

    return compararPorData(a, b);
  });
}

/**
 * `true` se e somente se `s` é uma data ISO 8601 canônica em UTC — exatamente a
 * forma que `toISOString()` emite (`YYYY-MM-DDTHH:mm:ss.sssZ`), validada por
 * round-trip. Strings que o `Date` apenas "consegue parsear" em formatos
 * não-canônicos (ex.: `"2020"`, `"01/15/2023"`) são rejeitadas, preservando a
 * invariante de que toda `dataArquivo` persistida é ISO canônica UTC.
 */
export function ehIsoPlausivel(s: unknown): s is string {
  return (
    typeof s === "string" &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString() === s
  );
}
