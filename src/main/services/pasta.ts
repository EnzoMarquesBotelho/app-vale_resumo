/**
 * Serviço de importação de pasta em lote.
 *
 * Roda no processo main (acesso a disco). Varre recursivamente uma pasta
 * escolhida pelo usuário, coleta os arquivos suportados (.txt/.md/.pdf),
 * deriva o caderno de cada um pelo caminho relativo à pasta escolhida, pula os
 * já importados (mesmo `caminhoOrigem`), extrai o texto reutilizando
 * `files.ts` e cria um `DocumentoSalvo` por arquivo via `storage.ts`.
 *
 * Somente leitura sobre a pasta escolhida: só `readdir`/`stat`/`readFile`
 * (dentro de `files.ts`), nunca escreve/move/renomeia/apaga nada lá. As
 * escritas são todas no `userData` via `storage.ts`.
 */
import { readdir } from "node:fs/promises";
import { join, relative, win32 as pathWin32, posix as pathPosix } from "node:path";
import {
  extensoesSuportadas,
  PASTA_MAX_ARQUIVOS_LOTE,
  PASTA_PROFUNDIDADE_MAXIMA,
} from "@shared/constants";
import { derivarCadernoComposto } from "@shared/notebooks";
import type { ResultadoImportacaoPasta } from "@shared/types";
import { importarArquivo } from "./files.js";
import {
  caminhosOrigemImportados,
  criarDocumento,
  normalizarCaminhoOrigem,
} from "./storage.js";

/** Um arquivo suportado encontrado na varredura. */
export interface ArquivoVarrido {
  /** Caminho absoluto no disco. */
  caminhoAbsoluto: string;
  /** Caminho relativo à pasta escolhida (para derivar o caderno). */
  caminhoRelativo: string;
}

/** Resultado da varredura (antes de qualquer persistência). */
export interface ResultadoVarredura {
  /** Arquivos suportados, ordenados por `caminhoRelativo` (localeCompare). */
  arquivos: ArquivoVarrido[];
  /** Quantos arquivos tinham extensão não suportada (contados, não lidos). */
  ignoradosPorFormato: number;
  /** `true` se a poda por profundidade cortou alguma subpasta. */
  profundidadePodada: boolean;
}

/**
 * Tetos opcionais de varredura/lote, injetáveis sobretudo para teste. Em
 * produção são omitidos e caem nos defaults de `@shared/constants`
 * (`PASTA_PROFUNDIDADE_MAXIMA`, `PASTA_MAX_ARQUIVOS_LOTE`). Expor isso como
 * parâmetro — em vez de `let` mutável em módulo — mantém as funções puras e
 * permite testar a poda/parada com números baixos sem gerar centenas de
 * arquivos reais.
 */
export interface LimitesVarredura {
  profundidadeMaxima?: number;
  maxArquivosLote?: number;
}

/**
 * Nome de exibição da pasta escolhida, saneando raiz de drive (Windows) e raiz
 * POSIX para "" (que cai em "Geral" via `montarCaderno`). Pura e testável:
 * usa `path.win32.basename` quando o caminho contém "\", senão
 * `path.posix.basename`, para ser determinística em qualquer runner (um runner
 * POSIX não trataria "C:\\" como caminho Windows com o `basename` nativo).
 *
 * @param pastaEscolhida caminho absoluto da pasta escolhida pelo usuário.
 * @returns o nome de exibição, ou "" para raiz de drive/raiz POSIX.
 */
export function nomePastaParaCaderno(pastaEscolhida: string): string {
  const semBarra = pastaEscolhida.replace(/[\\/]+$/, "");
  const bruto = semBarra.includes("\\")
    ? pathWin32.basename(semBarra)
    : pathPosix.basename(semBarra);
  if (bruto === "" || /^[A-Za-z]:$/.test(bruto)) return "";
  return bruto;
}

/**
 * Varre recursivamente `pastaEscolhida` coletando os arquivos suportados.
 *
 * Definição de profundidade: a pasta escolhida tem profundidade 0; uma subpasta
 * direta tem profundidade 1, e assim por diante. Descemos para uma subpasta só
 * se a profundidade dela for <= o teto. Com o teto 10, a 1ª subpasta de
 * profundidade 11 é a primeira podada.
 *
 * Entradas ilegíveis (subpasta que lança em `readdir`) são puladas com
 * `console.warn`; a varredura continua. A `readdir` da pasta escolhida (raiz) é
 * a única cuja falha é fatal (propagada ao chamador).
 */
export async function varrerPasta(
  pastaEscolhida: string,
  limites?: LimitesVarredura,
): Promise<ResultadoVarredura> {
  const profundidadeMax =
    limites?.profundidadeMaxima ?? PASTA_PROFUNDIDADE_MAXIMA;

  const arquivos: ArquivoVarrido[] = [];
  let ignoradosPorFormato = 0;
  let profundidadePodada = false;

  async function descer(dir: string, profundidadeAtual: number): Promise<void> {
    const entradas = await readdir(dir, { withFileTypes: true });
    for (const entrada of entradas) {
      const caminhoAbsoluto = join(dir, entrada.name);

      // Symlinks e tipos especiais: ignorados silenciosamente (evita loops de
      // symlink); não seguimos symlinks de diretório.
      if (entrada.isSymbolicLink()) continue;

      if (entrada.isDirectory()) {
        const profundidadeFilho = profundidadeAtual + 1;
        if (profundidadeFilho > profundidadeMax) {
          profundidadePodada = true;
          continue;
        }
        try {
          await descer(caminhoAbsoluto, profundidadeFilho);
        } catch (erro) {
          // Subpasta ilegível (ex.: permissão negada): pula e segue o lote.
          console.warn(
            `varrerPasta: pulando subpasta ilegível "${caminhoAbsoluto}":`,
            erro,
          );
        }
        continue;
      }

      if (!entrada.isFile()) continue;

      const extensao = extrairExtensao(entrada.name);
      if ((extensoesSuportadas as readonly string[]).includes(extensao)) {
        arquivos.push({
          caminhoAbsoluto,
          caminhoRelativo: relative(pastaEscolhida, caminhoAbsoluto),
        });
      } else {
        ignoradosPorFormato += 1;
      }
    }
  }

  // A falha na raiz é fatal (propaga); as subpastas são absorvidas acima.
  await descer(pastaEscolhida, 0);

  arquivos.sort((a, b) => a.caminhoRelativo.localeCompare(b.caminhoRelativo));
  return { arquivos, ignoradosPorFormato, profundidadePodada };
}

/** Extensão em caixa baixa, sem o ponto (ex.: "pdf"). "" se não houver. */
function extrairExtensao(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  if (ponto <= 0) return "";
  return nome.slice(ponto + 1).toLowerCase();
}

/**
 * Importa em lote a `pastaEscolhida`: varre, deriva cadernos, pula duplicatas,
 * extrai texto e cria um documento por arquivo. Nenhuma geração de IA é
 * disparada. Devolve o resumo do lote. Falhas individuais são contadas e não
 * abortam o lote.
 */
export async function importarPasta(
  pastaEscolhida: string,
  baseDir?: string,
  limites?: LimitesVarredura,
): Promise<ResultadoImportacaoPasta> {
  // 1. Nome da pasta escolhida (com guard de raiz de drive / raiz POSIX).
  const nomePasta = nomePastaParaCaderno(pastaEscolhida);

  // 2. Varredura.
  const varredura = await varrerPasta(pastaEscolhida, limites);

  // 3. Guarda de quantidade: parada segura, nada criado.
  const maxArquivos = limites?.maxArquivosLote ?? PASTA_MAX_ARQUIVOS_LOTE;
  if (varredura.arquivos.length > maxArquivos) {
    return {
      importados: 0,
      ignoradosPorFormato: varredura.ignoradosPorFormato,
      ignoradosPorDuplicata: 0,
      falhas: 0,
      cadernosTocados: [],
      limiteExcedido: "arquivos",
    };
  }

  // 4. Conjunto de caminhos já importados (atualizado dentro do lote).
  const jaImportados = await caminhosOrigemImportados(baseDir);

  let importados = 0;
  let ignoradosPorDuplicata = 0;
  let falhas = 0;
  const cadernos = new Set<string>();

  // 5. Para cada arquivo, em ordem determinística (caminhoRelativo).
  for (const arquivo of varredura.arquivos) {
    const chave = normalizarCaminhoOrigem(arquivo.caminhoAbsoluto);
    if (jaImportados.has(chave)) {
      ignoradosPorDuplicata += 1;
      continue;
    }

    const { cadernoId, cadernoNome } = derivarCadernoComposto(
      nomePasta,
      arquivo.caminhoRelativo,
    );

    try {
      const extraido = await importarArquivo(arquivo.caminhoAbsoluto);
      await criarDocumento(
        {
          nome: extraido.nome,
          formato: extraido.formato,
          texto: extraido.texto,
          cadernoId,
          cadernoNome,
          caminhoOrigem: arquivo.caminhoAbsoluto,
          // Spread condicional: nunca passa `dataArquivo: undefined`.
          ...(extraido.dataArquivo !== undefined
            ? { dataArquivo: extraido.dataArquivo }
            : {}),
        },
        baseDir,
      );
      importados += 1;
      cadernos.add(cadernoNome);
      // Atualiza o conjunto imediatamente: em colisão de chave normalizada
      // dentro do mesmo lote, vence o primeiro na ordem de caminhoRelativo; os
      // seguintes caem em `ignoradosPorDuplicata` no topo do loop.
      jaImportados.add(chave);
    } catch (erro) {
      console.warn(
        `importarPasta: falha ao importar "${arquivo.caminhoAbsoluto}":`,
        erro,
      );
      falhas += 1;
    }
  }

  const cadernosTocados = [...cadernos].sort((a, b) => a.localeCompare(b));

  return {
    importados,
    ignoradosPorFormato: varredura.ignoradosPorFormato,
    ignoradosPorDuplicata,
    falhas,
    cadernosTocados,
    // O caso "arquivos" já retornou no passo 3.
    limiteExcedido: varredura.profundidadePodada ? "profundidade" : null,
  };
}
