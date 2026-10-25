// ============ 围棋规则（19×19） ============
// 落子 / 提子 / 禁入点（自杀）/ 简单劫争

use crate::rules::{GameRules, GameStatus, Move, Piece, PieceKind, Pos, Side};

const N: usize = 19;

#[derive(Debug, Clone)]
pub struct GoBoard {
    board: [[Option<Piece>; N]; N],
    side: Side,
    history: Vec<Move>,
    status: GameStatus,
    /// 劫争禁着点
    ko: Option<Pos>,
    /// 连续虚着次数
    passes: u32,
}

impl GoBoard {
    pub fn new() -> Self {
        Self {
            board: [[None; N]; N],
            side: Side::White,
            history: Vec::new(),
            status: GameStatus::Ongoing,
            ko: None,
            passes: 0,
        }
    }

    pub fn get(&self, p: Pos) -> Option<Piece> {
        if p.row < N && p.col < N {
            self.board[p.row][p.col]
        } else {
            None
        }
    }

    fn neighbors(p: Pos) -> Vec<Pos> {
        let mut out = Vec::with_capacity(4);
        if p.row > 0 {
            out.push(Pos::new(p.row - 1, p.col));
        }
        if p.row + 1 < N {
            out.push(Pos::new(p.row + 1, p.col));
        }
        if p.col > 0 {
            out.push(Pos::new(p.row, p.col - 1));
        }
        if p.col + 1 < N {
            out.push(Pos::new(p.row, p.col + 1));
        }
        out
    }

    /// 取某点所属棋块与气数
    fn group(&self, start: Pos) -> (Vec<Pos>, usize) {
        let side = match self.get(start) {
            Some(p) => p.side,
            None => return (vec![], 0),
        };
        let mut stack = vec![start];
        let mut seen = vec![start];
        let mut liberties = 0usize;
        let mut counted: Vec<Pos> = Vec::new();
        while let Some(p) = stack.pop() {
            for nb in Self::neighbors(p) {
                match self.get(nb) {
                    None => {
                        if !counted.contains(&nb) {
                            counted.push(nb);
                            liberties += 1;
                        }
                    }
                    Some(q) if q.side == side => {
                        if !seen.contains(&nb) {
                            seen.push(nb);
                            stack.push(nb);
                        }
                    }
                    _ => {}
                }
            }
        }
        (seen, liberties)
    }

    /// 在临时棋盘上落子并提子，返回提子列表；若自杀返回 None
    fn simulate(&self, to: Pos, side: Side) -> Option<Vec<Pos>> {
        let mut probe = self.board;
        probe[to.row][to.col] = Some(Piece { kind: PieceKind::Stone, side });
        let mut captured = Vec::new();
        for nb in Self::neighbors(to) {
            if let Some(q) = probe[nb.row][nb.col] {
                if q.side != side {
                    // 计算该块气
                    let mut stack = vec![nb];
                    let mut seen = vec![nb];
                    let mut libs = 0usize;
                    let mut counted: Vec<Pos> = Vec::new();
                    while let Some(p) = stack.pop() {
                        for n2 in Self::neighbors(p) {
                            match probe[n2.row][n2.col] {
                                None => {
                                    if !counted.contains(&n2) {
                                        counted.push(n2);
                                        libs += 1;
                                    }
                                }
                                Some(x) if x.side == q.side => {
                                    if !seen.contains(&n2) {
                                        seen.push(n2);
                                        stack.push(n2);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    if libs == 0 {
                        for p in seen {
                            probe[p.row][p.col] = None;
                            if !captured.contains(&p) {
                                captured.push(p);
                            }
                        }
                    }
                }
            }
        }
        // 自杀判定：自身棋块无气且未提子
        if captured.is_empty() {
            let mut stack = vec![to];
            let mut seen = vec![to];
            let mut libs = 0usize;
            while let Some(p) = stack.pop() {
                for n2 in Self::neighbors(p) {
                    match probe[n2.row][n2.col] {
                        None => libs += 1,
                        Some(x) if x.side == side => {
                            if !seen.contains(&n2) {
                                seen.push(n2);
                                stack.push(n2);
                            }
                        }
                        _ => {}
                    }
                }
            }
            if libs == 0 {
                return None;
            }
        }
        Some(captured)
    }
}

impl GameRules for GoBoard {
    fn side_to_move(&self) -> Side {
        self.side
    }

    fn is_move_legal(&self, mv: &Move) -> bool {
        if self.get(mv.to).is_some() {
            return false;
        }
        if let Some(k) = self.ko {
            if k == mv.to {
                return false;
            }
        }
        self.simulate(mv.to, self.side).is_some()
    }

    fn pseudo_legal_moves(&self) -> Vec<Move> {
        let mut out = Vec::new();
        for r in 0..N {
            for c in 0..N {
                let p = Pos::new(r, c);
                if self.get(p).is_none() {
                    out.push(Move::drop(p));
                }
            }
        }
        out
    }

    fn make_move(&mut self, mv: &Move) -> Result<(), String> {
        if !self.is_move_legal(mv) {
            return Err("非法落子".into());
        }
        let captures = self.simulate(mv.to, self.side).ok_or("自杀禁着")?;
        self.board[mv.to.row][mv.to.col] = Some(Piece {
            kind: PieceKind::Stone,
            side: self.side,
        });
        for p in &captures {
            self.board[p.row][p.col] = None;
        }
        // 简单劫：提一子且自身棋块仅一子时，禁着点为刚被提处
        self.ko = if captures.len() == 1 {
            let (grp, _) = self.group(mv.to);
            if grp.len() == 1 {
                Some(captures[0])
            } else {
                None
            }
        } else {
            None
        };
        let mut recorded = mv.clone();
        recorded.go_captures = captures;
        self.history.push(recorded);
        self.passes = 0;
        self.side = self.side.opponent();
        Ok(())
    }

    fn unmake_move(&mut self) -> Option<Move> {
        let mv = self.history.pop()?;
        let placed = self.board[mv.to.row][mv.to.col]?;
        self.board[mv.to.row][mv.to.col] = None;
        for p in &mv.go_captures {
            self.board[p.row][p.col] = Some(Piece {
                kind: PieceKind::Stone,
                side: placed.side.opponent(),
            });
        }
        self.side = placed.side;
        self.ko = None;
        self.status = GameStatus::Ongoing;
        Some(mv)
    }

    fn in_check(&self, _side: Side) -> bool {
        false
    }

    fn status(&self) -> GameStatus {
        self.status
    }

    fn history_len(&self) -> usize {
        self.history.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_move_ok() {
        let mut b = GoBoard::new();
        assert!(b.make_move(&Move::drop(Pos::new(3, 3))).is_ok());
        assert_eq!(b.side_to_move(), Side::Black);
    }

    #[test]
    fn test_occupied_rejected() {
        let mut b = GoBoard::new();
        b.make_move(&Move::drop(Pos::new(3, 3))).unwrap();
        assert!(b.make_move(&Move::drop(Pos::new(3, 3))).is_err());
    }

    #[test]
    fn test_capture_single_stone() {
        let mut b = GoBoard::new();
        // 白 (0,1)，黑 (0,0)、(1,0) 后白仅剩一气，黑再落 (0,2) 不应立即提
        b.make_move(&Move::drop(Pos::new(0, 1))).unwrap(); // 白
        b.make_move(&Move::drop(Pos::new(0, 0))).unwrap(); // 黑
        b.make_move(&Move::drop(Pos::new(5, 5))).unwrap(); // 白
        b.make_move(&Move::drop(Pos::new(1, 0))).unwrap(); // 黑
        b.make_move(&Move::drop(Pos::new(6, 6))).unwrap(); // 白
        let mv = Move::drop(Pos::new(0, 2)); // 黑提白 (0,1)
        let mut probe = b.clone();
        assert!(probe.make_move(&mv).is_ok());
        assert!(probe.get(Pos::new(0, 1)).is_none(), "白子应被提掉");
    }

    #[test]
    fn test_undo_restores_stone() {
        let mut b = GoBoard::new();
        b.make_move(&Move::drop(Pos::new(3, 3))).unwrap();
        b.unmake_move();
        assert!(b.get(Pos::new(3, 3)).is_none());
        assert_eq!(b.side_to_move(), Side::White);
    }
}
