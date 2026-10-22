// 三棋思维教练 — 三棋公共棋盘与棋子基础类型
// 中国象棋 10×9 / 国际象棋 8×8 / 围棋 19×19

use serde::{Deserialize, Serialize};

/// 游戏种类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameKind {
    /// 中国象棋 10行×9列
    Xiangqi,
    /// 国际象棋 8×8
    Chess,
    /// 围棋 19×19
    Go,
}

impl GameKind {
    pub fn board_size(&self) -> (usize, usize) {
        match self {
            GameKind::Xiangqi => (10, 9),
            GameKind::Chess => (8, 8),
            GameKind::Go => (19, 19),
        }
    }
    pub fn piece_count(&self) -> usize {
        match self {
            GameKind::Xiangqi => 32,
            GameKind::Chess => 32,
            GameKind::Go => 361,
        }
    }
    pub fn name_zh(&self) -> &'static str {
        match self {
            GameKind::Xiangqi => "中国象棋",
            GameKind::Chess => "国际象棋",
            GameKind::Go => "围棋",
        }
    }
}

/// 对局双方
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    /// 象棋/国象：白方（象棋为红方）
    White,
    /// 象棋/国象：黑方（象棋为黑方）
    Black,
}

impl Side {
    pub fn opponent(&self) -> Side {
        match self {
            Side::White => Side::Black,
            Side::Black => Side::White,
        }
    }
    pub fn name_zh(&self) -> &'static str {
        match self {
            Side::White => "白方",
            Side::Black => "黑方",
        }
    }
}

/// 棋子种类
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PieceKind {
    // 象棋
    King,     // 帅/将
    Advisor,  // 仕/士
    Elephant, // 相/象
    Horse,    // 马
    Rook,     // 车
    Cannon,   // 炮
    Pawn,     // 兵/卒
    // 国象
    Queen,    // 后
    Bishop,   // 象
    Knight,   // 马
    // 围棋
    Stone,    // 围棋棋子（不分种类，只有黑白）
}

/// 带归属的棋子
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Piece {
    pub kind: PieceKind,
    pub side: Side,
}

/// 棋盘坐标（row 从北/上数起，col 从西/左数起，均 0-based）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Pos {
    pub row: usize,
    pub col: usize,
}

impl Pos {
    pub fn new(row: usize, col: usize) -> Self {
        Self { row, col }
    }
}

/// 一步棋（含围棋提子信息）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Move {
    /// 起始位置（围棋落子时为 None）
    pub from: Option<Pos>,
    /// 目标位置
    pub to: Pos,
    /// 升变后的棋子种类（国象兵升变专用，其余为 None）
    pub promotion: Option<PieceKind>,
    /// 该步吃掉的子（记录被吃位置与种类，用于悔棋恢复）
    pub captured: Option<(Pos, Piece)>,
    /// 围棋提子列表（被提掉的对方棋子位置）
    pub go_captures: Vec<Pos>,
    /// 国象王车易位标记
    pub is_castle: bool,
    /// 国象过路兵标记
    pub is_en_passant: bool,
}

impl Move {
    pub fn simple(from: Pos, to: Pos) -> Self {
        Self {
            from: Some(from),
            to,
            promotion: None,
            captured: None,
            go_captures: vec![],
            is_castle: false,
            is_en_passant: false,
        }
    }
    pub fn drop(to: Pos) -> Self {
        Self {
            from: None,
            to,
            promotion: None,
            captured: None,
            go_captures: vec![],
            is_castle: false,
            is_en_passant: false,
        }
    }
}

/// 对局状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameStatus {
    /// 进行中
    Ongoing,
    /// 将死/被擒死（象棋）/对方认负
    Checkmate,
    /// 逼和（国象）/双方无子可动（象棋）
    Stalemate,
    /// 长将和棋（象棋规则）
    PerpetualCheck,
    /// 围棋：双方连续虚着，终局
    GoPassEnd,
    /// 其他和棋（如国象三次重复、50步规则）
    Draw,
}

/// 通用棋盘抽象：三棋共享的走法生成 / 合法性判定接口
pub trait GameRules {
    /// 当前轮到哪方
    fn side_to_move(&self) -> Side;
    /// 走法是否合法
    fn is_move_legal(&self, mv: &Move) -> bool;
    /// 生成伪合法走法（未过滤自杀/被将等）
    fn pseudo_legal_moves(&self) -> Vec<Move>;
    /// 生成完全合法走法
    fn legal_moves(&self) -> Vec<Move> {
        self.pseudo_legal_moves()
            .into_iter()
            .filter(|mv| self.is_move_legal(mv))
            .collect()
    }
    /// 执行走法（返回 Err 表示非法）
    fn make_move(&mut self, mv: &Move) -> Result<(), String>;
    /// 悔棋（返回被撤销的走法）
    fn unmake_move(&mut self) -> Option<Move>;
    /// 当前将军状态（象棋/国象；围棋恒 false）
    fn in_check(&self, side: Side) -> bool;
    /// 当前对局状态
    fn status(&self) -> GameStatus;
    /// 历史手数
    fn history_len(&self) -> usize;
}
