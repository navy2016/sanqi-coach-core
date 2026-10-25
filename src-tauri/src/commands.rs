// ============ Tauri Command 接口层 ============
// 与前端 /workspace/sanqi-coach/src/tauri/bridge.ts 约定的 7 个 command 对齐。
// 流式讲解经 Tauri event `coach://stream` 推送 { delta }。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::coach::{CandidateEval, ScoredMove, VariationNode};
use crate::common::error::{CoreError, CoreResult};
use crate::common::rating::Grade;
use crate::rules::{GameKind, GameStatus, Move, Piece, PieceKind, Pos, Side};
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
/// 优先走真实引擎：象棋 pikafish / 国象 Stockfish（UCI MultiPV）、围棋自研 MCTS；
/// 引擎不可用时降级为内置启发式，并在候选里标注（前端据此提示「引擎未就绪」）。
#[tauri::command]
pub fn get_variations(
    app: tauri::AppHandle,
    store: State<'_, GameStore>,
    kind: GameKind,
    game_id: String,
    mv: Move,
    difficulty: Option<String>,
) -> CoreResult<VariationResponse> {
    let snap = store.snapshot(kind, &game_id).map_err(to_core_err)?;
    let keep = match difficulty.as_deref() {
        Some("beginner") => 5,
        Some("challenge") => 1,
        _ => 3,
    };
    let depth = match difficulty.as_deref() {
        Some("beginner") => 8,
        Some("challenge") => 16,
        _ => 12,
    };

    if let Some(candidates) = engine_candidates(&app, kind, &snap, keep, depth) {
        let root = crate::coach::variation_tree(kind, &snap.board, snap.turn, &mv, 3);
        return Ok(VariationResponse { candidates, root });
    }

    let mut candidates = crate::coach::evaluate_candidates(kind, &snap.board, snap.turn, &snap.legal_moves);
    candidates.truncate(keep);
    let root = crate::coach::variation_tree(kind, &snap.board, snap.turn, &mv, 3);
    Ok(VariationResponse { candidates, root })
}

/// 引擎候选走法；返回 None 表示引擎不可用（调用方降级）
fn engine_candidates(
    app: &tauri::AppHandle,
    kind: GameKind,
    snap: &crate::state::GameSnapshot,
    keep: usize,
    depth: u32,
) -> Option<Vec<CandidateEval>> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().ok()?;

    if kind == GameKind::Go {
        use crate::engine::go_mcts::{self, Board, Stone};
        let rows: Vec<Vec<Option<char>>> = snap
            .board
            .iter()
            .map(|r| r.iter().map(|c| c.map(|p| if p.side == Side::White { 'W' } else { 'B' })).collect())
            .collect();
        let stm = if snap.turn == Side::White { Stone::White } else { Stone::Black };
        let b = Board::from_matrix(&rows, stm);
        let res = go_mcts::search(&b, 1200, keep);
        let best = res.first()?.1;
        let out: Vec<CandidateEval> = res
            .iter()
            .map(|(idx, wr)| {
                let loss = (((best - wr) * 1000.0).round() as i32).max(0);
                CandidateEval {
                    move_str: go_mcts::to_gtp(*idx),
                    loss_cp: loss,
                    grade: Grade::from_loss(loss),
                    is_best: false,
                    eval_cp: Some(((wr * 1000.0).round()) as i32),
                    best_reply: None,
                    pv_lines: vec![],
                }
            })
            .collect();
        return Some(out);
    }

    let ek = EngineKind::from_game(kind);
    let path = crate::engine::analysis::bootstrap(ek, &dir).ok()?;
    let fen = crate::engine::analysis::to_fen(kind, &snap.board, snap.turn);
    let list = crate::engine::analysis::analyze_multipv(ek, &path, &fen, depth, keep).ok()?;
    let best = list.first()?.1;
    let out: Vec<CandidateEval> = list
        .iter()
        .map(|(uci, sc)| {
            let loss = (best - sc).max(0);
            CandidateEval {
                move_str: uci.clone(),
                loss_cp: loss,
                grade: Grade::from_loss(loss),
                is_best: *sc == best,
                eval_cp: Some(*sc),
                best_reply: None,
                pv_lines: vec![uci.clone()],
            }
        })
        .collect();
    Some(out)
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
/// 引擎状态：前端「引擎」指示灯与设置页用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus {
    pub kind: String,
    pub available: bool,
    pub path: Option<String>,
    pub bundled: bool,
}

#[tauri::command]
pub fn engine_status(kind: GameKind) -> EngineStatus {
    let cfg = crate::engine::config_with_bundled(kind);
    EngineStatus {
        kind: cfg.kind.name().to_string(),
        available: cfg.is_available(),
        path: cfg.binary_path.clone(),
        bundled: cfg.binary_path.is_some(),
    }
}
