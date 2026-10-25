// ============ 对局状态管理 ============
// 多局棋的内存存储，供 Tauri command 层读写。

use std::collections::HashMap;
use std::sync::Mutex;

use crate::rules::chess::ChessBoard;
use crate::rules::go::GoBoard;
use crate::rules::xiangqi::XiangqiBoard;
use crate::rules::{GameKind, GameRules, GameStatus, Move, Piece, Pos, Side};

/// 一局棋（三棋统一封装）
pub enum Game {
    Xiangqi(XiangqiBoard),
    Chess(ChessBoard),
    Go(GoBoard),
}

impl Game {
    pub fn new(kind: GameKind) -> Self {
        match kind {
            GameKind::Xiangqi => Game::Xiangqi(XiangqiBoard::new()),
            GameKind::Chess => Game::Chess(ChessBoard::new()),
            GameKind::Go => Game::Go(GoBoard::new()),
        }
    }

    pub fn kind(&self) -> GameKind {
        match self {
            Game::Xiangqi(_) => GameKind::Xiangqi,
            Game::Chess(_) => GameKind::Chess,
            Game::Go(_) => GameKind::Go,
        }
    }

    pub fn rules(&self) -> &dyn GameRules {
        match self {
            Game::Xiangqi(b) => b,
            Game::Chess(b) => b,
            Game::Go(b) => b,
        }
    }

    pub fn rules_mut(&mut self) -> &mut dyn GameRules {
        match self {
            Game::Xiangqi(b) => b,
            Game::Chess(b) => b,
            Game::Go(b) => b,
        }
    }

    /// 棋盘矩阵（供前端渲染）
    pub fn matrix(&self) -> Vec<Vec<Option<Piece>>> {
        let (rows, cols) = self.kind().board_size();
        let mut out = vec![vec![None; cols]; rows];
        for r in 0..rows {
            for c in 0..cols {
                let p = Pos::new(r, c);
                let cell = match self {
                    Game::Xiangqi(b) => b.get(p),
                    Game::Chess(b) => b.get(p),
                    Game::Go(b) => b.get(p),
                };
                out[r][c] = cell;
            }
        }
        out
    }

    pub fn side(&self) -> Side {
        self.rules().side_to_move()
    }

    pub fn status(&self) -> GameStatus {
        self.rules().status()
    }
}

/// 全局对局仓库（Tauri managed state）
/// 一局会话：棋局 + 着法历史（KataGo 走 GTP 需要回放着法才能复现局面）
pub struct Session {
    pub game: Game,
    pub history: Vec<Move>,
}

#[derive(Default)]
pub struct GameStore {
    games: Mutex<HashMap<String, Session>>,
}

impl GameStore {
    pub fn new() -> Self {
        Self {
            games: Mutex::new(HashMap::new()),
        }
    }

    /// 取一局；不存在则按 kind 新建
    pub fn with_game<F, T>(&self, kind: GameKind, game_id: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Game) -> Result<T, String>,
    {
        let mut guard = self.games.lock().map_err(|_| "对局仓库锁中毒".to_string())?;
        let session = guard
            .entry(game_id.to_string())
            .or_insert_with(|| Session { game: Game::new(kind), history: Vec::new() });
        let game = &mut session.game;
        if game.kind() != kind {
            return Err(format!(
                "对局 {} 是 {}，与请求的 {} 不一致",
                game_id,
                game.kind().name_zh(),
                kind.name_zh()
            ));
        }
        f(game)
    }

    /// 棋局 + 历史的可变访问（落子/悔棋时同步维护历史）
    pub fn with_session<F, T>(&self, kind: GameKind, game_id: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut Game, &mut Vec<Move>) -> Result<T, String>,
    {
        let mut guard = self.games.lock().map_err(|_| "对局仓库锁中毒".to_string())?;
        let session = guard
            .entry(game_id.to_string())
            .or_insert_with(|| Session { game: Game::new(kind), history: Vec::new() });
        if session.game.kind() != kind {
            return Err(format!("对局 {} 棋种不一致", game_id));
        }
        f(&mut session.game, &mut session.history)
    }

    /// 只读快照
    pub fn snapshot(&self, kind: GameKind, game_id: &str) -> Result<GameSnapshot, String> {
        self.with_session(kind, game_id, |g, hist| {
            Ok(GameSnapshot {
                board: g.matrix(),
                turn: g.side(),
                status: g.status(),
                history_len: g.rules().history_len(),
                legal_moves: g.rules().legal_moves(),
                history: hist.clone(),
            })
        })
    }

    pub fn reset(&self, kind: GameKind, game_id: &str) -> Result<(), String> {
        let mut guard = self.games.lock().map_err(|_| "对局仓库锁中毒".to_string())?;
        guard.insert(game_id.to_string(), Session { game: Game::new(kind), history: Vec::new() });
        Ok(())
    }
}

/// 对局快照（序列化给前端）
#[derive(Debug, Clone)]
pub struct GameSnapshot {
    pub history: Vec<Move>,
    pub board: Vec<Vec<Option<Piece>>>,
    pub turn: Side,
    pub status: GameStatus,
    pub history_len: usize,
    pub legal_moves: Vec<Move>,
}
