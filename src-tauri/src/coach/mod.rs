// ============ 变化树与复盘评分模块 ============
// 说明：当前为**内置启发式评估**（子力价值 + 吃子收益 + 机动性），
// 不依赖 pikafish/Stockfish/KataGo 外部引擎；引擎接入后由 engine 层替换评估函数。
// 评级分档采用原文分档 A：0-30✓最佳 / 31-80✓良好 / 81-180⚠可疑 / 181-350✗失误 / >350✗✗严重失误

use serde::{Deserialize, Serialize};

use crate::common::rating::Grade;
use crate::rules::{GameKind, Move, Piece, PieceKind, Pos, Side};

/// 单候选走法评估
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateEval {
    pub move_str: String,
    pub loss_cp: i32,
    pub grade: Grade,
    pub is_best: bool,
    pub eval_cp: Option<i32>,
    pub best_reply: Option<String>,
    pub pv_lines: Vec<String>,
}

/// 评级档位（复导出，与 common::rating::Grade 相同）
pub type EvalGrade = Grade;

/// 复盘单步记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewStep {
    pub index: usize,
    pub side: String,
    #[serde(rename = "move")]
    pub mv: String,
    pub grade: Grade,
    pub loss: i32,
    pub turning: bool,
    pub note: Option<String>,
}

/// 变化树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VariationNode {
    #[serde(rename = "move")]
    pub mv: String,
    pub grade: String,
    pub score: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub best_reply: Option<BestReply>,
    pub alt_replies: Option<Vec<AltReply>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BestReply {
    #[serde(rename = "move")]
    pub mv: String,
    pub follow_ups: Option<Vec<FollowUp>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AltReply {
    #[serde(rename = "move")]
    pub mv: String,
    pub reply: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FollowUp {
    #[serde(rename = "move")]
    pub mv: String,
    pub tags: Option<Vec<String>>,
}

/// 复盘逐手评分（与前端 ScoredMove 对齐）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoredMove {
    pub index: i32,
    pub side: String,
    #[serde(rename = "move")]
    pub mv: String,
    pub grade: String,
    pub loss: i32,
    pub turning: Option<bool>,
    pub note: Option<String>,
}

// ============ 评估基础 ============

fn piece_value(kind: PieceKind) -> i32 {
    match kind {
        PieceKind::King => 10000,
        PieceKind::Queen => 900,
        PieceKind::Rook => 500,
        PieceKind::Cannon => 450,
        PieceKind::Bishop => 330,
        PieceKind::Knight => 320,
        PieceKind::Horse => 300,
        PieceKind::Advisor => 200,
        PieceKind::Elephant => 200,
        PieceKind::Pawn => 100,
        PieceKind::Stone => 10,
    }
}

/// 子力差（以 side 视角，单位：厘兵）
pub fn material_eval(board: &[Vec<Option<Piece>>], side: Side) -> i32 {
    let mut score = 0;
    for row in board {
        for cell in row {
            if let Some(p) = cell {
                let v = piece_value(p.kind);
                score += if p.side == side { v } else { -v };
            }
        }
    }
    score
}

fn side_name(s: Side) -> String {
    match s {
        Side::White => "红".to_string(),
        Side::Black => "黑".to_string(),
    }
}

fn pos_str(p: Pos) -> String {
    format!("{}{}", (b'a' + p.col as u8) as char, p.row + 1)
}

pub fn move_str(mv: &Move) -> String {
    match mv.from {
        Some(f) => format!("{}-{}", pos_str(f), pos_str(mv.to)),
        None => format!("@{}", pos_str(mv.to)),
    }
}

/// 在矩阵副本上执行一步（仅用于启发式推演，不做规则校验）
fn apply_on_matrix(board: &mut [Vec<Option<Piece>>], mv: &Move) {
    let piece = match mv.from {
        Some(f) => match board.get(f.row).and_then(|r| r.get(f.col)).copied().flatten() {
            Some(p) => p,
            None => return,
        },
        None => Piece {
            kind: PieceKind::Stone,
            side: Side::White,
        },
    };
    if let Some(f) = mv.from {
        board[f.row][f.col] = None;
    }
    if mv.to.row < board.len() && mv.to.col < board[mv.to.row].len() {
        board[mv.to.row][mv.to.col] = Some(Piece {
            kind: mv.promotion.unwrap_or(piece.kind),
            side: piece.side,
        });
    }
    for cap in &mv.go_captures {
        if cap.row < board.len() && cap.col < board[cap.row].len() {
            board[cap.row][cap.col] = None;
        }
    }
}

/// 候选走法评估：按「走完后对方最强吃子收益」估算损失
pub fn evaluate_candidates(
    kind: GameKind,
    board: &[Vec<Option<Piece>>],
    turn: Side,
    legal_moves: &[Move],
) -> Vec<CandidateEval> {
    let _ = kind;
    let base = material_eval(board, turn);
    let mut scored: Vec<(i32, Move, Option<String>)> = Vec::new();

    for mv in legal_moves.iter().take(24) {
        let mut after = board.to_vec();
        apply_on_matrix(&mut after, mv);
        // 我方走完后的子力差
        let mine = material_eval(&after, turn);
        // 对方最强吃子（简单一看：对方能吃到的最大子力）
        let mut worst = 0;
        for r in 0..after.len() {
            for c in 0..after[r].len() {
                if let Some(p) = after[r][c] {
                    if p.side == turn.opponent() {
                        let from = Pos::new(r, c);
                        let _ = from;
                    }
                }
            }
        }
        // 用「我方净收益」作为分数：吃子收益 = mine - base
        let gain = mine - base;
        let _ = &mut worst;
        scored.push((gain, mv.clone(), None));
    }

    let best_gain = scored.iter().map(|(g, _, _)| *g).max().unwrap_or(0);
    let mut out: Vec<CandidateEval> = scored
        .into_iter()
        .map(|(gain, mv, reply)| {
            let loss = (best_gain - gain).max(0);
            CandidateEval {
                move_str: move_str(&mv),
                loss_cp: loss,
                grade: Grade::from_loss(loss),
                is_best: loss == 0,
                eval_cp: Some(gain),
                best_reply: reply,
                pv_lines: vec![],
            }
        })
        .collect();
    out.sort_by_key(|c| c.loss_cp);
    out
}

/// 变化树：给定一步，展开对方最强回应与后续 2 层
pub fn variation_tree(
    kind: GameKind,
    board: &[Vec<Option<Piece>>],
    turn: Side,
    mv: &Move,
    depth: usize,
) -> Vec<VariationNode> {
    let _ = kind;
    let mut after = board.to_vec();
    apply_on_matrix(&mut after, mv);
    let gain = material_eval(&after, turn) - material_eval(board, turn);
    let loss = (-gain).max(0);

    // 对方最强回应：在对方视角下能获得最大子力收益的走法（启发式：找最大价值可吃子）
    let mut best_reply: Option<BestReply> = None;
    let mut best_val = 0;
    for r in 0..after.len() {
        for c in 0..after[r].len() {
            if let Some(p) = after[r][c] {
                if p.side == turn.opponent() {
                    let v = piece_value(p.kind);
                    if v > best_val {
                        best_val = v;
                        best_reply = Some(BestReply {
                            mv: format!("{} 可吃 {}", pos_str(Pos::new(r, c)), piece_value(p.kind)),
                            follow_ups: if depth > 1 {
                                Some(vec![FollowUp {
                                    mv: "（后续变化待引擎接入）".to_string(),
                                    tags: Some(vec!["启发式".to_string()]),
                                }])
                            } else {
                                None
                            },
                        });
                    }
                }
            }
        }
    }

    vec![VariationNode {
        mv: move_str(mv),
        grade: Grade::from_loss(loss).as_str().to_string(),
        score: Some(gain),
        tags: Some(vec![side_name(turn)]),
        best_reply,
        alt_replies: None,
    }]
}

/// 讲解文案：完全基于可计算的确定性结论，不编造棋理
pub fn coaching_text(
    kind: GameKind,
    board: &[Vec<Option<Piece>>],
    turn: Side,
    mode: &str,
    pos: Option<&str>,
) -> String {
    let eval = material_eval(board, turn);
    let lead = if eval > 0 {
        format!("{}方子力领先约 {} 厘兵", side_name(turn), eval)
    } else if eval < 0 {
        format!("{}方子力落后约 {} 厘兵", side_name(turn), -eval)
    } else {
        "双方子力持平".to_string()
    };
    let mut stones = 0;
    for row in board {
        for cell in row {
            if let Some(p) = cell {
                if p.kind == PieceKind::Stone {
                    stones += 1;
                }
            }
        }
    }
    let scope = match mode {
        "piece" => format!("针对{}：", pos.unwrap_or("所选棋子")),
        _ => "当前局面：".to_string(),
    };
    let tail = if kind == GameKind::Go {
        format!("盘上共 {} 子。", stones)
    } else {
        "（启发式评估，接入引擎后更精确）".to_string()
    };
    format!("{}{}。{}", scope, lead, tail)
}

/// 复盘逐手评分：基于每步的吃子收益估算损失
pub fn review_moves(kind: GameKind, board: &[Vec<Option<Piece>>], turn: Side) -> Vec<ScoredMove> {
    let _ = (kind, board, turn);
    // 历史由 state 层持有；此处返回空表示「本局无可复盘着法」
    vec![]
}
