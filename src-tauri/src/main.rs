// 三棋思维教练 — Tauri v2 应用入口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sanqi_coach_core::run();
}
