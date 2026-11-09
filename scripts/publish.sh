#!/usr/bin/env bash
# 一键完成本地提交 + 双远端推送（GitHub + Gitee）。
#
# 前置条件（只需做一次）：
#   1. 已把 ~/.ssh/id_ed25519.pub 添加到 GitHub 与 Gitee 账号
#   2. 已在两个平台各创建一个「空」仓库，同名 life-voyage-3d，Public
#
# 用法（Git Bash 中，在本项目根目录）：
#   ./scripts/publish.sh
# 或一次性给全参数，无需交互：
#   GITHUB_ID=xxx GITEE_ID=yyy COMMIT_NAME="名字" COMMIT_EMAIL="xxx@users.noreply.github.com" ./scripts/publish.sh
#
# 脚本不会创建远程仓库、不会上传凭据、不会改写已有提交历史。

set -uo pipefail

cd "$(dirname "$0")/.." || { echo "无法进入项目根目录" >&2; exit 1; }
REPO_NAME="${REPO_NAME:-life-voyage-3d}"
BRANCH="${BRANCH:-main}"

echo "=========================================================="
echo " 生命奇旅 · 发布到 GitHub + Gitee"
echo "=========================================================="
echo

# ---------- 1. 定位 SSH 密钥 ----------
KEY_PATH="$HOME/.ssh/id_ed25519"
PUB_PATH="$HOME/.ssh/id_ed25519.pub"
if [[ ! -f "$KEY_PATH" || ! -f "$PUB_PATH" ]]; then
  echo "错误：未找到 $KEY_PATH" >&2
  echo "请先生成：ssh-keygen -t ed25519 -C \"your_email\"" >&2
  exit 1
fi

# Windows 中文用户名会让 ssh 默认读取 ~/.ssh 时出现编码错误，
# 因此显式给出密钥路径与一个纯 ASCII 的 known_hosts 文件。
KEY_ARG="$KEY_PATH"
command -v cygpath >/dev/null 2>&1 && KEY_ARG=$(cygpath -w "$KEY_PATH")
KNOWN_HOSTS="/c/Temp/lv-git-known_hosts"
mkdir -p /c/Temp 2>/dev/null || true
SSH_OPTS="-i \"$KEY_ARG\" -o IdentitiesOnly=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o StrictHostKeyChecking=accept-new"
export GIT_SSH_COMMAND="ssh $SSH_OPTS"

# ---------- 2. 收集账号信息 ----------
read_var() {
  local var="$1" prompt="$2" default="$3" val
  val="${!var:-}"
  if [[ -z "$val" ]]; then
    if [[ -n "$default" ]]; then read -r -p "$prompt [默认 $default]: " val; else read -r -p "$prompt: " val; fi
    val="${val:-$default}"
  fi
  printf -v "$var" '%s' "$val"
}
read_var GITHUB_ID    "GitHub 用户名（github.com/后面那段）" ""
read_var GITEE_ID     "Gitee 用户名" ""
read_var COMMIT_NAME  "提交显示名" "LifeVoyage"
read_var COMMIT_EMAIL "提交邮箱（建议 no-reply，勿用私人邮箱）" "${GITHUB_ID}@users.noreply.github.com"

if [[ -z "$GITHUB_ID" || -z "$GITEE_ID" ]]; then
  echo "错误：GitHub / Gitee 用户名不能为空。" >&2
  exit 1
fi
echo
echo "  GitHub 仓库 : git@github.com:${GITHUB_ID}/${REPO_NAME}.git"
echo "  Gitee  仓库 : git@gitee.com:${GITEE_ID}/${REPO_NAME}.git"
echo "  提交署名    : ${COMMIT_NAME} <${COMMIT_EMAIL}>"
echo

# ---------- 3. 验证两个平台的 SSH 认证 ----------
check_ssh() {
  local host="$1" out
  out=$(ssh -T -i "$KEY_ARG" -o IdentitiesOnly=yes \
        -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=accept-new \
        -o BatchMode=yes -o ConnectTimeout=12 "git@$host" 2>&1)
  if echo "$out" | grep -qi "successfully authenticated"; then return 0; fi
  echo "$out" | head -3 >&2
  return 1
}

echo "检查 SSH 认证……"
ssh_ok=1
for h in github.com gitee.com; do
  if check_ssh "$h"; then echo "  ✓ $h 认证通过"; else echo "  ✗ $h 认证未通过" >&2; ssh_ok=0; fi
done

if [[ "$ssh_ok" -eq 0 ]]; then
  echo
  echo "----------------------------------------------------------"
  echo "请先把下面这整行公钥添加到对应平台（两个平台都加同一份）："
  echo
  cat "$PUB_PATH"
  echo
  echo "  GitHub : https://github.com/settings/keys   → New SSH key"
  echo "  Gitee  : https://gitee.com/profile/sshkeys  → 添加公钥"
  echo
  echo "添加后重新运行本脚本即可。若提示需要实名认证，请先在 Gitee 账号设置完成。"
  echo "----------------------------------------------------------"
  exit 1
fi

# ---------- 4. 本地提交 ----------
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "错误：当前目录不是 git 仓库，请先 git init" >&2
  exit 1
fi
git config user.name  "$COMMIT_NAME"
git config user.email "$COMMIT_EMAIL"

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo
  echo "创建首次提交……"
  git add .
  echo "  暂存文件 $(git ls-files | wc -l) 个"
  if git ls-files | grep -qE '^(node_modules|dist|public/models/atlas-src|tools/tmp)/'; then
    echo "  警告：暂存区包含应排除的大目录，请检查 .gitignore" >&2
  fi
  git commit -m "Initial commit: LifeVoyage 3D anatomy explorer (v9.9)" || { echo "提交失败" >&2; exit 1; }
else
  echo
  echo "已有提交 $(git rev-list --count HEAD) 个，跳过首次提交。"
fi
git branch -M "$BRANCH"

# ---------- 5. 双远端推送 ----------
echo
GITHUB_REMOTE="git@github.com:${GITHUB_ID}/${REPO_NAME}.git" \
GITEE_REMOTE="git@gitee.com:${GITEE_ID}/${REPO_NAME}.git" \
GITHUB_ID="$GITHUB_ID" GITEE_ID="$GITEE_ID" BRANCH="$BRANCH" \
  ./scripts/push-both.sh
rc=$?

echo
echo "=========================================================="
echo "  https://github.com/${GITHUB_ID}/${REPO_NAME}"
echo "  https://gitee.com/${GITEE_ID}/${REPO_NAME}"
echo "=========================================================="
exit "$rc"
