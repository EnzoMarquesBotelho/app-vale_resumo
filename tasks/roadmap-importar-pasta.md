# Roadmap — Fatia: Importar pasta (lote, recursivo)

> Fatia pós-MVP. Estende a importação para aceitar PASTAS, não só arquivos.
> Base: cadernos e importação de arquivo único já implementados.
> Decisões confirmadas com o usuário em 2026-10-15.

## Objetivo

Permitir escolher uma **pasta** e importar, de uma vez, todos os arquivos
suportados (.txt/.md/.pdf) dela e de suas subpastas, cada arquivo virando um
documento no caderno correto. A geração de IA (resumo/flashcards/mapa/exercícios)
continua sob demanda, por documento — nada é gerado automaticamente no lote.

## Decisões confirmadas

1. **Entrada:** além de "escolher arquivo", um novo "escolher pasta". A UI de
   importação passa a ter as duas opções.
2. **Varredura recursiva:** varre a pasta escolhida E suas subpastas (motivo:
   matérias têm subpastas tipo Teórica/Prática).
3. **Caderno composto por caminho relativo à pasta escolhida:** o caderno de
   cada arquivo é o caminho de subpastas, relativo à pasta escolhida, juntado
   com " — ".
   - Escolheu `...\Facul` → `Facul\Cálculo\Teórica\x.pdf` → caderno
     **"Cálculo — Teórica"**.
   - Escolheu `...\Facul\Cálculo` → `Cálculo\Teórica\x.pdf` → caderno
     **"Teórica"** (relativo à pasta escolhida).
   - Arquivo direto na pasta escolhida (sem subpasta) → caderno = **nome da
     pasta escolhida**.
   - Normalização de nome de caderno reusa a lógica já existente em
     `src/shared/notebooks.ts` (sem acentos/slug para o id, nome de exibição
     preservado). O separador de exibição é " — ".
4. **Só arquivos suportados:** .txt/.md/.pdf. Outros formatos são ignorados
   (não geram erro, apenas não entram). PDFs sem texto extraível entram como
   documento com aviso "sem texto extraível", como já acontece hoje.
5. **Importa só o TEXTO em lote.** Nenhuma geração de IA automática. O usuário
   gera artefatos sob demanda, por documento, depois.
6. **Feedback de lote:** mostrar progresso/resumo da importação (ex.: "X
   arquivos importados em N cadernos; Y ignorados por formato"). Não travar a UI.

## Fora de escopo desta fatia (roadmap)

- **Geração em lote** (gerar resumo/flashcards/etc. para a pasta inteira de uma
  vez) — fatia futura.
- Monitoramento automático de pasta (re-importar quando a pasta muda) — já é
  item do roadmap original.
- Deduplicação sofisticada / re-importar atualizando documento existente.
  (Comportamento desta fatia para re-importação: o design decide uma regra
  simples e segura — ver abaixo.)

## Pontos para o design decidir (regra simples e segura)

- **Re-importação:** se um arquivo já foi importado antes (mesmo caminho de
  origem), o design decide uma regra simples: pular (não duplicar) OU criar um
  novo documento. Preferência: evitar duplicatas silenciosas; recomendar pular
  os de mesmo `caminhoOrigem` já existente, mas documentar a decisão.
- **Limites:** teto de tamanho por arquivo (já existe, 50 MB) continua valendo
  por arquivo; considerar um teto de quantidade de arquivos por lote para não
  travar (ex.: avisar/parar com segurança se exceder um número alto).
- **Guarda contra pastas enormes/profundas:** profundidade e contagem razoáveis.

## Orientação técnica (o design refina)

- **Main:** novo handler IPC (ex.: `importarPasta`) usando
  `dialog.showOpenDialog({ properties: ["openDirectory"] })`; varredura recursiva
  no processo main (fs), filtrando por extensão suportada; para cada arquivo,
  derivar o caderno pelo caminho relativo à pasta escolhida e reutilizar a
  extração de texto de `files.ts`; criar os documentos via a camada de storage,
  reusando a derivação/normalização de caderno de `notebooks.ts`.
- **Shared/IPC/preload:** novo método na AppApi + canal; tipo de resultado do
  lote (contagens, lista de cadernos criados, ignorados).
- **Renderer:** `Importar.tsx` ganha o botão "Importar pasta"; exibir o resultado
  do lote de forma clara (pt-BR). Chamadas só via `getApi()`.
- **Somente leitura** sobre a pasta escolhida (nunca escrever/mover/apagar nada).
- **Testes:** derivação de caderno a partir de caminho relativo (raiz, 1 nível,
  vários níveis, nomes com acento/espaço, colisão entre matérias resolvida pelo
  composto); varredura recursiva filtrando extensões (com fixtures em tests/,
  tmpdir — NUNCA a pasta Facul real); regra de re-importação; round-trip de
  persistência de vários documentos em cadernos diferentes.
