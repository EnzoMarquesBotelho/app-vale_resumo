/**
 * Geração PURA de Markdown dos artefatos e do documento inteiro.
 *
 * Sem Node/Electron/React: funções determinísticas sobre os dados de domínio,
 * testáveis em isolamento no vitest `node`. Cada função por artefato devolve
 * uma `string` com título de seção `##` (sem título de documento), usando `\n`
 * como quebra de linha e sem `\n` final sobrando — o concatenador controla o
 * espaçamento entre seções.
 */
import type {
  Exercicio,
  Flashcard,
  MapaMental,
  ModoConteudo,
  Quiz,
  Resumo,
} from "../types";
import { itensMapa } from "./mapaArvore";
import type { DocumentoExportavel, TipoArtefato } from "./types";

/** Ordem canônica das seções no documento exportado. */
export const ORDEM_ARTEFATOS: readonly TipoArtefato[] = [
  "resumo",
  "flashcards",
  "exercicios",
  "mapaMental",
  "quiz",
];

/** Rótulo em português do modo de resumo, para a linha de meta. */
const ROTULO_MODO_RESUMO: Record<Resumo["modo"], string> = {
  curto: "curto",
  longo: "longo",
};

/** Rótulo em português do modo de uma lista de exercícios. */
const ROTULO_MODO_EXERCICIO: Record<ModoConteudo, string> = {
  teorica: "teórica",
  pratica: "prática",
  mista: "mista",
};

/**
 * Markdown do resumo: `## Resumo`, a linha de modo em itálico e o conteúdo
 * como texto corrido. Cobre os dois modos (`curto`/`longo`).
 */
export function gerarMarkdownResumo(resumo: Resumo): string {
  return [
    "## Resumo",
    "",
    `*Modo: ${ROTULO_MODO_RESUMO[resumo.modo]}*`,
    "",
    resumo.conteudo,
  ].join("\n");
}

/**
 * Markdown dos flashcards: `## Flashcards` e um bloco `### N. pergunta` seguido
 * da resposta por card, numerado base-1 na ordem do array.
 */
export function gerarMarkdownFlashcards(flashcards: Flashcard[]): string {
  const blocos = flashcards.map(
    (card, i) => `### ${i + 1}. ${card.pergunta}\n\n${card.resposta}`,
  );
  return ["## Flashcards", "", ...entremear(blocos)].join("\n");
}

/**
 * Markdown dos exercícios: `## Exercícios` e um bloco `### N. enunciado` com a
 * `**Resposta:**` por item. Se todos os itens têm o mesmo modo, mostra-o em
 * itálico sob o título; se houver mistura de modos, cada item recebe um sufixo
 * `(modo)` ao lado do número.
 */
export function gerarMarkdownExercicios(exercicios: Exercicio[]): string {
  const modos = new Set(exercicios.map((ex) => ex.modo));
  const homogeneo = modos.size === 1 && exercicios.length > 0;

  const linhas: string[] = ["## Exercícios", ""];
  if (homogeneo) {
    const modo = exercicios[0].modo;
    linhas.push(`*Modo: ${ROTULO_MODO_EXERCICIO[modo]}*`, "");
  }

  const blocos = exercicios.map((ex, i) => {
    const sufixo = homogeneo ? "" : ` (${ROTULO_MODO_EXERCICIO[ex.modo]})`;
    return `### ${i + 1}.${sufixo} ${ex.enunciado}\n\n**Resposta:** ${ex.resposta}`;
  });

  return [...linhas, ...entremear(blocos)].join("\n");
}

/**
 * Markdown do mapa mental: `## Mapa mental` e uma lista aninhada por
 * indentação (dois espaços por nível) a partir de `itensMapa`. A raiz é o
 * primeiro `- ` sem indentação (nível 0); o título não duplica a raiz.
 */
export function gerarMarkdownMapaMental(mapa: MapaMental): string {
  const itens = itensMapa(mapa).map(
    (item) => `${"  ".repeat(item.nivel)}- ${item.rotulo}`,
  );
  return ["## Mapa mental", "", ...itens].join("\n");
}

/**
 * Markdown do quiz: `## Quiz` e um bloco por pergunta (base-1). Múltipla
 * escolha marca a correta com `- [x]` e as demais com `- [ ]`; aberta mostra o
 * `**Gabarito:**`.
 */
export function gerarMarkdownQuiz(quiz: Quiz): string {
  const blocos = quiz.perguntas.map((pergunta, i) => {
    const titulo = `### ${i + 1}. ${pergunta.enunciado}`;
    if (pergunta.tipo === "multipla") {
      const alternativas = pergunta.alternativas.map(
        (alt) => `${alt.correta ? "- [x]" : "- [ ]"} ${alt.texto}`,
      );
      return [titulo, "", ...alternativas].join("\n");
    }
    return `${titulo}\n\n**Gabarito:** ${pergunta.gabarito}`;
  });
  return ["## Quiz", "", ...entremear(blocos)].join("\n");
}

/**
 * Lista os tipos de artefato presentes em `doc`, na ordem canônica. Regra de
 * presença IDÊNTICA à de `storage.ts` (`listarDocumentos`): resumo/mapa/quiz
 * por `!== undefined`; flashcards/exercícios exigem também `length > 0`.
 *
 * É a única fonte da regra de presença, reusada pelo Markdown de documento,
 * pelo PDF de documento e pelo renderer (habilitar/desabilitar o controle).
 */
export function artefatosPresentes(doc: DocumentoExportavel): TipoArtefato[] {
  const presentes: TipoArtefato[] = [];
  for (const tipo of ORDEM_ARTEFATOS) {
    if (artefatoPresente(doc, tipo)) presentes.push(tipo);
  }
  return presentes;
}

/** Aplica a regra de presença de um único artefato (ver `artefatosPresentes`). */
function artefatoPresente(doc: DocumentoExportavel, tipo: TipoArtefato): boolean {
  switch (tipo) {
    case "resumo":
      return doc.resumo !== undefined;
    case "flashcards":
      return doc.flashcards !== undefined && doc.flashcards.length > 0;
    case "exercicios":
      return doc.exercicios !== undefined && doc.exercicios.length > 0;
    case "mapaMental":
      return doc.mapaMental !== undefined;
    case "quiz":
      return doc.quiz !== undefined;
  }
}

/**
 * Markdown do documento inteiro: `# nome` seguido das seções presentes na
 * ordem canônica, separadas por uma linha em branco. Sem nenhum artefato,
 * produz o cabeçalho mais `_Nenhum artefato gerado ainda._` (não lança).
 */
export function gerarMarkdownDocumento(doc: DocumentoExportavel): string {
  const presentes = artefatosPresentes(doc);
  if (presentes.length === 0) {
    return [`# ${doc.nome}`, "", "_Nenhum artefato gerado ainda._"].join("\n");
  }

  const secoes = presentes.map((tipo) => gerarSecaoArtefato(doc, tipo));
  return [`# ${doc.nome}`, "", ...entremear(secoes)].join("\n");
}

/**
 * Markdown da seção de um artefato presente. As asserções de não-nulo são
 * seguras: só é chamada para tipos que `artefatosPresentes` já confirmou.
 */
function gerarSecaoArtefato(
  doc: DocumentoExportavel,
  tipo: TipoArtefato,
): string {
  switch (tipo) {
    case "resumo":
      return gerarMarkdownResumo(doc.resumo!);
    case "flashcards":
      return gerarMarkdownFlashcards(doc.flashcards!);
    case "exercicios":
      return gerarMarkdownExercicios(doc.exercicios!);
    case "mapaMental":
      return gerarMarkdownMapaMental(doc.mapaMental!);
    case "quiz":
      return gerarMarkdownQuiz(doc.quiz!);
  }
}

/**
 * Intercala uma linha em branco entre os blocos (sem linha extra no fim),
 * usado para separar cards/itens/seções mantendo o resultado sem `\n` final.
 */
function entremear(blocos: string[]): string[] {
  const resultado: string[] = [];
  blocos.forEach((bloco, i) => {
    if (i > 0) resultado.push("");
    resultado.push(bloco);
  });
  return resultado;
}
