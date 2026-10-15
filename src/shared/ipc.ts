/**
 * Contrato de IPC tipado compartilhado entre main e renderer.
 *
 * Centraliza os nomes dos canais e a assinatura da API exposta ao renderer
 * via `contextBridge`. Main e renderer importam daqui para não divergirem.
 */

import type {
  ArquivoImportado,
  Exercicio,
  Flashcard,
  ModoConteudo,
  ModoResumo,
  OllamaStatus,
} from "./types";

/** Nomes dos canais de IPC. */
export const IPC_CHANNELS = {
  /** Canal de teste: renderer→main→renderer. */
  ping: "app:ping",
  /** Abre um seletor de arquivo e importa o escolhido (texto extraído). */
  importarArquivo: "arquivo:importar",
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
}
