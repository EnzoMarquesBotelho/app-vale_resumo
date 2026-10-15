# Intenção: App de Estudos (desktop, local, IA via Ollama)

> Documento de intenção confirmado com o usuário. Produzido pela skill `interview-me`.
> Data: 2026-10-15

## Statement of Intent (confirmado)

- **Resultado:** Um app de desktop que recebe qualquer arquivo (texto; no futuro vídeo/imagem/áudio) e, usando IA local (Ollama), gera resumos (curtos ou longos), flashcards e listas de exercícios (teóricas, práticas ou mistas).
- **Usuário:** O próprio autor e pessoas próximas — estudantes. O autor é iniciante em programação.
- **Por que agora:** Estudar hoje é fragmentado; a ideia é transformar material bruto em material de estudo automaticamente, sem depender de internet nem pagar por uso.
- **Sucesso:** Jogar um arquivo, escolher o que se quer, e receber resumo + flashcards + exercícios úteis — tudo rodando offline na máquina do usuário. O app é entregue funcionando.
- **Restrição:** 100% local e offline (IA via Ollama); plataforma desktop; sem prazo; o agente (Kiro) constrói e entrega pronto.

## Núcleo da primeira versão (MVP)

1. Importar um arquivo (começando por texto: `.txt`, `.md`, `.pdf`).
2. Resumo gerado por IA local, em dois modos: **curto/essencial** ou **longo/detalhado**.
3. Flashcards gerados a partir do conteúdo.
4. Listas de exercícios geradas a partir do conteúdo, em três modos: **teóricas**, **práticas** ou **mistas**.
5. Tudo processado localmente via Ollama, sem internet.

## Fora de escopo do MVP (roadmap — não descartado)

- Notebooks estilo OneNote (matérias divididas por cadernos)
- Mapas mentais estilo Obsidian
- Agenda de revisão / cronograma com datas
- Contagem regressiva para provas, com dicas do que estudar em cada dia
- Quizzes interativos
- Correção automática de exercícios
- Histórico que salva os resultados
- Exportação de planos de estudo
- Transcrição de áudio
- Ingestão de vídeo e imagem
- Multi-idioma
- Multi-agente (por arquivo ou por pasta)
- Monitoramento automático de pastas (atualização automática)
- Comparar e mesclar materiais; detectar falta de material
- Listas de exercícios por matéria ou de todas as matérias (mín. 5, máx. 100 exercícios)
- Aparência agradável e suporte a arquivos de qualquer tamanho (requisitos de qualidade a refinar na spec)

## Decisões registradas

- **Plataforma:** Desktop.
- **Conectividade:** Offline / local.
- **Motor de IA:** Modelo local via Ollama.
- **Entrega:** O agente entrega o app pronto; o usuário é iniciante e não vai codar junto.
- **Prazo:** Nenhum.
