// Gera PDFs mínimos de amostra para os testes de extração de texto.
// Executado manualmente uma vez: `node tests/fixtures/make-pdfs.mjs`.
// Os PDFs resultantes são pequenos e versionados junto do projeto.
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Monta um PDF a partir de uma lista de objetos (corpo) com xref/trailer.
 * `infoObjNumber`, quando informado, adiciona `/Info N 0 R` ao trailer para
 * que o objeto correspondente (um dicionário com CreationDate etc.) seja lido
 * por `getMetadata()`.
 */
function buildPdf(objects, infoObjNumber) {
  const header = "%PDF-1.4\n";
  let body = "";
  const offsets = [];
  objects.forEach((obj, index) => {
    offsets.push(header.length + body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  const infoRef = infoObjNumber ? ` /Info ${infoObjNumber} 0 R` : "";
  const trailer = `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R${infoRef} >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return header + body + xref + trailer;
}

/** Fluxo de conteúdo que desenha texto (extraível). */
function textStream(lines) {
  const commands = lines
    .map((line, i) => {
      const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      return `BT /F1 14 Tf 72 ${760 - i * 22} Td (${escaped}) Tj ET`;
    })
    .join("\n");
  return commands;
}

function pageObjects(contentStream) {
  const stream = `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`;
  return [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    stream,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
}

// PDF com texto extraível.
const withText = buildPdf(
  pageObjects(
    textStream([
      "Resumo de Biologia Celular",
      "A mitocondria e a usina de energia da celula.",
      "Acentuacao e espacos sao preservados no teste.",
    ]),
  ),
);
writeFileSync(resolve(here, "com-texto.pdf"), withText, "latin1");

// PDF sem texto extraivel (pagina em branco, sem operadores de texto).
// Simula um PDF escaneado: so uma pagina vazia, nenhum conteudo de texto.
const noText = buildPdf([
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
  "<< /Length 0 >>\nstream\n\nendstream",
]);
writeFileSync(resolve(here, "sem-texto.pdf"), noText, "latin1");

// PDF com data interna (Info dictionary com CreationDate). O 6º objeto é o
// dicionário Info, referenciado pelo trailer (/Info 6 0 R).
const withDateObjects = [
  ...pageObjects(
    textStream([
      "Documento com data interna.",
      "Usado para testar a captura de CreationDate.",
    ]),
  ),
  "<< /CreationDate (D:20230115103000-03'00') /ModDate (D:20230116080000-03'00') >>",
];
const withDate = buildPdf(withDateObjects, withDateObjects.length);
writeFileSync(resolve(here, "com-data.pdf"), withDate, "latin1");

console.log("Fixtures PDF gerados em tests/fixtures/");
