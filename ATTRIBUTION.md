# 署名与第三方资产许可 / Attribution & Third-party Assets

本文件是 `docs/RESEARCH.md` §4 署名文案的仓库级副本，**逐条照抄，不得删改**；
应用内「关于」弹窗使用同一份文案。开源发布时请保持本文件、`index.html`
「关于」弹窗与 `docs/RESEARCH.md` 三处一致。

## 1. 署名文案（照抄，不得删改）

> ① 本项目的人体 3D 模型改编自 [body-anatomy-3d-viewer](https://github.com/hpfrei/body-anatomy-3d-viewer)
> （基于 [Z-Anatomy](https://github.com/topics/z-anatomy) 数据集），依 **CC BY-SA 4.0** 授权使用，
> 本作品相应部分同样以 CC BY-SA 4.0 共享。
>
> ② 解剖数据亦参考 [BodyParts3D](https://lifesciencedb.jp/bp3d/?lng=en)，
> © The Database Center for Life Science，依 CC 署名-相同方式共享授权使用。
>
> ③ 三维渲染基于 [three.js](https://threejs.org)（MIT License）。
>
> ④ 医学内容参考：默沙东诊疗手册大众版、世界卫生组织（WHO）科普资料。
> 本作品仅供健康教育科普，不构成医疗建议。

## 2. 资产清单与许可

| 文件 | 大小 | 来源 | 许可 |
|---|---|---|---|
| `public/models/body.glb` | 8.2 MB | Z-Anatomy（经 body-anatomy-3d-viewer 简化） | CC BY-SA 4.0 |
| `public/models/organs.glb` | 5.1 MB | Z-Anatomy + BodyParts3D + HuBMAP | CC BY-SA 4.0 / CC BY-SA 2.1 |
| `public/models/nervous.glb` | 2.0 MB | Z-Anatomy（脊髓 + 外周神经） | CC BY-SA 4.0 |
| `public/models/vasculature.glb` | 4.5 MB | BodyParts3D（96 动脉 + 80 静脉） | CC BY-SA 2.1 |
| `public/models/vasculature-economy.glb` | 1.65 MB | 同上（移动端 LOD） | CC BY-SA 2.1 |
| `public/draco/` | 756 KB | Google Draco 解码器 | Apache-2.0 / 依其发行说明 |

**代码依赖**：three.js r170（MIT）、three-mesh-bvh（MIT）、Vite（MIT）、
TypeScript（Apache-2.0）、draco3dgltf / meshoptimizer / @gltf-transform（各自许可，见 `package.json`）。
这些依赖通过 npm 安装，不随仓库分发。

## 3. 许可范围说明（重要）

- 本项目**原创代码**（`src/`、`tools/*.mjs`、构建配置、原创文档）依仓库根目录 `LICENSE`（MIT）授权。
- `public/` 下的**三维模型与解码器不适用 MIT**，分别依上表原始许可使用；`LICENSE` 不授予、
  也不试图改变这些第三方资产的权利。
- Z-Anatomy 与 BodyParts3D 采用 **CC BY-SA**（署名—相同方式共享）。对基于这些模型改编、
  简化或再混编的部分进行再分发时，须保留署名并以相同许可共享。若你 fork 本仓库并修改模型，
  请注意这一义务。
- BodyParts3D 的许可在官方站点标注为 **CC BY-SA 2.1**，而下游仓库
  `ashemag/human-atlas` 的 `ATTRIBUTION.md` 标注为 **CC BY 4.0**，两种表述并存。
  正式对外发布或商用前，请以 [官方站点](https://lifesciencedb.jp/bp3d/?lng=en) 为准复核。
- `public/models/atlas-src/`（约 90 MB）与 `tools/tmp/` 是构建期的上游原始／中间文件，
  **不在本仓库中分发**（见 `.gitignore`）。如需重建资产，请从上述上游自行获取并遵守其许可。

## 4. 医学内容免责

本项目全部文案为健康教育科普内容，不提供诊断、用药或治疗建议；
`src/data/organs.json` 中每条数字型医学事实均带 `reference` 字段标注来源。
内容未经临床审校，不得作为医疗依据。
