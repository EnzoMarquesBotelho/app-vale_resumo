/**
 * Persistência local da preferência de tema (claro/escuro/automático).
 *
 * Roda no processo main (acesso a disco). Grava um único arquivo JSON em
 * `app.getPath('userData')/configuracoes/tema.json`, no mesmo espírito de
 * `storage.ts`: diretório base injetável (`baseDir`) para os testes rodarem
 * num diretório temporário sem Electron, `mkdir` recursivo antes de gravar,
 * escrita atômica (`.tmp` + `rename`) e leitura tolerante (qualquer falha ou
 * valor inválido devolve o padrão, nunca lança na leitura).
 */
import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  THEME_PREFERENCE_PADRAO,
  ehThemePreference,
  type ThemePreference,
} from "@shared/theme";

/** Subpasta, dentro do `userData`, onde as configurações ficam salvas. */
const SUBPASTA_CONFIGURACOES = "configuracoes";

/** Nome do arquivo JSON que guarda a preferência de tema. */
const ARQUIVO_TEMA = "tema.json";

/** Versão do schema gravado em disco, para migrações futuras. */
const VERSAO_SCHEMA = 1;

/** Forma do JSON gravado em disco (schema v1). */
interface ArquivoTema {
  versao: 1;
  preferencia: ThemePreference;
}

/**
 * Diretório onde o arquivo de tema é salvo. Default:
 * `app.getPath('userData')/configuracoes`. Nos testes passa-se um `baseDir`
 * temporário para não tocar no diretório real do usuário.
 */
function diretorioConfiguracoes(baseDir?: string): string {
  const base = baseDir ?? app.getPath("userData");
  return join(base, SUBPASTA_CONFIGURACOES);
}

/** Caminho do arquivo JSON de tema. */
function caminhoTema(baseDir?: string): string {
  return join(diretorioConfiguracoes(baseDir), ARQUIVO_TEMA);
}

/**
 * Carrega a preferência de tema do disco. Leitura tolerante: arquivo ausente,
 * JSON corrompido ou valor fora do domínio (validado por `ehThemePreference`)
 * devolvem `THEME_PREFERENCE_PADRAO` em vez de lançar.
 */
export async function carregarPreferenciaTema(
  baseDir?: string,
): Promise<ThemePreference> {
  try {
    const conteudo = await readFile(caminhoTema(baseDir), "utf-8");
    const dados = JSON.parse(conteudo) as unknown;
    if (
      typeof dados === "object" &&
      dados !== null &&
      "preferencia" in dados &&
      ehThemePreference((dados as { preferencia: unknown }).preferencia)
    ) {
      return (dados as { preferencia: ThemePreference }).preferencia;
    }
    return THEME_PREFERENCE_PADRAO;
  } catch {
    return THEME_PREFERENCE_PADRAO;
  }
}

/**
 * Salva a preferência de tema em disco de forma atômica (`.tmp` + `rename`),
 * garantindo o diretório antes de gravar. Grava o schema v1 completo.
 */
export async function salvarPreferenciaTema(
  preferencia: ThemePreference,
  baseDir?: string,
): Promise<void> {
  const dir = diretorioConfiguracoes(baseDir);
  await mkdir(dir, { recursive: true });
  const destino = caminhoTema(baseDir);
  const temporario = `${destino}.tmp`;
  const registro: ArquivoTema = { versao: VERSAO_SCHEMA, preferencia };
  await writeFile(temporario, JSON.stringify(registro, null, 2), "utf-8");
  await rename(temporario, destino);
}
