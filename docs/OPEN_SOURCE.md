# 开源发布指南：同步到 Gitee 与 GitHub

> 适用对象：`life-voyage-3d/`（「生命奇旅」）。
> 本文记录**已完成的本地准备**与**需要账号持有人本人完成的平台侧步骤**。
> 更新日期：2026-11-09。平台配额与政策可能调整，发布前请以官网最新说明为准。

---

## 0. 现状盘点（实测）

| 项 | 实测结果 | 开源前结论 |
|---|---|---|
| `life-voyage-3d/.git` | **不存在** | 需 `git init` |
| `LICENSE` / `ATTRIBUTION.md` / `.gitignore` / `.gitattributes` | 原本全部缺失 | 已补齐 |
| `git config --global user.name` | 未设置（`user.email` 已设为 `2629494904@qq.com`） | 首次提交需指定署名 |
| `node_modules/` | 111 MB | 必须排除 |
| `dist/` | 113 MB（含复制的模型） | 必须排除 |
| `public/models/atlas-src/` | **90 MB**，Z-Anatomy 上游原始 `.bin` / `.gz` | 必须排除（体积 + 第三方资产再分发） |
| `tools/tmp/` | 21 MB，上游 GLB / STL / `FMA.csv` 中间文件 | 必须排除 |
| 成品 GLB × 5 | 合计 **20.67 MiB**，最大单文件 7.87 MB | 保留，两个平台都能直接托管 |
| 排除后仓库体积 | **约 23 MB** | 健康，无需 Git LFS |
| 敏感文件（`.env` / token / `.pem`） | 未发现 | 通过 |
| `gh` / `glab` / `gitee` CLI | 均未安装 | 用原生 `git` + SSH 即可 |
| `git-lfs` | 已安装（本方案不需要） | — |
| `~/.ssh/id_ed25519.pub` | 已存在 | 同一把公钥可同时添加到两个平台 |

**平台配额参考**：GitHub 单文件硬上限 100 MiB（超过 50 MiB 会警告），建议仓库 < 1 GB，
>100 MiB 需 Git LFS；Gitee 免费版常见配额约单仓库 500 MB、单文件 50 MB
（企业版免费档口径，个人版以官网为准）。本项目最大单文件 7.87 MB、总量约 23 MB，
**两边都不触及限制，不需要 LFS**。

---

## 1. 已完成：本地开源准备

下列文件已创建／更新，可直接提交：

| 文件 | 作用 |
|---|---|
| `.gitignore` | 排除 `node_modules/`、`dist/`、`atlas-src/`、`tools/tmp/`、密钥与日志 |
| `.gitattributes` | 把 GLB / PNG / woff 等标为二进制，禁止换行转换 |
| `LICENSE` | 原创代码 MIT；开头明确**不覆盖**第三方模型资产 |
| `ATTRIBUTION.md` | 逐条照抄 `docs/RESEARCH.md` §4 署名（不得删改）+ 资产许可表 + 范围说明 |
| `CONTRIBUTING.md` | 开发环境、自检清单、PR 规范 |
| `README.md` | 修正功能数字与过期索引，新增「开源与许可」章节 |
| `scripts/push-both.sh` | 双远端一键推送模板 |
| `scripts/publish.sh` | **一键发布**：校验 SSH、设置署名、首次提交、改 `main`、配置双远端并推送 |
| `scripts/publish.cmd` | Windows 双击入口（纯 ASCII + CRLF，已实测） |
| `docs/OPEN_SOURCE.md` | 本指南 |

### 许可策略（关键）

项目**不能**整体标成一个 MIT 许可证：人体模型来自 Z-Anatomy / BodyParts3D，
采用 **CC BY-SA**（署名—相同方式共享），具有传染性义务。正确做法是分层声明：

| 客体 | 许可 | 位置 |
|---|---|---|
| 原创 TS/CSS、脚本、构建配置、原创文档 | MIT | `LICENSE` |
| `public/models/*.glb` | CC BY-SA 4.0 / 2.1（依来源） | `ATTRIBUTION.md` |
| `public/draco/` | 依其发行许可 | `ATTRIBUTION.md` |
| npm 依赖 | 各自许可，不随仓库分发 | `package.json` |
| 医学文案 | 科普内容，不构成医疗建议 | 应用内「关于」+ `ATTRIBUTION.md` |

`LICENSE` 开头的 **Scope** 段落已明确 MIT 只覆盖原创代码；
`ATTRIBUTION.md` 逐条保留了项目章程要求「照抄、不得删改」的四条署名。
发布前请再核对三处一致：`ATTRIBUTION.md`、`docs/RESEARCH.md` §4、应用内「关于」弹窗。

> ⚠️ 待复核：BodyParts3D 官方标注 **CC BY-SA 2.1**，下游 `ashemag/human-atlas` 标注 **CC BY 4.0**，
> 两种表述并存。正式公开发布（尤其涉及商用）前请到
> [官方站点](https://lifesciencedb.jp/bp3d/?lng=en) 确认，并在 `ATTRIBUTION.md` 中统一。

---

## 2. 需要你本人完成的：账号与认证

创建远程仓库、添加公钥、生成令牌都涉及你的账号凭据，必须本人操作。

### 2.1 准备 SSH 公钥（推荐，两边通用）

本机已有 `~/.ssh/id_ed25519.pub`。查看内容：

```bash
cat ~/.ssh/id_ed25519.pub
```

- **GitHub**：头像 → Settings → SSH and GPG keys → New SSH key → 粘贴公钥。
- **Gitee**：头像 → 设置 → SSH 公钥 → 添加公钥 → 粘贴同一份公钥。

验证（首次会询问是否信任主机，输入 `yes`）：

```bash
ssh -T git@github.com     # 成功会显示 Hi <你的ID>! You've successfully authenticated...
ssh -T git@gitee.com      # 成功会显示 Hi <你的名字>! You've successfully authenticated...
```

> 若更习惯 HTTPS：GitHub 自 2021 年起**不再接受账号密码**，推送时须用
> Personal Access Token 代替密码（Settings → Developer settings →
> Personal access tokens → 勾选 `repo`）。Gitee 同理可用私人令牌。
> 两个平台都推荐 SSH，省去令牌过期维护。

### 2.2 在网页端创建两个空仓库

两边建议**同名**：`life-voyage-3d`，可见性选 Public。

| 平台 | 入口 | 注意 |
|---|---|---|
| GitHub | 右上角 `+` → New repository | **不要**勾选 "Add a README" / license / .gitignore，本地已有，勾了会导致首次推送冲突 |
| Gitee | 右上角 `+` → 新建仓库 | 同样**不要**初始化仓库；开源许可证可稍后在仓库设置里选，或直接用本地 `LICENSE` |

创建后复制各自的 **SSH** 地址，形如：

```
git@github.com:<你的ID>/life-voyage-3d.git
git@gitee.com:<你的ID>/life-voyage-3d.git
```

> Gitee 公开仓库可能需要完成实名认证后才能推送，若提示请先到账号设置完成。

### 2.3 最短路径：一键脚本（推荐，替代 §3–§4 的手工命令）

`scripts/publish.sh` 会自动完成：绕开中文用户名的 SSH 路径问题 → 校验两平台认证 →
设置仓库级署名 → 首次提交 → 把分支改为 `main` → 配置 `github`/`gitee` 双远端 → 依次推送。

Windows 上任选一种启动方式：

- **双击** `scripts\publish.cmd`；
- 或在 `life-voyage-3d` 文件夹内右键 → **Git Bash Here**，粘贴：

  ```bash
  ./scripts/publish.sh
  ```

脚本依次询问 4 个值：GitHub 用户名、Gitee 用户名、提交显示名、提交邮箱。
也可以一次给全、不交互：

```bash
GITHUB_ID=xx GITEE_ID=yy COMMIT_NAME="名字" COMMIT_EMAIL="xx@users.noreply.github.com" ./scripts/publish.sh
```

**若公钥尚未添加**，脚本会打印公钥全文与两个添加页面地址后**安全退出**，
不提交、不配置远端；加完公钥重跑即可。认证通过时会看到
`✓ github.com 认证通过` / `✓ gitee.com 认证通过`，随后自动完成提交与双推，
最后打印两个仓库 URL。

> 本机实测（2026-11-09）：中文用户名 `C:\Users\语` 会让 `ssh` 默认读取 `~/.ssh` 时
> 报 `Could not create directory '/c/Users/\323\357/.ssh'`。脚本用显式
> `-i <Windows 密钥路径>` 加纯 ASCII 的 `UserKnownHostsFile`（`/c/Temp/lv-git-known_hosts`）
> 绕开；`.gitattributes` 另把 `*.cmd` 锁定为 CRLF，否则 cmd.exe 会把批处理解析成乱码。

---

## 3. 本地初始化与首次提交（手工版）

> 使用 §2.3 一键脚本时，本节与 §4 已自动完成，以下内容仅供理解与排错。

若本地尚未提交过（当前状态），在项目根目录执行：

```bash
cd "C:/Users/语/Desktop/生物信息学/life-voyage-3d"

git init
git config user.name  "你的名字或昵称"       # 全局未设置 name，这里设仓库级
git config user.email "你的邮箱"

git add .
git status --short                          # 复核：不应出现 node_modules / dist / atlas-src / tmp
git commit -m "Initial commit: LifeVoyage 3D anatomy explorer (v9.9)"
git branch -M main
```

> **隐私提示**：公开仓库的提交历史会永久暴露 `user.email`。若不想公开常用邮箱，
> 建议用 GitHub 提供的 `no-reply` 地址（Settings → Emails → Keep my email addresses private，
> 形如 `12345678+你的ID@users.noreply.github.com`），或统一用一个公开邮箱。
> 提交前用 `git config user.email` 确认；已提交可 `git commit --amend --reset-author` 修正。
> 本机全局 `user.email` 当前是私人邮箱，**不要直接用它提交公开仓库**。

> **换行提示**：`.gitattributes` 已把所有文本文件锁定为 LF（`* text=auto eol=lf`），
> 并覆盖 Windows 全局 `core.autocrlf=true`，保证 `scripts/push-both.sh` 在
> Linux / macOS 上可直接执行；二进制资产用 `-text` 排除转换。

**提交前务必复核** `git status --short` 里没有这些路径。可用下面的命令确认将被纳入的文件总量：

```bash
git ls-files | wc -l
git count-objects -vH      # 暂存后查看 size-pack
```

如果误把大文件加进去了（`git add` 之后、commit 之前）：

```bash
git rm --cached -r node_modules dist public/models/atlas-src tools/tmp
```

若**已经 commit** 才被发现，需要改写历史（`git filter-repo` 或重新 `init`），
所以务必在第一次 commit 前检查。

---

## 4. 配置双远端并首次推送

### 方式 A：一键脚本（推荐）

```bash
GITHUB_ID=你的GitHubID GITEE_ID=你的GiteeID ./scripts/push-both.sh
```

脚本会设置 `github` 与 `gitee` 两个 remote，并把 `main` 依次推送；
某个平台失败不会阻断另一个。加 `--with-tags` 可同时推送标签。

### 方式 B：手工命令

```bash
git remote add github git@github.com:<你的ID>/life-voyage-3d.git
git remote add gitee  git@gitee.com:<你的ID>/life-voyage-3d.git

git push -u github main
git push -u gitee  main
```

> 注意：`origin` 没有强制要求。这里用两个具名 remote，避免「谁是主仓库」的歧义；
> 后续每次推送都要推两次（或用脚本）。

### 日常同步

```bash
git add . && git commit -m "fix: ..."
GITHUB_ID=xx GITEE_ID=yy ./scripts/push-both.sh
```

打版本标签时：

```bash
git tag -a v9.9.0 -m "v9.9 聚焦态修复"
GITHUB_ID=xx GITEE_ID=yy ./scripts/push-both.sh --with-tags
```

### 可选的自动镜像

若希望只推一处、另一处自动跟随，可用 GitHub Actions
（如在 `main` 推送后用 `mirror` action 同步到 Gitee，需把 Gitee 私钥存为 Secret）
或 Gitee 的「仓库镜像」功能。初次发布建议**先手工双推**，确认无误后再考虑自动化。

---

## 5. 发布后检查清单

- [ ] 两个仓库都能看到 `README.md`、`LICENSE`、`ATTRIBUTION.md`、`CONTRIBUTING.md`
- [ ] GitHub 右侧自动识别出 MIT 许可证（若因 Scope 段落未识别，可在仓库设置里手动指定）
- [ ] 仓库 Settings → 填写描述、官网、Topics（如 `threejs` `webgl` `anatomy` `education` `typescript`）
- [ ] `git clone` 到新目录后 `npm install && npm run dev` 能正常启动（验证 5 个 GLB 都在）
- [ ] 确认仓库里**没有** `node_modules/`、`dist/`、`atlas-src/`、`tools/tmp/`
- [ ] 确认没有 `.env`、令牌、私钥等敏感内容（可用 `git log --all -- .env` 复查）
- [ ] 「关于」弹窗与 `ATTRIBUTION.md` 署名一致，免责声明可见
- [ ] 在两边各建一个 Release（可附上 `dist/` 的 zip 或演示截图）
- [ ] 可选：用 GitHub Pages / Gitee Pages 托管 `dist/` 做在线 Demo；
      注意 Gitee Pages 对公开静态页有内容与实名要求，发布前看其最新说明
- [ ] 若在意国内访问速度，README 里把 Gitee 链接放前面，GitHub 链接作为镜像

---

## 6. 常见坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 推送后仓库几百 MB | 忘加 `.gitignore` 就 `git add .` | commit 前 `git rm --cached -r ...`；已提交需 `git filter-repo` 或重新 init |
| `Support for password authentication was removed` | GitHub 不再接受密码 | 换 SSH，或用 PAT 当密码 |
| `remote origin already exists` / 地址写错 | 重复 add | `git remote set-url github <新地址>` |
| `src refspec main does not match any` | 还没 commit，或本地是 `master` | 先 commit，再 `git branch -M main` |
| 首次推送被拒（`non-fast-forward`） | 网页端建仓时勾了 README/LICENSE | `git pull github main --allow-unrelated-histories --rebase` 后再推；或删掉远程空仓库重建 |
| 大文件被 GitHub 拒绝 | 单文件 >100 MiB | 本项目不需要；真需要时 `git lfs track` 并**提交 `.gitattributes`** |
| Gitee 推送提示需实名 | 平台合规要求 | 到账号设置完成实名认证 |
| 模型在别人机器上加载失败 | GLB 被 `.gitattributes` 错误地做了换行转换 | 已把 `*.glb` 标为 `-text`，克隆后校验文件大小与本地一致 |
| 许可证显示不正确 | `LICENSE` 顶部有 Scope 说明，平台自动识别可能失败 | 内容合法有效，可在仓库设置里手动选 MIT |

---

## 7. 一句话流程

**补齐合规文件 → `git init` → 检查暂存清单 → 首次 commit → 两平台建空仓 + 添 SSH 公钥
→ `scripts/push-both.sh` → 按清单验收。**

其中只有「建仓 + 添公钥 + 填自己的账号 ID」必须本人操作，其余均可自动化完成。
