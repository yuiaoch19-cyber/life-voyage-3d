# 生命奇旅 LifeVoyage — 3D 人体探索

> 看见生命，理解身体，珍惜健康。
> 纯前端 three.js 交互式人体科普应用：可旋转的人体、可点击的器官、
> 随心跳奔涌的血管粒子流。

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # dist/ 纯静态，可直接部署
```

## 功能一览

- **23 个可交互实体**（17 器官 + 6 神经节点）：点击隔离、悬停描边、信息面板
- **体格层三模式**：X 光 / 实体（分层透明）/ 隐藏 + 透明度滑块
- **全身血管树**（BP3D 176 根真实血管）+ **13.8 万血流粒子**（等间距连续流、心率联动；移动端减半）
- **神经网 + 221 条信号流道**（ZA 神经部件提取，波包传导）
- **4 组病变模拟 + A/B 并排对比** + 血管斑块
- **10 个系统过滤器**（含骨骼/肌肉）+ 搜索
- **剖切**（矢状/冠状 + 位置滑块）
- **章节巡游**（血液/呼吸/神经三大主题 + 随机）+ 找器官测验
- **食物之旅**（消化路径粒子 + 段落字幕）
- **截图导出**（普通 + A/B 双格合成）
- **移动端适配**（器官导航抽屉、LOD 自动切换、safe-area）
- **可访问性**（键盘导航、焦点管理、aria-live、prefers-reduced-motion）

## 模型资产

| 文件 | 大小 | 来源 | 许可 |
|---|---|---|---|
| body.glb | 8.2MB | Z-Anatomy（肌骨） | CC BY-SA 4.0 |
| organs.glb | 5.1MB | Z-Anatomy + BodyParts3D + HuBMAP | CC BY-SA / CC BY 4.0 |
| nervous.glb | 2.0MB | Z-Anatomy（脊髓+外周神经） | CC BY-SA 4.0 |
| vasculature.glb | 4.5MB | BodyParts3D（96 动脉 + 80 静脉） | CC BY-SA 2.1 |
| vasculature-economy.glb | 1.65MB | 同上（移动端 LOD） | CC BY-SA 2.1 |

完整署名见 [ATTRIBUTION.md](ATTRIBUTION.md)、应用内「关于」弹窗与 `docs/RESEARCH.md` §4。
仓库已包含运行所需的 5 个成品 GLB；构建期的上游原始／中间文件
（`public/models/atlas-src/`、`tools/tmp/`）不纳入版本控制，如需重建请从上述上游自行获取。

## 开源与许可

- **原创代码**：MIT，见 [LICENSE](LICENSE)。
- **三维模型与第三方资产不适用 MIT**：分别依 CC BY-SA 4.0 / CC BY-SA 2.1 等原始许可
  使用并署名，完整清单见 [ATTRIBUTION.md](ATTRIBUTION.md)。修改或再分发改编模型时，
  须遵守 CC BY-SA 的「相同方式共享」义务。
- 同时发布到 Gitee 与 GitHub 的完整流程见 [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md)；
  贡献规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 医学内容仅供健康教育科普，**不构成医疗建议**。

## 文档索引

| 文件 | 内容 |
|---|---|
| [STATUS.md](STATUS.md) | 迭代历史与当前状态（v2→v9.9） |
| [docs/PROMPT.md](docs/PROMPT.md) | Master Prompt（需求 R1–R10、决议链 v2→v9） |
| [docs/RESEARCH.md](docs/RESEARCH.md) | 开源调研与借用清单 |
| [docs/OPEN_SOURCE.md](docs/OPEN_SOURCE.md) | Gitee / GitHub 双仓库开源发布指南 |
| [ATTRIBUTION.md](ATTRIBUTION.md) | 署名与第三方资产许可 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| [docs/V6_PLAN.md](docs/V6_PLAN.md) | v6 调研驱动迭代方案 |
| [docs/V9_PLAN.md](docs/V9_PLAN.md) | v9「让身体活起来」方案 |
| [docs/DISEASE_PLAN.md](docs/DISEASE_PLAN.md) | 病变模拟方案 |
| [docs/NERVOUS_PLAN.md](docs/NERVOUS_PLAN.md) | 神经系统方案 |
