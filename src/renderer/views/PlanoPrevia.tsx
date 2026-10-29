import type { PlanoCalculado } from "@shared/plano";
import { formatarCarimbo, formatarData, formatarMinutos, fraseAviso } from "./planoFormat";

/**
 * Prévia presentacional do plano de estudo ("O que estudar"): divisão base/novo,
 * aviso honesto e blocos por dia. Extraída de `PlanoEstudo.tsx` para ser
 * reutilizada pelo diagnóstico. Sem estado e sem acesso ao main.
 */

export interface PlanoPreviaProps {
  previa: PlanoCalculado;
  horasPorDia: number;
  diasPorSemana: number;
  /** Carimbo ISO de quando o plano foi montado, se conhecido. */
  montadoEm: string | null;
  /** `true` mostra o selo "Plano ajustado pelo diagnóstico". */
  ajustadoPeloDiagnostico?: boolean;
}

export function PlanoPrevia({
  previa,
  horasPorDia,
  diasPorSemana,
  montadoEm,
  ajustadoPeloDiagnostico = false,
}: PlanoPreviaProps): React.JSX.Element {
  return (
    <section className="plano-previa" aria-label="Prévia do plano de estudo">
      <h4>O que estudar</h4>
      {ajustadoPeloDiagnostico && (
        <p className="app-meta">
          <strong>Plano ajustado pelo diagnóstico</strong>
        </p>
      )}
      {montadoEm !== null && (
        <p className="app-meta">Plano montado em {formatarCarimbo(montadoEm)}.</p>
      )}
      {previa.mistura !== undefined && (
        <p className="app-meta">
          Divisão do tempo: {Math.round(previa.mistura.fracaoBase * 100)}% base,{" "}
          {Math.round(previa.mistura.fracaoNovo * 100)}% conteúdo novo.
        </p>
      )}
      {previa.aviso !== undefined && (
        <p className="agenda-erro" role="alert">
          {fraseAviso(previa.aviso, horasPorDia, diasPorSemana)}
        </p>
      )}
      {previa.dias.length > 0 && (
        <ul className="plano-previa-dias">
          {previa.dias
            .filter((d) => d.blocos.length > 0)
            .map((d) => (
              <li key={d.data} className="plano-previa-dia">
                <strong>{formatarData(d.data)}</strong>
                <ul className="plano-previa-blocos">
                  {d.blocos.map((b, i) => (
                    <li key={`${b.topicoId}-${i}`}>
                      {b.titulo} — {formatarMinutos(b.minutos)}
                      {b.novo ? " (novo)" : " (base)"}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
