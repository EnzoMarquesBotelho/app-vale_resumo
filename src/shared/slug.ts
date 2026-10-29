/**
 * Util de string PURA e genérica para derivar um "slug" de um título.
 *
 * Vive aqui (e não em `plano.ts`) porque é uma util de saneamento de string,
 * não de cálculo do plano — separa preocupações (matemática vs. texto). Sem
 * dependência externa: usa `normalize("NFD")` + strip de diacríticos.
 *
 * NÃO aplica o prefixo `manual:` — isso é responsabilidade de quem sanea o
 * plano (`sanearPlano` em `provas.ts`), que compõe `manual:<slug>-<índice>`.
 */

/**
 * Converte um título em um slug: minúsculas, sem acentos, com não-alfanuméricos
 * trocados por hífen, hífens colapsados e aparados das pontas. Vazio após
 * normalizar → `"topico"` (nunca retorna string vazia). Determinística: títulos
 * iguais produzem slugs iguais.
 */
export function slugTopico(titulo: string): string {
  const slug = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "topico";
}
