// ============ 中国象棋规则（10 行 × 9 列） ============
// 走法生成 / 合法性（蹩马腿、塞象眼、炮翻山、过河兵、九宫、飞将）/ 将军判定

use crate::rules::{GameRules, GameStatus, Move, Piece, PieceKind, Pos, Side};

const ROWS: usize = 10;
const COLS: usize = 9;

#[derive(Debug, Clone)]
pub struct XiangqiBoard {
    board: [[Option<Piece>; COLS]; ROWS],
    side: Side,
    history: Vec<Move>,
    status: GameStatus,
}

fn in_board(r: isize, c: isize) -> bool {
    (0..ROWS as isize).contains(&r) && (0..COLS as isize).contains(&c)
}

fn in_palace(side: Side, r: isize, c: isize) -> bool {
    if !(3..=5).contains(&c) {
        return false;
    }
    match side {
        Side::Black => (0..=2).contains(&r),
        Side::White => (7..=9).contains(&r),
    }
}

/// 是否已过河（对 side 而言）
fn crossed_river(side: Side, r: isize) -> bool {
    match side {
        Side::Black => r >= 5,
        Side::White => r <= 4,
    }
}

impl XiangqiBoard {
    pub fn new() -> Self {
        let mut b = Self {
            board: [[None; COLS]; ROWS],
            side: Side::White,
            history: Vec::new(),
            status: GameStatus::Ongoing,
        };
        let back = [
            PieceKind::Rook,
            PieceKind::Horse,
            PieceKind::Elephant,
            PieceKind::Advisor,
            PieceKind::King,
            PieceKind::Advisor,
            PieceKind::Elephant,
            PieceKind::Horse,
            PieceKind::Rook,
        ];
        for (c, k) in back.iter().enumerate() {
            b.board[0][c] = Some(Piece { kind: *k, side: Side::Black });
            b.board[9][c] = Some(Piece { kind: *k, side: Side::White });
        }
        b.board[2][1] = Some(Piece { kind: PieceKind::Cannon, side: Side::Black });
        b.board[2][7] = Some(Piece { kind: PieceKind::Cannon, side: Side::Black });
        b.board[7][1] = Some(Piece { kind: PieceKind::Cannon, side: Side::White });
        b.board[7][7] = Some(Piece { kind: PieceKind::Cannon, side: Side::White });
        for c in [0usize, 2, 4, 6, 8] {
            b.board[3][c] = Some(Piece { kind: PieceKind::Pawn, side: Side::Black });
            b.board[6][c] = Some(Piece { kind: PieceKind::Pawn, side: Side::White });
        }
        b
    }

    pub fn get(&self, p: Pos) -> Option<Piece> {
        if p.row < ROWS && p.col < COLS {
            self.board[p.row][p.col]
        } else {
            None
        }
    }

    fn find_king(&self, side: Side) -> Option<Pos> {
        for r in 0..ROWS {
            for c in 0..COLS {
                if let Some(p) = self.board[r][c] {
                    if p.side == side && p.kind == PieceKind::King {
                        return Some(Pos::new(r, c));
                    }
                }
            }
        }
        None
    }

    /// 两将照面（飞将）判定：同列且中间无子
    fn kings_face(&self) -> bool {
        let wk = match self.find_king(Side::White) {
            Some(p) => p,
            None => return false,
        };
        let bk = match self.find_king(Side::Black) {
            Some(p) => p,
            None => return false,
        };
        if wk.col != bk.col {
            return false;
        }
        let (lo, hi) = if wk.row < bk.row { (wk.row, bk.row) } else { (bk.row, wk.row) };
        for r in (lo + 1)..hi {
            if self.board[r][wk.col].is_some() {
                return false;
            }
        }
        true
    }

    fn attacked(&self, target: Pos, by: Side) -> bool {
        for r in 0..ROWS {
            for c in 0..COLS {
                if let Some(p) = self.board[r][c] {
                    if p.side != by {
                        continue;
                    }
                    let from = Pos::new(r, c);
                    if self.pseudo_moves_for(from).iter().any(|m| m.to == target) {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn pseudo_moves_for(&self, from: Pos) -> Vec<Move> {
        let pc = match self.get(from) {
            Some(p) => p,
            None => return vec![],
        };
        let mut out: Vec<Move> = Vec::new();
        let (r, c) = (from.row as isize, from.col as isize);

        let mut add = |to: Pos, out: &mut Vec<Move>| {
            if let Some(t) = self.get(to) {
                if t.side == pc.side {
                    return;
                }
            }
            let mut mv = Move::simple(from, to);
            if let Some(t) = self.get(to) {
                mv.captured = Some((to, t));
            }
            out.push(mv);
        };

        match pc.kind {
            PieceKind::King => {
                for (dr, dc) in [(-1isize, 0isize), (1, 0), (0, -1), (0, 1)] {
                    let (nr, nc) = (r + dr, c + dc);
                    if in_board(nr, nc) && in_palace(pc.side, nr, nc) {
                        add(Pos::new(nr as usize, nc as usize), &mut out);
                    }
                }
            }
            PieceKind::Advisor => {
                for (dr, dc) in [(-1isize, -1isize), (-1, 1), (1, -1), (1, 1)] {
                    let (nr, nc) = (r + dr, c + dc);
                    if in_board(nr, nc) && in_palace(pc.side, nr, nc) {
                        add(Pos::new(nr as usize, nc as usize), &mut out);
                    }
                }
            }
            PieceKind::Elephant => {
                for (dr, dc) in [(-2isize, -2isize), (-2, 2), (2, -2), (2, 2)] {
                    let (nr, nc) = (r + dr, c + dc);
                    if !in_board(nr, nc) {
                        continue;
                    }
                    // 不能过河
                    let crosses = match pc.side {
                        Side::Black => nr >= 5,
                        Side::White => nr <= 4,
                    };
                    if crosses {
                        continue;
                    }
                    // 塞象眼
                    let eye = Pos::new((r + dr / 2) as usize, (c + dc / 2) as usize);
                    if self.get(eye).is_some() {
                        continue;
                    }
                    add(Pos::new(nr as usize, nc as usize), &mut out);
                }
            }
            PieceKind::Horse => {
                for (dr, dc) in [
                    (-2isize, -1isize),
                    (-2, 1),
                    (-1, -2),
                    (-1, 2),
                    (1, -2),
                    (1, 2),
                    (2, -1),
                    (2, 1),
                ] {
                    let (nr, nc) = (r + dr, c + dc);
                    if !in_board(nr, nc) {
                        continue;
                    }
                    // 蹩马腿
                    let leg = if dr.abs() == 2 {
                        Pos::new((r + dr / 2) as usize, c as usize)
                    } else {
                        Pos::new(r as usize, (c + dc / 2) as usize)
                    };
                    if self.get(leg).is_some() {
                        continue;
                    }
                    add(Pos::new(nr as usize, nc as usize), &mut out);
                }
            }
            PieceKind::Rook => {
                for (dr, dc) in [(-1isize, 0isize), (1, 0), (0, -1), (0, 1)] {
                    let (mut rr, mut cc) = (r + dr, c + dc);
                    while in_board(rr, cc) {
                        let to = Pos::new(rr as usize, cc as usize);
                        match self.get(to) {
                            Some(t) => {
                                if t.side != pc.side {
                                    let mut mv = Move::simple(from, to);
                                    mv.captured = Some((to, t));
                                    out.push(mv);
                                }
                                break;
                            }
                            None => out.push(Move::simple(from, to)),
                        }
                        rr += dr;
                        cc += dc;
                    }
                }
            }
            PieceKind::Cannon => {
                for (dr, dc) in [(-1isize, 0isize), (1, 0), (0, -1), (0, 1)] {
                    let (mut rr, mut cc) = (r + dr, c + dc);
                    let mut screen = false;
                    while in_board(rr, cc) {
                        let to = Pos::new(rr as usize, cc as usize);
                        match self.get(to) {
                            Some(t) => {
                                if !screen {
                                    screen = true;
                                } else {
                                    if t.side != pc.side {
                                        let mut mv = Move::simple(from, to);
                                        mv.captured = Some((to, t));
                                        out.push(mv);
                                    }
                                    break;
                                }
                            }
                            None => {
                                if !screen {
                                    out.push(Move::simple(from, to));
                                }
                            }
                        }
                        rr += dr;
                        cc += dc;
                    }
                }
            }
            PieceKind::Pawn => {
                let fwd: isize = match pc.side {
                    Side::Black => 1,
                    Side::White => -1,
                };
                if in_board(r + fwd, c) {
                    add(Pos::new((r + fwd) as usize, c as usize), &mut out);
                }
                if crossed_river(pc.side, r) {
                    for dc in [-1isize, 1] {
                        if in_board(r, c + dc) {
                            add(Pos::new(r as usize, (c + dc) as usize), &mut out);
                        }
                    }
                }
            }
            _ => {}
        }
        out
    }

    fn apply_internal(&mut self, mv: &Move) -> Option<Piece> {
        let from = mv.from?;
        let piece = self.board[from.row][from.col]?;
        self.board[mv.to.row][mv.to.col] = Some(Piece {
            kind: piece.kind,
            side: piece.side,
        });
        self.board[from.row][from.col] = None;
        Some(piece)
    }
}

impl GameRules for XiangqiBoard {
    fn side_to_move(&self) -> Side {
        self.side
    }

    fn is_move_legal(&self, mv: &Move) -> bool {
        let from = match mv.from {
            Some(f) => f,
            None => return false,
        };
        match self.get(from) {
            Some(p) if p.side == self.side => {}
            _ => return false,
        }
        if !self.pseudo_moves_for(from).iter().any(|m| m.to == mv.to) {
            return false;
        }
        let mut probe = self.clone();
        probe.apply_internal(mv);
        if probe.kings_face() {
            return false;
        }
        !probe.attacked(
            match probe.find_king(self.side) {
                Some(k) => k,
                None => return false,
            },
            self.side.opponent(),
        )
    }

    fn pseudo_legal_moves(&self) -> Vec<Move> {
        let mut out = Vec::new();
        for r in 0..ROWS {
            for c in 0..COLS {
                if let Some(p) = self.board[r][c] {
                    if p.side == self.side {
                        out.extend(self.pseudo_moves_for(Pos::new(r, c)));
                    }
                }
            }
        }
        out
    }

    fn make_move(&mut self, mv: &Move) -> Result<(), String> {
        if !self.is_move_legal(mv) {
            return Err("非法走法".into());
        }
        let mut recorded = mv.clone();
        if recorded.captured.is_none() {
            if let Some(t) = self.get(mv.to) {
                recorded.captured = Some((mv.to, t));
            }
        }
        self.apply_internal(&recorded);
        self.history.push(recorded);
        self.side = self.side.opponent();
        let has_legal = !self.legal_moves().is_empty();
        self.status = if has_legal {
            GameStatus::Ongoing
        } else if self.in_check(self.side) {
            GameStatus::Checkmate
        } else {
            GameStatus::Stalemate
        };
        Ok(())
    }

    fn unmake_move(&mut self) -> Option<Move> {
        let mv = self.history.pop()?;
        let from = mv.from?;
        let moved = self.board[mv.to.row][mv.to.col]?;
        if let Some((cap_pos, cap)) = mv.captured {
            self.board[cap_pos.row][cap_pos.col] = Some(cap);
        }
        self.board[mv.to.row][mv.to.col] = None;
        self.board[from.row][from.col] = Some(Piece {
            kind: moved.kind,
            side: moved.side,
        });
        self.side = moved.side;
        self.status = GameStatus::Ongoing;
        Some(mv)
    }

    fn in_check(&self, side: Side) -> bool {
        match self.find_king(side) {
            Some(k) => self.attacked(k, side.opponent()) || self.kings_face(),
            None => false,
        }
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
    fn test_initial_position() {
        let b = XiangqiBoard::new();
        assert_eq!(b.side_to_move(), Side::White);
        assert!(b.get(Pos::new(9, 4)).is_some(), "白帅应在 (9,4)");
        assert!(b.get(Pos::new(0, 4)).is_some(), "黑将应在 (0,4)");
    }

    #[test]
    fn test_pawn_forward_only_before_river() {
        let b = XiangqiBoard::new();
        let moves = b.pseudo_moves_for(Pos::new(6, 0));
        assert_eq!(moves.len(), 1, "未过河兵只能前进");
        assert_eq!(moves[0].to, Pos::new(5, 0));
    }

    #[test]
    fn test_horse_blocked_by_leg() {
        let b = XiangqiBoard::new();
        // 初始局面马被自己兵/相挡住部分方向，但至少应有 2 个走法
        let moves = b.pseudo_moves_for(Pos::new(9, 1));
        assert!(!moves.is_empty());
    }

    #[test]
    fn test_cannon_capture_needs_screen() {
        let mut b = XiangqiBoard::new();
        // 炮 (7,1) 沿列向上：先无子可走，遇黑炮(2,1) 需翻山
        let moves = b.pseudo_moves_for(Pos::new(7, 1));
        let captures: Vec<_> = moves.iter().filter(|m| m.captured.is_some()).collect();
        assert!(captures.is_empty(), "隔着空档不应有吃子");
    }

    #[test]
    fn test_move_and_undo() {
        let mut b = XiangqiBoard::new();
        let before = b.legal_moves().len();
        b.make_move(&Move::simple(Pos::new(6, 0), Pos::new(5, 0))).unwrap();
        assert_eq!(b.side_to_move(), Side::Black);
        b.unmake_move();
        assert_eq!(b.side_to_move(), Side::White);
        assert_eq!(b.legal_moves().len(), before);
    }
}
