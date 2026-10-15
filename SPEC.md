# Spec: App de Estudos com IA Local (MVP)

> Spec criada pela skill `spec-driven-development`, a partir da intenção confirmada em
> `docs/intent/app-estudos.md`. Documento vivo — atualizar quando decisões ou escopo mudarem.
> Status: **aprovada pelo usuário** (2026-10-15). Fase 1 — Specify concluída.

## Objective

**O que estamos construindo:** um aplicativo de desktop, 100% local e offline, que recebe
arquivos de estudo (texto e PDF no MVP) e usa um modelo de IA local (via Ollama) para gerar
automaticamente três artefatos de estudo a partir do conteúdo:

1. **Resumo** — em dois modos: curto/essencial ou longo/detalhado.
2. **Flashcards** — pares pergunta/resposta extraídos do conteúdo.
3. **Lista de exercícios** — em três modos: teóricas, práticas ou mistas.

**Por quê:** estudar hoje é fragmentado. A ferramenta transforma material bruto em material
de estudo pronto, sem internet e sem custo por uso.

**Usuário:** o autor (iniciante em programação) e pessoas próximas — estudantes. O app é
entregue funcionando; o usuário não precisa programar.

**Como é o sucesso (acceptance criteria):**

- O usuário importa um arquivo `.txt`, `.md` ou `.pdf` e vê o texto extraído.
- Com um clique, gera um resumo no modo escolhido (curto ou longo).
- Com um clique, gera flashcards (pergunta/resposta) navegáveis.
- Com um clique, gera uma lista de exercícios no modo escolhido (teórica/prática/mista).
- Todo o processamento ocorre localmente via Ollama, sem nenhuma chamada à internet.
- Se o Ollama não estiver instalado/rodando, o app mostra uma mensagem clara com instruções.
- Os resultados gerados ficam salvos localmente e podem ser reabertos.

## Tech Stack

- **Plataforma:** Electron (desktop; alvo principal Windows, compatível com Mac/Linux).
- **UI:** React + TypeScript.
- **Bundler/dev:** Vite (via `electron-vite`).
- **IA local:** Ollama, acessado pela API HTTP local (`http://localhost:11434`).
  - Modelo padrão configurável (ex.: `llama3.1:8b` ou `qwen2.5:7b`).
- **Extração de PDF:** `pdfjs-dist` (ou equivalente) para extrair texto de PDFs.
- **Persistência local:** arquivos JSON em disco no diretório de dados do app
  (`app.getPath('userData')`). Sem banco externo, sem nuvem.
- **Idioma:** português por padrão (multi-idioma é roadmap).

> Observação: versões exatas das dependências serão fixadas (pinned) no `package.json`
> durante a implementação.

## Commands

```
Instalar deps:   npm install
Dev (app):       npm run dev
Build:           npm run build
Empacotar app:   npm run package      (gera executável distribuível)
Testes:          npm test
Lint:            npm run lint
```

> Pré-requisito de runtime: o Ollama precisa estar instalado e rodando na máquina, com
> pelo menos um modelo baixado (`ollama pull llama3.1:8b`). O app detecta e orienta se faltar.

## Project Structure

```
src/
  main/            → Processo principal do Electron (janela, IPC, acesso a disco)
    ipc/           → Handlers de IPC (importar arquivo, chamar IA, salvar/carregar)
    services/
      ollama.ts    → Cliente da API local do Ollama (checar status, gerar)
      files.ts     → Leitura de .txt/.md e extração de texto de PDF
      storage.ts   → Salvar/carregar resultados em JSON local
  renderer/        → UI em React + TypeScript
    components/     → Componentes de UI (importador, visualizador, flashcards, exercícios)
    views/          → Telas (Importar, Resumo, Flashcards, Exercícios)
    state/          → Estado da aplicação
  shared/          → Tipos e constantes compartilhados entre main e renderer
    types.ts       → Tipos (Documento, Resumo, Flashcard, Exercicio, etc.)
    prompts.ts     → Templates de prompt para cada tipo de geração
tests/             → Testes unitários e de integração
docs/              → Documentação (inclui docs/intent/)
```

## Code Style

- TypeScript estrito (`strict: true`). Nada de `any` sem justificativa.
- Nomes de variáveis/funções em inglês no código; textos de UI em português.
- Componentes React funcionais com hooks. Um componente por arquivo.
- Funções puras na camada `services` sempre que possível; efeitos colaterais isolados.
- Comunicação renderer↔main **só** por canais IPC tipados (nunca `nodeIntegration` solto no renderer).

Exemplo de estilo (serviço do Ollama):

```ts
// src/main/services/ollama.ts
const OLLAMA_URL = "http://localhost:11434";

export interface GenerateParams {
  model: string;
  prompt: string;
}

/** Retorna true se o Ollama está acessível localmente. */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function generate({ model, prompt }: GenerateParams): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}`);
  const data = (await res.json()) as { response: string };
  return data.response;
}
```

## Testing Strategy

- **Framework:** Vitest (integra bem com Vite/TypeScript).
- **Localização:** `tests/`, espelhando a estrutura de `src/`.
- **Níveis:**
  - Unitário: serviços (`files.ts` extração de texto, `storage.ts` salvar/carregar,
    parsing das respostas da IA em flashcards/exercícios estruturados).
  - Integração: fluxo "texto de entrada → prompt → resposta mockada do Ollama → artefato parseado".
- **Mock do Ollama:** nos testes, a chamada HTTP ao Ollama é mockada; não dependemos de
  modelo real rodando no CI.
- **Cobertura:** foco na camada de serviços (parsing e persistência), onde quebras são mais caras.

## Boundaries

- **Always (sempre fazer):**
  - Rodar `npm run lint` e `npm test` antes de considerar uma tarefa concluída.
  - Manter todo processamento de IA local; nenhuma chamada de rede externa à internet.
  - Validar e tratar o caso de Ollama ausente/offline com mensagem clara.
  - Fixar (pin) versões de dependências no `package.json`.
- **Ask first (perguntar antes):**
  - Adicionar qualquer dependência que faça chamadas de rede externas.
  - Mudar a stack (ex.: trocar Electron por outra coisa).
  - Introduzir banco de dados externo em vez de JSON local.
  - Expandir o escopo além do MVP (qualquer item do roadmap).
- **Never (nunca fazer):**
  - Enviar conteúdo do usuário para servidores na nuvem.
  - Commitar segredos ou chaves.
  - Habilitar `nodeIntegration` no renderer sem `contextIsolation`.
  - Remover testes que falham sem aprovação.

## Success Criteria

Condições específicas e testáveis para o MVP estar "pronto":

1. `npm run dev` abre o app desktop em Windows.
2. Importar `.txt`, `.md` e `.pdf` extrai e exibe o texto corretamente.
3. Gerar resumo retorna texto coerente nos modos curto e longo.
4. Gerar flashcards retorna ao menos N pares pergunta/resposta estruturados e navegáveis.
5. Gerar exercícios retorna uma lista nos três modos (teórica/prática/mista).
6. Com a internet desligada, todas as gerações continuam funcionando (via Ollama local).
7. Ollama ausente → mensagem de erro clara com instruções, sem crash.
8. Resultados gerados persistem localmente e reabrem após fechar/reabrir o app.
9. `npm test` passa; `npm run lint` sem erros.

## Decisões (Open Questions resolvidas)

1. **Modelo padrão:** `llama3.1:8b` como default, configurável nas opções. ✅
2. **Quantidade de flashcards/exercícios:** o usuário escolhe a quantidade (mín. 5, máx. 100)
   já no MVP. ✅
3. **PDF escaneado (imagem):** no MVP, PDFs sem texto extraível mostram "sem texto extraível";
   OCR fica no roadmap. ✅
```

Me diz suas respostas às Open Questions e aprovação.
