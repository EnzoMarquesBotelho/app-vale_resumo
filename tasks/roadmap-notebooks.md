# Roadmap — Fatia: Cadernos (Notebooks) por matéria

> Primeira fatia pós-MVP. Fundação de organização que destrava funções futuras
> (agenda por matéria, provas por matéria, filtros). Spec base: `SPEC.md`.
> Decisões confirmadas com o usuário em 2026-10-15.

## Objetivo

Organizar os documentos em **cadernos** (um caderno por matéria), substituindo a
lista plana do Histórico por uma visão agrupada por caderno. Cada documento
pertence a exatamente um caderno.

## Decisões confirmadas

1. **Hierarquia:** um nível apenas — `Caderno → Documento`. (Sem seções/páginas
   estilo OneNote completo; pode evoluir depois se necessário.)
2. **Pertencimento:** um documento pertence a **um único** caderno.
3. **Caderno automático por pasta de origem:** ao importar um arquivo, o caderno
   sugerido é o **nome da pasta-mãe** do arquivo no disco.
   - Ex.: `...\Facul\Cálculo\aula1.pdf` → caderno **"Cálculo"**.
   - Arquivo "solto" (sem pasta de matéria clara, ex.: direto na Área de
     Trabalho) → caderno **"Geral"** (fallback).
4. **Confirmar/editar na importação:** a sugestão de caderno é **editável** no
   momento de importar — o usuário pode confirmar a sugestão, escolher outro
   caderno existente, ou digitar um novo nome. (Motivo: a pasta-mãe nem sempre é
   o nome da matéria — ex.: subpastas como `_extracted_text`.)
5. **Documentos pré-existentes:** os documentos já salvos no histórico (lista
   plana atual) vão para o caderno **"Geral"** na migração, salvo os que já
   tiverem uma pasta de origem registrável (regra: se o doc tem caminho de
   origem com pasta-mãe, usar esse nome; senão, "Geral"). Nada se perde.

## Impacto na arquitetura (orientação, não prescrição)

- **Persistência:** hoje os documentos são JSON por documento em
  `userData/documentos`. Adicionar o conceito de caderno: cada documento ganha
  um campo de caderno (id ou nome normalizado); e/ou um índice de cadernos.
  Migração dos documentos existentes para "Geral" (ou pela pasta de origem) na
  primeira execução, sem perder dados.
- **Origem do arquivo:** passar a registrar o caminho/origem do arquivo
  importado para derivar a pasta-mãe (hoje `ArquivoImportado` tem só `nome`).
- **UI:** o Histórico vira uma visão por cadernos (lista de cadernos → ao abrir
  um caderno, seus documentos). Importação ganha um campo de caderno editável
  com a sugestão pré-preenchida.

## Fora de escopo desta fatia (continua roadmap)

Seções/páginas, mover documentos entre cadernos em lote, mapas mentais, agenda,
provas, quizzes, exportação, OCR, áudio/vídeo, multi-idioma, etc.
