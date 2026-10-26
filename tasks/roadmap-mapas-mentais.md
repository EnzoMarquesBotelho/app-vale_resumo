# Roadmap — Fatia: Mapas Mentais

> Fatia pós-MVP. Novo artefato de estudo gerado por IA local + visualização em
> grafo hierárquico. Base: `SPEC.md`, cadernos já implementados.
> Decisões confirmadas com o usuário em 2026-10-15.

## Objetivo

A partir do texto importado, a IA local gera um **mapa mental hierárquico**
(tema central → ramos → sub-ramos). O app exibe isso como uma **árvore visual
bonita e navegável**, salva junto com o documento no caderno (como os demais
artefatos: resumo, flashcards, exercícios).

## Decisões confirmadas

1. **Estrutura: árvore hierárquica** (não grafo livre estilo Obsidian). Um nó
   central (tema), ramos (subtemas) e sub-ramos (detalhes). Profundidade
   razoável (sugestão: até ~4 níveis), cada nó com um rótulo curto.
2. **Interação nesta fatia: navegável, NÃO editável.**
   - Expandir / colapsar ramos.
   - Zoom (in/out) e pan (arrastar o mapa).
   - O conteúdo é gerado pela IA e não é editado manualmente.
3. **Visual caprichado:** layout de árvore agradável (radial ou horizontal),
   nós com cores/contraste por nível, linhas suaves, consistente com os tokens
   de design já existentes em `src/renderer/styles.css`. Deve ficar bonito e
   confortável de olhar.
4. **Persistência:** o mapa mental é salvo no documento, no caderno, como mais
   um artefato — reabre pelo Histórico junto com os demais.
5. **Geração robusta:** a IA devolve o mapa em JSON estruturado (árvore);
   reusar o parser tolerante existente (`extrairBlocoJson` / padrão de
   `parse.ts`) com validação de schema e re-tentativa corretiva, como já é feito
   para flashcards/exercícios. Textos grandes seguem a estratégia de chunking já
   usada no resumo, se necessário.

## Fora de escopo desta fatia (roadmap)

- **Edição manual** do mapa (renomear/adicionar/remover nós, arrastar e salvar
  posições, desfazer) — fatia futura própria.
- Exportar o mapa como imagem/arquivo.
- Grafo livre (nós com múltiplas conexões arbitrárias).

## Orientação técnica (o design refina; não é rígido)

- **Shared:** novo tipo de artefato "mapa mental" em `src/shared/types.ts`
  (estrutura de nó: id, rótulo, filhos). Template de prompt em
  `src/shared/prompts.ts` pedindo a árvore em JSON.
- **Main:** serviço de geração (reusar parser tolerante de `parse.ts`; validar o
  schema da árvore), handler IPC novo (`mapamental:gerar` ou similar) em
  `src/main/ipc/index.ts` resolvendo o modelo via `modeloParaGeracao()`,
  persistência do artefato em `storage.ts` (análogo a resumo/flashcards/exerc.).
- **Renderer:** nova aba/view "Mapa mental" com a visualização em árvore
  navegável. Avaliar uma lib de visualização de árvore/grafo leve e offline
  (ex.: react-flow ou equivalente) OU um render SVG próprio; se adicionar
  dependência, fixar a versão e justificar. Chamadas ao main só via `getApi()`.
- **Testes:** parsing da árvore (bom/malformado/truncado/retry), validação de
  schema, persistência round-trip. UI é verificação manual (sem harness de
  componente no projeto). Testes NÃO dependem da pasta Facul (somente leitura).
