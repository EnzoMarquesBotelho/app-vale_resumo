import { useEffect, useState } from "react";
import type { UpdaterStatus } from "@shared/updater";
import { getApi } from "./api";

/** O que o hook do updater expõe para a UI. */
export interface UsoUpdater {
  /** Último estado conhecido (last-write-wins). */
  status: UpdaterStatus;
  /** Dispara a verificação manual. */
  verificar: () => void;
  /** Inicia o download da versão disponível. */
  baixar: () => void;
  /** Reinicia e instala a atualização baixada. */
  reiniciar: () => void;
}

/**
 * Hook do updater do renderer (molde: `useTema.ts`). No mount assina o push de
 * estado do main e dispara uma verificação para popular o estado inicial
 * (resolve `dev-unavailable` em dev; `checking` no empacotado), cancelando a
 * assinatura no cleanup. A ordenação entre push e retorno é last-write-wins
 * (§4.1): sem guarda monotônica. Toda conversa com o main passa por `getApi()`
 * — nunca `window.api?.`.
 */
export function useUpdater(): UsoUpdater {
  const [status, setStatus] = useState<UpdaterStatus>({ tipo: "idle" });

  useEffect(() => {
    let ativo = true;

    const cancelar = getApi().aoAtualizarStatus((novo) => {
      if (ativo) setStatus(novo);
    });

    void getApi()
      .verificarAtualizacao()
      .then((inicial) => {
        if (ativo) setStatus(inicial);
      });

    return () => {
      ativo = false;
      cancelar();
    };
  }, []);

  function verificar(): void {
    void getApi()
      .verificarAtualizacao()
      .then((novo) => setStatus(novo));
  }

  function baixar(): void {
    void getApi()
      .baixarAtualizacao()
      .then((novo) => setStatus(novo));
  }

  function reiniciar(): void {
    void getApi().reiniciarParaAtualizar();
  }

  return { status, verificar, baixar, reiniciar };
}
