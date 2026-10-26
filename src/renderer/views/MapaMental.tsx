import { useMemo, useRef, useState } from "react";
import {
  MARGEM,
  NO_ALTURA,
  NO_LARGURA,
  calcularLayout,
  caminhoAresta,
} from "@shared/mapaLayout";
import type { NoPosicionado } from "@shared/mapaLayout";
import type { ArquivoImportado, MapaMental, NoMapaMental } from "@shared/types";
import { getApi } from "../api";
import { ExportarControles } from "../components/ExportarControles";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das demais telas.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao gerar o mapa mental.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao gerar o mapa mental.";
}

/** Props da tela de mapa mental. */
interface MapaMentalProps {
  /** Arquivo importado cujo texto será usado (ou `null` se nenhum). */
  arquivo: ArquivoImportado | null;
  /**
   * Mapa mental já salvo deste documento, para reabrir resultados anteriores.
   * `null`/ausente quando ainda não há mapa salvo.
   */
  mapaMentalSalvo?: MapaMental | null;
  /** Chamado quando um novo mapa é gerado, para o App persistir o artefato. */
  onGerado?: (mapa: MapaMental) => void;
  /** Nome do documento ativo, usado para nomear o arquivo exportado. */
  nomeDocumento?: string;
}

/** Limites e passo do zoom. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_PASSO = 0.1;

/**
 * Coleta o conjunto inicial de ids expandidos: a raiz e seus filhos diretos.
 * Os níveis mais profundos começam colapsados para o mapa abrir legível.
 */
function expandidosIniciais(raiz: NoMapaMental): Set<string> {
  const ids = new Set<string>([raiz.id]);
  for (const filho of raiz.filhos) ids.add(filho.id);
  return ids;
}

/** Classe CSS do nó por nível (cores por profundidade via tokens). */
function classeNivel(nivel: number): string {
  if (nivel === 1) return "mapa-no nivel-1";
  if (nivel === 2) return "mapa-no nivel-2";
  return "mapa-no nivel-3";
}

/** Resumo textual acessível da árvore (lista aninhada para leitores de tela). */
function ResumoTextual({ no }: { no: NoMapaMental }): React.JSX.Element {
  return (
    <li>
      {no.rotulo}
      {no.filhos.length > 0 && (
        <ul>
          {no.filhos.map((filho) => (
            <ResumoTextual key={filho.id} no={filho} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Tela de mapa mental: gera uma árvore hierárquica (tema → ramos → sub-ramos)
 * do texto importado via IA local e a desenha num SVG navegável — expandir/
 * colapsar ramos, zoom e pan (arrastar). Navegável, não editável.
 */
export function MapaMental({
  arquivo,
  mapaMentalSalvo,
  onGerado,
  nomeDocumento,
}: MapaMentalProps): React.JSX.Element {
  // Estado inicializado a partir do que está salvo. O App remonta esta tela
  // (via `key` por documento) ao reabrir/importar outro.
  const [raiz, setRaiz] = useState<NoMapaMental | null>(
    mapaMentalSalvo?.raiz ?? null,
  );
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(() =>
    mapaMentalSalvo?.raiz
      ? expandidosIniciais(mapaMentalSalvo.raiz)
      : new Set<string>(),
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Referência do arraste em andamento (null quando não há arraste).
  const arraste = useRef<{ x: number; y: number } | null>(null);

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Layout recalculado quando a árvore ou o conjunto de expandidos muda.
  const layout = useMemo(
    () => (raiz !== null ? calcularLayout(raiz, expandidos) : null),
    [raiz, expandidos],
  );
  const posPorId = useMemo(() => {
    const mapa = new Map<string, NoPosicionado>();
    if (layout) for (const no of layout.nos) mapa.set(no.id, no);
    return mapa;
  }, [layout]);

  async function gerar(): Promise<void> {
    if (!temTexto) return;
    setErro(null);
    setRaiz(null);
    setGerando(true);
    try {
      const raizGerada = await getApi().gerarMapaMental(arquivo.texto);
      // Defesa simétrica com as telas irmãs: o contrato garante não-nulo.
      setRaiz(raizGerada ?? null);
      if (raizGerada != null) {
        setExpandidos(expandidosIniciais(raizGerada));
        setZoom(1);
        setPan({ x: 0, y: 0 });
        if (onGerado) {
          onGerado({
            documentoId: "",
            raiz: raizGerada,
            geradoEm: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  /** Alterna o estado de expandido de um nó com filhos. */
  function alternarNo(no: NoPosicionado): void {
    if (no.filhosIds.length === 0) return;
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(no.id)) proximo.delete(no.id);
      else proximo.add(no.id);
      return proximo;
    });
  }

  function ajustarZoom(delta: number): void {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)));
  }

  function redefinirVista(): void {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function aoApertarFundo(e: React.MouseEvent): void {
    arraste.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }

  function aoMoverFundo(e: React.MouseEvent): void {
    if (arraste.current === null) return;
    setPan({
      x: e.clientX - arraste.current.x,
      y: e.clientY - arraste.current.y,
    });
  }

  function aoSoltarFundo(): void {
    arraste.current = null;
  }

  const larguraVb = (layout?.largura ?? 0) + NO_LARGURA + MARGEM * 2;
  const alturaVb = (layout?.alturaConteudo ?? 0) + MARGEM * 2;

  return (
    <section className="mapa">
      <header className="mapa-header">
        <h2>Mapa mental</h2>
        {!temTexto ? (
          <p className="app-meta">
            Importe um arquivo com texto para gerar um mapa mental.
          </p>
        ) : (
          <div className="mapa-controles">
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando}
            >
              {gerando ? "Gerando…" : "Gerar mapa mental"}
            </button>
            {raiz !== null && (
              <div className="mapa-zoom" role="group" aria-label="Zoom do mapa">
                <button
                  type="button"
                  onClick={() => ajustarZoom(-ZOOM_PASSO)}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Diminuir o zoom"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => ajustarZoom(ZOOM_PASSO)}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Aumentar o zoom"
                >
                  ＋
                </button>
                <button
                  type="button"
                  onClick={redefinirVista}
                  aria-label="Redefinir a vista"
                >
                  Redefinir
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {erro !== null && (
        <p className="mapa-erro" role="alert">
          {erro}
        </p>
      )}

      {raiz !== null && layout !== null && (
        <article className="mapa-resultado">
          <ExportarControles
            alvo={{
              escopo: "artefato",
              tipo: "mapaMental",
              documento: {
                nome: nomeDocumento ?? arquivo?.nome ?? "Documento",
                mapaMental: {
                  documentoId: "",
                  raiz,
                  geradoEm: mapaMentalSalvo?.geradoEm ?? "",
                },
              },
            }}
          />
          <div
            className="mapa-canvas"
            onMouseDown={aoApertarFundo}
            onMouseMove={aoMoverFundo}
            onMouseUp={aoSoltarFundo}
            onMouseLeave={aoSoltarFundo}
          >
            <svg
              className="mapa-svg"
              role="img"
              aria-label={`Mapa mental: ${raiz.rotulo}`}
              viewBox={`0 0 ${larguraVb} ${alturaVb}`}
              preserveAspectRatio="xMinYMid meet"
            >
              <g
                transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
                style={{ transformOrigin: "0 0" }}
              >
                <g transform={`translate(${MARGEM + NO_LARGURA / 2}, ${MARGEM})`}>
                  {layout.arestas.map((aresta) => {
                    const pai = posPorId.get(aresta.de);
                    const filho = posPorId.get(aresta.para);
                    if (!pai || !filho) return null;
                    return (
                      <path
                        key={`${aresta.de}-${aresta.para}`}
                        className="mapa-aresta"
                        d={caminhoAresta(pai, filho)}
                      />
                    );
                  })}
                  {layout.nos.map((no) => (
                    <g
                      key={no.id}
                      className={classeNivel(no.nivel)}
                      transform={`translate(${no.x}, ${no.y})`}
                      onClick={() => alternarNo(no)}
                      role={no.filhosIds.length > 0 ? "button" : undefined}
                      style={{
                        cursor:
                          no.filhosIds.length > 0 ? "pointer" : "default",
                      }}
                    >
                      <title>{no.rotulo}</title>
                      <rect
                        className="mapa-no-caixa"
                        x={-NO_LARGURA / 2}
                        y={-NO_ALTURA / 2}
                        width={NO_LARGURA}
                        height={NO_ALTURA}
                        rx={10}
                      />
                      <text
                        className="mapa-no-texto"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {no.rotulo}
                      </text>
                      {no.temFilhosOcultos && (
                        <text
                          className="mapa-no-indicador"
                          x={NO_LARGURA / 2 - 10}
                          y={0}
                          textAnchor="middle"
                          dominantBaseline="central"
                        >
                          +{no.filhosIds.length}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              </g>
            </svg>
          </div>
          {/* Resumo textual acessível: o conteúdo do mapa sem depender do SVG. */}
          <ul className="mapa-resumo-textual">
            <ResumoTextual no={raiz} />
          </ul>
        </article>
      )}
    </section>
  );
}
