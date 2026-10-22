// ============ Tauri Command 接口层 ============
// 与前端 /workspace/sanqi-coach/src/tauri/bridge.ts 约定的 7 个 command 对齐。
// 流式讲解经 Tauri event `coach://stream` 推送 { delta }。
// TODO: 集成真实 engine/coach/ai 后补全实现

use serde::{Deserialize, Serialize};
use crate::rules::{GameKind, Move, Side, Piece};
use crate::coach::{CandidateEval, ScoredMove, VariationNode};
use crate::ai::AiConfig;
use crate::settings::AppSettings;
use crate::common::error::{CoreError, CoreResult};

/// 走子（含合法性判定）
#[tauri::command]
pub async fn make_move(kind: GameKind, game_id: String, mv: Move) -> CoreResult<GameState> {
    // TODO: 调用 rules::Board + engine 评估
    Err(CoreError::NotImplemented("make_move"))
}

/// 求变化树（假设推演，替对手思考）
#[tauri::command]
pub async fn get_variations(kind: GameKind, game_id: String, mv: Move) -> CoreResult<VariationResponse> {
    // TODO: 调用 coach:: 变化树计算
    Err(CoreError::NotImplemented("get_variations"))
}

/// 求讲解（一次性全文；流式经事件推送）
#[tauri::command]
pub async fn get_coaching(kind: GameKind, game_id: String, mode: String, pos: Option<String>) -> CoreResult<CoachingResponse> {
    // TODO: 调用 ai:: 流式讲解
    Err(CoreError::NotImplemented("get_coaching"))
}

/// 悔棋
#[tauri::command]
pub async fn undo_move(kind: GameKind, game_id: String) -> CoreResult<GameState> {
    // TODO: 调用 rules::Board.undo
    Err(CoreError::NotImplemented("undo_move"))
}

/// 复盘
#[tauri::command]
pub async fn analyze_game(kind: GameKind, game_id: String) -> CoreResult<AnalyzeResponse> {
    // TODO: 调用 coach:: 逐手评分
    Err(CoreError::NotImplemented("analyze_game"))
}

/// 设置读
#[tauri::command]
pub async fn load_settings() -> CoreResult<AppSettings> {
    AppSettings::load()
}

/// 设置写
#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> CoreResult<()> {
    settings.save()
}

// ============ 响应类型 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub board: Vec<Vec<Option<Piece>>>,
    pub turn: Side,
    pub status: String,
    pub move_history: Vec<Move>,
    pub legal_moves: Vec<Move>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariationResponse {
    pub candidates: Vec<CandidateEval>,
    pub root: Vec<VariationNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachingResponse {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeResponse {
    pub moves: Vec<ScoredMove>,
    pub summary: String,
}