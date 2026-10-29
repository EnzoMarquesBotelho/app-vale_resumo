import { useEffect, useState } from "react";
import { INTERVALOS_REVISAO_PADRAO } from "@shared/constants";
import { parsearIntervalos } from "@shared/agenda";
import type {
  DicaDoDia,
  ModoDistribuicao,
  Prova,
  ResumoCaderno,
  ResumoProva,
  SessaoRevisao,
  VinculoProva,
} from "@shared/types";
import { getApi } from "../api";
import { PlanoEstudo } from "./PlanoEstudo";

/**
 * Extrai uma frase amigável do erro vindo do IPC, removendo o prefixo técnico
 * que o Electron adiciona ao encapsular o erro do handler. (Mesmo tratamento
 * das demais telas.)
 */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao carregar a agenda.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao carregar a agenda.";
}

/** Formata uma data pura "YYYY-MM-DD" em algo legível em português. */
function formatarDataPura(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (m === null) return data;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Texto curto da contagem regressiva por estado da prova. */
function rotuloContagem(resumo: ResumoProva): string {
  switch (resumo.estado) {
    case "hoje":
      return "é hoje";
    case "amanha":
      return "é amanhã";
    case "passada":
      return "já passou";
    default:
      return `faltam ${resumo.diasRestantes} dias`;
  }
}

/** Rótulos em português para cada modo de distribuição. */
const ROTULOS_MODO: Record<ModoDistribuicao, string> = {
  rotacao: "Rotação (um caderno por dia)",
  intercalado: "Intercalado (um pouco de cada por dia)",
};

/** Default do campo de intervalos (ex.: "7, 3, 1"). */
const INTERVALOS_PADRAO_TEXTO = INTERVALOS_REVISAO_PADRAO.join(", ");

/** Estado do formulário de criar/editar prova. */
interface FormProva {
  titulo: string;
  data: string;
  tipoVinculo: "caderno" | "abrangente";
  cadernoNome: string;
  modoDistribuicao: ModoDistribuicao;
  intervalos: string;
}

/** Formulário inicial em branco (prova nova). */
function formVazio(): FormProva {
  return {
    titulo: "",
    data: "",
    tipoVinculo: "caderno",
    cadernoNome: "",
    modoDistribuicao: "rotacao",
    intervalos: INTERVALOS_PADRAO_TEXTO,
  };
}

/** Deriva o estado do formulário a partir de uma prova carregada (edição). */
function formDeProva(prova: Prova): FormProva {
  return {
    titulo: prova.titulo,
    data: prova.data,
    tipoVinculo: prova.vinculo.tipo,
    cadernoNome:
      prova.vinculo.tipo === "caderno" ? prova.vinculo.cadernoNome : "",
    modoDistribuicao:
      prova.vinculo.tipo === "abrangente"
        ? prova.vinculo.modoDistribuicao
        : "rotacao",
    intervalos:
      prova.intervalos.length > 0
        ? prova.intervalos.join(", ")
        : INTERVALOS_PADRAO_TEXTO,
  };
}

/** Monta o `VinculoProva` a partir do formulário. */
function vinculoDoForm(form: FormProva): VinculoProva {
  if (form.tipoVinculo === "caderno") {
    return {
      tipo: "caderno",
      cadernoId: "",
      cadernoNome: form.cadernoNome.trim(),
    };
  }
  return { tipo: "abrangente", modoDistribuicao: form.modoDistribuicao };
}

/**
 * Tela de Agenda: domínio autônomo (não depende de documento importado).
 * Lista as provas com contagem regressiva, permite criar/editar provas, editar
 * a agenda de revisão por sessão e ver a dica do dia (mecânica + IA opcional).
 * Chama o main APENAS via `getApi()`.
 */
export function Agenda(): React.JSX.Element {
  const [provas, setProvas] = useState<ResumoProva[]>([]);
  const [cadernos, setCadernos] = useState<ResumoCaderno[]>([]);
  const [provaSelecionada, setProvaSelecionada] = useState<Prova | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Formulário: `null` = oculto; senão criar (sem id) ou editar (com id).
  const [form, setForm] = useState<FormProva | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // `true` quando o formulário do plano de estudo está aberto.
  const [montandoPlano, setMontandoPlano] = useState(false);

  // Dica do dia da prova selecionada.
  const [dica, setDica] = useState<DicaDoDia | null>(null);
  const [dicaIa, setDicaIa] = useState<string | null>(null);
  const [gerandoDica, setGerandoDica] = useState(false);
  const [erroDica, setErroDica] = useState<string | null>(null);

  // Carrega a lista de provas e os cadernos (para o seletor do formulário).
  async function carregar(): Promise<void> {
    setErro(null);
    setCarregando(true);
    try {
      const [listaProvas, listaCadernos] = await Promise.all([
        getApi().listarProvas(),
        getApi().listarCadernos(),
      ]);
      setProvas(listaProvas);
      setCadernos(listaCadernos);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const [listaProvas, listaCadernos] = await Promise.all([
          getApi().listarProvas(),
          getApi().listarCadernos(),
        ]);
        if (ativo) {
          setProvas(listaProvas);
          setCadernos(listaCadernos);
        }
      } catch (e) {
        if (ativo) setErro(mensagemDeErro(e));
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  /** Abre uma prova: carrega os detalhes e a dica mecânica do dia. */
  async function abrirProva(id: string): Promise<void> {
    setErro(null);
    setErroDica(null);
    setDicaIa(null);
    setForm(null);
    setEditandoId(null);
    setMontandoPlano(false);
    try {
      const [prova, dicaDoDia] = await Promise.all([
        getApi().carregarProva(id),
        getApi().dicaDoDia(id),
      ]);
      setProvaSelecionada(prova);
      setDica(dicaDoDia);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  /** Abre o formulário em branco para criar uma prova nova. */
  function novaProva(): void {
    setProvaSelecionada(null);
    setDica(null);
    setDicaIa(null);
    setErroDica(null);
    setEditandoId(null);
    setMontandoPlano(false);
    setForm(formVazio());
  }

  /** Abre o formulário já preenchido com a prova selecionada (edição). */
  function editarSelecionada(): void {
    if (provaSelecionada === null) return;
    setMontandoPlano(false);
    setEditandoId(provaSelecionada.id);
    setForm(formDeProva(provaSelecionada));
  }

  /** Fecha o formulário sem salvar. */
  function cancelarForm(): void {
    setForm(null);
    setEditandoId(null);
  }

  /** Salva o formulário: cria uma prova nova ou edita a existente. */
  async function salvarForm(): Promise<void> {
    if (form === null) return;
    setErro(null);
    setSalvando(true);
    try {
      const vinculo = vinculoDoForm(form);
      const intervalos = parsearIntervalos(form.intervalos);
      if (editandoId !== null) {
        const atualizada = await getApi().editarProva(editandoId, {
          titulo: form.titulo,
          data: form.data,
          vinculo,
          intervalos,
        });
        setProvaSelecionada(atualizada);
        const dicaDoDia = await getApi().dicaDoDia(atualizada.id);
        setDica(dicaDoDia);
      } else {
        const criada = await getApi().criarProva({
          titulo: form.titulo,
          data: form.data,
          vinculo,
          intervalos,
        });
        setProvaSelecionada(criada);
        const dicaDoDia = await getApi().dicaDoDia(criada.id);
        setDica(dicaDoDia);
      }
      setForm(null);
      setEditandoId(null);
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  /** Remove uma prova; limpa a seleção se era a removida e recarrega. */
  async function removerProva(id: string): Promise<void> {
    setErro(null);
    try {
      await getApi().removerProva(id);
      if (provaSelecionada?.id === id) {
        setProvaSelecionada(null);
        setDica(null);
        setDicaIa(null);
      }
      if (editandoId === id) {
        setForm(null);
        setEditandoId(null);
      }
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  /**
   * Persiste uma nova lista de sessões para a prova selecionada e recarrega a
   * prova/dica. O main sanea, reordena, re-id e preserva os flags enviados.
   */
  async function salvarSessoes(sessoes: SessaoRevisao[]): Promise<void> {
    if (provaSelecionada === null) return;
    setErro(null);
    try {
      const atualizada = await getApi().salvarSessoes(
        provaSelecionada.id,
        sessoes,
      );
      setProvaSelecionada(atualizada);
      const dicaDoDia = await getApi().dicaDoDia(atualizada.id);
      setDica(dicaDoDia);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  /** Marca/desmarca uma sessão como concluída (não mexe no `manual`). */
  function alternarConcluida(sessao: SessaoRevisao): void {
    if (provaSelecionada === null) return;
    const novas = provaSelecionada.sessoes.map((s) =>
      s.id === sessao.id ? { ...s, concluida: !(s.concluida ?? false) } : s,
    );
    void salvarSessoes(novas);
  }

  /** Move uma sessão para outra data (seta `manual: true`). */
  function moverSessao(sessao: SessaoRevisao, novaData: string): void {
    if (provaSelecionada === null || novaData === "") return;
    const novas = provaSelecionada.sessoes.map((s) =>
      s.id === sessao.id ? { ...s, data: novaData, manual: true } : s,
    );
    void salvarSessoes(novas);
  }

  /** Remove uma sessão (não recarimba o `manual` das demais). */
  function removerSessao(sessao: SessaoRevisao): void {
    if (provaSelecionada === null) return;
    const novas = provaSelecionada.sessoes.filter((s) => s.id !== sessao.id);
    void salvarSessoes(novas);
  }

  /** Adiciona uma sessão manual na data da prova (o usuário move depois). */
  function adicionarSessao(): void {
    if (provaSelecionada === null) return;
    const nova: SessaoRevisao = {
      id: `nova-${Date.now()}`,
      data: provaSelecionada.data,
      diasAntes: 0,
      manual: true,
    };
    void salvarSessoes([...provaSelecionada.sessoes, nova]);
  }

  /** Regera as sugestões preservando as sessões manuais. */
  async function regerar(): Promise<void> {
    if (provaSelecionada === null) return;
    setErro(null);
    try {
      const atualizada = await getApi().regerarAgenda(provaSelecionada.id);
      setProvaSelecionada(atualizada);
      const dicaDoDia = await getApi().dicaDoDia(atualizada.id);
      setDica(dicaDoDia);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  /** Gera a dica da IA (opcional, nunca bloqueia a tela). */
  async function gerarDicaIa(): Promise<void> {
    if (provaSelecionada === null) return;
    setErroDica(null);
    setDicaIa(null);
    setGerandoDica(true);
    try {
      const texto = await getApi().dicaDaIa(provaSelecionada.id);
      setDicaIa(texto);
    } catch (e) {
      setErroDica(mensagemDeErro(e));
    } finally {
      setGerandoDica(false);
    }
  }

  const sessoesOrdenadas =
    provaSelecionada === null
      ? []
      : [...provaSelecionada.sessoes].sort((a, b) =>
          a.data < b.data ? -1 : a.data > b.data ? 1 : 0,
        );

  return (
    <section className="agenda">
      <header className="agenda-header">
        <h2>Agenda</h2>
        <div className="agenda-header-acoes">
          <button type="button" onClick={() => void novaProva()}>
            Nova prova
          </button>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
          >
            {carregando ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {erro !== null && (
        <p className="agenda-erro" role="alert">
          {erro}
        </p>
      )}

      {/* Região 1 — Lista de provas (contagem regressiva). */}
      {provas.length === 0 ? (
        <p className="app-meta">
          Nenhuma prova cadastrada ainda. Clique em “Nova prova” para começar a
          montar sua agenda de revisão.
        </p>
      ) : (
        <ul className="agenda-lista">
          {provas.map((prova) => (
            <li
              key={prova.id}
              className={`agenda-item ${prova.estado} ${
                prova.id === provaSelecionada?.id ? "ativo" : ""
              }`}
            >
              <div className="agenda-info">
                <span className="agenda-titulo">{prova.titulo}</span>
                <span className="app-meta">
                  {formatarDataPura(prova.data)} ·{" "}
                  {prova.tipoVinculo === "caderno"
                    ? (prova.cadernoNome ?? "Caderno")
                    : "Abrangente"}
                </span>
                <span className={`agenda-badge ${prova.estado}`}>
                  {rotuloContagem(prova)}
                </span>
              </div>
              <div className="agenda-acoes">
                <button type="button" onClick={() => void abrirProva(prova.id)}>
                  Abrir
                </button>
                <button
                  type="button"
                  className="agenda-remover"
                  onClick={() => void removerProva(prova.id)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Região 2 — Formulário criar/editar prova. */}
      {form !== null && (
        <form
          className="agenda-form"
          onSubmit={(e) => {
            e.preventDefault();
            void salvarForm();
          }}
        >
          <h3>{editandoId !== null ? "Editar prova" : "Nova prova"}</h3>

          <label className="agenda-campo">
            Título
            <input
              type="text"
              value={form.titulo}
              onChange={(e) =>
                setForm({ ...form, titulo: e.target.value })
              }
              placeholder="Ex.: P1 de Cálculo"
            />
          </label>

          <label className="agenda-campo">
            Data da prova
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </label>

          <fieldset className="agenda-vinculo">
            <legend>Vínculo</legend>
            <label className="agenda-radio">
              <input
                type="radio"
                name="tipoVinculo"
                checked={form.tipoVinculo === "caderno"}
                onChange={() => setForm({ ...form, tipoVinculo: "caderno" })}
              />
              Ligada a um caderno
            </label>
            {form.tipoVinculo === "caderno" && (
              <label className="agenda-campo">
                Caderno
                <select
                  value={form.cadernoNome}
                  onChange={(e) =>
                    setForm({ ...form, cadernoNome: e.target.value })
                  }
                >
                  <option value="">Selecione um caderno…</option>
                  {cadernos.map((c) => (
                    <option key={c.cadernoId} value={c.cadernoNome}>
                      {c.cadernoNome}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="agenda-radio">
              <input
                type="radio"
                name="tipoVinculo"
                checked={form.tipoVinculo === "abrangente"}
                onChange={() =>
                  setForm({ ...form, tipoVinculo: "abrangente" })
                }
              />
              Prova abrangente (ENEM/ENADE)
            </label>
            {form.tipoVinculo === "abrangente" && (
              <div className="agenda-modos">
                {(Object.keys(ROTULOS_MODO) as ModoDistribuicao[]).map(
                  (modo) => (
                    <label key={modo} className="agenda-radio">
                      <input
                        type="radio"
                        name="modoDistribuicao"
                        checked={form.modoDistribuicao === modo}
                        onChange={() =>
                          setForm({ ...form, modoDistribuicao: modo })
                        }
                      />
                      {ROTULOS_MODO[modo]}
                    </label>
                  ),
                )}
              </div>
            )}
          </fieldset>

          <label className="agenda-campo">
            Intervalos (dias antes)
            <input
              type="text"
              value={form.intervalos}
              onChange={(e) =>
                setForm({ ...form, intervalos: e.target.value })
              }
              placeholder={INTERVALOS_PADRAO_TEXTO}
            />
          </label>

          <div className="agenda-form-acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => cancelarForm()}
              disabled={salvando}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Regiões 3 e 4 — Agenda editável e dica do dia da prova selecionada. */}
      {provaSelecionada !== null && (
        <div className="agenda-detalhe">
          <header className="agenda-detalhe-header">
            <h3>{provaSelecionada.titulo}</h3>
            <div className="agenda-detalhe-acoes">
              <button type="button" onClick={() => editarSelecionada()}>
                Editar prova
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setEditandoId(null);
                  setMontandoPlano(true);
                }}
              >
                {provaSelecionada.plano
                  ? "Editar plano"
                  : "Montar plano de estudo"}
              </button>
            </div>
          </header>

          {montandoPlano && (
            <PlanoEstudo
              prova={provaSelecionada}
              aoSalvar={(atualizada) => {
                // Mantém o formulário aberto para exibir a prévia "o que
                // estudar" logo após salvar; o usuário fecha pelo "Fechar".
                setProvaSelecionada(atualizada);
              }}
              aoCancelar={() => setMontandoPlano(false)}
            />
          )}

          {/* Região 4 — Dica do dia. */}
          {dica !== null && (
            <div className="agenda-dica">
              <p className="agenda-dica-mecanica">{dica.mensagem}</p>
              <button
                type="button"
                onClick={() => void gerarDicaIa()}
                disabled={gerandoDica}
              >
                {gerandoDica ? "Gerando…" : "Dica da IA"}
              </button>
              {erroDica !== null && (
                <p className="agenda-erro" role="alert">
                  {erroDica}
                </p>
              )}
              {dicaIa !== null && (
                <p className="agenda-dica-ia">{dicaIa}</p>
              )}
            </div>
          )}

          {/* Região 3 — Agenda editável. */}
          <div className="agenda-sessoes">
            <div className="agenda-sessoes-header">
              <h4>Agenda de revisão</h4>
              <div className="agenda-sessoes-acoes">
                <button type="button" onClick={() => adicionarSessao()}>
                  Adicionar sessão
                </button>
                <button type="button" onClick={() => void regerar()}>
                  Regerar sugestões
                </button>
              </div>
            </div>

            {sessoesOrdenadas.length === 0 ? (
              <p className="app-meta">
                Nenhuma sessão de revisão. Use “Regerar sugestões” ou adicione
                uma sessão manualmente.
              </p>
            ) : (
              <ul className="agenda-sessoes-lista">
                {sessoesOrdenadas.map((sessao) => (
                  <li
                    key={sessao.id}
                    className={`agenda-sessao ${
                      sessao.concluida === true ? "concluida" : ""
                    }`}
                  >
                    <label className="agenda-sessao-check">
                      <input
                        type="checkbox"
                        checked={sessao.concluida === true}
                        onChange={() => alternarConcluida(sessao)}
                      />
                      <span className="app-meta">
                        {sessao.diasAntes} dia(s) antes
                        {sessao.manual ? " · manual" : ""}
                      </span>
                    </label>
                    <input
                      type="date"
                      value={sessao.data}
                      onChange={(e) => moverSessao(sessao, e.target.value)}
                    />
                    <button
                      type="button"
                      className="agenda-remover"
                      onClick={() => removerSessao(sessao)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
