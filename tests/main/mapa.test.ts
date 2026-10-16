import { describe, expect, it, vi } from "vitest";
import {
  MAPA_MAX_FILHOS_POR_NO,
  MAPA_MAX_NOS,
  MAPA_PROFUNDIDADE_MAXIMA,
  MAPA_ROTULO_MAX,
} from "@shared/constants";
import type { NoMapaMental } from "@shared/types";
import {
  MapaMentalInvalidoError,
  SemTextoParaMapaMentalError,
  gerarMapaMental,
  parseMapaMental,
} from "../../src/main/services/mapa.js";

/** Conta todos os nós da árvore (incluindo a raiz). */
function contarNos(no: NoMapaMental): number {
  return 1 + no.filhos.reduce((soma, f) => soma + contarNos(f), 0);
}

/** Coleta todos os ids da árvore em pré-ordem. */
function idsEmPreOrdem(no: NoMapaMental): string[] {
  return [no.id, ...no.filhos.flatMap(idsEmPreOrdem)];
}

/** Profundidade máxima da árvore (raiz = 1). */
function profundidade(no: NoMapaMental): number {
  if (no.filhos.length === 0) return 1;
  return 1 + Math.max(...no.filhos.map(profundidade));
}

describe("parseMapaMental (resposta bem-formada)", () => {
  it("interpreta o formato { raiz: {...} }", () => {
    const resposta =
      '{"raiz":{"rotulo":"Tema","filhos":[{"rotulo":"Ramo","filhos":[]}]}}';
    const raiz = parseMapaMental(resposta);
    expect(raiz).not.toBeNull();
    expect(raiz?.rotulo).toBe("Tema");
    expect(raiz?.filhos).toHaveLength(1);
    expect(raiz?.filhos[0].rotulo).toBe("Ramo");
  });

  it("interpreta um nó solto na raiz (sem a chave raiz)", () => {
    const resposta = '{"rotulo":"Tema","filhos":[]}';
    const raiz = parseMapaMental(resposta);
    expect(raiz?.rotulo).toBe("Tema");
    expect(raiz?.filhos).toEqual([]);
  });

  it("interpreta JSON cercado por texto e por ```json```", () => {
    const resposta =
      'Claro! ```json\n{"raiz":{"rotulo":"T","filhos":[]}}\n``` pronto';
    const raiz = parseMapaMental(resposta);
    expect(raiz?.rotulo).toBe("T");
  });

  it("apara espaços do rótulo", () => {
    const raiz = parseMapaMental('{"rotulo":"  Tema  ","filhos":[]}');
    expect(raiz?.rotulo).toBe("Tema");
  });

  it("atribui ids densos n0, n1, ... em pré-ordem", () => {
    const resposta =
      '{"raiz":{"rotulo":"A","filhos":[{"rotulo":"B","filhos":[{"rotulo":"C","filhos":[]}]},{"rotulo":"D","filhos":[]}]}}';
    const raiz = parseMapaMental(resposta);
    expect(raiz).not.toBeNull();
    const ids = idsEmPreOrdem(raiz as NoMapaMental);
    expect(ids).toEqual(["n0", "n1", "n2", "n3"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parseMapaMental (resposta malformada)", () => {
  it("devolve null quando não há JSON", () => {
    expect(parseMapaMental("desculpe, não consegui")).toBeNull();
  });

  it("devolve null para JSON truncado (bloco não fechado)", () => {
    expect(parseMapaMental('{"raiz":{"rotulo":"T",')).toBeNull();
  });

  it("devolve null para JSON sintaticamente inválido", () => {
    expect(parseMapaMental('{"raiz":{"rotulo": cadê as aspas}}')).toBeNull();
  });

  it("devolve null quando a raiz não tem rótulo válido", () => {
    expect(parseMapaMental('{"raiz":{"filhos":[]}}')).toBeNull();
    expect(parseMapaMental('{"raiz":{"rotulo":"","filhos":[]}}')).toBeNull();
  });

  it("devolve null quando o candidato à raiz não é objeto não-nulo", () => {
    expect(parseMapaMental('{"raiz":"texto"}')).toBeNull();
    expect(parseMapaMental('{"raiz":null}')).toBeNull();
    expect(parseMapaMental('{"raiz":42}')).toBeNull();
  });

  it("devolve null quando o topo é um array", () => {
    expect(parseMapaMental('[{"rotulo":"T","filhos":[]}]')).toBeNull();
  });
});

describe("parseMapaMental (sanitização)", () => {
  it("descarta filho sem rótulo (e sua subárvore), mantendo os válidos", () => {
    const resposta =
      '{"raiz":{"rotulo":"T","filhos":[{"rotulo":"","filhos":[{"rotulo":"neto","filhos":[]}]},{"rotulo":"ok","filhos":[]}]}}';
    const raiz = parseMapaMental(resposta);
    expect(raiz?.filhos).toHaveLength(1);
    expect(raiz?.filhos[0].rotulo).toBe("ok");
  });

  it("trata filhos ausente/não-array como folha", () => {
    const raiz = parseMapaMental('{"raiz":{"rotulo":"T","filhos":"x"}}');
    expect(raiz?.filhos).toEqual([]);
  });

  it("trunca rótulos longos na fronteira de palavra com reticência", () => {
    const rotuloLongo = `${"palavra ".repeat(30)}fim`;
    const raiz = parseMapaMental(
      JSON.stringify({ raiz: { rotulo: rotuloLongo, filhos: [] } }),
    );
    expect(raiz).not.toBeNull();
    const r = raiz as NoMapaMental;
    expect(r.rotulo.length).toBeLessThanOrEqual(MAPA_ROTULO_MAX);
    expect(r.rotulo.endsWith("…")).toBe(true);
    // Corte na fronteira de palavra: não termina no meio de "palavra".
    expect(r.rotulo).not.toContain("palavr…");
  });

  it("trunca uma única palavra longa em MAX-1 + reticência", () => {
    const palavra = "a".repeat(MAPA_ROTULO_MAX + 50);
    const raiz = parseMapaMental(
      JSON.stringify({ raiz: { rotulo: palavra, filhos: [] } }),
    );
    const r = raiz as NoMapaMental;
    expect(r.rotulo.length).toBe(MAPA_ROTULO_MAX);
    expect(r.rotulo.endsWith("…")).toBe(true);
  });

  it("poda a profundidade além de MAPA_PROFUNDIDADE_MAXIMA", () => {
    // Monta uma cadeia linear bem mais profunda que o limite.
    let noAtual: unknown = { rotulo: "folha", filhos: [] };
    for (let i = 0; i < MAPA_PROFUNDIDADE_MAXIMA + 5; i += 1) {
      noAtual = { rotulo: `n${i}`, filhos: [noAtual] };
    }
    const raiz = parseMapaMental(JSON.stringify({ raiz: noAtual }));
    expect(raiz).not.toBeNull();
    expect(profundidade(raiz as NoMapaMental)).toBe(MAPA_PROFUNDIDADE_MAXIMA);
  });

  it("poda o leque além de MAPA_MAX_FILHOS_POR_NO", () => {
    const filhos = Array.from({ length: MAPA_MAX_FILHOS_POR_NO + 10 }, (_, i) => ({
      rotulo: `f${i}`,
      filhos: [],
    }));
    const raiz = parseMapaMental(JSON.stringify({ raiz: { rotulo: "T", filhos } }));
    expect(raiz?.filhos).toHaveLength(MAPA_MAX_FILHOS_POR_NO);
  });

  it("respeita o teto MAPA_MAX_NOS", () => {
    // Raiz com muito mais folhas que o teto (dentro do limite de leque não dá,
    // então usa uma árvore larga e rasa com vários ramos cheios).
    const ramos = Array.from({ length: MAPA_MAX_FILHOS_POR_NO }, (_, i) => ({
      rotulo: `ramo${i}`,
      filhos: Array.from({ length: MAPA_MAX_FILHOS_POR_NO }, (_, j) => ({
        rotulo: `n${i}_${j}`,
        filhos: Array.from({ length: MAPA_MAX_FILHOS_POR_NO }, (_, k) => ({
          rotulo: `d${i}_${j}_${k}`,
          filhos: [],
        })),
      })),
    }));
    const raiz = parseMapaMental(
      JSON.stringify({ raiz: { rotulo: "T", filhos: ramos } }),
    );
    expect(raiz).not.toBeNull();
    expect(contarNos(raiz as NoMapaMental)).toBeLessThanOrEqual(MAPA_MAX_NOS);
  });
});

describe("gerarMapaMental", () => {
  const arvoreValida =
    '{"raiz":{"rotulo":"Tema","filhos":[{"rotulo":"Ramo","filhos":[]}]}}';

  it("lança SemTextoParaMapaMentalError para texto vazio", async () => {
    await expect(gerarMapaMental({ texto: "   " })).rejects.toBeInstanceOf(
      SemTextoParaMapaMentalError,
    );
  });

  it("gera o mapa em uma única chamada quando a 1ª resposta é válida", async () => {
    const gerar = vi.fn().mockResolvedValue(arvoreValida);
    const mapa = await gerarMapaMental({ texto: "conteúdo", gerar });
    expect(mapa.raiz.rotulo).toBe("Tema");
    expect(mapa.documentoId).toBe("");
    expect(typeof mapa.geradoEm).toBe("string");
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("re-tenta uma vez quando a 1ª resposta é malformada", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("não é json")
      .mockResolvedValueOnce(arvoreValida);
    const mapa = await gerarMapaMental({ texto: "conteúdo", gerar });
    expect(mapa.raiz.rotulo).toBe("Tema");
    expect(gerar).toHaveBeenCalledTimes(2);
    // As gerações estruturadas passam "json" como 2º argumento.
    expect(gerar.mock.calls[0][1]).toBe("json");
    expect(gerar.mock.calls[1][1]).toBe("json");
  });

  it("re-tenta duas vezes: falha, falha, sucesso (3 chamadas)", async () => {
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("lixo")
      .mockResolvedValueOnce("ainda lixo")
      .mockResolvedValueOnce(arvoreValida);
    const mapa = await gerarMapaMental({ texto: "conteúdo", gerar });
    expect(mapa.raiz.rotulo).toBe("Tema");
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("lança MapaMentalInvalidoError após falha persistente", async () => {
    const gerar = vi.fn().mockResolvedValue("nunca é json");
    await expect(
      gerarMapaMental({ texto: "conteúdo", gerar }),
    ).rejects.toBeInstanceOf(MapaMentalInvalidoError);
    expect(gerar).toHaveBeenCalledTimes(3);
  });

  it("a mensagem de erro orienta a usar um modelo de texto", () => {
    const mensagem = new MapaMentalInvalidoError().message;
    expect(mensagem).toMatch(/modelo de texto/);
    expect(mensagem).toMatch(/llama3.1/);
    expect(mensagem).toMatch(/moondream/);
  });

  it("propaga o erro do gerador (ex.: Ollama offline)", async () => {
    const gerar = vi.fn().mockRejectedValue(new Error("ollama offline"));
    await expect(
      gerarMapaMental({ texto: "conteúdo", gerar }),
    ).rejects.toThrow("ollama offline");
  });

  it("condensa texto grande via resumo antes de gerar o mapa", async () => {
    // tamanhoChunk pequeno força o caminho "grande": o texto vira 3 chunks.
    // Sequência esperada de prompts: 3 (map do resumo) + 1 (reduce) + 1 (mapa).
    const tamanhoChunk = 20;
    const paragrafo = "x".repeat(18);
    const texto = `${paragrafo}\n\n${paragrafo}\n\n${paragrafo}`;
    const gerar = vi
      .fn()
      .mockResolvedValueOnce("parcial 1")
      .mockResolvedValueOnce("parcial 2")
      .mockResolvedValueOnce("parcial 3")
      .mockResolvedValueOnce("resumo combinado")
      .mockResolvedValueOnce(arvoreValida);

    const mapa = await gerarMapaMental({ texto, gerar, tamanhoChunk });

    expect(mapa.raiz.rotulo).toBe("Tema");
    expect(gerar).toHaveBeenCalledTimes(5);
    // O último prompt (o do mapa) é construído sobre o resumo condensado.
    const promptMapa = gerar.mock.calls[4][0] as string;
    expect(promptMapa).toContain("resumo combinado");
  });
});
