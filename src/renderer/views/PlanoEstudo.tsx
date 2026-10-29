import { useEffect, useState } from "react";
import type {
  NivelDificuldade,
  OrdinalProva,
  PlanoEstudo as PlanoEstudoModelo,
  PreferenciaCheckpoint,
  Prova,
  TopicoPlano,
} from "@shared/types";
import type { PlanoCalculado } from "@shared/plano";
import { getApi } from "../api";
import { PlanoPrevia } from "./PlanoPrevia";

/**
 * Formulário do questionário do plano de estudo guiado, montado a partir de
 * uma `Prova` já selecionada na Agenda. Nesta fatia ele apenas SALVA/REEDITA
 * as respostas (a prévia da agenda dia-a-dia vem na próxima fatia). Acessível
 * (pt-BR, `<label>`/`<fieldset>`/`<legend>`, `role="alert"`), usando só tokens
 * de tema. Fala com o main APENAS via `getApi()`.
 */

/** Extrai uma frase amigável do erro vindo do IPC (mesmo padrão da Agenda). */
function mensagemDeErro(e: unknown): string {
  if (!(e instanceof Error) || e.message.length === 0) {
    return "Falha ao salvar o plano de estudo.";
  }
  const partes = e.message.split("Error: ");
  const limpo = (partes[partes.length - 1] ?? e.message).trim();
  return limpo.length > 0 ? limpo : "Falha ao salvar o plano de estudo.";
}

/** Rótulos em português de cada ordinal de prova. */
const ROTULOS_ORDINAL: Record<OrdinalProva, string> = {
  primeira: "1ª prova",
  segunda: "2ª prova",
  final: "Prova final",
};

/** Rótulos em português de cada nível de dificuldade. */
const ROTULOS_DIFICULDADE: Record<NivelDificuldade, string> = {
  facil: "Fácil",
  media: "Média",
  dificil: "Difícil",
};

/** Rótulos em português de cada preferência de checkpoint. */
const ROTULOS_CHECKPOINT: Record<PreferenciaCheckpoint, string> = {
  automatico: "Criar listas de exercícios automaticamente",
  lembrete: "Só me lembrar perto da prova",
};

/** Estado editável de um tópico no formulário. */
interface TopicoForm {
  id: string;
  titulo: string;
  novo: boolean;
  dificuldade: NivelDificuldade;
  dataArquivo?: string;
  /** `true` quando o tópico foi digitado à mão (não veio de documento). */
  manual: boolean;
}

export interface PlanoEstudoProps {
  /** Prova à qual o plano pertence (com `plano` quando já montado). */
  prova: Prova;
  /** Chamado com a prova atualizada após salvar com sucesso. */
  aoSalvar: (prova: Prova) => void;
  /** Chamado quando o usuário fecha o formulário sem salvar. */
  aoCancelar: () => void;
}

/** Converte um tópico persistido em um tópico do formulário. */
function paraForm(topico: TopicoPlano): TopicoForm {
  return {
    id: topico.id,
    titulo: topico.titulo,
    novo: topico.novo,
    dificuldade: topico.dificuldade ?? "media",
    ...(topico.dataArquivo !== undefined ? { dataArquivo: topico.dataArquivo } : {}),
    manual: topico.id.startsWith("manual:"),
  };
}

export function PlanoEstudo({
  prova,
  aoSalvar,
  aoCancelar,
}: PlanoEstudoProps): React.JSX.Element {
  const planoAtual = prova.plano;

  const [ordinal, setOrdinal] = useState<OrdinalProva>(
    planoAtual?.ordinal ?? "primeira",
  );
  const [horasPorDia, setHorasPorDia] = useState<number>(
    planoAtual?.horasPorDia ?? 2,
  );
  const [diasPorSemana, setDiasPorSemana] = useState<number>(
    planoAtual?.diasPorSemana ?? 5,
  );
  const [checkpoint, setCheckpoint] = useState<PreferenciaCheckpoint>(
    planoAtual?.checkpoint ?? "lembrete",
  );
  const [topicos, setTopicos] = useState<TopicoForm[]>(
    planoAtual?.topicos.map(paraForm) ?? [],
  );
  const [novoTitulo, setNovoTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<PlanoCalculado | null>(null);
  const [montadoEm, setMontadoEm] = useState<string | null>(
    planoAtual?.atualizadoEm ?? null,
  );
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);

  // Sugere tópicos a partir dos documentos do caderno vinculado (ou de todos,
  // quando a prova é abrangente). Só adiciona os que ainda não estão na lista.
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const cadernoId =
          prova.vinculo.tipo === "caderno" ? prova.vinculo.cadernoId : undefined;
        const docs = await getApi().listarDocumentos(cadernoId);
        if (!ativo) return;
        setTopicos((atuais) => {
          const existentes = new Set(atuais.map((t) => t.id));
          const sugeridos: TopicoForm[] = docs
            .filter((d) => !existentes.has(d.id))
            .map((d) => ({
              id: d.id,
              titulo: d.nome,
              novo: false,
              dificuldade: "media" as NivelDificuldade,
              ...(d.dataArquivo !== undefined ? { dataArquivo: d.dataArquivo } : {}),
              manual: false,
            }));
          return [...atuais, ...sugeridos];
        });
      } catch {
        // Falha ao sugerir não bloqueia o formulário: o aluno digita à mão.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [prova]);

  function atualizarTopico(id: string, mudanca: Partial<TopicoForm>): void {
    setTopicos((atuais) =>
      atuais.map((t) => (t.id === id ? { ...t, ...mudanca } : t)),
    );
  }

  function removerTopico(id: string): void {
    setTopicos((atuais) => atuais.filter((t) => t.id !== id));
  }

  function adicionarTopicoManual(): void {
    const titulo = novoTitulo.trim();
    if (titulo.length === 0) return;
    // Id temporário só para a key do React; o main deriva o id final ao salvar.
    const idTemp = `manual:novo-${Date.now()}`;
    setTopicos((atuais) => [
      ...atuais,
      { id: idTemp, titulo, novo: false, dificuldade: "media", manual: true },
    ]);
    setNovoTitulo("");
  }

  async function salvar(): Promise<void> {
    setErro(null);
    setSalvando(true);
    try {
      const plano: PlanoEstudoModelo = {
        ordinal,
        horasPorDia,
        diasPorSemana,
        topicos: topicos.map((t) => ({
          // Tópicos manuais não enviam o id temporário (o main deriva o final).
          ...(t.manual ? {} : { id: t.id }),
          titulo: t.titulo,
          novo: ordinal === "primeira" ? false : t.novo,
          dificuldade: t.dificuldade,
          ...(t.dataArquivo !== undefined ? { dataArquivo: t.dataArquivo } : {}),
        })) as TopicoPlano[],
        checkpoint,
        atualizadoEm: "", // recarimbado server-side.
      };
      const atualizada = await getApi().salvarPlano(prova.id, plano);
      aoSalvar(atualizada);
      setMontadoEm(atualizada.plano?.atualizadoEm ?? null);
      // Prévia "o que estudar": recalculada sob demanda, nunca persistida.
      setErroPrevia(null);
      try {
        const calculada = await getApi().calcularPlano(prova.id);
        setPrevia(calculada);
      } catch (ePrevia) {
        setPrevia(null);
        setErroPrevia(mensagemDeErro(ePrevia));
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const mostrarColunaNovo = ordinal !== "primeira";

  return (
    <form
      className="plano-form"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <h3>{planoAtual ? "Editar plano de estudo" : "Montar plano de estudo"}</h3>

      {erro !== null && (
        <p className="agenda-erro" role="alert">
          {erro}
        </p>
      )}

      <fieldset className="plano-fieldset">
        <legend>Qual prova é?</legend>
        {(["primeira", "segunda", "final"] as OrdinalProva[]).map((o) => (
          <label key={o} className="plano-radio">
            <input
              type="radio"
              name="plano-ordinal"
              value={o}
              checked={ordinal === o}
              onChange={() => setOrdinal(o)}
            />
            {ROTULOS_ORDINAL[o]}
          </label>
        ))}
      </fieldset>

      <div className="plano-linha">
        <label className="agenda-campo">
          Horas de estudo por dia
          <input
            type="number"
            min={1}
            max={24}
            value={horasPorDia}
            onChange={(e) => setHorasPorDia(Number(e.target.value))}
          />
        </label>
        <label className="agenda-campo">
          Dias de estudo por semana
          <input
            type="number"
            min={1}
            max={7}
            value={diasPorSemana}
            onChange={(e) => setDiasPorSemana(Number(e.target.value))}
          />
        </label>
      </div>

      <fieldset className="plano-fieldset">
        <legend>Assuntos</legend>
        {topicos.length === 0 ? (
          <p className="app-meta">
            Nenhum assunto ainda. Adicione abaixo ou importe documentos no
            caderno vinculado.
          </p>
        ) : (
          <ul className="plano-topicos">
            {topicos.map((t) => (
              <li key={t.id} className="plano-topico">
                <span className="plano-topico-titulo">{t.titulo}</span>
                {mostrarColunaNovo && (
                  <label className="plano-topico-novo">
                    <input
                      type="checkbox"
                      checked={t.novo}
                      onChange={(e) =>
                        atualizarTopico(t.id, { novo: e.target.checked })
                      }
                    />
                    Cai na prova
                  </label>
                )}
                <label className="plano-topico-dificuldade">
                  <span className="plano-rotulo-oculto">
                    Dificuldade de {t.titulo}
                  </span>
                  <select
                    value={t.dificuldade}
                    onChange={(e) =>
                      atualizarTopico(t.id, {
                        dificuldade: e.target.value as NivelDificuldade,
                      })
                    }
                  >
                    {(
                      ["facil", "media", "dificil"] as NivelDificuldade[]
                    ).map((n) => (
                      <option key={n} value={n}>
                        {ROTULOS_DIFICULDADE[n]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="agenda-remover"
                  onClick={() => removerTopico(t.id)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="plano-adicionar">
          <label className="agenda-campo">
            Adicionar assunto
            <input
              type="text"
              value={novoTitulo}
              onChange={(e) => setNovoTitulo(e.target.value)}
              placeholder="Ex.: Limites"
            />
          </label>
          <button type="button" onClick={() => adicionarTopicoManual()}>
            Adicionar
          </button>
        </div>
      </fieldset>

      <fieldset className="plano-fieldset">
        <legend>Checkpoints (pré-provas)</legend>
        {(["lembrete", "automatico"] as PreferenciaCheckpoint[]).map((c) => (
          <label key={c} className="plano-radio">
            <input
              type="radio"
              name="plano-checkpoint"
              value={c}
              checked={checkpoint === c}
              onChange={() => setCheckpoint(c)}
            />
            {ROTULOS_CHECKPOINT[c]}
          </label>
        ))}
      </fieldset>

      <div className="plano-acoes">
        <button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar plano"}
        </button>
        <button type="button" onClick={() => aoCancelar()}>
          {previa !== null ? "Fechar" : "Cancelar"}
        </button>
      </div>

      {erroPrevia !== null && (
        <p className="agenda-erro" role="alert">
          {erroPrevia}
        </p>
      )}

      {previa !== null && (
        <PlanoPrevia
          previa={previa}
          horasPorDia={horasPorDia}
          diasPorSemana={diasPorSemana}
          montadoEm={montadoEm}
        />
      )}
    </form>
  );
}
