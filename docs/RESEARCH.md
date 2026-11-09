# 开源项目调研与借用清单（RESEARCH）

> 调研日期：2026-10-31。所有链接与许可证信息在 M4 合规检查时需复核一次。

## 1. 可直接借用（代码 / 模型）

### 1.1 hpfrei/body-anatomy-3d-viewer ⭐ 首选起点
- 仓库：<https://github.com/hpfrei/body-anatomy-3d-viewer>
- Demo：<https://www.hpfreilabs.com/body-anatomy-3d-viewer/>
- 许可：**CC BY-SA 4.0**（项目与内含模型同许可，源自 Z-Anatomy 数据）
- 是什么：纯 three.js（无构建工具）的解剖浏览器，核心资产是一枚 **6.9MB 的
  DRACO 压缩 body.glb**——作者用 Blender 脚本从 Z-Anatomy 数据集简化而来，
  **每个 mesh 内嵌元数据**（`name` / `nameDetail` / `type`（肌肉/骨骼）/ `wikiLink`）。
- 已验证可借用点：
  - body.glb 直接复用（M1 即可跑起来）；
  - `viewer.js`（约 440 行）：raycast 逐层点选、红色自发光高亮、点击后部件飞出
    分层查看、Tween.js 沿 CatmullRom 样条的相机飞行、肌肉/骨骼分层开关；
  - DRACOLoader 配置方式。
- 借用后需：保留署名 + 以同方式共享（见 §4 署名文案 ①）。

### 1.2 ashemag/human-atlas ⭐ 交互设计与数据组织范本
- 仓库：<https://github.com/ashemag/human-atlas>
- Demo：<https://human-atlas-seven.vercel.app>
- 许可：**代码 MIT**；解剖数据基于 BodyParts3D 4.0，仓库内 ATTRIBUTION.md
  标注为 **CC BY 4.0**（注意：BodyParts3D 官方站点标注的是 CC BY-SA 2.1，
  两种说法并存，正式商用前务必到官方站 lifesciencedb.jp/bp3d 复核）。
- 是什么：React + Three.js + shadcn/ui 的解剖浏览器，**2,234 个可独立选择的
  mesh、15 个解剖系统、3,432 个命名概念可搜索**；模型约 228 万三角形、
  压缩后约 33MB，已为浏览器性能做过简化。
- 借用点（读实现思路，不搬 React 代码）：
  - 爆炸视图（explosion view）+ 零件清单联动；
  - 系统/图层开关 + 骨架与器官预设机位；
  - 结构详情面板的信息架构与搜索。
- 它本身就是本项目"大而全"路线的现成参照物，demo 可直接体验对标。

### 1.3 Z-Anatomy（上游数据源）
- 仓库/官网：<https://github.com/topics/z-anatomy>
- 许可：**CC BY-SA 4.0**（内容与模型）
- 是什么：首个基于 Blender 开源制作的完整人体解剖图谱，含 ~2500 结构、多层组织。
- 借用点：当 body.glb 不满足（如需要器官单独成 mesh、更高精度）时，
  下载其 .blend 工程，在 Blender 里按器官拆分命名后导出 glTF。
  （1.1 的 body.glb 即由它简化而来。）

### 1.4 BodyParts3D / Anatomography（官方原始数据）
- 官方：<https://lifesciencedb.jp/bp3d/?lng=en>（可按部件挑选并导出）
- GitHub 镜像（STL 全集）：<https://github.com/Kevin-Mattheus-Moerman/BodyParts3D>
- 许可：官方标注 **CC BY-SA 2.1**（日本）
- 用途：按需挑选单个器官的 STL → Blender 合并/减面 → glTF。
- 学术引用：Mitsuhashi et al. 2009, "BodyParts3D: 3D structure database for
  anatomical concepts"（PubMed:18835852）。

### 1.5 NIH 3D（单器官精细模型补料）
- 地址：<https://3d.nih.gov>
- 许可：**逐模型标注**，可筛 CC0 / 各类 CC；格式 STL/VRML 等。
- 用途：心脏、肺等需要"主角级"精度的器官，搜 CC0 模型下载后减面转 GLB。

### 1.6 three.js 官方资源（MIT）
- 示例库：<https://threejs.org/examples/>
- 官方手册·粒子系统教程：<https://threejs.org/manual/#en/particle-systems>
- 直接取用：OrbitControls、OutlinePass、UnrealBloomPass、EffectComposer、
  DRACOLoader、KTX2Loader、GPUComputationRenderer。

## 2. 仅作参考（不可复制代码）

### 2.1 thebuggeddev/anatomy
- 仓库：<https://github.com/thebuggeddev/anatomy>（3.8k star）
- Demo：<https://anatomyatelier.vercel.app>
- ⚠️ **无 LICENSE 文件 = 默认保留所有权利，禁止复制其代码**。
- 用法：只打开 demo 观摩其交互与 UI；作为视觉/交互对标。

### 2.2 Open Anatomy Project
- 官网：<https://www.openanatomy.org>（论文：Halle et al. 2017, Front. Neuroinform.）
- 用法：浏览其开放图谱册，学习"分层 + 结构列表 + 详情"的信息架构；
  具体再利用需逐册核对图谱自身的许可（多为 CC BY-NC 系）。

### 2.3 商业产品对标（仅体验，不碰代码/资产）
- BioDigital Human、Zygote Body（<https://www.zygotebody.com>）：
  学习其"层级透明度滑块 + 点选器官 + 孤立显示"的成熟交互范式。

## 3. 粒子沿曲线流动（血管粒子流）方案与代码来源

核心技术路线（多次社区验证）：**把曲线采样点烘焙进 DataTexture / attributes，
顶点着色器里按每粒子进度 `t` 采样曲线位置，全程 GPU 侧动画**——
数万粒子零 CPU 开销。

| 来源 | 内容 | 链接 |
|---|---|---|
| The Front Dev 教程（2023） | `curve.getPointAt` + 顶点着色器，R3F 但 shader 部分通用 | <https://www.thefrontdev.co.uk/creating-amazing-particle-effect-along-a-curve-in-react-three-fiber> |
| three.js Discourse #1 | "把样条点推进顶点着色器，在 GLSL 里算曲线位置"（官方成员建议，效率最优） | <https://discourse.threejs.org/t/particle-effect-on-a-curve/37777> |
| three.js Discourse #2 | 动画放 vertex shader 并行化的通用结论 | <https://discourse.threejs.org/t/how-would-you-approach-this/7210> |
| Stemkoski 经典示例集 | "Particle System – Path Movement"（粒子沿路径移动）11 变体 | <https://stemkoski.github.io/Three.js> |
| CurveModifier 官方示例思路 | 曲线编码进纹理使顶点沿曲线变形 | <https://medium.com/samsung-internet-dev/curve-modifiers-in-three-js-1ada72c61677> |

落地建议（对应 PROMPT.md R6）：
1. 每条血管曲线均匀采样 256 点 → 存 `DataTexture`（RGB=xyz）；
2. 粒子 attribute：`aT`（0–1 初始相位）、`aSize`、`aVesselId`；
3. 顶点着色器：`t = fract(uTime * uSpeed * (1.0 + 0.2*pulse(uHeartBeat)) + aT)`
   → 采样曲线得位置，尺寸/透明度随 t 与心跳脉冲变化；
4. additive blending，动脉 `#F87171` / 静脉 `#38BDF8`。

## 4. 署名文案（「关于」页照抄，不得删改）

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

## 5. 已知坑与实测提醒

- DRACO 压缩的 GLB 必须配置 `DRACOLoader` 且解码器路径正确，否则加载静默失败；
- 高面数模型 raycast 逐三角检测很慢，务必接 `three-mesh-bvh` 的
  `accelerateRaycast`（ashemag/human-atlas 同款思路）；
- OutlinePass 与 UnrealBloomPass 串联时顺序敏感，bloom 放最后，否则描边被泛光吃掉；
- 粒子若用 `PointsMaterial` 无法做沿曲线采样，必须自定义 ShaderMaterial；
- 器官透明度渐变需 `transparent: true` + `depthWrite: false` 并控制渲染顺序，
  否则会出现透视排序错误；
- BodyParts3D 许可存在 2.1（官方）/4.0（human-atlas 标注）两种表述（见 1.2），
  正式对外发布前以官方站为准复核。
