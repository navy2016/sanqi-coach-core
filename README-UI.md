# 三棋思维教练 · 前端 UI 层（README-UI）

Tauri v2 前端层实现：**Vite + TypeScript（原生 TS，无框架）**。

> 技术取舍：棋盘用 SVG 自绘（河界/九宫/星位/木色格）、面板为纯 DOM 组件，无虚拟 DOM 需求；
> 零运行时依赖可把桌面安装包压到 art2 给出的 8MB 量级目标，也降低 CI 构建风险。
> 文章原文提过 "TS 业务层 + React UI 层"（art6），若后续统一为 React，本层的组件划分可逐块平移。

## 运行

```bash
npm install        # registry 已指向 npmmirror
npm run dev        # Vite dev server（纯浏览器可跑，数据层自动降级 mock）
npm run build      # tsc --noEmit && vite build → dist/
```

Tauri 桌面壳由 `src-tauri/`（同事并行开发）负责；本层通过 `src/tauri/bridge.ts` 与其对接。

## 页面结构

```
┌──────────────────────────────────────────────┐
│ 🧠 三棋思维教练   [中国象棋][国际象棋][围棋] ⚙️AI设置 │  ← app-header + tabs
├──────────────────────────────┬───────────────┤
│                              │ 🧑‍🏫 AI 棋理讲解  │  ← coachPanel（流式打字机）
│      棋盘（居中偏左）            │ 假设推演·变化树   │  ← variationTree（双出口）
│      象棋10×9 / 国象8×8 / 围棋19×19│ 复盘·逐手评分    │  ← scoreList（档位色+转折点）
├──────────────────────────────┴───────────────┤
│ ↩ 悔棋   复盘   🧑‍🏫 AI讲解当前局面  （窄屏底部操作条） │
└──────────────────────────────────────────────┘
```

- **PC**：棋盘居中偏左（`margin-left:4%` + 右列面板），右侧为讲解/分析面板。
- **Android/窄屏（≤860px）**：棋盘占主体，底部蓝色操作条（rgb(75,126,237)，按钮高 42px）。
- **设置页**：白底 iOS 风格弹层表单（art2_img5），含服务商预设/降级提示。

## 目录

| 路径 | 职责 |
|---|---|
| `src/styles/tokens.css` | 设计令牌：米白 rgb(252,252,252)、木色 rgb(192,156,122)、主蓝 rgb(75,126,237)、评级六色、圆角 8px |
| `src/styles/app.css` | 布局（PC 双栏 / Android 底部操作条）、卡片、评分行、设置表单 |
| `src/core/types.ts` | 公共类型（Move/GameState/VariationNode/ScoredMove/CoachSettings）+ 服务商预设 |
| `src/core/grade.ts` | 五档评级分档 **A**（0-30✓/31-80良好/81-180⚠/181-350✗/>350✗✗，金★全局最优） |
| `src/boards/boardView.ts` | SVG 棋盘基类：坐标↔像素映射、点击、选中/落点提示/最后一手高亮 |
| `src/boards/xiangqi.ts` | 中国象棋 10×9（河界、九宫斜线、河界文字） |
| `src/boards/chess.ts` | 国际象棋 8×8（木色深浅格、坐标标注、Unicode 棋子） |
| `src/boards/go.ts` | 围棋 19×19（星位；构造器支持 9/13 路） |
| `src/panels/coachPanel.ts` | AI 讲解：打字机流式（28ms/1-2字）、`coach://stream` 增量并入、降级基础提示 |
| `src/panels/variationTree.ts` | 变化树：候选+档位+标签+对方最强回应/次选；「换一个走法 / 确认这样走」双出口 |
| `src/panels/scoreList.ts` | 逐手评分：损失分+档位颜色行+转折点红框高亮+AI 总结 |
| `src/ui/settings.ts` | 设置页：baseUrl/key/model（DeepSeek/GLM/Doubao 预设）、难度、TTS、降级提示 |
| `src/ui/app.ts` | 装配：tabs 切换、交互闭环、按钮事件 |
| `src/ui/presets.ts` | 三棋初始局面（演示用；正式局面由后端 FEN 注入） |
| `src/tauri/bridge.ts` | **invoke 统一封装层**（见下） |

## Tauri invoke 对接（与 src-tauri 约定的命令清单）

`src/tauri/bridge.ts` 是唯一对接点。检测 `window.__TAURI_INTERNALS__`；不可用时整体降级 mock（UI 全流程可演示）。

| 命令 | 参数 | 返回 | 用途 |
|---|---|---|---|
| `make_move` | `kind, gameId, move:{from,to,promotion?}` | `GameState` | 走子 |
| `get_variations` | `kind, gameId, move` | `{root: VariationNode[]}` | 求变化树（假设推演） |
| `get_coaching` | `kind, gameId, mode('situation'\|'piece'), pos?` | `{text}` | 求讲解 |
| `undo_move` | `kind, gameId` | `GameState` | 悔棋（退回玩家走错之前） |
| `analyze_game` | `kind, gameId` | `{moves: ScoredMove[], summary}` | 复盘 |
| `load_settings` / `save_settings` | `settings?` | `CoachSettings` / void | 设置读写 |

- **流式讲解**：后端经 Tauri event `coach://stream` 推 `{delta}`；前端 `onCoachStream()` 订阅（优先 `@tauri-apps/api/event`，未安装时回退到 `window.__coachStreamHandler` 全局钩子——src-tauri 侧可注入）。
- **未配 Key**：`get_coaching` 失败 → `coachPanel.showFallback()` 呈现基础提示，不影响下棋（art2 三层保险）。
- 若 src-tauri 最终命令名与上表不同，只需改 `bridge.ts` 内 `rawInvoke('命令名', args)` 一处。

## 与 SPEC.md 的对齐说明

1. **评级分档**：采用 SPEC 推荐的**分档 A**（art1/art3 原文三处交叉印证）；委派规格中的 81-150/151-300/>300 未采用，如阿策裁决改用分档 B，只需改 `core/grade.ts` 的 `gradeForLoss`。
2. **落点颜色**：绿最佳 / 蓝良好 / 黄可疑 / 橙失误 / 红严重失误 / 金★全局最优（art3 原文）。
3. **棋种×平台**：Web 版原文仅明确象棋；三棋 UI 均已实现，属沿用同一技术栈的推断。

## 验收状态

- [x] 组件划分清晰（boards/panels/ui/core/tauri 五层）
- [x] 米白+暖棕、圆角 8px、居中卡片、蓝色主按钮、评级六色（tokens.css 全部带像素出处注释）
- [x] 三棋棋盘（河界/九宫、星位、木色格）+ 选中/落点提示 + 悔棋按钮
- [x] AI 讲解打字机、变化树双出口、逐手评分（档位色+转折点高亮）
- [x] 设置页 + 降级逻辑
- [x] invoke wrapper（命令清单表 + mock 降级 + 流式事件订阅）
- [ ] `npm run build` —— 本沙箱执行结果见群内汇报；如未跑通标注"待 CI 验证"
