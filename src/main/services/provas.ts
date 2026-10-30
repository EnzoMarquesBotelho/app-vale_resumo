/**
 * Serviço de persistência local das PROVAS: salva e carrega cada prova (com a
 * sua agenda de revisão embutida) como um arquivo JSON em disco.
 *
 * Roda no processo main (acesso a disco). Análogo e INDEPENDENTE de
 * `storage.ts` (documentos e provas são domínios distintos): cada prova vira
 * um arquivo `<id>.json` dentro de `app.getPath('userData')/provas`. Tudo
 * local, inspecionável e simples; os resultados reabrem após fechar/reabrir.
 *
 * O diretório base é injetável (`baseDir`) e o "hoje" (data-calendário local)
 * é injetável (`hoje`) para os testes rodarem num diretório temporário e com
 * datas fixas, sem depender do Electron nem do relógio real. Em produção, o
 * default de `baseDir` vem de `app.getPath('userData')` e o de `hoje` de
 * `hojeLocal()`.
 */
import { app } from "electron";
import { readdir, readFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CHECKPOINT_DIAS_ANTES,
  CHECKPOINT_MINIMO_EXERCICIOS,
  INTERVALOS_REVISAO_PADRAO,
} from "@shared/constants";
import { montarCaderno } from "@shared/notebooks";
import {
  diasRestantes,
  diferencaDias,
  estadoProva,
  gerarAgenda,
  normalizarIntervalos,
  recomputarAgenda,
} from "@shared/agenda";
import { ehIsoPlausivel } from "@shared/cronologia";
import { assinaturaPlano } from "@shared/diagnostico";
import { slugTopico } from "@shared/slug";
import type {
  AlternativaQuiz,
  CheckpointGerado,
  CheckpointsPlano,
  DiagnosticoPlano,
  Exercicio,
  ModoConteudo,
  MotivoCheckpointIgnorado,
  TopicoCheckpoint,
  TopicoCheckpointIgnorado,
  MotivoTopicoIgnorado,
  NivelDificuldade,
  PerguntaDiagnostico,
  TopicoIgnorado,
  PlanoEstudo,
  PreferenciaCheckpoint,
  Prova,
  ResumoProva,
  SessaoRevisao,
  TipoProva,
  TopicoPlano,
  VinculoProva,
} from "@shared/types";
import {
  dataLocalDe,
  dataValida,
  validarDataProva,
} from "@shared/dataProva";
import {
  aplicarOrdinalAoPlano,
  ehTipoProva,
  ordinalDeTipo,
} from "@shared/tipoProva";

/** Nome da subpasta, dentro do `userData`, onde as provas ficam salvas. */
const SUBPASTA_PROVAS = "provas";

/** Comprimento máximo do título de uma prova (truncado, não é erro). */
const TITULO_MAX = 200;

/**
 * `hojeLocal()`: ÚNICO leitor do relógio real nesta fatia. Compõe a data-
 * calendário local "YYYY-MM-DD" a partir de `getFullYear`/`getMonth()+1`/
 * `getDate` com zero-padding — NÃO usa `toLocaleDateString` (que depende de
 * dados de locale ICU que podem ser enxutos no app empacotado). Define a
 * meia-noite local de forma determinística. Nunca é chamado pelas funções
 * puras (elas recebem `hoje` como parâmetro); os handlers o resolvem uma vez.
 */
export function hojeLocal(): string {
  return dataLocalDe(new Date());
}

/** Erro lançado quando uma prova solicitada não existe em disco. */
export class ProvaNaoEncontradaError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "PROVA_NAO_ENCONTRADA" as const;
  constructor(public readonly id: string) {
    super("Prova não encontrada. Ela pode ter sido removida.");
    this.name = "ProvaNaoEncontradaError";
  }
}

/** Erro lançado quando os dados informados para uma prova são inválidos. */
export class DadosProvaInvalidosError extends Error {
  /** Código estável para a UI reconhecer o caso sem depender do texto. */
  readonly code = "DADOS_PROVA_INVALIDOS" as const;
  constructor(message: string) {
    super(message);
    this.name = "DadosProvaInvalidosError";
  }
}

/** Retorna o diretório onde as provas são salvas. */
function diretorioProvas(baseDir?: string): string {
  const base = baseDir ?? app.getPath("userData");
  return join(base, SUBPASTA_PROVAS);
}

/** Caminho do arquivo JSON de uma prova pelo seu id. */
function caminhoProva(id: string, baseDir?: string): string {
  return join(diretorioProvas(baseDir), `${id}.json`);
}

/** Garante que o diretório de provas existe antes de ler/escrever. */
async function garantirDiretorio(baseDir?: string): Promise<string> {
  const dir = diretorioProvas(baseDir);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Grava a prova crua em disco como JSON, de forma atômica. Escreve em
 * `<id>.json.tmp` e renomeia para `<id>.json` (rename é atômico no mesmo
 * volume), evitando um arquivo meio-escrito se o processo morrer no meio.
 */
async function escreverProva(prova: Prova, baseDir?: string): Promise<void> {
  await garantirDiretorio(baseDir);
  const destino = caminhoProva(prova.id, baseDir);
  const temporario = `${destino}.tmp`;
  await writeFile(temporario, JSON.stringify(prova, null, 2), "utf-8");
  await rename(temporario, destino);
}

/**
 * Valida/sanea um título: `trim` 1–200 (vazio → erro; >200 → trunca em 200).
 */
function sanearTitulo(titulo: unknown): string {
  if (typeof titulo !== "string" || titulo.trim().length === 0) {
    throw new DadosProvaInvalidosError("Informe um título para a prova.");
  }
  return titulo.trim().slice(0, TITULO_MAX);
}

/**
 * Valida/normaliza um vínculo recebido do renderer. SUBSTITUI integralmente o
 * vínculo anterior (sem merge raso na união discriminada): para `caderno`,
 * `cadernoId` é RE-DERIVADO server-side via `montarCaderno` a partir do
 * `cadernoNome`; para `abrangente`, exige `modoDistribuicao` válido e nunca
 * deixa `cadernoId` órfão. Entradas inconsistentes com o `tipo` → erro.
 */
function sanearVinculo(vinculo: unknown): VinculoProva {
  if (typeof vinculo !== "object" || vinculo === null) {
    throw new DadosProvaInvalidosError("Informe um vínculo válido para a prova.");
  }
  const v = vinculo as { tipo?: unknown } & Record<string, unknown>;
  if (v.tipo === "caderno") {
    const nomeBruto = typeof v.cadernoNome === "string" ? v.cadernoNome : "";
    if (nomeBruto.trim().length === 0) {
      throw new DadosProvaInvalidosError(
        "Informe o caderno ao qual a prova está ligada.",
      );
    }
    const { cadernoId, cadernoNome } = montarCaderno(nomeBruto);
    return { tipo: "caderno", cadernoId, cadernoNome };
  }
  if (v.tipo === "abrangente") {
    if (v.modoDistribuicao !== "rotacao" && v.modoDistribuicao !== "intercalado") {
      throw new DadosProvaInvalidosError(
        "Informe o modo de distribuição (rotação ou intercalado).",
      );
    }
    return { tipo: "abrangente", modoDistribuicao: v.modoDistribuicao };
  }
  throw new DadosProvaInvalidosError("Informe um vínculo válido para a prova.");
}

/** Dados para criar uma nova prova (como chegam do renderer). */
export interface NovaProva {
  /** Título da prova. */
  titulo: string;
  /** Data da prova "YYYY-MM-DD". */
  data: string;
  /** Vínculo: caderno único ou abrangente com modo de distribuição. */
  vinculo: VinculoProva;
  /** Intervalos de repetição espaçada; ausente → default [7,3,1]. */
  intervalos?: number[];
  /** Tipo de prova (opcional; define nome automático e ordinal do plano). */
  tipo?: TipoProva | null;
}

/** Valida o tipo recebido: undefined/null = omitido; inválido = erro. */
function sanearTipo(tipo: unknown): TipoProva | undefined {
  if (tipo === undefined || tipo === null) return undefined;
  if (!ehTipoProva(tipo)) {
    throw new DadosProvaInvalidosError("Escolha um tipo de prova válido.");
  }
  return tipo;
}

/**
 * Cria e salva uma nova prova e devolve o registro criado.
 *
 * Gera `id` (`randomUUID`), valida/sanea os dados (§8.2), deriva o vínculo
 * (re-derivando `cadernoId` via `montarCaderno`), sanea os intervalos
 * (default `INTERVALOS_REVISAO_PADRAO` quando vazios), gera a 1ª agenda via
 * `gerarAgenda` com o `hoje` injetado e carimba `criadoEm`/`atualizadoEm`.
 *
 * @throws {DadosProvaInvalidosError} se título/data/vínculo forem inválidos.
 */
export async function criarProva(
  dados: NovaProva,
  hoje: string,
  baseDir?: string,
): Promise<Prova> {
  const titulo = sanearTitulo(dados.titulo);
  if (!dataValida(dados.data)) {
    throw new DadosProvaInvalidosError("Informe uma data válida (ano-mês-dia).");
  }
  const resultadoData = validarDataProva({ data: dados.data, hoje });
  if (!resultadoData.ok) {
    throw new DadosProvaInvalidosError(resultadoData.mensagem);
  }
  const vinculo = sanearVinculo(dados.vinculo);
  const tipo = sanearTipo(dados.tipo);
  const intervalos = normalizarIntervalos(
    Array.isArray(dados.intervalos)
      ? dados.intervalos
      : [...INTERVALOS_REVISAO_PADRAO],
  );
  const agora = new Date().toISOString();
  const prova: Prova = {
    id: randomUUID(),
    titulo,
    data: dados.data,
    vinculo,
    intervalos,
    sessoes: gerarAgenda({ dataProva: dados.data, intervalos, hoje }),
    criadoEm: agora,
    atualizadoEm: agora,
    ...(tipo !== undefined ? { tipo } : {}),
  };
  await escreverProva(prova, baseDir);
  return prova;
}

/**
 * Carrega uma prova completa (com sessões) pelo id.
 * @throws {ProvaNaoEncontradaError} se o arquivo não existir.
 */
export async function carregarProva(
  id: string,
  baseDir?: string,
): Promise<Prova> {
  try {
    const conteudo = await readFile(caminhoProva(id, baseDir), "utf-8");
    const prova = JSON.parse(conteudo) as Prova;
    // Bloco aditivo da fatia 3: só toca se a chave existir (prova antiga volta
    // idêntica). Bloco corrompido é descartado, nunca derruba a leitura.
    if (typeof prova === "object" && prova !== null && "diagnostico" in prova) {
      const saneado = sanearDiagnosticoPersistido(prova.diagnostico);
      if (saneado === undefined) {
        delete prova.diagnostico;
      } else {
        prova.diagnostico = saneado;
      }
    }
    // Campo aditivo `tipo`: valor inválido é descartado em silêncio.
    if (typeof prova === "object" && prova !== null && "tipo" in prova) {
      if (!ehTipoProva(prova.tipo)) delete prova.tipo;
    }
    // Bloco aditivo da fatia 4: mesmo tratamento tolerante do diagnóstico.
    if (typeof prova === "object" && prova !== null && "checkpoints" in prova) {
      const saneado = sanearCheckpointsPersistido(prova.checkpoints);
      if (saneado === undefined) {
        delete prova.checkpoints;
      } else {
        prova.checkpoints = saneado;
      }
    }
    return prova;
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      (erro as { code: unknown }).code === "ENOENT"
    ) {
      throw new ProvaNaoEncontradaError(id);
    }
    throw erro;
  }
}

/**
 * Carrega todas as provas válidas do diretório, de forma tolerante: pula
 * arquivos corrompidos e trata o diretório ausente como "nenhuma prova".
 * Ignora `.json.tmp` órfãos (filtra por `.endsWith(".json")`).
 */
async function carregarTodas(baseDir?: string): Promise<Prova[]> {
  const dir = diretorioProvas(baseDir);
  let arquivos: string[];
  try {
    arquivos = await readdir(dir);
  } catch (erro) {
    if (
      typeof erro === "object" &&
      erro !== null &&
      "code" in erro &&
      (erro as { code: unknown }).code === "ENOENT"
    ) {
      return [];
    }
    throw erro;
  }

  const provas: Prova[] = [];
  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".json")) continue;
    const id = arquivo.slice(0, -".json".length);
    try {
      provas.push(await carregarProva(id, baseDir));
    } catch {
      continue;
    }
  }
  return provas;
}

/**
 * Lista as provas como resumos leves (contagem regressiva), calculando
 * `diasRestantes`/`estado` em relação ao `hoje` injetado. Ordena por `data`
 * crescente (mais próxima primeiro); empate pelo `titulo`. Leitura tolerante;
 * diretório ausente → `[]`.
 */
export async function listarProvas(
  hoje: string,
  baseDir?: string,
): Promise<ResumoProva[]> {
  const provas = await carregarTodas(baseDir);
  const resumos: ResumoProva[] = provas.map((prova) => {
    const dias = diasRestantes(prova.data, hoje);
    return {
      id: prova.id,
      titulo: prova.titulo,
      data: prova.data,
      diasRestantes: dias,
      estado: estadoProva(dias),
      tipoVinculo: prova.vinculo.tipo,
      ...(prova.vinculo.tipo === "caderno"
        ? { cadernoNome: prova.vinculo.cadernoNome }
        : {}),
    };
  });
  resumos.sort((a, b) => {
    if (a.data < b.data) return -1;
    if (a.data > b.data) return 1;
    return a.titulo.localeCompare(b.titulo);
  });
  return resumos;
}

/** Mudanças aceitas por `editarProva` (campos omitidos ficam como estão). */
export type MudancasProva = Partial<
  Pick<Prova, "titulo" | "data" | "vinculo" | "intervalos">
> & { tipo?: TipoProva | null };

/**
 * Edita campos de uma prova. `vinculo`, quando presente, SUBSTITUI
 * integralmente o anterior (re-derivando `cadernoId` via `montarCaderno`, sem
 * merge raso). A agenda é RECOMPUTADA (preservando manuais) APENAS quando
 * `data` ou `intervalos` mudam — mudar só o vínculo não recomputa datas.
 * Recarimba `atualizadoEm`.
 *
 * @throws {ProvaNaoEncontradaError} se a prova não existir.
 * @throws {DadosProvaInvalidosError} se algum campo informado for inválido.
 */
export async function editarProva(
  id: string,
  mudancas: MudancasProva,
  hoje: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);

  const titulo =
    mudancas.titulo !== undefined ? sanearTitulo(mudancas.titulo) : prova.titulo;

  let data = prova.data;
  let dataMudou = false;
  if (mudancas.data !== undefined) {
    if (!dataValida(mudancas.data)) {
      throw new DadosProvaInvalidosError(
        "Informe uma data válida (ano-mês-dia).",
      );
    }
    // Data inalterada passa mesmo se já ocorreu (prova antiga); data NOVA
    // precisa ser a partir de amanhã.
    const resultadoData = validarDataProva({
      data: mudancas.data,
      hoje,
      dataAtual: prova.data,
    });
    if (!resultadoData.ok) {
      throw new DadosProvaInvalidosError(resultadoData.mensagem);
    }
    dataMudou = mudancas.data !== prova.data;
    data = mudancas.data;
  }

  const vinculo =
    mudancas.vinculo !== undefined
      ? sanearVinculo(mudancas.vinculo)
      : prova.vinculo;

  let intervalos = prova.intervalos;
  let intervalosMudaram = false;
  if (mudancas.intervalos !== undefined) {
    intervalos = normalizarIntervalos(mudancas.intervalos);
    intervalosMudaram =
      JSON.stringify(intervalos) !== JSON.stringify(prova.intervalos);
  }

  // `tipo`: ausente = nada muda; null = remove a chave; válido = grava e
  // sincroniza o ordinal do plano (I1).
  let tipoFinal = prova.tipo;
  let plano = prova.plano;
  if (mudancas.tipo === null) {
    tipoFinal = undefined;
  } else if (mudancas.tipo !== undefined) {
    tipoFinal = sanearTipo(mudancas.tipo);
    if (tipoFinal !== undefined && plano !== undefined) {
      plano = aplicarOrdinalAoPlano(plano, ordinalDeTipo(tipoFinal));
    }
  }

  // Recomputa SÓ quando data/intervalos mudam; mudar só o vínculo não mexe nas
  // datas (as sessões são agnósticas de caderno — ver design §3).
  const sessoes =
    dataMudou || intervalosMudaram
      ? recomputarAgenda({
          dataProva: data,
          intervalos,
          hoje,
          sessoesAtuais: prova.sessoes,
        })
      : prova.sessoes;

  const atualizada: Prova = {
    ...prova,
    titulo,
    data,
    vinculo,
    intervalos,
    sessoes,
    atualizadoEm: new Date().toISOString(),
    ...(plano !== undefined ? { plano } : {}),
  };
  // Nunca grava `tipo: undefined`: remover o tipo apaga a chave.
  if (tipoFinal === undefined) {
    delete atualizada.tipo;
  } else {
    atualizada.tipo = tipoFinal;
  }
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/**
 * Substitui as sessões de uma prova (edição manual). Sanea as sessões
 * recebidas: descarta datas fora de "YYYY-MM-DD" ou passadas (`data < hoje`),
 * PRESERVA o flag `manual` recebido (não força `true`), PRESERVA o flag
 * `concluida` (spread condicional — ausente/`false` → chave omitida),
 * RECALCULA `diasAntes = diferencaDias(prova.data, data)` para cada sessão,
 * reordena por data crescente e reatribui ids `s0..sN`. Saneamento silencioso
 * (datas inválidas/passadas são descartadas, não geram erro).
 *
 * @throws {ProvaNaoEncontradaError} se a prova não existir.
 */
export async function salvarSessoes(
  id: string,
  sessoes: SessaoRevisao[],
  hoje: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);

  const saneadas = (Array.isArray(sessoes) ? sessoes : [])
    .filter((s) => dataValida(s?.data) && s.data >= hoje)
    .map((s) => ({
      data: s.data,
      diasAntes: diferencaDias(prova.data, s.data),
      manual: s.manual === true,
      ...(s.concluida === true ? { concluida: true } : {}),
    }));

  saneadas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const novasSessoes: SessaoRevisao[] = saneadas.map((s, i) => ({
    id: `s${i}`,
    ...s,
  }));

  const atualizada: Prova = {
    ...prova,
    sessoes: novasSessoes,
    atualizadoEm: new Date().toISOString(),
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/**
 * Regera as sugestões preservando as edições manuais (recomputar explícito).
 * @throws {ProvaNaoEncontradaError} se a prova não existir.
 */
export async function regerarAgenda(
  id: string,
  hoje: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  const sessoes = recomputarAgenda({
    dataProva: prova.data,
    intervalos: prova.intervalos,
    hoje,
    sessoesAtuais: prova.sessoes,
  });
  const atualizada: Prova = {
    ...prova,
    sessoes,
    atualizadoEm: new Date().toISOString(),
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/** Limites de saneamento do questionário do plano de estudo. */
const HORAS_POR_DIA_DEFAULT = 2;
const DIAS_POR_SEMANA_DEFAULT = 5;
const TITULO_TOPICO_MAX = 200;

/** Níveis de dificuldade válidos. */
const NIVEIS: readonly NivelDificuldade[] = ["facil", "media", "dificil"];

/** Preferências de checkpoint válidas. */
const CHECKPOINTS: readonly PreferenciaCheckpoint[] = [
  "automatico",
  "lembrete",
];

/** Arredonda e aplica clamp a um inteiro num intervalo [min, max]. */
function inteiroClamp(
  bruto: unknown,
  min: number,
  max: number,
  padrao: number,
): number {
  if (typeof bruto !== "number" || !Number.isFinite(bruto)) return padrao;
  const arredondado = Math.round(bruto);
  if (arredondado < min) return min;
  if (arredondado > max) return max;
  return arredondado;
}

/**
 * Sanea/valida as respostas CRUAS do questionário vindas do renderer e devolve
 * um `PlanoEstudo` consistente. Segue o padrão de `provas.ts`: regras
 * silenciosas (valores absurdos viram valores sensatos), EXCETO os campos
 * essenciais (ordinal e ao menos um assunto), que lançam
 * `DadosProvaInvalidosError` com frase pronta em português.
 *
 * `atualizadoEm` é carimbado com o `agora` recebido (nunca lê o relógio aqui).
 */
export function sanearPlano(bruto: unknown, agora: string): PlanoEstudo {
  const p =
    typeof bruto === "object" && bruto !== null
      ? (bruto as Record<string, unknown>)
      : {};

  const ordinal = p.ordinal;
  if (ordinal !== "primeira" && ordinal !== "segunda" && ordinal !== "final") {
    throw new DadosProvaInvalidosError("Informe qual prova é.");
  }

  const horasPorDia = inteiroClamp(p.horasPorDia, 1, 24, HORAS_POR_DIA_DEFAULT);
  const diasPorSemana = inteiroClamp(
    p.diasPorSemana,
    1,
    7,
    DIAS_POR_SEMANA_DEFAULT,
  );

  const topicosBrutos = Array.isArray(p.topicos) ? p.topicos : [];
  const topicos: TopicoPlano[] = [];
  const vistos = new Set<string>();
  topicosBrutos.forEach((item, i) => {
    const t =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)
        : {};
    const tituloBruto = typeof t.titulo === "string" ? t.titulo.trim() : "";
    if (tituloBruto.length === 0) return; // item sem título é descartado.
    const titulo = tituloBruto.slice(0, TITULO_TOPICO_MAX);

    // Id: aceita o do doc (não-vazio e sem o prefixo reservado `manual:`);
    // senão deriva `manual:<slug>-<i>` — espaço disjunto dos ids de documento.
    const idBruto = typeof t.id === "string" ? t.id.trim() : "";
    const id =
      idBruto.length > 0 && !idBruto.startsWith("manual:")
        ? idBruto
        : `manual:${slugTopico(titulo)}-${i}`;
    if (vistos.has(id)) return; // dedup por id, mantendo o 1º.
    vistos.add(id);

    const novo = ordinal === "primeira" ? false : t.novo === true;
    const topico: TopicoPlano = { id, titulo, novo };
    if (typeof t.dificuldade === "string" && NIVEIS.includes(t.dificuldade as NivelDificuldade)) {
      topico.dificuldade = t.dificuldade as NivelDificuldade;
    }
    if (ehIsoPlausivel(t.dataArquivo)) {
      topico.dataArquivo = t.dataArquivo;
    }
    topicos.push(topico);
  });
  if (topicos.length === 0) {
    throw new DadosProvaInvalidosError("Informe ao menos um assunto.");
  }

  // ordemManual: só ids existentes, dedup; vazio → chave omitida.
  const idsExistentes = new Set(topicos.map((t) => t.id));
  const ordemManual: string[] = [];
  if (Array.isArray(p.ordemManual)) {
    const vistosOrdem = new Set<string>();
    for (const valor of p.ordemManual) {
      if (typeof valor !== "string") continue;
      if (!idsExistentes.has(valor) || vistosOrdem.has(valor)) continue;
      vistosOrdem.add(valor);
      ordemManual.push(valor);
    }
  }

  const checkpoint: PreferenciaCheckpoint = CHECKPOINTS.includes(
    p.checkpoint as PreferenciaCheckpoint,
  )
    ? (p.checkpoint as PreferenciaCheckpoint)
    : "lembrete";

  return {
    ordinal,
    horasPorDia,
    diasPorSemana,
    topicos,
    ...(ordemManual.length > 0 ? { ordemManual } : {}),
    checkpoint,
    atualizadoEm: agora,
  };
}

/**
 * Sanea as respostas do questionário e grava o bloco `plano` numa prova
 * existente, de forma atômica. Usa SPREAD CONDICIONAL (`...(plano ? ...)`) no
 * padrão real de `listarProvas`/`salvarSessoes` — nunca grava `plano:
 * undefined`. O MESMO `agora` carimba `PlanoEstudo.atualizadoEm` (via
 * `sanearPlano`) e `Prova.atualizadoEm`, deixando os dois idênticos nesta
 * operação (divergem depois quando só a agenda muda).
 *
 * @throws {ProvaNaoEncontradaError} se a prova não existir.
 * @throws {DadosProvaInvalidosError} se os dados essenciais faltarem.
 */
export async function salvarPlano(
  id: string,
  planoBruto: unknown,
  agora: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  // Com `tipo`, o main decide o ordinal (o renderer só sugere).
  const bruto =
    prova.tipo !== undefined &&
    typeof planoBruto === "object" &&
    planoBruto !== null &&
    !Array.isArray(planoBruto)
      ? { ...planoBruto, ordinal: ordinalDeTipo(prova.tipo) }
      : planoBruto;
  const plano = sanearPlano(bruto, agora);
  const atualizada: Prova = {
    ...prova,
    ...(plano ? { plano } : {}),
    // Backfill: prova sem tipo passa a ter tipo = ordinal escolhido.
    ...(prova.tipo === undefined ? { tipo: plano.ordinal } : {}),
    atualizadoEm: agora,
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

// --- Diagnóstico do plano (fatia 3) -----------------------------------------

const MOTIVOS_IGNORADO: readonly MotivoTopicoIgnorado[] = [
  "manual",
  "sem_texto",
  "nao_gerou",
];

function objetoOuNulo(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Valida uma pergunta persistida do diagnóstico; `null` se inválida. */
function sanearPerguntaDiagnostico(bruta: unknown): PerguntaDiagnostico | null {
  const p = objetoOuNulo(bruta);
  if (p === null) return null;
  if (typeof p.topicoId !== "string" || p.topicoId.length === 0) return null;
  if (p.camada !== "base" && p.camada !== "novo") return null;
  if (typeof p.enunciado !== "string" || p.enunciado.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(p.alternativas)) return null;
  if (p.alternativas.length < 2 || p.alternativas.length > 6) return null;
  const alternativas: AlternativaQuiz[] = [];
  for (const a of p.alternativas) {
    const alt = objetoOuNulo(a);
    if (alt === null) return null;
    if (typeof alt.texto !== "string" || alt.texto.trim().length === 0) {
      return null;
    }
    alternativas.push({ texto: alt.texto, correta: alt.correta === true });
  }
  if (alternativas.filter((a) => a.correta).length !== 1) return null;
  return {
    tipo: "multipla",
    enunciado: p.enunciado.trim(),
    alternativas,
    topicoId: p.topicoId,
    camada: p.camada,
  };
}

/**
 * Leitura tolerante do bloco `diagnostico` persistido. Nunca lança: bloco
 * inválido ⇒ `undefined`; pergunta inválida é descartada e, se algo foi
 * descartado ou `respostas` está desalinhada, volta a PENDENTE (respostas e
 * concluidoEm omitidos). Chaves opcionais por spread condicional.
 */
export function sanearDiagnosticoPersistido(
  bruto: unknown,
): DiagnosticoPlano | undefined {
  const d = objetoOuNulo(bruto);
  if (d === null) return undefined;
  if (typeof d.assinatura !== "string" || typeof d.geradoEm !== "string") {
    return undefined;
  }
  const brutas = Array.isArray(d.perguntas) ? d.perguntas : [];
  const perguntas: PerguntaDiagnostico[] = [];
  for (const b of brutas) {
    const p = sanearPerguntaDiagnostico(b);
    if (p !== null) perguntas.push(p);
  }
  if (perguntas.length === 0) return undefined;

  const pedido =
    typeof d.pedido === "number" && Number.isInteger(d.pedido) && d.pedido >= 1
      ? d.pedido
      : perguntas.length;

  const ignorados: TopicoIgnorado[] = [];
  if (Array.isArray(d.ignorados)) {
    for (const b of d.ignorados) {
      const ig = objetoOuNulo(b);
      if (
        ig !== null &&
        typeof ig.id === "string" &&
        typeof ig.titulo === "string" &&
        MOTIVOS_IGNORADO.includes(ig.motivo as MotivoTopicoIgnorado)
      ) {
        ignorados.push({
          id: ig.id,
          titulo: ig.titulo,
          motivo: ig.motivo as MotivoTopicoIgnorado,
        });
      }
    }
  }

  const respostasValidas =
    perguntas.length === brutas.length &&
    Array.isArray(d.respostas) &&
    d.respostas.length === perguntas.length &&
    d.respostas.every(
      (r, i) =>
        typeof r === "number" &&
        Number.isInteger(r) &&
        r >= -1 &&
        r < perguntas[i].alternativas.length,
    );

  return {
    assinatura: d.assinatura,
    geradoEm: d.geradoEm,
    perguntas,
    pedido,
    ignorados,
    ...(respostasValidas
      ? {
          respostas: d.respostas as number[],
          ...(typeof d.concluidoEm === "string"
            ? { concluidoEm: d.concluidoEm }
            : {}),
        }
      : {}),
  };
}

/**
 * Persiste um diagnóstico recém-gerado (substitui o anterior). Recarrega a
 * prova e só grava se o plano ainda tem a assinatura usada na geração.
 *
 * @throws {DadosProvaInvalidosError} se o plano sumiu ou mudou.
 */
export async function salvarDiagnostico(
  id: string,
  d: DiagnosticoPlano,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  if (
    prova.plano === undefined ||
    d.assinatura !== assinaturaPlano(prova.plano)
  ) {
    throw new DadosProvaInvalidosError(
      "Os assuntos do plano mudaram enquanto eu preparava o diagnóstico. Tente de novo.",
    );
  }
  const atualizada: Prova = {
    ...prova,
    diagnostico: d,
    atualizadoEm: d.geradoEm,
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/**
 * Grava as escolhas do aluno no diagnóstico (`-1` = "Não sei").
 *
 * @throws {DadosProvaInvalidosError} sem diagnóstico ou com escolhas inválidas.
 */
export async function registrarRespostasDiagnostico(
  id: string,
  escolhas: unknown,
  agora: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  const d = prova.diagnostico;
  if (d === undefined) {
    throw new DadosProvaInvalidosError(
      "Não há diagnóstico para responder. Faça o diagnóstico primeiro.",
    );
  }
  const validas =
    Array.isArray(escolhas) &&
    escolhas.length === d.perguntas.length &&
    escolhas.every(
      (e, i) =>
        typeof e === "number" &&
        Number.isInteger(e) &&
        e >= -1 &&
        e < d.perguntas[i].alternativas.length,
    );
  if (!validas) {
    throw new DadosProvaInvalidosError(
      "Responda todas as perguntas para ver o resultado.",
    );
  }
  const atualizada: Prova = {
    ...prova,
    diagnostico: { ...d, respostas: escolhas as number[], concluidoEm: agora },
    atualizadoEm: agora,
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/**
 * Remove uma prova pelo id. Remover algo inexistente é um no-op (não lança),
 * para a UI poder apagar sem corrida de estado.
 */
export async function removerProva(id: string, baseDir?: string): Promise<void> {
  await rm(caminhoProva(id, baseDir), { force: true });
}

// --- Checkpoints pré-prova (fatia 4) -----------------------------------------

const MODOS_EXERCICIO: readonly ModoConteudo[] = ["teorica", "pratica", "mista"];
const MOTIVOS_CHECKPOINT_IGNORADO: readonly MotivoCheckpointIgnorado[] = [
  "manual",
  "sem_texto",
  "fora_da_amostra",
];
const PADRAO_ID_CHECKPOINT = /^d[1-9]\d{0,2}$/;
const TITULO_CHECKPOINT_MAX = 200;

function textoNaoVazio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function sanearExercicioPersistido(bruto: unknown): Exercicio | null {
  const e = objetoOuNulo(bruto);
  if (e === null) return null;
  if (!textoNaoVazio(e.enunciado) || !textoNaoVazio(e.resposta)) return null;
  if (!MODOS_EXERCICIO.includes(e.modo as ModoConteudo)) return null;
  return {
    enunciado: e.enunciado.trim(),
    resposta: e.resposta.trim(),
    modo: e.modo as ModoConteudo,
  };
}

/** Valida um item de checkpoint persistido; `null` se inválido. */
function sanearItemCheckpoint(bruto: unknown): CheckpointGerado | null {
  const it = objetoOuNulo(bruto);
  if (it === null) return null;
  if (typeof it.id !== "string" || !PADRAO_ID_CHECKPOINT.test(it.id)) return null;
  if (!textoNaoVazio(it.geradoEm)) return null;

  const exercicios: Exercicio[] = [];
  for (const b of Array.isArray(it.exercicios) ? it.exercicios : []) {
    const ex = sanearExercicioPersistido(b);
    if (ex !== null) exercicios.push(ex);
  }
  if (exercicios.length < CHECKPOINT_MINIMO_EXERCICIOS) return null;

  const topicos: TopicoCheckpoint[] = [];
  const vistos = new Set<string>();
  for (const b of Array.isArray(it.topicos) ? it.topicos : []) {
    const t = objetoOuNulo(b);
    if (t === null || !textoNaoVazio(t.id) || typeof t.titulo !== "string") continue;
    if (vistos.has(t.id)) continue;
    vistos.add(t.id);
    topicos.push({ id: t.id, titulo: t.titulo.slice(0, TITULO_CHECKPOINT_MAX) });
  }
  if (topicos.length === 0) return null;

  const ignorados: TopicoCheckpointIgnorado[] = [];
  for (const b of Array.isArray(it.ignorados) ? it.ignorados : []) {
    const ig = objetoOuNulo(b);
    if (
      ig !== null &&
      textoNaoVazio(ig.id) &&
      typeof ig.titulo === "string" &&
      MOTIVOS_CHECKPOINT_IGNORADO.includes(ig.motivo as MotivoCheckpointIgnorado)
    ) {
      ignorados.push({
        id: ig.id,
        titulo: ig.titulo.slice(0, TITULO_CHECKPOINT_MAX),
        motivo: ig.motivo as MotivoCheckpointIgnorado,
      });
    }
  }

  const pedido =
    typeof it.pedido === "number" && Number.isInteger(it.pedido) && it.pedido >= 1
      ? it.pedido
      : exercicios.length;

  return {
    id: it.id,
    geradoEm: it.geradoEm,
    topicos,
    ignorados,
    pedido,
    exercicios,
    ...(textoNaoVazio(it.concluidoEm) ? { concluidoEm: it.concluidoEm } : {}),
  };
}

function numeroDoIdCheckpoint(id: string): number {
  return Number(id.slice(1));
}

/**
 * Leitura tolerante do bloco `checkpoints` persistido. Nunca lança: bloco
 * inválido ⇒ `undefined`; item inválido é descartado; ids únicos (mantém o 1º),
 * ordenados por `diasAntes` decrescente. Chaves opcionais por spread condicional.
 */
export function sanearCheckpointsPersistido(
  bruto: unknown,
): CheckpointsPlano | undefined {
  const b = objetoOuNulo(bruto);
  if (b === null || !textoNaoVazio(b.assinatura) || !Array.isArray(b.itens)) {
    return undefined;
  }
  const itens: CheckpointGerado[] = [];
  const ids = new Set<string>();
  for (const bruta of b.itens) {
    const item = sanearItemCheckpoint(bruta);
    if (item === null || ids.has(item.id)) continue;
    ids.add(item.id);
    itens.push(item);
  }
  itens.sort((x, y) => numeroDoIdCheckpoint(y.id) - numeroDoIdCheckpoint(x.id));
  const limitados = itens.slice(0, CHECKPOINT_DIAS_ANTES.length);
  return limitados.length === 0
    ? undefined
    : { assinatura: b.assinatura, itens: limitados };
}

/**
 * Persiste uma lista de checkpoint recém-gerada (substitui a de mesmo id).
 * Recarrega a prova e só grava se o plano ainda tem a assinatura usada na
 * geração. Com assinatura nova, o bloco antigo é substituído por um bloco só
 * com este item.
 *
 * @throws {DadosProvaInvalidosError} se o plano sumiu ou mudou.
 */
export async function salvarCheckpoint(
  id: string,
  assinaturaDaGeracao: string,
  item: CheckpointGerado,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  if (
    prova.plano === undefined ||
    assinaturaDaGeracao !== assinaturaPlano(prova.plano)
  ) {
    throw new DadosProvaInvalidosError(
      "Os assuntos do plano mudaram enquanto eu preparava a lista. Tente de novo.",
    );
  }
  const atual = prova.checkpoints;
  const mesmos =
    atual !== undefined && atual.assinatura === assinaturaDaGeracao
      ? atual.itens.filter((i) => i.id !== item.id)
      : [];
  const itens = [...mesmos, item].sort(
    (x, y) => numeroDoIdCheckpoint(y.id) - numeroDoIdCheckpoint(x.id),
  );
  const atualizada: Prova = {
    ...prova,
    checkpoints: { assinatura: assinaturaDaGeracao, itens },
    atualizadoEm: item.geradoEm,
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/**
 * Marca a lista do checkpoint como concluída. Idempotente: já concluída ⇒
 * devolve a prova sem regravar nem mudar carimbos.
 *
 * @throws {DadosProvaInvalidosError} sem a lista no bloco atual.
 */
export async function concluirCheckpoint(
  id: string,
  checkpointId: string,
  agora: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  const bloco = prova.checkpoints;
  const item = bloco?.itens.find((i) => i.id === checkpointId);
  if (
    prova.plano === undefined ||
    bloco === undefined ||
    item === undefined ||
    bloco.assinatura !== assinaturaPlano(prova.plano)
  ) {
    throw new DadosProvaInvalidosError(
      "Não encontrei essa lista para marcar como concluída.",
    );
  }
  if (item.concluidoEm !== undefined) return prova;
  const atualizada: Prova = {
    ...prova,
    checkpoints: {
      ...bloco,
      itens: bloco.itens.map((i) =>
        i.id === checkpointId ? { ...i, concluidoEm: agora } : i,
      ),
    },
    atualizadoEm: agora,
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}

/**
 * Troca a preferência lembrete⇄automático SEM tocar `plano.atualizadoEm`
 * (âncora da data-base dos checkpoints).
 *
 * @throws {DadosProvaInvalidosError} sem plano ou com preferência inválida.
 */
export async function definirPreferenciaCheckpoint(
  id: string,
  preferenciaBruta: unknown,
  agora: string,
  baseDir?: string,
): Promise<Prova> {
  const prova = await carregarProva(id, baseDir);
  if (prova.plano === undefined) {
    throw new DadosProvaInvalidosError(
      "Monte o plano de estudo antes de escolher os checkpoints.",
    );
  }
  if (preferenciaBruta !== "automatico" && preferenciaBruta !== "lembrete") {
    throw new DadosProvaInvalidosError("Escolha automático ou lembrete.");
  }
  const atualizada: Prova = {
    ...prova,
    plano: { ...prova.plano, checkpoint: preferenciaBruta },
    atualizadoEm: agora,
  };
  await escreverProva(atualizada, baseDir);
  return atualizada;
}