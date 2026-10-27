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

### 2. `package.json` — scripts
O script `package` (empacotamento local sem publicação) foi mantido intacto.
Há também um script `release` com `--publish always`.

> Nota: a seção abaixo descreve o estado INICIAL. Ver "Atualização — CAMINHO 1"
> no fim do arquivo: no CI o electron-builder passou a ser chamado com
> `--publish never` e a Release é criada pelo workflow, não pelo builder.

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

---

## Atualização — CAMINHO 1: release única criada pelo workflow

**Problema observado em produção (duas vezes):** deixar o electron-builder
publicar a Release (`--publish always`) gerava RELEASES DUPLICADAS para a mesma
versão (uma com o `.exe.blockmap`, outra com o `.exe` + `latest.yml`), por conta
de criação em paralelo. Além disso, o electron-builder nomeava a Release pela
versão do `package.json` (0.1.0), IGNORANDO a tag do git — o que causava
divergência tag/versão (tag `v0.1.1` mas Release `0.1.0`).

**Correção (CAMINHO 1):** o electron-builder passa a apenas CONSTRUIR os
artefatos; quem cria a Release única e anexa os assets é o próprio workflow.

- `electron-builder` no CI: agora é chamado com `--publish never` (constrói o
  instalador NSIS e o `latest.yml` em `release/`, sem tocar no GitHub).
- O bloco `publish:` do `electron-builder.yml` foi MANTIDO: ele continua
  gerando o `latest.yml` e é lido pelo electron-updater em runtime.
- `.github/workflows/release.yml` reescrito: após o build, usa
  `softprops/action-gh-release@v2` para criar UMA Release (nome/tag = a tag do
  git que disparou o run) e anexar `release/*.exe`, `release/*.exe.blockmap` e
  `release/latest.yml`. `fail_on_unmatched_files: true` faz a build falhar se
  faltar o `latest.yml`. `setup-node` bumpado para Node 22 (LTS). `checkout@v4`,
  `setup-node@v4`, `action-gh-release@v2` fixados em major.
- `npm run package` (empacotamento local sem publicar) continua intacto.

## Processo de release correto (evita divergência tag/versão)

Siga esta ordem. **A tag do git DEVE ser igual à versão do `package.json`, e a
versão precisa ser bumpada ANTES de criar a tag.**

1. **Bump da versão** em `package.json` (ex.: `0.1.0` → `0.1.1`).
2. **Commit** da mudança de versão:
   ```powershell
   git add package.json
   git commit -m "chore: bump versao para 0.1.1"
   ```
3. **Criar a tag** que CASA com a versão do `package.json`:
   ```powershell
   git tag v0.1.1
   ```
4. **Push da master e depois da tag**:
   ```powershell
   git push origin master
   git push origin v0.1.1
   ```
5. O workflow dispara na tag `v*`, compila os artefatos com
   `--publish never` e cria **uma única** Release `v0.1.1` com o instalador,
   o `.blockmap` e o `latest.yml`. (Alternativa de disparo manual:
   Actions → release → "Run workflow".)

Checklist rápido antes de taggear:
- [ ] `package.json` tem a versão nova (ex.: `0.1.1`).
- [ ] O commit do bump está na master.
- [ ] A tag é exatamente `v` + a versão do `package.json` (`v0.1.1`).
