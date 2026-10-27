import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import { IPC_CHANNELS, type AppApi } from "@shared/ipc";
import type { EstadoTema } from "@shared/theme";
import type { UpdaterStatus } from "@shared/updater";

/**
 * API tipada exposta ao renderer via `contextBridge`.
 * O renderer nunca acessa `ipcRenderer` diretamente: só os métodos aqui.
 */
const api: AppApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  ping: (mensagem: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.ping, mensagem),
  importarArquivo: () => ipcRenderer.invoke(IPC_CHANNELS.importarArquivo),
  importarPasta: () => ipcRenderer.invoke(IPC_CHANNELS.importarPasta),
  ollamaStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ollamaStatus),
  ollamaSelecionarModelo: (modelo: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ollamaSelecionarModelo, modelo),
  gerarResumo: (texto, modo) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarResumo, texto, modo),
  gerarFlashcards: (texto, quantidade) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarFlashcards, texto, quantidade),
  gerarExercicios: (texto, modo, quantidade) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarExercicios, texto, modo, quantidade),
  gerarMapaMental: (texto) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarMapaMental, texto),
  gerarQuiz: (texto, modo, quantidade) =>
    ipcRenderer.invoke(IPC_CHANNELS.gerarQuiz, texto, modo, quantidade),
  avaliarRespostas: (entradas) =>
    ipcRenderer.invoke(IPC_CHANNELS.avaliarRespostas, entradas),
  criarDocumento: (nome, formato, texto, cadernoNome, caminhoOrigem) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.criarDocumento,
      nome,
      formato,
      texto,
      cadernoNome,
      caminhoOrigem,
    ),
  salvarResumo: (id, resumo) =>
    ipcRenderer.invoke(IPC_CHANNELS.salvarResumo, id, resumo),
  salvarFlashcards: (id, flashcards) =>
    ipcRenderer.invoke(IPC_CHANNELS.salvarFlashcards, id, flashcards),
  salvarExercicios: (id, exercicios) =>
    ipcRenderer.invoke(IPC_CHANNELS.salvarExercicios, id, exercicios),
  salvarMapaMental: (id, mapa) =>
    ipcRenderer.invoke(IPC_CHANNELS.salvarMapaMental, id, mapa),
  salvarQuiz: (id, quiz) =>
    ipcRenderer.invoke(IPC_CHANNELS.salvarQuiz, id, quiz),
  listarDocumentos: (cadernoId) =>
    ipcRenderer.invoke(IPC_CHANNELS.listarDocumentos, cadernoId),
  listarCadernos: () => ipcRenderer.invoke(IPC_CHANNELS.listarCadernos),
  carregarDocumento: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.carregarDocumento, id),
  removerDocumento: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.removerDocumento, id),
  criarProva: (dados) => ipcRenderer.invoke(IPC_CHANNELS.criarProva, dados),
  listarProvas: () => ipcRenderer.invoke(IPC_CHANNELS.listarProvas),
  carregarProva: (id) => ipcRenderer.invoke(IPC_CHANNELS.carregarProva, id),
  editarProva: (id, mudancas) =>
    ipcRenderer.invoke(IPC_CHANNELS.editarProva, id, mudancas),
  salvarSessoes: (id, sessoes) =>
    ipcRenderer.invoke(IPC_CHANNELS.salvarSessoes, id, sessoes),
  regerarAgenda: (id) => ipcRenderer.invoke(IPC_CHANNELS.regerarAgenda, id),
  removerProva: (id) => ipcRenderer.invoke(IPC_CHANNELS.removerProva, id),
  dicaDoDia: (id) => ipcRenderer.invoke(IPC_CHANNELS.dicaDoDia, id),
  dicaDaIa: (id) => ipcRenderer.invoke(IPC_CHANNELS.dicaDaIa, id),
  exportarMarkdown: (alvo) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportarMarkdown, alvo),
  exportarPdf: (alvo) => ipcRenderer.invoke(IPC_CHANNELS.exportarPdf, alvo),
  obterTema: () => ipcRenderer.invoke(IPC_CHANNELS.tema.obter),
  definirTema: (preferencia) =>
    ipcRenderer.invoke(IPC_CHANNELS.tema.definir, preferencia),
  aoAlterarTema: (ouvinte) => {
    // Wrapper que descarta o objeto de evento e repassa só o estado. Guardamos
    // a MESMA referência para o removeListener casar no cancelador.
    const handler = (_evento: IpcRendererEvent, estado: EstadoTema): void =>
      ouvinte(estado);
    ipcRenderer.on(IPC_CHANNELS.tema.alterado, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.tema.alterado, handler);
  },
  verificarAtualizacao: () =>
    ipcRenderer.invoke(IPC_CHANNELS.atualizacao.verificar),
  baixarAtualizacao: () => ipcRenderer.invoke(IPC_CHANNELS.atualizacao.baixar),
  reiniciarParaAtualizar: () =>
    ipcRenderer.invoke(IPC_CHANNELS.atualizacao.reiniciar),
  aoAtualizarStatus: (ouvinte) => {
    // Espelha exatamente `aoAlterarTema`: mesma referência de handler para o
    // removeListener casar no cancelador.
    const handler = (_evento: IpcRendererEvent, estado: UpdaterStatus): void =>
      ouvinte(estado);
    ipcRenderer.on(IPC_CHANNELS.atualizacao.status, handler);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.atualizacao.status, handler);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type PreloadApi = AppApi;
