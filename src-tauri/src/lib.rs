// 三棋思维教练 — Rust 核心层
// 模块划分：
//   rules/  三棋规则引擎（走法生成、合法性、吃子/将军/将死/提子/禁入点/劫争）
//   engine/ UCI/GTP 引擎对接（pikafish/stockfish 走 UCI，KataGo 走 GTP），不可用时降级内置搜索
//   coach/  替对手思考变化树 + 全局复盘逐手评分
//   ai/     OpenAI 兼容 AI 讲解服务层（SSE 流式，降级基础文案，绝不编造）
//   settings/ 设置读写
//   commands.rs Tauri command 接口层（前端 invoke 入口）

pub mod common;
pub mod rules;
pub mod engine;
pub mod coach;
pub mod ai;
pub mod settings;
pub mod commands;

pub use rules::{GameKind, Move, Piece, Side};
pub use engine::EngineKind;
pub use coach::{CandidateEval, EvalGrade, ReviewStep};
pub use ai::AiConfig;
pub use settings::AppSettings;

/// Tauri v2 应用入口（桌面端与移动端共用）
///
/// `mobile_entry_point` 宏是 Android/iOS 构建的硬性要求：
/// 缺少它时 `tauri android build` 会报
/// "does not include required runtime symbols"。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::make_move,
            commands::get_variations,
            commands::get_coaching,
            commands::undo_move,
            commands::analyze_game,
            commands::load_settings,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sanqi-coach");
}
