#!/usr/bin/env bash
# 同时把当前分支推送到 GitHub 与 Gitee（SSH 方式）。
#
# 用法：
#   ./scripts/push-both.sh                                  # 复用仓库里已配置的 github / gitee 远端
#   GITHUB_ID=xx GITEE_ID=yy ./scripts/push-both.sh         # 首次使用，按账号 ID 配置远端
#   ./scripts/push-both.sh --with-tags                      # 同时推送标签
#
# 也可以直接给完整地址：
#   GITHUB_REMOTE=git@github.com:you/repo.git \
#   GITEE_REMOTE=git@gitee.com:you/repo.git ./scripts/push-both.sh
#
# 注意：脚本不会创建远程仓库，请先在两个平台网页端创建仓库。

set -uo pipefail

REPO_NAME="${REPO_NAME:-life-voyage-3d}"
BRANCH="${BRANCH:-main}"
WITH_TAGS=0
[[ "${1:-}" == "--with-tags" ]] && WITH_TAGS=1

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "错误：当前目录不是 git 仓库，请先 git init" >&2
  exit 1
fi

# 远端地址优先级：显式环境变量 > 仓库里已配置的 remote > 由账号 ID 拼装。
# 两个远端都已配好时，无需再提供账号 ID。
resolve_remote() {
  local name="$1" id="$2" host="$3" explicit="$4" existing
  if [[ -n "$explicit" ]]; then echo "$explicit"; return; fi
  existing=$(git remote get-url "$name" 2>/dev/null || true)
  if [[ -n "$existing" ]]; then echo "$existing"; return; fi
  if [[ -n "$id" ]]; then echo "git@${host}:${id}/${REPO_NAME}.git"; return; fi
  echo ""
}

GITHUB_REMOTE=$(resolve_remote github "${GITHUB_ID:-}" github.com "${GITHUB_REMOTE:-}")
GITEE_REMOTE=$(resolve_remote gitee  "${GITEE_ID:-}" gitee.com  "${GITEE_REMOTE:-}")

if [[ -z "$GITHUB_REMOTE" || -z "$GITEE_REMOTE" ]]; then
  echo "错误：缺少远端地址。请提供 GITHUB_ID 与 GITEE_ID，或 GITHUB_REMOTE / GITEE_REMOTE。" >&2
  echo "示例：GITHUB_ID=octocat GITEE_ID=octocat ./scripts/push-both.sh" >&2
  exit 1
fi

set_remote() {
  local name="$1" url="$2"
  if git remote get-url "$name" >/dev/null 2>&1; then
    git remote set-url "$name" "$url"
  else
    git remote add "$name" "$url"
  fi
  echo "  $name -> $url"
}

echo "配置远端："
set_remote github "$GITHUB_REMOTE"
set_remote gitee  "$GITEE_REMOTE"

echo
echo "当前分支：$BRANCH"
echo "推送中……"
failed=0
for r in github gitee; do
  if git push -u "$r" "$BRANCH"; then
    echo "  ✓ $r 推送成功"
  else
    echo "  ✗ $r 推送失败（另一边仍会继续）" >&2
    failed=1
  fi
  if [[ "$WITH_TAGS" -eq 1 ]]; then
    git push "$r" --tags || { echo "  ✗ $r 标签推送失败" >&2; failed=1; }
  fi
done

echo
if [[ "$failed" -eq 0 ]]; then
  echo "全部完成：GitHub 与 Gitee 均已同步。"
else
  echo "有远端推送失败，请检查 SSH 公钥是否已添加到对应平台、仓库是否已创建、分支是否匹配。" >&2
fi
exit "$failed"
