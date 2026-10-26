import { useEffect, useState } from "react";
import {
  THEME_PREFERENCE_PADRAO,
  type EstadoTema,
  type ThemePreference,
} from "@shared/theme";
import { getApi } from "./api";
import { aplicarTema } from "./theme";

/** O que o hook de tema expõe para a UI. */
export interface UsoTema {
  /** Preferência atual (fallback no padrão enquanto o estado não chegou). */
  preferencia: ThemePreference;
  /** Define a preferência, persiste no main e aplica o novo tema efetivo. */
  definir: (preferencia: ThemePreference) => Promise<void>;
}

/**
 * Hook de tema do renderer. No mount, lê o estado via `getApi().obterTema()`,
 * aplica o tema efetivo e assina as mudanças vindas do main (ex.: o SO alternou
 * claro/escuro no modo automático), cancelando a assinatura no cleanup. Toda a
 * conversa com o main passa por `getApi()` — nunca `window.api?.`.
 */
export function useTema(): UsoTema {
  const [estado, setEstado] = useState<EstadoTema | null>(null);

  useEffect(() => {
    let ativo = true;

    void getApi()
      .obterTema()
      .then((inicial) => {
        if (!ativo) return;
        setEstado(inicial);
        aplicarTema(inicial.efetivo);
      });

    const cancelar = getApi().aoAlterarTema((novo) => {
      setEstado(novo);
      aplicarTema(novo.efetivo);
    });

    return () => {
      ativo = false;
      cancelar();
    };
  }, []);

  async function definir(preferencia: ThemePreference): Promise<void> {
    const novo = await getApi().definirTema(preferencia);
    setEstado(novo);
    aplicarTema(novo.efetivo);
  }

  return {
    preferencia: estado?.preferencia ?? THEME_PREFERENCE_PADRAO,
    definir,
  };
}
