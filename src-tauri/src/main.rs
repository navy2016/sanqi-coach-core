// 三棋思维教练 — Tauri v2 应用入口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sanqi_coach_core::commands;

fn main() {
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
