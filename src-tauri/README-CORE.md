# 三棋思维教练 — Rust 核心层 (src-tauri/)

## 模块结构

```
src-tauri/
├── Cargo.toml              # 依赖：tauri v2、serde、tokio、reqwest
├── build.rs                # Tauri build 脚本
├── tauri.conf.json         # Tauri v2 配置（桌面端默认 1280×800）
├── src/
│   ├── main.rs             # Tauri 入口，注册 7 个 command
│   ├── lib.rs              # 模块导出
│   ├── common/
│   │   ├── error.rs        # 统一错误类型 CoreError（11 种变体）
│   │   └── rating.rs       # 五档评级（0-30✓/31-80✓/81-180⚠/181-350✗/>350✗✗）
│   ├── rules/
│   │   ├── mod.rs          # 公共类型（GameKind/Side/Piece/Pos/Move/GameRules trait）
│   │   └── xiangqi.rs      # 中国象棋规则引擎（10×9，含将军/捉子/长将检测）
│   ├── engine/
│   │   └── mod.rs          # UCI/GTP 引擎对接层（pikafish/Stockfish/KataGo/Simple）
│   ├── coach/
│   │   └── mod.rs          # 变化树（VariationNode）与复盘评分（ScoredMove）类型
│   ├── ai/
│   │   └── mod.rs          # AI 讲解服务（AiConfig + CoachMode + OpenAI 兼容 SSE）
│   ├── settings/
│   │   └── mod.rs          # 设置读写（AppSettings JSON）
│   └── commands.rs         # Tauri command 接口（7 个 command）
```

## Tauri Command 清单

| Command | 参数 | 返回 | 说明 |
|---|---|---|---|
| `make_move` | `kind, game_id, mv` | `GameState` | 走子（含合法性判定） |
| `get_variations` | `kind, game_id, mv` | `VariationResponse` | 变化树（替对手思考） |
| `get_coaching` | `kind, game_id, mode, pos?` | `CoachingResponse` | AI 讲解（事件流 `coach://stream`） |
| `undo_move` | `kind, game_id` | `GameState` | 悔棋 |
| `analyze_game` | `kind, game_id` | `AnalyzeResponse` | 全局复盘逐手评分 |
| `load_settings` | 无 | `AppSettings` | 读取设置 |
| `save_settings` | `settings` | 无 | 写入设置 |

## 引擎接入方式

引擎二进制由外部路径注入（不打包进仓库），通过 `AppSettings.engine_paths` 配置：

| 棋种 | 引擎 | 协议 |
|---|---|---|
| 中国象棋 | pikafish | UCI |
| 国际象棋 | Stockfish | UCI |
| 围棋 | KataGo | GTP |

引擎不可用时自动降级为内置简单搜索（`EngineKind::Simple`）。

## 评级分档（原文分档 A）

| 损失（厘兵） | 评级 | 标记 |
|---|---|---|
| 0–30 | ✓ 最佳 | 绿色高亮 |
| 31–80 | ✓ 良好 | 绿色 |
| 81–180 | ⚠ 可疑 | 黄色 |
| 181–350 | ✗ 失误 | 橙色 |
| >350 | ✗✗ 严重失误 | 红色 |
| 全局最优 | ★ | 与档位独立叠加 |

## 构建与验证

```bash
cargo check              # 语法验证
cargo test               # 运行单元测试
cargo build              # 编译
```

**沙箱无 Rust 工具链，上述命令交由 GitHub Actions CI 执行。**

## 前端对齐

- 命令名与参数与 `/workspace/sanqi-coach/src/tauri/bridge.ts` 完全一致
- 流式讲解通过 Tauri event `coach://stream` 推送 `{ delta }` 片段
- 类型定义与 `/workspace/sanqi-coach/src/core/types.ts` 对齐