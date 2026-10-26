# Worklog — Publicação de releases no GitHub via Actions

Configuração (infra/CI only) para permitir publicar o instalador Windows no
GitHub Releases ao enviar uma tag de versão. Base para o futuro auto-updater
(electron-updater), que lê o mesmo bloco `publish` e o manifesto `latest.yml`.

## O que foi alterado

### 1. `electron-builder.yml` — bloco `publish`
Adicionado ao final, sem mexer no restante:

```yaml
publish:
  - provider: github
    owner: EnzoMarquesBotelho
    repo: app-vale_resumo
```

Esse bloco:
- permite ao electron-builder enviar os artefatos ao Release da tag quando
  chamado com `--publish always`;
- faz o builder gerar o `latest.yml` (manifesto de update) que o
  electron-updater usará depois para detectar novas versões.

### 2. `package.json` — novo script `release`
O script `package` (empacotamento local sem publicação) foi mantido intacto.
Foi adicionado um script dedicado para o CI:

```json
"release": "electron-vite build && electron-builder --win --publish always --config electron-builder.yml"
```

O workflow chama o electron-builder diretamente (`npx electron-builder --win
--publish always --config electron-builder.yml`), mas o script `release` fica
disponível para uso manual equivalente.

### 3. `.github/workflows/release.yml` — workflow de CI
- Dispara em: push de tag `v*` e também `workflow_dispatch` (execução manual
  pela UI do GitHub).
- Roda em `windows-latest`.
- `permissions: contents: write` (necessário para criar/atualizar o Release).
- Passos: checkout (`actions/checkout@v4`) → setup Node 20
  (`actions/setup-node@v4`, cache npm) → `npm ci` → `npm run build` →
  `npx electron-builder --win --publish always --config electron-builder.yml`.
- `GH_TOKEN` recebe `${{ secrets.GITHUB_TOKEN }}` (token fornecido pelo próprio
  Actions; não há token pessoal na máquina do usuário).

## Comandos que o usuário vai rodar

### (a) Adicionar o remote e enviar a master pela primeira vez
```powershell
git remote add origin https://github.com/EnzoMarquesBotelho/app-vale_resumo.git
git push -u origin master
```

### (b) Cortar o primeiro release (tag v0.1.0)
```powershell
git tag v0.1.0
git push origin v0.1.0
```
Ao receber a tag `v*`, o workflow `release` compila o instalador e publica o
Release automaticamente. (Alternativa: disparar manualmente em
Actions → release → "Run workflow".)

## Verificação local (sem push)

- `npm run build` — OK (limpo).
- `npm run lint` — OK (0 problemas).
- `npm test` — 476 testes passando (41 arquivos).
- YAML (`release.yml` e `electron-builder.yml`) — parse válido (js-yaml), sem
  tabs.
- `electron-builder --publish` NÃO foi executado localmente (sem token e para
  não criar releases a partir daqui), conforme instruído.

## Observações
- Remote não foi adicionado e nenhuma tag foi criada: isso é feito pelo usuário.
- Nenhuma alteração em `src/`, testes ou lógica de negócio.
