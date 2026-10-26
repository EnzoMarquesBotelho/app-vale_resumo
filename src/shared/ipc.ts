/**
 * Contrato de IPC tipado compartilhado entre main e renderer.
 *
 * Centraliza os nomes dos canais e a assinatura da API exposta ao renderer
 * via `contextBridge`. Main e renderer importam daqui para não divergirem.
 */

import type {
  ArquivoImportado,
  AvaliacaoResposta,
  DicaDoDia,
  DocumentoSalvo,
  EntradaAvaliacao,
  Exercicio,
  Flashcard,
  FormatoArquivo,
  MapaMental,
  ModoConteudo,
  ModoQuiz,
  ModoResumo,
  NoMapaMental,
  OllamaStatus,
  PerguntaQuiz,
  Prova,
  Quiz,
  Resumo,
  ResumoCaderno,
  ResumoDocumentoSalvo,
  ResumoProva,
  ResultadoImportacaoPasta,
  SessaoRevisao,
  VinculoProva,
} from "./types";
import type { AlvoExportacao, ResultadoExportacao } from "./export/types";
import type { EstadoTema, ThemePreference } from "./theme";

/** Nomes dos canais de IPC. */
export const IPC_CHANNELS = {
  /** Canal de teste: renderer→main→renderer. */
  ping: "app:ping",
  /** Abre um seletor de arquivo e importa o escolhido (texto extraído). */
  importarArquivo: "arquivo:importar",
  /** Abre um seletor de PASTA e importa em lote os arquivos suportados. */
  importarPasta: "pasta:importar",
  /** Consulta o status do Ollama (disponível, modelos, modelo selecionado). */
  ollamaStatus: "ollama:status",
  /** Define o modelo selecionado para as gerações. */
  ollamaSelecionarModelo: "ollama:selecionar-modelo",
  /** Gera um resumo (curto/longo) a partir de um texto. */
  gerarResumo: "resumo:gerar",
  /** Gera flashcards (quantidade escolhível) a partir de um texto. */
  gerarFlashcards: "flashcards:gerar",
  /** Gera exercícios (modo teórica/prática/mista, 5–100) a partir de um texto. */
  gerarExercicios: "exercicios:gerar",
  /** Gera o mapa mental (árvore hierárquica) a partir de um texto. */
  gerarMapaMental: "mapamental:gerar",
  /** Gera um quiz (múltipla/aberta/misto, 5–100) a partir de um texto. */
  gerarQuiz: "quiz:gerar",
  /** Avalia por IA um lote de respostas (exercícios e perguntas abertas). */
  avaliarRespostas: "avaliacao:avaliar",
  /** Cria e salva um novo documento (sem artefatos) a partir de um arquivo. */
  criarDocumento: "documento:criar",
  /** Salva o resumo gerado em um documento existente. */
  salvarResumo: "documento:salvar-resumo",
  /** Salva os flashcards gerados em um documento existente. */
  salvarFlashcards: "documento:salvar-flashcards",
  /** Salva os exercícios gerados em um documento existente. */
  salvarExercicios: "documento:salvar-exercicios",
  /** Salva o mapa mental gerado em um documento existente. */
  salvarMapaMental: "documento:salvar-mapa-mental",
  /** Salva o quiz gerado em um documento existente. */
  salvarQuiz: "documento:salvar-quiz",
  /** Lista os documentos salvos (resumos leves) para o Histórico. */
  listarDocumentos: "documento:listar",
  /** Lista os cadernos agregados (derivados dos documentos) para o Histórico. */
  listarCadernos: "caderno:listar",
  /** Carrega um documento salvo completo (texto + artefatos) pelo id. */
  carregarDocumento: "documento:carregar",
  /** Remove um documento salvo pelo id. */
  removerDocumento: "documento:remover",
  /** Cria e salva uma nova prova (gera a 1ª agenda automática). */
  criarProva: "prova:criar",
  /** Lista as provas como resumos leves (contagem regressiva), ordenadas. */
  listarProvas: "prova:listar",
  /** Carrega uma prova completa (com sessões) pelo id. */
  carregarProva: "prova:carregar",
  /** Edita campos da prova (título/data/vínculo/intervalos) e recomputa a agenda. */
  editarProva: "prova:editar",
  /** Substitui as sessões da prova (edição manual add/remove/mover/concluir). */
  salvarSessoes: "prova:salvar-sessoes",
  /** Regera as sugestões preservando edições manuais (recomputar explícito). */
  regerarAgenda: "prova:regerar-agenda",
  /** Remove uma prova pelo id. */
  removerProva: "prova:remover",
  /** Calcula a dica MECÂNICA do dia de uma prova (sem IA, instantânea). */
  dicaDoDia: "prova:dica-do-dia",
  /** Gera a dica da IA (opcional) para uma prova via Ollama local. */
  dicaDaIa: "prova:dica-da-ia",
  /** Exporta um artefato ou o documento inteiro para Markdown (.md). */
  exportarMarkdown: "export:markdown",
  /** Exporta um artefato ou o documento inteiro para PDF (.pdf). */
  exportarPdf: "export:pdf",
  /**
   * Grupo ANINHADO dos canais de tema (os demais canais são planos). Seguro de
   * aninhar porque nenhum consumidor itera `IPC_CHANNELS` (Object.values/keys/
   * entries); todos referenciam `IPC_CHANNELS.<canal>` individualmente.
   */
  tema: {
    /** Renderer pede o estado de tema atual (preferência + efetivo). */
    obter: "tema:obter",
    /** Renderer define a preferência e recebe o novo estado. */
    definir: "tema:definir",
    /** Main avisa o renderer que o tema efetivo mudou (ex.: SO trocou). */
    alterado: "tema:alterado",
  },
} as const;

/**
 * API tipada exposta ao renderer em `window.api`.
 * Cada método corresponde a um handler registrado no processo main.
 */
export interface AppApi {
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  /**
   * Canal de teste do IPC. Envia uma mensagem ao main e recebe uma resposta.
   * @param mensagem texto enviado ao processo main
   * @returns resposta ("pong: <mensagem>") produzida no main
   */
  ping: (mensagem: string) => Promise<string>;
  /**
   * Abre o seletor de arquivos (`.txt`/`.md`/`.pdf`), importa o escolhido e
   * devolve o texto extraído.
   * @returns o arquivo importado, ou `null` se o usuário cancelou a seleção.
   */
  importarArquivo: () => Promise<ArquivoImportado | null>;
  /**
   * Abre o seletor de pasta, varre recursivamente (até o teto de profundidade),
   * importa em lote os arquivos .txt/.md/.pdf (texto apenas, sem IA), pulando os
   * já importados (mesmo caminhoOrigem), e devolve o resumo do lote.
   * @returns o resultado do lote, ou `null` se o usuário cancelou a seleção.
   */
  importarPasta: () => Promise<ResultadoImportacaoPasta | null>;
  /**
   * Consulta se o Ollama está rodando, quais modelos estão baixados e qual
   * modelo está selecionado. Nunca rejeita: offline vira `disponivel: false`.
   */
  ollamaStatus: () => Promise<OllamaStatus>;
  /**
   * Define o modelo usado nas gerações e devolve o status atualizado.
   * @param modelo nome do modelo (ex.: "llama3.1:8b")
   */
  ollamaSelecionarModelo: (modelo: string) => Promise<OllamaStatus>;
  /**
   * Gera um resumo do `texto` no `modo` escolhido (curto ou longo). Textos
   * grandes são divididos e resumidos em etapas no processo main.
   * @returns o texto do resumo gerado.
   */
  gerarResumo: (texto: string, modo: ModoResumo) => Promise<string>;
  /**
   * Gera flashcards (pares pergunta/resposta) a partir do `texto`. A
   * `quantidade` é ajustada aos limites do MVP (5–100) no processo main. O
   * parsing é tolerante: se o modelo devolver JSON malformado, há uma
   * re-tentativa corretiva antes de falhar.
   * @returns a lista de flashcards gerados.
   */
  gerarFlashcards: (texto: string, quantidade: number) => Promise<Flashcard[]>;
  /**
   * Gera uma lista de exercícios a partir do `texto`, no `modo` escolhido
   * (teórica/prática/mista). A `quantidade` é ajustada aos limites do MVP
   * (5–100) no processo main. O parsing é tolerante: se o modelo devolver JSON
   * malformado, há uma re-tentativa corretiva antes de falhar.
   * @returns a lista de exercícios gerados.
   */
  gerarExercicios: (
    texto: string,
    modo: ModoConteudo,
    quantidade: number,
  ) => Promise<Exercicio[]>;
  /**
   * Gera um mapa mental (árvore tema → ramos → sub-ramos) a partir do `texto`.
   * Parsing tolerante com uma re-tentativa corretiva, como flashcards/exercícios.
   * @returns a árvore raiz do mapa mental gerado (sempre não-nula; falhas são
   *   rejeições do IPC com mensagem amigável).
   */
  gerarMapaMental: (texto: string) => Promise<NoMapaMental>;
  /**
   * Gera um quiz (perguntas de múltipla escolha e/ou abertas) a partir do
   * `texto`, no `modo` escolhido (multipla/aberta/misto). A `quantidade` é
   * ajustada aos limites do MVP (5–100) no processo main. Parsing tolerante com
   * uma re-tentativa corretiva, como flashcards/exercícios.
   * @returns a lista de perguntas do quiz gerado (sempre não-nula; falhas são
   *   rejeições do IPC com mensagem amigável).
   */
  gerarQuiz: (
    texto: string,
    modo: ModoQuiz,
    quantidade: number,
  ) => Promise<PerguntaQuiz[]>;
  /**
   * Avalia por IA um lote de respostas (enunciado + gabarito + resposta do
   * aluno), servindo exercícios e perguntas abertas do quiz. Devolve as
   * avaliações na MESMA ordem das entradas (alinhadas por índice). Respostas
   * vazias não vão ao modelo (viram `"nao_avaliado"`); vereditos inválidos
   * viram `"nao_avaliado"` por item, sem quebrar o lote. Lança uma mensagem
   * amigável se o Ollama estiver indisponível ou a geração falhar.
   * @returns a lista de avaliações, uma por entrada, na ordem recebida.
   */
  avaliarRespostas: (
    entradas: EntradaAvaliacao[],
  ) => Promise<AvaliacaoResposta[]>;
  /**
   * Cria e salva um novo documento (sem artefatos ainda) a partir do arquivo
   * importado, para que os artefatos gerados possam ser anexados e persistidos.
   * O `cadernoNome` é a grafia escolhida/editada na importação; o main deriva
   * o `cadernoId` server-side via `montarCaderno`.
   * @returns o documento salvo criado (com `id` gerado).
   */
  criarDocumento: (
    nome: string,
    formato: FormatoArquivo,
    texto: string,
    cadernoNome: string,
    caminhoOrigem?: string,
  ) => Promise<DocumentoSalvo>;
  /**
   * Salva o resumo gerado no documento `id` e devolve o registro atualizado.
   */
  salvarResumo: (id: string, resumo: Resumo) => Promise<DocumentoSalvo>;
  /**
   * Salva os flashcards gerados no documento `id` e devolve o registro
   * atualizado.
   */
  salvarFlashcards: (
    id: string,
    flashcards: Flashcard[],
  ) => Promise<DocumentoSalvo>;
  /**
   * Salva os exercícios gerados no documento `id` e devolve o registro
   * atualizado.
   */
  salvarExercicios: (
    id: string,
    exercicios: Exercicio[],
  ) => Promise<DocumentoSalvo>;
  /** Salva o mapa mental gerado no documento `id` e devolve o registro. */
  salvarMapaMental: (id: string, mapa: MapaMental) => Promise<DocumentoSalvo>;
  /** Salva o quiz gerado no documento `id` e devolve o registro. */
  salvarQuiz: (id: string, quiz: Quiz) => Promise<DocumentoSalvo>;
  /**
   * Lista os documentos salvos como resumos leves, do mais recente para o mais
   * antigo. Usado pela tela de Histórico. Sem `cadernoId`, devolve todos; com
   * `cadernoId`, só os daquele caderno.
   */
  listarDocumentos: (cadernoId?: string) => Promise<ResumoDocumentoSalvo[]>;
  /**
   * Lista os cadernos agregados (derivados dos documentos), do mais recente
   * para o mais antigo. Usado pelo primeiro nível da tela de Histórico.
   */
  listarCadernos: () => Promise<ResumoCaderno[]>;
  /**
   * Carrega um documento salvo completo (texto + artefatos) pelo `id`, para
   * reabrir resultados anteriores.
   */
  carregarDocumento: (id: string) => Promise<DocumentoSalvo>;
  /** Remove um documento salvo pelo `id`. */
  removerDocumento: (id: string) => Promise<void>;
  /**
   * Cria uma prova com os dados informados e gera a 1ª agenda automática
   * (repetição espaçada, nunca no passado). `intervalos` ausente → default
   * [7,3,1]. Resolve com a prova salva (com sessões e id gerado) ou rejeita
   * com mensagem amigável se os dados forem inválidos.
   */
  criarProva: (dados: {
    titulo: string;
    data: string;
    vinculo: VinculoProva;
    intervalos?: number[];
  }) => Promise<Prova>;
  /**
   * Lista as provas como resumos leves, da mais próxima para a mais distante,
   * com `diasRestantes`/`estado` relativos ao hoje local. Nunca rejeita por
   * disco ausente (diretório vazio → `[]`).
   */
  listarProvas: () => Promise<ResumoProva[]>;
  /**
   * Carrega a prova completa (com sessões) pelo `id`. Rejeita com mensagem
   * amigável se a prova não existir.
   */
  carregarProva: (id: string) => Promise<Prova>;
  /**
   * Edita título/data/vínculo/intervalos de uma prova e RECOMPUTA a agenda
   * (preservando edições manuais) quando data/intervalos mudam. Campos
   * omitidos ficam como estão. `mudancas.vinculo`, quando presente, SUBSTITUI
   * integralmente o vínculo anterior (sem merge raso; `cadernoId` re-derivado
   * no main). Resolve com a prova atualizada ou rejeita com mensagem amigável
   * (prova inexistente ou dados inválidos).
   */
  editarProva: (
    id: string,
    mudancas: Partial<
      Pick<Prova, "titulo" | "data" | "vinculo" | "intervalos">
    >,
  ) => Promise<Prova>;
  /**
   * Substitui a lista de sessões (edição manual) e resolve com a prova
   * atualizada. As sessões recebidas são saneadas/ordenadas e re-id-adas no
   * main. Rejeita com mensagem amigável se a prova não existir.
   */
  salvarSessoes: (id: string, sessoes: SessaoRevisao[]) => Promise<Prova>;
  /**
   * Regera as sugestões preservando manuais; resolve com a prova atualizada ou
   * rejeita com mensagem amigável se a prova não existir.
   */
  regerarAgenda: (id: string) => Promise<Prova>;
  /** Remove a prova pelo `id` (no-op se já não existe). */
  removerProva: (id: string) => Promise<void>;
  /**
   * Dica mecânica do dia (sem IA): o que revisar hoje para a prova. Rejeita
   * com mensagem amigável se a prova não existir.
   */
  dicaDoDia: (id: string) => Promise<DicaDoDia>;
  /**
   * Dica da IA (opcional) para a prova, via Ollama local. Texto livre em
   * português. Resolve com a string ou rejeita com mensagem amigável se o
   * Ollama estiver indisponível (ou a prova não existir).
   */
  dicaDaIa: (id: string) => Promise<string>;
  /**
   * Exporta para Markdown o `alvo` (um artefato específico ou o documento
   * inteiro). Abre um seletor de destino; se o usuário cancelar, resolve com
   * `{ status: "cancelado" }` (sem gravar). Em sucesso resolve com o caminho
   * gravado. 100% local: não usa o Ollama.
   */
  exportarMarkdown: (alvo: AlvoExportacao) => Promise<ResultadoExportacao>;
  /** Igual a `exportarMarkdown`, mas gera um PDF (.pdf) via pdfmake. */
  exportarPdf: (alvo: AlvoExportacao) => Promise<ResultadoExportacao>;
  /**
   * Lê o estado de tema atual (preferência escolhida + tema efetivo resolvido
   * contra o sistema). Usado no boot do renderer para aplicar o tema certo.
   */
  obterTema: () => Promise<EstadoTema>;
  /**
   * Define a preferência de tema e devolve o estado resultante já resolvido.
   * A persistência é best-effort no main: uma falha ao gravar não rejeita.
   */
  definirTema: (preferencia: ThemePreference) => Promise<EstadoTema>;
  /**
   * Assina as mudanças de tema efetivo vindas do main (ex.: o SO alternou
   * entre claro e escuro no modo automático). Devolve um cancelador que
   * remove o ouvinte.
   */
  aoAlterarTema: (ouvinte: (estado: EstadoTema) => void) => () => void;
}
