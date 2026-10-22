# 三棋思维教练 App — CI/CD 指南

> 本项目采用「本地不编译、全托 CI」模式：开发者本地只改代码，所有构建/测试/发布工作交由 GitHub Actions 自动完成。

## 一、快速上手

### 1. 触发 CI（自动）

| 触发方式 | 触发条件 | 执行内容 |
|---|---|---|
| **push** | push 到 `main` 分支 | `frontend-build` + `backend-check` 两个并行 job |
| **Pull Request** | PR 指向 `main` | 同上，PR 页面显示状态检查 |

### 2. 手动触发 Release（手动）

1. 进入 GitHub 仓库 → **Actions** 标签页
2. 左侧选择 **Release Build** 工作流
3. 点击 **Run workflow** 按钮
4. 填写参数：
   - `version`：发布版本号（如 `v0.1.0`）
   - `platform`：构建目标（`desktop-linux` / `android` / `all`）
5. 点击 **Run workflow** 确认

## 二、工作流说明

### ci.yml — 持续集成

```
push/PR → ┬─ frontend-build ── npm ci → npm run build → npm test（无则跳过）
          └─ backend-check  ── cargo check → cargo test（src-tauri 未就绪时自动跳过）
```

**并行 job：**

| Job | 内容 | 当前状态 |
|---|---|---|
| `frontend-build` | npm ci → npm run build → npm test（无 test 脚本时跳过） | ✅ 已生效 |
| `backend-check` | cargo check → cargo test | ⏸️ src-tauri/ 就绪后自动生效 |

**关键行为：**
- **Rust 部分 graceful skip**：backend-check job 先检测 `src-tauri/Cargo.toml` 是否存在，不存在时输出 notice 并跳过，**不阻塞 CI 绿灯**
- **缓存**：
  - 前端：`~/.npm`（key 基于 `package-lock.json` 哈希）
  - Rust：`~/.cargo`（registry+git）与 `src-tauri/target`（key 基于 `Cargo.lock` 哈希）
- **并发控制**：同分支多次 push 只保留最新一次运行，自动取消旧的

### release.yml — 发布构建

手动触发（`workflow_dispatch`），参数：`version`（必填）、`platform`（desktop-linux / android / all）。

| Job | 内容 | 前置条件 |
|---|---|---`|
| `tag-version` | 创建并推送 Git 标签 | 无 |
| `desktop-linux` | Tauri 桌面构建 | `src-tauri/Cargo.toml` 存在 |
| `android` | Tauri Android APK 构建 | `src-tauri/Cargo.toml` 存在 |
| `create-release` | 汇总产物并创建 GitHub Release | 至少一个平台构建成功 |

## 三、本地开发建议

虽然构建全托 CI，本地仍建议：

```bash
npm run dev       # 本地开发服务器（vite）
npm run build     # 提交前快速验证（tsc --noEmit + vite build）
```

Rust 部分本地编译可选（不强制），CI 会兜底验证。

## 四、本地不编译、全托 CI 的说明

- **前端**：本地只需保证 `npm run build` 能通过（已验证）；完整测试链路在 CI 上执行
- **Rust**：本地无需安装 Rust 工具链，`cargo check`/`cargo test` 全部在 CI 上执行
- **发布**：桌面 + Android 产物全部由 CI 构建，本地不产出二进制

## 五、FAQ

**Q: src-tauri/ 还没就绪，CI 会不会失败？**
A: 不会。backend-check job 会先检测 `src-tauri/Cargo.toml`，不存在时输出 notice 并跳过，CI 保持绿灯。

**Q: package.json 没有 test 脚本，CI 会不会失败？**
A: 不会。frontend-build 的 test step 检测到无 `test` 脚本时会输出 notice 并跳过。

**Q: 如何触发 Release？**
A: 仓库 → Actions → Release Build → Run workflow，填 version 和 platform。

**Q: Release 构建失败怎么办？**
A: 查看 Actions 日志定位失败 step；常见原因：src-tauri/ 未就绪（job 会自动跳过）、Android SDK 配置问题。