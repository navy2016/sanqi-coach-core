# 三棋思维教练 App - 前端测试

本目录存放前端单元测试与集成测试。

## 现状（占位说明）

当前项目使用 **Vite + TypeScript（原生 TS 无框架）**，尚未引入测试框架。
CI（`.github/workflows/ci.yml`）已预留 test step：
- 检测 `package.json` 是否含 `test` 脚本 → 有则执行 `npm test`，无则输出 notice 并跳过
- 引入 Vitest 后，只需在 package.json 加 `"test": "vitest run"`，CI 自动生效

## 计划引入：Vitest

推荐 Vitest（与 Vite 5 共享配置，零额外构建开销）：

```bash
npm i -D vitest
# package.json scripts 添加: "test": "vitest run"
```

## 测试分层规划

| 层级 | 工具 | 覆盖目标 |
|---|---|---|
| 单元 | Vitest | 工具函数、状态逻辑（棋盘状态、走子规则、评级分档转换） |
| 组件 | Vitest + @testing-library | UI 组件渲染与交互 |
| E2E | Playwright | 三棋对局流程、复盘、残局挑战等核心路径 |

## 运行方式

```bash
npm test          # 引入 Vitest 后生效
npx vitest run    # 单次运行
npx vitest        # watch 模式
```
