# 方案：v6「从能看，到耐看、耐玩」— 调研驱动的下一轮迭代

> 立项：2026-11-01。本文基于三路调研（平台功能基准 / 肉感渲染技术 / 教育交互模式），
> 给出带优先级的迭代清单。每项含规格与验收，按 P0/P1/P2 排序，确认后逐个实施。

## 0. 调研发现（决定方向的三条证据）

1. **平台功能基准**（Lee et al. 2024 对六大平台的同行评审比较 + 产品资料）：
   - Complete Anatomy 的强项是 **quiz/测验与课程工具链**；Visible Body 强在**细节颗粒度与
     标注系统**（例：肝的 8 个分段可独立选择与打标）；BioDigital 的差异化恰是
     **疾病/病程可视化**——即我们的「健康对比」模块，方向已被市场验证。
   - 来源：[PMC11102696](https://pmc.ncbi.nlm.nih.gov/articles/PMC11102696)、
     [3D4Medical](https://3d4medical.com)、[JMLA Havens 2020](https://jmla.mlanet.org/ojs/jmla/article/view/825/1080)
2. **教育交互共识**：3D 解剖工具的用户价值核心是「主动探索 + 空间理解」；
   **quiz 用 3D 点选而非文本选择题**最受好评；标签+引线是解剖应用的标配交互。
   （r/medicalschool 用户明确要"按系统自定义测验"。）
3. **肉感渲染技术**：three.js 生态的成熟做法是
   **wrap diffuse（包裹漫反射）+ 薄壁透光透射近似**，用 `onBeforeCompile` 注入
   （[官方 SubsurfaceScatteringShader 示例](https://threejs.org/examples/)、
   [Jimenez 系屏幕空间 SSS 讨论](https://discourse.threejs.org/t/skin-shading-with-screen-space-sub-surface-scattering/83939)、
   Alan Zucconi 的 Fast SSS 系列教程）。后处理级分离 SSS 质量更高但成本不成比例，本期不做。

**结论**：v6 主攻三件事——把「肉感」做进光照管线（P0-A）、补上解剖应用的标配交互
标注与测验（P0-B/C），这三项分别对标 Visible Body 的质感、标注、测验三大强项；
P1 继续深化已被验证的疾病差异化。

---

## P0-A 组织感 2.0：肉感渲染管线（shader，零新资产）

现状差距：器官颜色均匀、光照是标准 PBR，"塑料感"未除尽。

规格：
1. **Wrap diffuse**：漫反射项改为 `max(0, (NdotL + w) / (1 + w))`（w≈0.35，逐器官可调），
   明暗过渡变软——肉的核心特征；
2. **薄壁透光**：背光透射项 `pow(saturate(dot(V, -(N + L*distort))), power) × translucency`，
   `translucency` 按器官厚度感配置（肺 0.5、肝 0.25、心 0.15）——逆光时薄边缘微微透亮；
3. **低频 albedo 色斑**：组织颜色不均匀（2 阶噪声，幅度 8–16%，每器官独立 seed）；
4. **高频法线微扰**：现有噪声差分扰动法线（绒感），幅度 ≤0.15 防脏。
   以上全部走现有 `onBeforeCompile` 补丁通道（`patchOrganMaterial`）， Disease uniforms 并存。

验收：同一器官逆光/顺光双机位截图对比，透光与软过渡肉眼可见；四病变器官回归无裂缝。

## P0-B 3D 标注系统（CSS2DRenderer）

规格：
- `CSS2DObject` 锚在每器官中心（`anchors.json` 现成）+ 前向偏移至表面；
- HUD 开关「标注」；标签 = 中文名（hover 显示英文）；
- 引线：DOM 旋转短斜线（CSS 实现最稳）；**遮挡淡出**：每帧对 16 个标签做一次 BVH 射线
  （ organs+body 可见网格），被挡 0.6s 淡出至 15%；
- 系统过滤/solo 时标签联动显隐；移动端默认关闭。

验收：任意视角标签不穿帮、不遮挡拾取（pointer-events none）；开关即时生效。

## P0-C 测验模式「找一找」

规格：
- HUD「测验」按钮 → 顶栏下方出题卡：「请找出：肝 🔍」，随机抽题（全 16 器官，skin 除外）；
- 用户在 3D 里**点选作答**（复用现有 raycast）：对=绿色描边+得分+下一题；错=红色抖动+提示
  （"再想想，它在左边一点"——方向性提示，不直接给答案）；
- 10 题一局 → 结算卡（得分/最佳纪录 localStorage）+ 正向文案；
- 测验中强制退出 solo/巡游/血管视图，避免干扰；Esc 中止。

验收：一局完整可玩、计分正确、与病变/巡游互不打架。

## P1-D 巡游讲解字幕
巡游时底部出字幕条（当前器官 summary 第一句 + 「3/16」进度），可关闭。

## P1-E 血管斑块（动脉粥样硬化）
动脉管壁 shader 追加黄斑（复用斑点逻辑）+ 局部内壁隆起（顶点位移沿内法线），
与「高血压心脏」故事页联动；开关挂在其 disease 滑杆上。

## P1-F 对比合成截图
A/B 模式下截图导出双格合成图（Canvas 2D 拼接健康/病变两帧）。

## P2-G 移动端血管 LOD
vasculature 生成 economy 档（预算 12 万三角），移动端自动切换。

---

## 建议排期

| 批次 | 内容 | 预计规模 |
|---|---|---|
| v6.0 | P0-A + P0-B + P0-C | shader 一天量 / 标注一天量 / 测验一天量 |
| v6.1 | P1-D + P1-E + P1-F | 半天量 ×3 |
| v6.2 | P2-G + 文案终审 | 半天 |

## 本期不做（记录原因）

- 后处理级分离 SSS（Jimenez）：质量增益不成比例于复杂度与性能；
- 肝 8 段级细分选择（Visible Body 级）：需要医学数据源支持超出当前开源资产；
- AR 模块：依赖 WebXR 环境普及度，优先级低于内容功能。
