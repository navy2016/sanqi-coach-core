// ============ Tauri Command 接口层 ============
// 与前端 /workspace/sanqi-coach/src/tauri/bridge.ts 约定的 7 个 command 对齐。
// 流式讲解经 Tauri event `coach://stream` 推送 { delta }。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::coach::{CandidateEval, ScoredMove, VariationNode};
use crate::common::error::{CoreError, CoreResult};
use crate::common::rating::Grade;
use crate::rules::{GameKind, GameStatus, Move, Piece, Pos, Side};
use crate::settings::AppSettings;
use crate::state::{GameSnapshot, GameStore};

fn to_core_err(e: String) -> CoreError {
    CoreError::IllegalMove(e)
}

fn status_str(s: GameStatus) -> String {
    match s {
        GameStatus::Ongoing => "ongoing",
        GameStatus::Checkmate => "checkmate",
        GameStatus::Stalemate => "stalemate",
        GameStatus::PerpetualCheck => "perpetual_check",
        GameStatus::GoPassEnd => "go_pass_end",
        GameStatus::Draw => "draw",
    }
    .to_string()
}

fn snapshot_to_state(s: GameSnapshot) -> GameState {
    let labels = s
        .board
        .iter()
        .map(|row| row.iter().map(|c| c.map(piece_label)).collect())
        .collect();
    GameState {
        board: s.board,
        labels,
        turn: s.turn,
        status: status_str(s.status),
        move_history: vec![],
        legal_moves: s.legal_moves,
        history_len: s.history_len,
    }
}

/// 渲染用标签：`red:车` / `black:将` / `white:K` / `B`（围棋）
fn piece_label(p: Piece) -> String {
    let side = match p.side {
        Side::White => "white",
        Side::Black => "black",
    };
    let name = match p.kind {
        PieceKind::King => "K",
        PieceKind::Queen => "Q",
        PieceKind::Rook => "R",
        PieceKind::Bishop => "B",
        PieceKind::Knight => "N",
        PieceKind::Pawn => "P",
        PieceKind::Advisor => "A",
        PieceKind::Elephant => "E",
        PieceKind::Horse => "H",
        PieceKind::Cannon => "C",
        PieceKind::Stone => "S",
    };
    format!("{side}:{name}")
}

/// 走子（含合法性判定）
#[tauri::command]
pub fn make_move(
    store: State<'_, GameStore>,
    kind: GameKind,
    game_id: String,
    mv: Move,
) -> CoreResult<GameState> {
    store
        .with_game(kind, &game_id, |g| {
            g.rules_mut().make_move(&mv)?;
            Ok(())
        })
        .map_err(to_core_err)?;
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    Ok(snapshot_to_state(snap))
}

/// 求变化树（假设推演，替对手思考）
#[tauri::command]
pub fn get_variations(
    store: State<'_, GameStore>,
    kind: GameKind,
    game_id: String,
    mv: Move,
    difficulty: Option<String>,
) -> CoreResult<VariationResponse> {
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    let mut candidates = crate::coach::evaluate_candidates(kind, &snap.board, snap.turn, &snap.legal_moves);
    // 原文三级难度：入门=前 5 个合理候选、进阶=前 3 个、挑战=只给最优
    let keep = match difficulty.as_deref() {
        Some("beginner") => 5,
        Some("challenge") => 1,
        _ => 3,
    };
    candidates.truncate(keep);
    let root = crate::coach::variation_tree(kind, &snap.board, snap.turn, &mv, 3);
    Ok(VariationResponse { candidates, root })
}

/// 求讲解（一次性全文；流式经事件推送）
#[tauri::command]
pub fn get_coaching(
    store: State<'_, GameStore>,
    kind: GameKind,
    game_id: String,
    mode: String,
    pos: Option<String>,
) -> CoreResult<CoachingResponse> {
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    let text = crate::coach::coaching_text(kind, &snap.board, snap.turn, &mode, pos.as_deref());
    Ok(CoachingResponse { text })
}

/// 悔棋
#[tauri::command]
pub fn undo_move(store: State<'_, GameStore>, kind: GameKind, game_id: String) -> CoreResult<GameState> {
    store
        .with_game(kind, &game_id, |g| {
            g.rules_mut().unmake_move().ok_or_else(|| "没有可悔的棋".to_string())?;
            Ok(())
        })
        .map_err(to_core_err)?;
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    Ok(snapshot_to_state(snap))
}

/// 复盘
#[tauri::command]
pub fn analyze_game(store: State<'_, GameStore>, kind: GameKind, game_id: String) -> CoreResult<AnalyzeResponse> {
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    let moves = crate::coach::review_moves(kind, &snap.board, snap.turn);
    let summary = if moves.is_empty() {
        "尚未落子，暂无可复盘的着手。".to_string()
    } else {
        format!("共 {} 手，已按胜率损失分档标注。", moves.len())
    };
    Ok(AnalyzeResponse { moves, summary })
}

/// 新开一局 / 重置
#[tauri::command]
pub fn new_game(store: State<'_, GameStore>, kind: GameKind, game_id: String) -> CoreResult<GameState> {
    store.reset(kind, &game_id).map_err(to_core_err)?;
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    Ok(snapshot_to_state(snap))
}

/// 设置读
#[tauri::command]
pub fn load_settings() -> CoreResult<AppSettings> {
    AppSettings::load()
}

/// 设置写
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> CoreResult<()> {
    settings.save()
}

// ============ 响应类型 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub board: Vec<Vec<Option<Piece>>>,
    /// 渲染用标签矩阵（与 board 同形），前端直接按字符串渲染
    pub labels: Vec<Vec<Option<String>>>,
    pub turn: Side,
    pub status: String,
    pub move_history: Vec<Move>,
    pub legal_moves: Vec<Move>,
    pub history_len: usize,
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

/// 供 coach 层复用
pub fn _grade_of(loss: i32) -> Grade {
    Grade::from_loss(loss)
}

/// 供 coach 层复用
pub fn _pos(r: usize, c: usize) -> Pos {
    Pos::new(r, c)
}