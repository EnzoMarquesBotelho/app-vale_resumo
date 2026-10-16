import { useState } from "react";
import { QUANTIDADE_MAXIMA, QUANTIDADE_MINIMA } from "@shared/types";
import type { ArquivoImportado, Flashcard } from "@shared/types";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das demais telas.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao gerar os flashcards.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao gerar os flashcards.";
}

/** Props da tela de flashcards. */
interface FlashcardsProps {
  /** Arquivo importado cujo texto será usado (ou `null` se nenhum). */
  arquivo: ArquivoImportado | null;
  /**
   * Flashcards já salvos deste documento, para reabrir resultados anteriores.
   * `null`/ausente quando ainda não há flashcards salvos.
   */
  flashcardsSalvos?: Flashcard[] | null;
  /** Chamado quando novos flashcards são gerados, para o App persistir. */
  onGerado?: (flashcards: Flashcard[]) => void;
}

/** Quantidade inicial sugerida de flashcards. */
const QUANTIDADE_PADRAO = 10;

/**
 * Tela de flashcards: o usuário escolhe quantos cards gerar (5–100) e gera a
 * partir do texto importado via IA local. Os cards são navegáveis (anterior/
 * próximo) e viram ao clicar (pergunta ↔ resposta).
 */
export function Flashcards({
  arquivo,
  flashcardsSalvos,
  onGerado,
}: FlashcardsProps): React.JSX.Element {
  const [quantidade, setQuantidade] = useState<number>(QUANTIDADE_PADRAO);
  // Estado inicializado a partir do que está salvo. O App remonta esta tela
  // (via `key` por documento) ao reabrir/importar outro, então a inicialização
  // reflete o documento ativo sem precisar sincronizar via efeito.
  const [cards, setCards] = useState<Flashcard[] | null>(
    flashcardsSalvos ?? null,
  );
  const [indice, setIndice] = useState(0);
  const [virado, setVirado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Mantém a quantidade dentro dos limites do MVP (5–100).
  const quantidadeValida =
    quantidade >= QUANTIDADE_MINIMA && quantidade <= QUANTIDADE_MAXIMA;

  async function gerar(): Promise<void> {
    if (!temTexto || !quantidadeValida) return;
    setErro(null);
    setCards(null);
    setIndice(0);
    setVirado(false);
    setGerando(true);
    try {
      const resultado = await window.api?.gerarFlashcards(
        arquivo.texto,
        quantidade,
      );
      setCards(resultado ?? null);
      if (resultado != null && onGerado) {
        onGerado(resultado);
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  function irPara(novoIndice: number): void {
    if (cards === null) return;
    const total = cards.length;
    // Navegação circular: do último volta ao primeiro e vice-versa.
    const normalizado = ((novoIndice % total) + total) % total;
    setIndice(normalizado);
    setVirado(false);
  }

  const cardAtual = cards !== null ? cards[indice] : null;

  return (
    <section className="flashcards">
      <header className="flashcards-header">
        <h2>Flashcards</h2>
        {!temTexto ? (
          <p className="app-meta">
            Importe um arquivo com texto para gerar flashcards.
          </p>
        ) : (
          <div className="flashcards-controles">
            <label className="flashcards-quantidade">
              Quantidade
              <input
                type="number"
                min={QUANTIDADE_MINIMA}
                max={QUANTIDADE_MAXIMA}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                disabled={gerando}
              />
            </label>
            <button
              type="button"
              onClick={() => void gerar()}
              disabled={gerando || !quantidadeValida}
            >
              {gerando ? "Gerando…" : "Gerar flashcards"}
            </button>
            {!quantidadeValida && (
              <span className="app-meta">
                Escolha entre {QUANTIDADE_MINIMA} e {QUANTIDADE_MAXIMA}.
              </span>
            )}
          </div>
        )}
      </header>

      {erro !== null && (
        <p className="flashcards-erro" role="alert">
          {erro}
        </p>
      )}

      {cardAtual !== null && cards !== null && (
        <article className="flashcards-resultado">
          <p className="flashcards-contador" aria-live="polite">
            Card {indice + 1} de {cards.length}
          </p>
          <button
            type="button"
            className={`flashcard ${virado ? "virado" : ""}`}
            onClick={() => setVirado((v) => !v)}
            aria-label={
              virado ? "Mostrar a pergunta" : "Mostrar a resposta"
            }
          >
            <span className="flashcard-rotulo">
              {virado ? "Resposta" : "Pergunta"}
            </span>
            <span className="flashcard-texto">
              {virado ? cardAtual.resposta : cardAtual.pergunta}
            </span>
            <span className="app-meta flashcard-dica">
              Clique para virar
            </span>
          </button>
          <nav className="flashcards-navegacao">
            <button type="button" onClick={() => irPara(indice - 1)}>
              ← Anterior
            </button>
            <button type="button" onClick={() => irPara(indice + 1)}>
              Próximo →
            </button>
          </nav>
        </article>
      )}
    </section>
  );
}
