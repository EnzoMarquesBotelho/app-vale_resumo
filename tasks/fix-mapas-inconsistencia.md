# Correção — Inconsistência na geração de mapas mentais (e geração JSON em geral)

> Relato do usuário (2026-10-15): a geração de mapa mental é inconsistente.
> Com `llama3.1:latest` só funcionou na 3ª tentativa; com `moondream:latest`
> falhou nas 2 tentativas.

## Diagnóstico (com base no código real)

1. **Causa raiz principal:** o cliente Ollama (`src/main/services/ollama.ts`)
   chama `POST /api/generate` com `{ model, prompt, stream: false }` — **sem o
   parâmetro `format`**. Sem forçar o formato, o modelo frequentemente embrulha
   o JSON em markdown/texto, ou gera algo que o parser tolerante rejeita. Isso
   explica "funcionou só na 3ª vez". O Ollama suporta `format: "json"` (e também
   `format: <json-schema>`), que **obriga** saída JSON válida e elimina quase
   toda a variabilidade. Afeta mapa mental, flashcards e exercícios (todos
   dependem de JSON do modelo).

2. **Modelo de visão não serve:** `moondream` é um modelo multimodal pequeno de
   VISÃO, inadequado para gerar JSON estruturado de texto. O app hoje deixa o
   usuário selecioná-lo e falhar sem explicação. Precisa orientar melhor.

3. **Uma única re-tentativa corretiva** é pouca margem quando a saída é instável.

## Correções a implementar

1. **Forçar JSON no Ollama para gerações estruturadas.** Permitir que `generate`
   receba uma opção de formato (ex.: `format?: "json" | object`) e repassá-la no
   corpo da requisição. As gerações de mapa mental, flashcards e exercícios
   passam a usar `format: "json"` (ou, preferível, um JSON schema do artefato,
   se simples de manter). Resumo continua texto livre (sem `format`).
   - Importante: ao usar `format: "json"`, mandar também no prompt a instrução
     para responder em JSON (recomendação do Ollama), o que já é o caso.
2. **Aumentar a resiliência da re-tentativa** do mapa mental: ao menos 2
   tentativas corretivas (total 3 chamadas) antes de falhar, OU uma re-tentativa
   que já use `format` schema. Manter o parser tolerante como rede de segurança.
3. **UX de modelo inadequado:** quando a geração falha repetidamente, a mensagem
   de erro deve sugerir usar um modelo de TEXTO (ex.: llama3.1, qwen2.5, gemma2)
   e evitar modelos de visão/embedding (moondream, minicpm-v, nomic-embed-text).
   Opcional/bom: no seletor de modelo, sinalizar/filtrar modelos sabidamente
   inadequados (embeddings) — mínimo: não quebrar, orientar.

## Restrições

- Manter stack e padrões atuais; sem dependência nova (format é nativo do Ollama).
- UI/mensagens em pt-BR; identificadores em inglês.
- Não regredir: baseline atual 213 testes + build/lint limpos; todos devem
  continuar passando, com testes novos para o parâmetro `format` e a resiliência.
- Testes mockam o Ollama (não dependem de modelo real nem da pasta Facul).
- Verificação manual real contra o Ollama local do usuário (que tem
  llama3.1:latest, qwen2.5, gemma2, e também moondream/embeddings) — somente
  leitura da pasta Facul.
