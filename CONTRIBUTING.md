# 贡献指南

感谢你愿意改进「生命奇旅」。这是一个面向公众的**健康教育科普**项目，
准确性和可读性优先于功能数量。

## 本地开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc --noEmit && vite build
npm run check:glb  # 检查模型资产
```

Node.js ≥ 20，无需后端与数据库，构建产物为纯静态 `dist/`。

## 提交前自检

- `npm run build` 通过（类型检查为 strict，含 `noUnusedLocals`）。
- 浏览器实测：桌面与 390×844 窄屏各走一遍选中器官、图层开关、透视、剖切。
- 不改动 `public/models/` 下的成品 GLB，除非明确说明来源与许可。
- 不改动 `ATTRIBUTION.md`、`docs/RESEARCH.md` §4 与应用内「关于」弹窗的署名文案。
- 新增或修改医学文案时，数字型事实必须在 `src/data/organs.json` 中带 `reference` 字段，
  且只讲生活方式与科普，不提供诊断、用药或治疗建议。
- 涉及状态或可见性逻辑时，优先修改 `src/systems/visibility.ts` 中的纯函数，
  不要在 `main.ts` 里加静默覆盖；并同步更新 `life-voyage-test/` 的能力矩阵用例。

## 提交与 PR

1. 从 `main` 建分支：`git switch -c feat/简短描述`。
2. 提交信息用一句话说明「改了什么、为什么」，例如
   `fix(labels): 修复跨列标签水平重叠`。
3. PR 描述里写清复现路径、验证方式与截图（如有视觉改动）。
4. 不要提交 `node_modules/`、`dist/`、`public/models/atlas-src/`、`tools/tmp/`
   （已在 `.gitignore` 中排除）。

## 许可

原创代码依仓库根目录 `LICENSE`（MIT）；第三方模型与资产依 `ATTRIBUTION.md`
所列各自许可。提交 PR 即表示你同意你的贡献按仓库的 MIT 许可发布，
且你有权提交该内容。若贡献涉及第三方素材，请在 PR 中注明来源与许可。
