# Roadmap — Fatia: Botão de atualização (auto-update via GitHub)

> Fatia pós-MVP. Verificação e instalação de atualizações do app a partir das
> releases públicas do GitHub, usando electron-updater. Base: deploy no GitHub
> já concluído (release pública `v0.1.1` com `latest.yml`).
> Decisões confirmadas com o usuário em 2026-10-26.

## Objetivo

O app verifica se há versão mais nova publicada no GitHub, baixa e instala
(reiniciando na versão nova), de forma amigável e não-intrusiva.

## Decisões confirmadas

1. **Verificação: automática ao abrir + botão manual.**
   - Ao iniciar, checa em segundo plano (discreto); se houver nova versão, avisa
     sem incomodar (ex.: um aviso/badge "nova versão disponível").
   - Também há um botão "Verificar atualizações" para o usuário forçar a checagem
     quando quiser.
   - A checagem só AVISA; baixar/instalar é decisão do usuário (nunca força).
2. **Fluxo: download automático + reiniciar para instalar (Opção A).**
   - Ao optar por atualizar, o app baixa a nova versão em segundo plano com
     **barra de progresso**.
   - Quando o download termina, oferece **"Reiniciar para atualizar"**; ao
     clicar, o app fecha e reabre já na versão nova (quitAndInstall).
3. **Motor: `electron-updater`** (dependência nova), lendo o bloco `publish`
   (github, owner/repo) do `electron-builder.yml` e o `latest.yml` das releases.

## Restrições e realidade técnica

- **Auto-update só funciona no app INSTALADO** (via instalador NSIS), NÃO em
  `npm run dev` nem no `win-unpacked`. electron-updater exige o app empacotado e
  assinado pelo fluxo do electron-builder. Portanto:
  - Em dev, o código deve DEGRADAR com elegância: detectar que não é um app
    empacotado (`app.isPackaged === false`) e NÃO tentar atualizar — mostrar um
    estado neutro (ex.: "atualizações disponíveis apenas no app instalado") em
    vez de erro.
  - A verificação manual de ponta a ponta (baixar+reiniciar) só é possível com
    duas versões instaláveis (instalar `v0.1.1`, publicar `v0.1.2`, ver o
    update). Isso fica como verificação manual do usuário.
- Sem assinatura de código (o app não é assinado): no Windows o NSIS updater
  funciona sem assinatura, mas pode haver aviso do SmartScreen na 1ª execução —
  fora do escopo resolver isso (exigiria certificado).
- 100% sobre as releases do próprio GitHub; nenhuma outra rede.

## Regras para o design decidir (simples e seguras)

- **Onde roda:** o electron-updater roda no processo MAIN (usa `autoUpdater` de
  `electron-updater`). O renderer recebe eventos por IPC (checando, disponível,
  progresso %, baixado, erro) e dispara ações (verificar, baixar, reiniciar).
- **Estados da UI:** ocioso / verificando / atualização disponível (versão X) /
  baixando (progresso %) / pronto para reiniciar / erro / "em dev (indisponível)".
  Mapear os eventos do autoUpdater (`checking-for-update`, `update-available`,
  `update-not-available`, `download-progress`, `update-downloaded`, `error`).
- **autoDownload:** desligar o download automático (`autoUpdater.autoDownload =
  false`) para respeitar a decisão 1 (checar só avisa; o download começa quando
  o usuário aceita). O `quitAndInstall` só no clique de "Reiniciar".
- **Verificação ao abrir:** só quando `app.isPackaged`; nunca em dev. Falha de
  rede na checagem é silenciosa (não incomodar o usuário que abriu offline).
- **Onde o controle aparece na UI:** definir um lugar natural no novo shell
  (sidebar/rodapé ou uma seção de "Sobre/Atualizações"). Discreto quando não há
  update; visível quando há.

## Fora de escopo desta fatia (roadmap)

- Assinatura de código / resolver SmartScreen.
- Canais de update (beta/stable), rollback de versão.
- Notas de versão (changelog) exibidas no app — pode ser um extra simples se
  trivial (ler o corpo da release), senão roadmap.

## Orientação técnica (o design refina)

- **Dependência:** adicionar `electron-updater` (fixar versão). É dep de runtime
  do main (não devDep). Confirmar que empacota certo com o electron-vite/builder.
- **Main:** módulo de update (ex.: `src/main/services/updater.ts`) configurando
  o `autoUpdater` (autoDownload=false, feed via publish config), com funções
  verificar/baixar/reiniciar e emissão de eventos ao renderer. Guardar atrás de
  `app.isPackaged`. Handlers IPC + canais em `ipc.ts`/`preload.ts`. Enviar
  eventos main→renderer (padrão de push já usado pelo tema — `webContents.send`).
- **Renderer:** um componente de status de atualização (ex.: no shell/sidebar)
  com os estados acima, barra de progresso no download e botões Verificar /
  Baixar / Reiniciar. Chamadas só via `getApi()`.
- **Testes:** a lógica testável (mapeamento de eventos→estado; comparação de
  versão se houver parte pura; o guard de `isPackaged`) com o autoUpdater
  mockado. O fluxo real de download/instalação é verificação manual (precisa de
  app empacotado + 2 versões). NÃO depender da pasta Facul nem de rede real nos
  testes. Preservar os 476 testes. Textos pt-BR; identificadores em inglês.
