# Roadmap — Fatia: Redesenho (barra lateral) + Temas claro/escuro

> Fatia pós-MVP mais ambiciosa visualmente: REDESENHO da navegação (sidebar) +
> temas claro/escuro + polimento geral. Só UI/renderer — a lógica de negócio,
> IPC, serviços e persistência NÃO mudam. Base: SPEC.md, todas as fatias
> entregues. Decisões confirmadas com o usuário em 2026-10-16.

## Objetivo

Dar ao app uma aparência de "aplicativo de verdade", mais agradável e menos
cansativa de usar: navegação por **barra lateral**, **tema claro/escuro** e
polimento visual — SEM perder nenhuma funcionalidade existente.

## Decisões confirmadas

1. **Redesenho (não só polimento).** Repensar o layout, não apenas refinar o
   atual.
2. **Barra lateral à esquerda** como navegação principal (substitui a faixa de
   8 abas no topo, que ficou apertada).
3. **Navegação de alto nível na sidebar: Biblioteca + Agenda.**
   - **Biblioteca:** onde hoje são Importar + Histórico. Mostra cadernos e
     documentos; importar arquivo/pasta é uma AÇÃO da Biblioteca (ex.: botão no
     topo da seção).
   - **Agenda:** provas/revisão/dicas — independente do documento aberto.
   - Os **artefatos NÃO são itens de navegação global.**
4. **Artefatos vivem na "tela do documento aberto".** Ao abrir um documento na
   Biblioteca, vai-se para uma tela do documento que contém: o texto importado,
   os 5 artefatos (gerar/ver: Resumo, Flashcards, Exercícios, Mapa mental, Quiz)
   e a exportação. Os artefatos podem ser abas internas/seções DESSA tela.
5. **Temas: seguir o sistema por padrão + alternador manual.** Opções:
   **Claro / Escuro / Automático** (automático = segue o SO via `nativeTheme`
   do Electron). A preferência é SALVA entre sessões. Padrão: Automático.
6. **Polimento visual:** tipografia, espaçamento, cantos/sombras, estados de
   hover/foco, consistência entre telas — tudo expresso em TOKENS de cor que
   passam a ter variante clara E escura.

## Restrição crítica — não regredir

Este é um REDESENHO só de UI. TODAS as funcionalidades e fluxos existentes
devem continuar acessíveis e funcionando, apenas reorganizados:
- Importar arquivo único e pasta (lote recursivo, cadernos compostos).
- Gerar e ver os 5 artefatos; persistência e reabertura pelo Histórico/Biblioteca.
- Correção por IA (exercícios sempre IA; toggle autoavaliação⇆IA no quiz).
- Agenda/provas (contagem regressiva, agenda editável, dica mecânica + IA).
- Exportação (Markdown/PDF, por artefato e documento inteiro).
- Status do Ollama + seletor de modelo + instruções quando ausente.
A lógica (main, IPC, serviços, `src/shared/*` de domínio) NÃO muda; a fatia
reescreve/reorganiza o renderer e os estilos. Baseline de testes (468) deve ser
preservada; nenhum teste de lógica deve quebrar.

## Regras para o design decidir (simples e seguras)

- **Tema via `nativeTheme` (Electron, main) + CSS.** Definir como a preferência
  (claro/escuro/automático) é persistida (ex.: no mesmo padrão de persistência
  local já usado) e propagada ao renderer. Os TOKENS em `styles.css` passam a ter
  dois conjuntos (claro/escuro), trocados por um atributo/classe no root (ex.:
  `data-theme`). Garantir contraste adequado nos dois temas (acessibilidade:
  texto legível, foco visível).
- **Estrutura do renderer:** a navegação por sidebar + tela-de-documento muda o
  `App.tsx` (hoje orquestra abas). Decidir o modelo de estado (qual seção ativa;
  qual documento aberto) preservando o comportamento atual de cada view. As
  views de artefato (`Resumo/Flashcards/Exercicios/MapaMental/Quiz`) devem ser
  reaproveitadas dentro da tela do documento, não reescritas na lógica.
- **Acessibilidade:** navegação por teclado na sidebar, `aria-current` na seção
  ativa, foco visível, contraste WCAG nos dois temas.
- **Sem dependência nova** se possível (sidebar + temas são CSS + estado +
  nativeTheme). Se algo exigir uma lib, justificar e pinar.

## Fora de escopo desta fatia (roadmap)

- Criação de logo / identidade visual (fatia própria do roadmap).
- Mais temas além de claro/escuro (ex.: temas coloridos).
- Redesenhar a LÓGICA de qualquer funcionalidade (só a apresentação muda).

## Orientação técnica (o design refina)

- **Main:** usar `nativeTheme` para o modo automático; IPC para ler/gravar a
  preferência de tema e informar o renderer. Persistir a preferência.
- **Renderer:** novo shell com `Sidebar` (Biblioteca, Agenda, + controle de
  tema), uma `Biblioteca` (cadernos/documentos + importar, reutilizando a lógica
  de Importar/Historico atuais) e uma `TelaDocumento` que hospeda as 5 views de
  artefato + exportação. `styles.css` reescrito com tokens claro/escuro.
  Chamadas ao main só via `getApi()`.
- **Testes:** a UI é verificação manual (sem harness de componente). Qualquer
  lógica pura nova (ex.: resolução do tema efetivo a partir de
  preferência+sistema) deve ter teste unitário. Rodar a suíte inteira para
  garantir que a lógica existente (468 testes) não regrediu. Textos pt-BR;
  identificadores em inglês. Verificação manual DETALHADA: abrir cada seção,
  abrir um documento e acessar os 5 artefatos, exportar, usar a agenda, e
  alternar os três modos de tema conferindo contraste.
