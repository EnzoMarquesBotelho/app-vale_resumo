/**
 * Montagem PURA do document-definition do pdfmake a partir dos dados dos
 * artefatos. Só faz `import type` de `pdfmake/interfaces` (apagado na
 * compilação) e NÃO importa pdfmake em runtime — importar este módulo num
 * teste `node` não puxa pdfmake/pdfkit/fontkit. O render do binário fica em
 * `export.ts` (camada de efeito).
 *
 * As funções são determinísticas, exceto pela data no rodapé, injetável via o
 * parâmetro opcional `agora` para os testes fixarem o valor.
 */
import type {
  Content,
  DynamicContent,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type {
  Exercicio,
  Flashcard,
  MapaMental,
  ModoConteudo,
  Quiz,
  Resumo,
} from "@shared/types";
import { artefatosPresentes } from "@shared/export/markdown";
import { itensMapa } from "@shared/export/mapaArvore";
import type { ItemMapa } from "@shared/export/mapaArvore";
import type { DocumentoExportavel, TipoArtefato } from "@shared/export/types";
import { gerarSvgMapaMental } from "./mapaSvg.js";

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

/** Largura útil (pt) da página A4 com as margens padrão, para dimensionar o SVG. */
const LARGURA_UTIL_A4 = 495;

/** Blocos de conteúdo do resumo. */
function conteudoResumo(resumo: Resumo): Content[] {
  return [
    { text: "Resumo", style: "tituloSecao" },
    { text: `Modo: ${ROTULO_MODO_RESUMO[resumo.modo]}`, style: "meta" },
    { text: resumo.conteudo, margin: [0, 4, 0, 0] },
  ];
}

/** Blocos de conteúdo dos flashcards (pergunta + resposta por card). */
function conteudoFlashcards(flashcards: Flashcard[]): Content[] {
  const blocos: Content[] = [{ text: "Flashcards", style: "tituloSecao" }];
  flashcards.forEach((card, i) => {
    blocos.push({ text: `${i + 1}. ${card.pergunta}`, style: "subtitulo" });
    blocos.push({ text: card.resposta, margin: [0, 2, 0, 8] });
  });
  return blocos;
}

/** Blocos de conteúdo dos exercícios (enunciado + resposta por item). */
function conteudoExercicios(exercicios: Exercicio[]): Content[] {
  const modos = new Set(exercicios.map((ex) => ex.modo));
  const homogeneo = modos.size === 1 && exercicios.length > 0;

  const blocos: Content[] = [{ text: "Exercícios", style: "tituloSecao" }];
  if (homogeneo) {
    blocos.push({
      text: `Modo: ${ROTULO_MODO_EXERCICIO[exercicios[0].modo]}`,
      style: "meta",
    });
  }
  exercicios.forEach((ex, i) => {
    const sufixo = homogeneo ? "" : ` (${ROTULO_MODO_EXERCICIO[ex.modo]})`;
    blocos.push({
      text: `${i + 1}.${sufixo} ${ex.enunciado}`,
      style: "subtitulo",
    });
    blocos.push({
      text: [{ text: "Resposta: ", bold: true }, ex.resposta],
      margin: [0, 2, 0, 8],
    });
  });
  return blocos;
}

/**
 * Reconstrói uma lista `ul` aninhada a partir dos `ItemMapa` achatados,
 * usando uma pilha por nível. Fallback textual legível abaixo do SVG.
 */
function listaAninhadaMapa(itens: ItemMapa[]): Content {
  const raizUl: { ul: Content[] } = { ul: [] };
  // pilha[n] = o array `ul` em que inserir um item de nível n.
  const pilha: Content[][] = [raizUl.ul];

  for (const item of itens) {
    const nivel = item.nivel;
    // Garante que a pilha tenha uma lista para o nível atual.
    while (pilha.length <= nivel) {
      const pai = pilha[pilha.length - 1];
      const ultimo = pai[pai.length - 1] as { text: string; ul?: Content[] };
      ultimo.ul = [];
      pilha.push(ultimo.ul);
    }
    // Recua a pilha se o item subiu de nível.
    pilha.length = nivel + 1;
    pilha[nivel].push({ text: item.rotulo });
  }

  return raizUl;
}

/** Blocos de conteúdo do mapa mental: o SVG vetorial mais a lista de apoio. */
function conteudoMapaMental(mapa: MapaMental): Content[] {
  const itens = itensMapa(mapa);
  return [
    { text: "Mapa mental", style: "tituloSecao" },
    {
      svg: gerarSvgMapaMental(mapa),
      fit: [LARGURA_UTIL_A4, 520],
      margin: [0, 4, 0, 8],
    },
    listaAninhadaMapa(itens),
  ];
}

/** Blocos de conteúdo do quiz (alternativas marcando a correta; gabarito). */
function conteudoQuiz(quiz: Quiz): Content[] {
  const blocos: Content[] = [{ text: "Quiz", style: "tituloSecao" }];
  quiz.perguntas.forEach((pergunta, i) => {
    blocos.push({
      text: `${i + 1}. ${pergunta.enunciado}`,
      style: "subtitulo",
    });
    if (pergunta.tipo === "multipla") {
      pergunta.alternativas.forEach((alt) => {
        blocos.push({
          text: `${alt.correta ? "☑" : "☐"} ${alt.texto}`,
          style: alt.correta ? "correta" : undefined,
          margin: [8, 0, 0, 0],
        });
      });
      blocos.push({ text: "", margin: [0, 0, 0, 6] });
    } else {
      blocos.push({
        text: [{ text: "Gabarito: ", bold: true }, pergunta.gabarito],
        margin: [0, 2, 0, 8],
      });
    }
  });
  return blocos;
}

/** Blocos de conteúdo de um único artefato presente, por tipo. */
function conteudoArtefato(
  doc: DocumentoExportavel,
  tipo: TipoArtefato,
): Content[] {
  switch (tipo) {
    case "resumo":
      return conteudoResumo(doc.resumo!);
    case "flashcards":
      return conteudoFlashcards(doc.flashcards!);
    case "exercicios":
      return conteudoExercicios(doc.exercicios!);
    case "mapaMental":
      return conteudoMapaMental(doc.mapaMental!);
    case "quiz":
      return conteudoQuiz(doc.quiz!);
  }
}

/** Rodapé com a data de exportação e a numeração de páginas. */
function montarRodape(agora: Date): DynamicContent {
  const data = agora.toLocaleDateString("pt-BR");
  return (paginaAtual, totalPaginas) => ({
    columns: [
      { text: `Exportado em ${data}`, style: "meta" },
      {
        text: `${paginaAtual} / ${totalPaginas}`,
        alignment: "right",
        style: "meta",
      },
    ],
    margin: [40, 10, 40, 0],
  });
}

/** Estilos e defaults compartilhados pelos dois montadores. */
function estilosBase(agora: Date): Omit<TDocumentDefinitions, "content"> {
  return {
    pageSize: "A4",
    pageMargins: [40, 50, 40, 50],
    defaultStyle: { font: "Roboto", fontSize: 11, color: "#1f2937" },
    styles: {
      tituloDocumento: { fontSize: 22, bold: true, color: "#4f46e5" },
      tituloSecao: {
        fontSize: 16,
        bold: true,
        color: "#6366f1",
        margin: [0, 12, 0, 6],
      },
      subtitulo: { fontSize: 13, bold: true, margin: [0, 6, 0, 2] },
      meta: { italics: true, color: "#6b7280", fontSize: 10 },
      correta: { color: "#15803d", bold: true },
    },
    footer: montarRodape(agora),
  };
}

/**
 * Document-definition de um único artefato: título do documento no topo e o
 * bloco do `tipo` pedido.
 */
export function montarDefinicaoPdfArtefato(
  tipo: TipoArtefato,
  doc: DocumentoExportavel,
  agora: Date = new Date(),
): TDocumentDefinitions {
  return {
    ...estilosBase(agora),
    content: [
      { text: doc.nome, style: "tituloDocumento" },
      ...conteudoArtefato(doc, tipo),
    ],
  };
}

/**
 * Document-definition do documento inteiro: título no topo e uma seção por
 * artefato presente na ordem canônica. Sem nenhum artefato, um parágrafo de
 * aviso (não lança).
 */
export function montarDefinicaoPdfDocumento(
  doc: DocumentoExportavel,
  agora: Date = new Date(),
): TDocumentDefinitions {
  const presentes = artefatosPresentes(doc);
  const content: Content[] = [{ text: doc.nome, style: "tituloDocumento" }];

  if (presentes.length === 0) {
    content.push({
      text: "Nenhum artefato gerado ainda.",
      style: "meta",
      margin: [0, 8, 0, 0],
    });
  } else {
    for (const tipo of presentes) {
      content.push(...conteudoArtefato(doc, tipo));
    }
  }

  return { ...estilosBase(agora), content };
}
