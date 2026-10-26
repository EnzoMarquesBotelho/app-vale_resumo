import { useState } from "react";
import { QUANTIDADE_MAXIMA, QUANTIDADE_MINIMA } from "@shared/types";
import { calcularPontuacao } from "@shared/quizScore";
import type { RespostaUsuarioPura } from "@shared/quizScore";
import type {
  ArquivoImportado,
  AvaliacaoResposta,
  EntradaAvaliacao,
  ModoQuiz,
  PerguntaQuiz,
  Quiz as QuizArtefato,
} from "@shared/types";
import { getApi } from "../api";
import { ExportarControles } from "../components/ExportarControles";

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

/**
 * Como as perguntas abertas são corrigidas na revisão: `autoavaliacao` mostra
 * o gabarito e deixa o aluno se autoavaliar (comportamento padrão); `ia`
 * envia as abertas à IA local para um veredito automático. As objetivas são
 * SEMPRE corrigidas pelo gabarito (`calcularPontuacao`), independentemente do
 * modo escolhido.
 */
type ModoCorrecao = "autoavaliacao" | "ia";

/** Rótulo em português para cada veredito exibido no selo. */
const ROTULO_VEREDITO: Record<AvaliacaoResposta["veredito"], string> = {
  correto: "Correto",
  parcial: "Parcial",
  incorreto: "Incorreto",
  nao_avaliado: "Não avaliado",
};

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
  /** Nome do documento ativo, usado para nomear o arquivo exportado. */
  nomeDocumento?: string;
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
  nomeDocumento,
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
  // Correção das abertas: o modo escolhido mais a tentativa efêmera (avaliações
  // da IA alinhadas por índice global às perguntas — objetivas ficam `null`).
  // Nada persiste no DocumentoSalvo; remontar a view zera tudo.
  const [modoCorrecao, setModoCorrecao] = useState<ModoCorrecao>("autoavaliacao");
  const [avaliacoes, setAvaliacoes] = useState<(AvaliacaoResposta | null)[]>([]);
  const [avaliando, setAvaliando] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState<string | null>(null);

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
    setAvaliacoes([]);
    setErroAvaliacao(null);
    setAvaliando(false);
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

  /**
   * Envia as respostas: passa ao modo revisão e rola ao topo. No modo `ia`,
   * manda SÓ as perguntas abertas à IA local e re-espalha o resultado por
   * índice global (objetivas ficam `null`, seguem o gabarito). Uma falha da IA
   * NÃO trava a revisão: entra em revisão mesmo assim, com o gabarito como
   * fallback. As objetivas nunca passam pela IA.
   */
  async function enviar(): Promise<void> {
    if (perguntas === null) return;
    if (modoCorrecao === "ia") {
      setErroAvaliacao(null);
      setAvaliando(true);
      try {
        const indicesAbertas: number[] = [];
        const entradas: EntradaAvaliacao[] = [];
        perguntas.forEach((pergunta, indice) => {
          if (pergunta.tipo !== "aberta") return;
          const resposta = respostas[indice];
          indicesAbertas.push(indice);
          entradas.push({
            enunciado: pergunta.enunciado,
            gabarito: pergunta.gabarito,
            resposta: resposta?.tipo === "aberta" ? resposta.texto : "",
          });
        });
        const resultado = await getApi().avaliarRespostas(entradas);
        const porIndice: (AvaliacaoResposta | null)[] = perguntas.map(
          () => null,
        );
        indicesAbertas.forEach((indiceGlobal, i) => {
          porIndice[indiceGlobal] = resultado[i] ?? null;
        });
        setAvaliacoes(porIndice);
      } catch (e) {
        // Fallback de gabarito: registra o erro mas AINDA entra em revisão.
        setErroAvaliacao(mensagemDeErro(e));
        setAvaliacoes([]);
      } finally {
        setAvaliando(false);
      }
    }
    setEnviado(true);
    window.scrollTo({ top: 0 });
  }

  /** Refaz: zera as respostas e volta ao modo responder (mesmas perguntas). */
  function refazer(): void {
    if (perguntas !== null) setRespostas(respostasVazias(perguntas));
    setEnviado(false);
    setAvaliacoes([]);
    setErroAvaliacao(null);
    setAvaliando(false);
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

      {perguntas !== null && perguntas.length > 0 && (
        <ExportarControles
          alvo={{
            escopo: "artefato",
            tipo: "quiz",
            documento: {
              nome: nomeDocumento ?? arquivo?.nome ?? "Documento",
              quiz: {
                documentoId: "",
                modo,
                perguntas,
                geradoEm: quizSalvo?.geradoEm ?? "",
              },
            },
          }}
        />
      )}

      {perguntas !== null &&
        (enviado ? (
          <Revisao
            perguntas={perguntas}
            respostas={respostas}
            modoCorrecao={modoCorrecao}
            avaliacoes={avaliacoes}
            erroAvaliacao={erroAvaliacao}
            onRefazer={refazer}
          />
        ) : (
          <Responder
            perguntas={perguntas}
            respostas={respostas}
            modoCorrecao={modoCorrecao}
            avaliando={avaliando}
            onEscolher={escolher}
            onResponderAberta={responderAberta}
            onModoCorrecao={setModoCorrecao}
            onEnviar={() => void enviar()}
          />
        ))}
    </section>
  );
}

/** Props do modo de resposta (sem feedback). */
interface ResponderProps {
  perguntas: PerguntaQuiz[];
  respostas: RespostaUsuario[];
  modoCorrecao: ModoCorrecao;
  avaliando: boolean;
  onEscolher: (indice: number, escolhidaIndice: number) => void;
  onResponderAberta: (indice: number, texto: string) => void;
  onModoCorrecao: (modo: ModoCorrecao) => void;
  onEnviar: () => void;
}

/**
 * Modo RESPONDER: lista as perguntas para o usuário responder sem nenhum
 * feedback de certo/errado. Objetivas usam um grupo de rádios; abertas usam
 * um textarea. Junto ao botão Enviar há o toggle de como corrigir as abertas
 * (autoavaliação pelo gabarito ou correção pela IA).
 */
function Responder({
  perguntas,
  respostas,
  modoCorrecao,
  avaliando,
  onEscolher,
  onResponderAberta,
  onModoCorrecao,
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
        <fieldset className="quiz-correcao">
          <legend>Como corrigir</legend>
          <label className="quiz-correcao-opcao">
            <input
              type="radio"
              name="modo-correcao"
              checked={modoCorrecao === "autoavaliacao"}
              onChange={() => onModoCorrecao("autoavaliacao")}
              disabled={avaliando}
            />
            Autoavaliação (gabarito)
          </label>
          <label className="quiz-correcao-opcao">
            <input
              type="radio"
              name="modo-correcao"
              checked={modoCorrecao === "ia"}
              onChange={() => onModoCorrecao("ia")}
              disabled={avaliando}
            />
            Correção pela IA
          </label>
        </fieldset>
        <button
          type="button"
          onClick={onEnviar}
          disabled={perguntas.length === 0 || avaliando}
        >
          {avaliando ? "Avaliando…" : "Enviar respostas"}
        </button>
      </div>
    </div>
  );
}

/** Props do modo de revisão (correção na própria questão). */
interface RevisaoProps {
  perguntas: PerguntaQuiz[];
  respostas: RespostaUsuario[];
  modoCorrecao: ModoCorrecao;
  avaliacoes: (AvaliacaoResposta | null)[];
  erroAvaliacao: string | null;
  onRefazer: () => void;
}

/**
 * Modo REVISÃO: mostra a pontuação das objetivas no topo e, por questão, a
 * correção na própria questão — nas objetivas, a alternativa correta destacada
 * e a escolha do usuário marcada certa/errada com um selo textual; nas abertas,
 * a resposta do usuário ao lado do gabarito. No modo IA, as abertas com
 * veredito mostram o selo + comentário da IA além do gabarito; se a IA falhou
 * (ou não há veredito), cai no comportamento de autoavaliação (gabarito).
 * As objetivas são inalteradas em ambos os modos.
 */
function Revisao({
  perguntas,
  respostas,
  modoCorrecao,
  avaliacoes,
  erroAvaliacao,
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
      {erroAvaliacao !== null && (
        <p className="exercicios-erro" role="alert">
          {erroAvaliacao}
        </p>
      )}
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
          const avaliacao = avaliacoes[indice] ?? null;
          const mostrarIa = modoCorrecao === "ia" && avaliacao !== null;
          return (
            <li key={indice} className="quiz-item">
              <p className="exercicio-enunciado">{pergunta.enunciado}</p>
              <p className="quiz-aberta-rotulo">Sua resposta</p>
              <p className="quiz-resposta-usuario">
                {textoUsuario.length > 0 ? textoUsuario : "Você não respondeu."}
              </p>
              {mostrarIa && (
                <>
                  <span
                    className={`avaliacao-selo avaliacao-selo-${avaliacao.veredito}`}
                  >
                    {ROTULO_VEREDITO[avaliacao.veredito]}
                  </span>
                  <p className="avaliacao-comentario">{avaliacao.comentario}</p>
                </>
              )}
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
