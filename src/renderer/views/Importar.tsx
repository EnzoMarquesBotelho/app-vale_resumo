import { useEffect, useState } from "react";
import { avisoSemTextoExtraivel } from "@shared/constants";
import type { ArquivoImportado, ResumoCaderno } from "@shared/types";
import { getApi } from "../api";

/**
 * Extrai uma frase amigável do erro vindo do IPC. O Electron encapsula o erro
 * do handler com um prefixo técnico (ex.: "Error occurred in handler for
 * 'arquivo:importar': Error: ..."); aqui removemos esse ruído e mostramos
 * apenas a mensagem pronta para o usuário.
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao importar o arquivo.";
  }
  // Pega o texto após o último "Error: " adicionado pelo encapsulamento do IPC.
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao importar o arquivo.";
}

/**
 * Tela de importação: o usuário escolhe um arquivo (.txt/.md/.pdf) e vê o
 * texto extraído. PDFs sem texto extraível exibem o aviso correspondente.
 */
/** Props da tela de importação. */
interface ImportarProps {
  /**
   * Arquivo atualmente ativo (ex.: reaberto do histórico), controlado pelo
   * App. Quando informado, a tela exibe esse arquivo; `null` limpa a exibição.
   */
  arquivo: ArquivoImportado | null;
  /** Notifica o componente pai sobre o arquivo importado (ou `null`). */
  onImportado?: (arquivo: ArquivoImportado | null) => void;
  /**
   * Chamado quando o usuário confirma o caderno escolhido para o arquivo
   * atual. A PRESENÇA desta prop é o seletor de modo: definido = fluxo de
   * importação (campo editável + botão "Confirmar caderno"); ausente
   * (`undefined`) = reabertura (rótulo somente-leitura, sem criar documento).
   */
  onConfirmarCaderno?: (arquivo: ArquivoImportado, cadernoNome: string) => void;
}

export function Importar({
  arquivo,
  onImportado,
  onConfirmarCaderno,
}: ImportarProps): React.JSX.Element {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Grafia do caderno escolhida/editada pelo usuário no fluxo de importação.
  const [cadernoEscolhido, setCadernoEscolhido] = useState(
    arquivo?.cadernoNomeSugerido ?? "",
  );
  // Chave do arquivo ativo, para detectar troca de arquivo durante o render e
  // re-preencher o campo com a sugestão sem usar um efeito (padrão recomendado
  // pelo React para resetar estado quando uma prop muda).
  const [chaveArquivo, setChaveArquivo] = useState(
    `${arquivo?.caminhoOrigem ?? ""}|${arquivo?.cadernoNomeSugerido ?? ""}`,
  );
  // Cadernos existentes para o autocompletar; recarregados ao confirmar.
  const [cadernos, setCadernos] = useState<ResumoCaderno[]>([]);

  // Modo importação: só confirmamos caderno quando o App fornece o callback.
  const ehFluxoImportacao = onConfirmarCaderno !== undefined;
  const temTextoExtraivel =
    arquivo !== null && !arquivo.semTextoExtraivel;

  // Quando um novo arquivo entra, pré-preenche o campo com a sugestão. A edição
  // manual do usuário persiste enquanto o mesmo arquivo estiver ativo. Ajustar
  // estado durante o render (em vez de um efeito) evita a cascata de renders.
  const chaveAtual = `${arquivo?.caminhoOrigem ?? ""}|${
    arquivo?.cadernoNomeSugerido ?? ""
  }`;
  if (chaveAtual !== chaveArquivo) {
    setChaveArquivo(chaveAtual);
    setCadernoEscolhido(arquivo?.cadernoNomeSugerido ?? "");
  }

  // Carrega a lista de cadernos para o datalist ao montar (apenas no fluxo de
  // importação; a reabertura não oferece edição).
  useEffect(() => {
    if (!ehFluxoImportacao) return;
    let ativo = true;
    void (async () => {
      try {
        const lista = await getApi().listarCadernos();
        if (ativo) setCadernos(lista);
      } catch {
        // Autocompletar é auxiliar: falha ao listar não bloqueia a importação.
        if (ativo) setCadernos([]);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [ehFluxoImportacao]);

  async function escolherArquivo(): Promise<void> {
    setErro(null);
    setCarregando(true);
    try {
      const resultado = await getApi().importarArquivo();
      // `null` = usuário cancelou a seleção: mantém o estado anterior.
      if (resultado) {
        onImportado?.(resultado);
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
      onImportado?.(null);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarCaderno(): Promise<void> {
    if (arquivo === null || onConfirmarCaderno === undefined) return;
    onConfirmarCaderno(arquivo, cadernoEscolhido);
    // Recarrega o datalist: um caderno novo criado agora deve aparecer como
    // opção no próximo arquivo da mesma sessão.
    try {
      const lista = await getApi().listarCadernos();
      setCadernos(lista);
    } catch {
      // Mantém a lista anterior se o recarregamento falhar.
    }
  }

  return (
    <section className="importar">
      <header className="importar-header">
        <h2>Importar arquivo</h2>
        <p className="app-meta">Formatos suportados: .txt, .md, .pdf</p>
        <button
          type="button"
          onClick={() => void escolherArquivo()}
          disabled={carregando}
        >
          {carregando ? "Importando…" : "Escolher arquivo"}
        </button>
      </header>

      {erro !== null && (
        <p className="importar-erro" role="alert">
          {erro}
        </p>
      )}

      {arquivo !== null && (
        <article className="importar-resultado">
          <h3>{arquivo.nome}</h3>
          {arquivo.semTextoExtraivel ? (
            <p className="importar-aviso" role="status">
              {avisoSemTextoExtraivel}
            </p>
          ) : (
            <pre className="importar-texto">{arquivo.texto}</pre>
          )}

          {temTextoExtraivel && ehFluxoImportacao && (
            <div className="importar-caderno">
              <label className="importar-caderno-rotulo" htmlFor="caderno-nome">
                Caderno
              </label>
              <input
                id="caderno-nome"
                className="importar-caderno-input"
                type="text"
                list="cadernos-existentes"
                value={cadernoEscolhido}
                placeholder="Geral"
                onChange={(e) => setCadernoEscolhido(e.target.value)}
              />
              <datalist id="cadernos-existentes">
                {cadernos.map((caderno) => (
                  <option key={caderno.cadernoId} value={caderno.cadernoNome} />
                ))}
              </datalist>
              <button type="button" onClick={() => void confirmarCaderno()}>
                Confirmar caderno
              </button>
            </div>
          )}

          {temTextoExtraivel &&
            !ehFluxoImportacao &&
            arquivo.cadernoNomeSugerido !== undefined && (
              <p className="importar-caderno-rotulo" role="status">
                Caderno: <strong>{arquivo.cadernoNomeSugerido}</strong>
              </p>
            )}
        </article>
      )}
    </section>
  );
}
