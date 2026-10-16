import { useState } from "react";
import { QUANTIDADE_MAXIMA, QUANTIDADE_MINIMA } from "@shared/types";
import { calcularPontuacao } from "@shared/quizScore";
import type { RespostaUsuarioPura } from "@shared/quizScore";
import type { ArquivoImportado, ModoQuiz, PerguntaQuiz, Quiz as QuizArtefato } from "@shared/types";
import { getApi } from "../api";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das demais telas.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao gerar o quiz.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao gerar o quiz.";
}

/** Alias local da resposta do usuário (forma pura compartilhada). */
type RespostaUsuario = RespostaUsuarioPura;

/** Props da tela de quiz. */
interface QuizProps {
  /** Arquivo importado cujo texto será usado (ou `null` se nenhum). */
  arquivo: ArquivoImportado | null;
  /**
   * Quiz já salvo deste documento, para reabrir as perguntas anteriores.
   * `null`/ausente quando ainda não há quiz salvo. Só as perguntas persistem;
   * a tentativa (respostas/enviado/pontuação) vive em memória nesta view.
   */
  quizSalvo?: QuizArtefato | null;
  /** Chamado quando um novo quiz é gerado, para o App persistir. */
  onGerado?: (quiz: QuizArtefato) => void;
}

/** Quantidade inicial sugerida de perguntas. Constante LOCAL da view. */
const QUANTIDADE_PADRAO = 10;

/** Monta o vetor de respostas vazias para a lista de perguntas dada. */
function respostasVazias(perguntas: PerguntaQuiz[]): RespostaUsuario[] {
  return perguntas.map((pergunta) =>
    pergunta.tipo === "multipla"
      ? { tipo: "multipla", escolhidaIndice: null }
      : { tipo: "aberta", texto: "" },
  );
}

/**
 * Tela de quiz interativo em dois modos. O usuário escolhe o tipo
 * (múltipla/aberta/misto) e quantas perguntas gerar (5–100) a partir do texto
 * importado via IA local. Primeiro RESPONDE todas as perguntas sem nenhum
 * feedback; ao ENVIAR, volta ao início em modo REVISÃO, com a correção na
 * própria questão (alternativa correta destacada nas objetivas, gabarito nas
 * abertas) e a pontuação das objetivas no topo. REFAZER zera as respostas
 * mantendo as mesmas perguntas.
 */
export function Quiz({
  arquivo,
  quizSalvo,
  onGerado,
}: QuizProps): React.JSX.Element {
  // Estado inicializado a partir do que está salvo. O App remonta esta tela
  // (via `key` por documento) ao reabrir/importar outro, então a tentativa
  // sempre começa zerada e em modo responder.
  const [modo, setModo] = useState<ModoQuiz>(quizSalvo?.modo ?? "misto");
  const [quantidade, setQuantidade] = useState<number>(QUANTIDADE_PADRAO);
  const [perguntas, setPerguntas] = useState<PerguntaQuiz[] | null>(
    quizSalvo?.perguntas ?? null,
  );
  const [respostas, setRespostas] = useState<RespostaUsuario[]>(
    quizSalvo?.perguntas ? respostasVazias(quizSalvo.perguntas) : [],
  );
  const [enviado, setEnviado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const temTexto =
    arquivo !== null && !arquivo.semTextoExtraivel && arquivo.texto.length > 0;

  // Convenção dos limites 5–100: o serviço (`normalizarQuantidade`) sempre faz
  // clamp; a UI apenas antecipa o feedback, bloqueando o botão enquanto o valor
  // está fora da faixa. (Mesmo padrão de Exercicios.tsx.)
  const quantidadeValida =
    quantidade >= QUANTIDADE_MINIMA && quantidade <= QUANTIDADE_MAXIMA;

  async function gerar(): Promise<void> {
    if (!temTexto || !quantidadeValida) return;
    setErro(null);
    setPerguntas(null);
    setRespostas([]);
    setEnviado(false);
    setGerando(true);
    try {
      const perguntasGeradas = await getApi().gerarQuiz(
        arquivo.texto,
        modo,
        quantidade,
      );
      const lista = perguntasGeradas ?? null;
      setPerguntas(lista);
      if (lista != null) {
        setRespostas(respostasVazias(lista));
        if (onGerado) {
          onGerado({
            documentoId: "",
            modo,
            perguntas: lista,
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

  /** Registra a alternativa escolhida numa pergunta objetiva. */
  function escolher(indice: number, escolhidaIndice: number): void {
    setRespostas((atual) =>
      atual.map((resposta, i) =>
        i === indice ? { tipo: "multipla", escolhidaIndice } : resposta,
      ),
    );
  }

  /** Registra o texto digitado numa pergunta aberta. */
  function responderAberta(indice: number, texto: string): void {
    setRespostas((atual) =>
      atual.map((resposta, i) =>
        i === indice ? { tipo: "aberta", texto } : resposta,
      ),
    );
  }

  /** Envia as respostas: passa ao modo revisão e rola ao topo. */
  function enviar(): void {
    setEnviado(true);
    window.scrollTo({ top: 0 });
  }

  /** Refaz: zera as respostas e volta ao modo responder (mesmas perguntas). */
  function refazer(): void {
    if (perguntas !== null) setRespostas(respostasVazias(perguntas));
    setEnviado(false);
  }

  return (
    <section className="quiz">
      <header className="exercicios-header">
        <h2>Quiz</h2>
        {!temTexto ? (
          <p className="app-meta">
            Importe um arquivo com texto para gerar um quiz.
          </p>
        ) : (
          <div className="quiz-controles">
            <label className="exercicios-modo">
              Tipo
              <select
                value={modo}
                onChange={(e) => setModo(e.target.value as ModoQuiz)}
                disabled={gerando}
              >
                <option value="multipla">Múltipla escolha</option>
                <option value="aberta">Aberta</option>
                <option value="misto">Misto</option>
              </select>
            </label>
            <label className="exercicios-quantidade">
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
              {gerando ? "Gerando…" : "Gerar quiz"}
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
        <p className="exercicios-erro" role="alert">
          {erro}
        </p>
      )}

      {perguntas !== null &&
        (enviado ? (
          <Revisao
            perguntas={perguntas}
            respostas={respostas}
            onRefazer={refazer}
          />
        ) : (
          <Responder
            perguntas={perguntas}
            respostas={respostas}
            onEscolher={escolher}
            onResponderAberta={responderAberta}
            onEnviar={enviar}
          />
        ))}
    </section>
  );
}

/** Props do modo de resposta (sem feedback). */
interface ResponderProps {
  perguntas: PerguntaQuiz[];
  respostas: RespostaUsuario[];
  onEscolher: (indice: number, escolhidaIndice: number) => void;
  onResponderAberta: (indice: number, texto: string) => void;
  onEnviar: () => void;
}

/**
 * Modo RESPONDER: lista as perguntas para o usuário responder sem nenhum
 * feedback de certo/errado. Objetivas usam um grupo de rádios; abertas usam
 * um textarea. O botão Enviar fica ao fim.
 */
function Responder({
  perguntas,
  respostas,
  onEscolher,
  onResponderAberta,
  onEnviar,
}: ResponderProps): React.JSX.Element {
  return (
    <div className="exercicios-resultado">
      <ol className="quiz-lista">
        {perguntas.map((pergunta, indice) => {
          const resposta = respostas[indice];
          return (
            <li key={indice} className="quiz-item">
              <p className="exercicio-enunciado">{pergunta.enunciado}</p>
              {pergunta.tipo === "multipla" ? (
                <div
                  className="quiz-alternativas"
                  role="radiogroup"
                  aria-label={`Alternativas da questão ${indice + 1}`}
                >
                  {pergunta.alternativas.map((alternativa, alt) => (
                    <label key={alt} className="quiz-alternativa">
                      <input
                        type="radio"
                        name={`questao-${indice}`}
                        checked={
                          resposta?.tipo === "multipla" &&
                          resposta.escolhidaIndice === alt
                        }
                        onChange={() => onEscolher(indice, alt)}
                      />
                      {alternativa.texto}
                    </label>
                  ))}
                </div>
              ) : (
                <label className="quiz-aberta">
                  <span className="quiz-aberta-rotulo">Sua resposta</span>
                  <textarea
                    value={resposta?.tipo === "aberta" ? resposta.texto : ""}
                    onChange={(e) => onResponderAberta(indice, e.target.value)}
                    rows={3}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <div className="quiz-acoes">
        <button type="button" onClick={onEnviar} disabled={perguntas.length === 0}>
          Enviar respostas
        </button>
      </div>
    </div>
  );
}

/** Props do modo de revisão (correção na própria questão). */
interface RevisaoProps {
  perguntas: PerguntaQuiz[];
  respostas: RespostaUsuario[];
  onRefazer: () => void;
}

/**
 * Modo REVISÃO: mostra a pontuação das objetivas no topo e, por questão, a
 * correção na própria questão — nas objetivas, a alternativa correta destacada
 * e a escolha do usuário marcada certa/errada com um selo textual; nas abertas,
 * a resposta do usuário ao lado do gabarito.
 */
function Revisao({
  perguntas,
  respostas,
  onRefazer,
}: RevisaoProps): React.JSX.Element {
  const pontuacao = calcularPontuacao(perguntas, respostas);
  const resumoPontuacao =
    pontuacao.totalObjetivas > 0
      ? `${pontuacao.acertos} de ${pontuacao.totalObjetivas} em múltipla escolha`
      : "Confira o gabarito de cada questão para se autoavaliar.";

  return (
    <div className="exercicios-resultado">
      <p className="quiz-pontuacao" aria-live="polite">
        {resumoPontuacao}
      </p>
      <ol className="quiz-lista">
        {perguntas.map((pergunta, indice) => {
          const resposta = respostas[indice];
          if (pergunta.tipo === "multipla") {
            const escolhida =
              resposta?.tipo === "multipla" ? resposta.escolhidaIndice : null;
            const acertou =
              escolhida !== null &&
              pergunta.alternativas[escolhida]?.correta === true;
            const selo =
              escolhida === null
                ? { classe: "quiz-selo", texto: "Sem resposta" }
                : acertou
                  ? { classe: "quiz-selo quiz-selo-acerto", texto: "Acertou" }
                  : { classe: "quiz-selo quiz-selo-erro", texto: "Errou" };
            return (
              <li key={indice} className="quiz-item">
                <p className="exercicio-enunciado">{pergunta.enunciado}</p>
                <span className={selo.classe}>{selo.texto}</span>
                <div className="quiz-alternativas">
                  {pergunta.alternativas.map((alternativa, alt) => {
                    const escolhidaEstaAlt = escolhida === alt;
                    const classes = ["quiz-alternativa"];
                    if (alternativa.correta) classes.push("quiz-alt-correta");
                    if (escolhidaEstaAlt && !alternativa.correta) {
                      classes.push("quiz-alt-escolhida-errada");
                    }
                    return (
                      <label key={alt} className={classes.join(" ")}>
                        <input
                          type="radio"
                          name={`questao-${indice}`}
                          checked={escolhidaEstaAlt}
                          disabled
                          readOnly
                        />
                        {alternativa.texto}
                      </label>
                    );
                  })}
                </div>
              </li>
            );
          }

          const textoUsuario =
            resposta?.tipo === "aberta" ? resposta.texto.trim() : "";
          return (
            <li key={indice} className="quiz-item">
              <p className="exercicio-enunciado">{pergunta.enunciado}</p>
              <p className="quiz-aberta-rotulo">Sua resposta</p>
              <p className="quiz-resposta-usuario">
                {textoUsuario.length > 0 ? textoUsuario : "Você não respondeu."}
              </p>
              <p className="quiz-aberta-rotulo">Gabarito</p>
              <p className="quiz-gabarito">{pergunta.gabarito}</p>
            </li>
          );
        })}
      </ol>
      <div className="quiz-acoes">
        <button type="button" onClick={onRefazer}>
          Refazer
        </button>
      </div>
    </div>
  );
}
