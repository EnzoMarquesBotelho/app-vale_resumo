# Implementation Plan: App de Estudos com IA Local (MVP)

> Fonte: `SPEC.md` (aprovada em 2026-10-15) e `docs/intent/app-estudos.md`.
> Fase 2 (Plan) da skill `spec-driven-development`, usando `planning-and-task-breakdown`.
> Lista de tarefas detalhada: `tasks/todo.md`.

## Overview

App desktop Electron + React + TypeScript, 100% local/offline. Importa `.txt`/`.md`/`.pdf`,
extrai o texto e usa Ollama local para gerar resumo (curto/longo), flashcards e exercícios
(teórica/prática/mista). Resultados persistem em JSON local. Entregue funcionando para um
usuário iniciante.

## Architecture Decisions

- **Electron (main + renderer) com IPC tipado.** `contextIsolation` ligado, `nodeIntegration`
  desligado; todo acesso a disco e rede (Ollama) fica no processo `main`, exposto ao renderer
  por canais IPC. Motivo: segurança padrão do Electron e separação clara de responsabilidades.
- **Vite via `electron-vite`.** Dev rápido e build simples para um iniciante.
- **Ollama pela API HTTP local.** Sem SDK extra; `fetch` em `/api/tags` (status) e
  `/api/generate` (geração). Motivo: zero dependência de nuvem, fácil de mockar em teste.
- **Prompts com saída estruturada.** Flashcards e exercícios pedem JSON ao modelo; parsing
  tolerante a falhas (extrair bloco JSON, validar com schema). Motivo: UI precisa de dados
  estruturados, não texto solto.
- **Persistência em JSON no `userData`.** Cada documento importado vira uma pasta/arquivo com
  seus artefatos gerados. Motivo: simples, local, inspecionável; sem banco externo.
- **Vitest com Ollama mockado.** Testes não dependem de modelo real.

## Dependency Graph

```
Scaffolding Electron+Vite+React+TS
   │
   ├── shared/types.ts, shared/prompts.ts
   │        │
   │        ├── main/services/ollama.ts (status + generate)
   │        │        │
   │        │        └── IPC: gerar resumo / flashcards / exercícios
   │        │
   │        ├── main/services/files.ts (ler txt/md, extrair pdf)
   │        │        │
   │        │        └── IPC: importar arquivo
   │        │
   │        └── main/services/storage.ts (salvar/carregar JSON)
   │                 │
   │                 └── IPC: salvar/carregar resultados
   │
   └── renderer (UI React) ── consome os canais IPC acima
```

Ordem: scaffolding → tipos → serviços (files/ollama/storage) + IPC → UI por fatia vertical.

## Task List (índice — detalhe em tasks/todo.md)

### Fase 1: Fundação
- Task 1: Scaffolding do projeto (Electron + Vite + React + TS, lint, vitest)
- Task 2: Tipos compartilhados e esqueleto de IPC tipado
- Checkpoint: Fundação

### Fase 2: Núcleo (serviços + fatias verticais)
- Task 3: Serviço de arquivos + fatia "importar e ver texto" (txt/md/pdf)
- Task 4: Cliente Ollama + detecção de disponibilidade com UI de erro clara
- Task 5: Fatia vertical "gerar resumo" (curto/longo)
- Task 6: Fatia vertical "gerar flashcards" (quantidade escolhível, navegáveis)
- Task 7: Fatia vertical "gerar exercícios" (teórica/prática/mista, 5–100)
- Checkpoint: Núcleo

### Fase 3: Persistência e acabamento
- Task 8: Persistência local (salvar/carregar resultados por documento)
- Task 9: Aparência agradável e empacotamento (`npm run package`)
- Checkpoint: MVP completo

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Modelo local retorna JSON malformado para flashcards/exercícios | Alto | Parser tolerante (extrai bloco JSON), validação com schema, re-tentativa com prompt corretivo |
| Ollama não instalado/rodando na máquina do usuário | Alto | Detecção na inicialização + tela com instruções passo a passo; nunca crashar |
| PDFs escaneados (imagem) sem texto | Médio | Detectar texto vazio e mostrar "sem texto extraível" (OCR é roadmap) |
| Arquivos muito grandes estouram contexto do modelo | Médio | Dividir em pedaços (chunking) e resumir em etapas; limitar tamanho por geração |
| Iniciante tem dificuldade de rodar o projeto | Médio | README com passo a passo (instalar Node, Ollama, `ollama pull`, `npm install`, `npm run dev`) |

## Open Questions

- Nenhuma pendente. (As 3 Open Questions da spec foram resolvidas; ver `SPEC.md` → Decisões.)
