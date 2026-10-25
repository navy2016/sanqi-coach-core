// ============ 国际象棋规则（8×8） ============
// 走法生成 + 合法性（王车易位 / 过路兵 / 升变 / 将军判定）

use crate::rules::{GameRules, GameStatus, Move, Piece, PieceKind, Pos, Side};

#[derive(Debug, Clone)]
pub struct ChessBoard {
    board: [[Option<Piece>; 8]; 8],
    side: Side,
    history: Vec<Move>,
    status: GameStatus,
}

fn in_board(r: isize, c: isize) -> bool {
    (0..8).contains(&r) && (0..8).contains(&c)
}

impl ChessBoard {
    pub fn new() -> Self {
        let mut b = Self {
            board: [[None; 8]; 8],
            side: Side::White,
            history: Vec::new(),
            status: GameStatus::Ongoing,
        };
        let back = [
            PieceKind::Rook,
            PieceKind::Knight,
            PieceKind::Bishop,
            PieceKind::Queen,
            PieceKind::King,
            PieceKind::Bishop,
            PieceKind::Knight,
            PieceKind::Rook,
        ];
        for c in 0..8 {
            b.board[0][c] = Some(Piece { kind: back[c], side: Side::Black });
            b.board[1][c] = Some(Piece { kind: PieceKind::Pawn, side: Side::Black });
            b.board[6][c] = Some(Piece { kind: PieceKind::Pawn, side: Side::White });
            b.board[7][c] = Some(Piece { kind: back[c], side: Side::White });
        }
        b
    }

    pub fn get(&self, p: Pos) -> Option<Piece> {
        if p.row < 8 && p.col < 8 {
            self.board[p.row][p.col]
        } else {
            None
        }
    }

    fn find_king(&self, side: Side) -> Option<Pos> {
        for r in 0..8 {
            for c in 0..8 {
                if let Some(pc) = self.board[r][c] {
                    if pc.side == side && pc.kind == PieceKind::King {
                        return Some(Pos::new(r, c));
                    }
                }
            }
        }
        None
    }

    fn attacked(&self, target: Pos, by: Side) -> bool {
        for r in 0..8 {
            for c in 0..8 {
                if let Some(pc) = self.board[r][c] {
                    if pc.side != by {
                        continue;
                    }
                    let from = Pos::new(r, c);
                    for mv in self.pseudo_moves_for(from) {
                        if mv.to == target {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    fn in_check(&self, side: Side) -> bool {
        match self.find_king(side) {
            Some(k) => self.attacked(k, side.opponent()),
            None => false,
        }
    }

    fn pseudo_moves_for(&self, from: Pos) -> Vec<Move> {
        let pc = match self.get(from) {
            Some(p) => p,
            None => return vec![],
        };
        let mut out = Vec::new();
        let (r, c) = (from.row as isize, from.col as isize);

        let mut push = |to: Pos, out: &mut Vec<Move>| {
            if let Some(t) = self.get(to) {
                if t.side == pc.side {
                    return;
                }
            }
            out.push(Move::simple(from, to));
        };

        match pc.kind {
            PieceKind::Pawn => {
                let dir: isize = if pc.side == Side::White { -1 } else { 1 };
                let start_row = if pc.side == Side::White { 6 } else { 1 };
                let promo_row = if pc.side == Side::White { 0 } else { 7 };

                // 前进一格
                if in_board(r + dir, c) && self.get(Pos::new((r + dir) as usize, c as usize)).is_none() {
                    let to = Pos::new((r + dir) as usize, c as usize);
                    if to.row as isize == promo_row {
                        for k in [PieceKind::Queen, PieceKind::Rook, PieceKind::Bishop, PieceKind::Knight] {
                            let mut mv = Move::simple(from, to);
                            mv.promotion = Some(k);
                            out.push(mv);
                        }
                    } else {
                        out.push(Move::simple(from, to));
                    }
                    // 前进两格
                    if r as usize == start_row
                        && self.get(Pos::new((r + 2 * dir) as usize, c as usize)).is_none()
                    {
                        out.push(Move::simple(from, Pos::new((r + 2 * dir) as usize, c as usize)));
                    }
                }
                // 斜吃
                for dc in [-1isize, 1] {
                    if in_board(r + dir, c + dc) {
                        let to = Pos::new((r + dir) as usize, (c + dc) as usize);
                        match self.get(to) {
                            Some(t) if t.side != pc.side => {
                                if to.row as isize == promo_row {
                                    for k in [PieceKind::Queen, PieceKind::Rook, PieceKind::Bishop, PieceKind::Knight] {
                                        let mut mv = Move::simple(from, to);
                                        mv.promotion = Some(k);
                                        mv.captured = Some((to, t));
                                        out.push(mv);
                                    }
                                } else {
                                    let mut mv = Move::simple(from, to);
                                    mv.captured = Some((to, t));
                                    out.push(mv);
                                }
                            }
                            _ => {
                                // 过路兵
                                if let Some(last) = self.history.last() {
                                    if let (Some(lf), true) = (last.from, last.to.row.abs_diff(from.row) == 0) {
                                        let _ = lf;
                                    }
                                    if let Some(lf) = last.from {
                                        let is_double_pawn = self
                                            .get(last.to)
                                            .map(|p| p.kind == PieceKind::Pawn)
                                            .unwrap_or(false)
                                            && lf.row.abs_diff(last.to.row) == 2;
                                        if is_double_pawn
                                            && last.to.row == from.row
                                            && last.to.col == (c + dc) as usize
                                        {
                                            let cap_pos = Pos::new(from.row, (c + dc) as usize);
                                            if let Some(cap) = self.get(cap_pos) {
                                                let mut mv = Move::simple(from, to);
                                                mv.is_en_passant = true;
                                                mv.captured = Some((cap_pos, cap));
                                                out.push(mv);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            PieceKind::Knight => {
                for (dr, dc) in [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)] {
                    if in_board(r + dr, c + dc) {
                        push(Pos::new((r + dr) as usize, (c + dc) as usize), &mut out);
                    }
                }
            }
            PieceKind::Bishop | PieceKind::Rook | PieceKind::Queen => {
                let dirs: &[(isize, isize)] = match pc.kind {
                    PieceKind::Bishop => &[(-1, -1), (-1, 1), (1, -1), (1, 1)],
                    PieceKind::Rook => &[(-1, 0), (1, 0), (0, -1), (0, 1)],
                    _ => &[(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)],
                };
                for (dr, dc) in dirs {
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
            PieceKind::King => {
                for dr in -1isize..=1 {
                    for dc in -1isize..=1 {
                        if dr == 0 && dc == 0 {
                            continue;
                        }
                        if in_board(r + dr, c + dc) {
                            push(Pos::new((r + dr) as usize, (c + dc) as usize), &mut out);
                        }
                    }
                }
                // 王车易位：王未动、车未动、中间空、王不在被将状态
                let home_row = if pc.side == Side::White { 7usize } else { 0usize };
                if from.row == home_row && from.col == 4 && !self.in_check(pc.side) {
                    let king_moved = self.history.iter().any(|m| {
                        m.from.map(|f| f.row == home_row && f.col == 4).unwrap_or(false)
                    });
                    if !king_moved {
                        // 短易位
                        let rook_short = self.get(Pos::new(home_row, 7));
                        let empty_short = self.get(Pos::new(home_row, 5)).is_none()
                            && self.get(Pos::new(home_row, 6)).is_none();
                        if let Some(rk) = rook_short {
                            if rk.kind == PieceKind::Rook && rk.side == pc.side && empty_short
                                && !self.attacked(Pos::new(home_row, 5), pc.side.opponent())
                                && !self.attacked(Pos::new(home_row, 6), pc.side.opponent())
                            {
                                let mut mv = Move::simple(from, Pos::new(home_row, 6));
                                mv.is_castle = true;
                                out.push(mv);
                            }
                        }
                        // 长易位
                        let rook_long = self.get(Pos::new(home_row, 0));
                        let empty_long = self.get(Pos::new(home_row, 1)).is_none()
                            && self.get(Pos::new(home_row, 2)).is_none()
                            && self.get(Pos::new(home_row, 3)).is_none();
                        if let Some(rk) = rook_long {
                            if rk.kind == PieceKind::Rook && rk.side == pc.side && empty_long
                                && !self.attacked(Pos::new(home_row, 3), pc.side.opponent())
                                && !self.attacked(Pos::new(home_row, 2), pc.side.opponent())
                            {
                                let mut mv = Move::simple(from, Pos::new(home_row, 2));
                                mv.is_castle = true;
                                out.push(mv);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        out
    }

    fn apply_internal(&mut self, mv: &Move) {
        let from = match mv.from {
            Some(f) => f,
            None => return,
        };
        let piece = match self.board[from.row][from.col] {
            Some(p) => p,
            None => return,
        };
        // 过路兵：被吃兵不在 to
        if mv.is_en_passant {
            self.board[from.row][mv.to.col] = None;
        }
        self.board[mv.to.row][mv.to.col] = Some(Piece {
            kind: mv.promotion.unwrap_or(piece.kind),
            side: piece.side,
        });
        self.board[from.row][from.col] = None;
        // 易位时同步移动车
        if mv.is_castle {
            let row = from.row;
            if mv.to.col == 6 {
                self.board[row][5] = self.board[row][7].take();
            } else if mv.to.col == 2 {
                self.board[row][3] = self.board[row][0].take();
            }
        }
    }
}

impl GameRules for ChessBoard {
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
        if !self.pseudo_moves_for(from).iter().any(|m| m.to == mv.to && m.promotion == mv.promotion) {
            return false;
        }
        let mut probe = self.clone();
        probe.apply_internal(mv);
        !probe.in_check(self.side)
    }

    fn pseudo_legal_moves(&self) -> Vec<Move> {
        let mut out = Vec::new();
        for r in 0..8 {
            for c in 0..8 {
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
        // 状态更新
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
        // 还原被吃子
        if let Some((cap_pos, cap)) = mv.captured {
            self.board[cap_pos.row][cap_pos.col] = Some(cap);
        }
        self.board[mv.to.row][mv.to.col] = None;
        self.board[from.row][from.col] = Some(Piece {
            kind: if mv.promotion.is_some() { PieceKind::Pawn } else { moved.kind },
            side: moved.side,
        });
        if mv.is_castle {
            let row = from.row;
            if mv.to.col == 6 {
                self.board[row][7] = self.board[row][5].take();
            } else if mv.to.col == 2 {
                self.board[row][0] = self.board[row][3].take();
            }
        }
        self.side = moved.side;
        self.status = GameStatus::Ongoing;
        Some(mv)
    }

    fn in_check(&self, side: Side) -> bool {
        ChessBoard::in_check(self, side)
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
    fn test_initial_legal_moves_20() {
        let b = ChessBoard::new();
        assert_eq!(b.legal_moves().len(), 20);
    }

    #[test]
    fn test_pawn_double_push() {
        let mut b = ChessBoard::new();
        let mv = Move::simple(Pos::new(6, 4), Pos::new(4, 4));
        assert!(b.make_move(&mv).is_ok());
        assert_eq!(b.side_to_move(), Side::Black);
    }

    #[test]
    fn test_undo_restores() {
        let mut b = ChessBoard::new();
        let before = b.legal_moves().len();
        b.make_move(&Move::simple(Pos::new(6, 4), Pos::new(4, 4))).unwrap();
        b.unmake_move();
        assert_eq!(b.legal_moves().len(), before);
        assert_eq!(b.side_to_move(), Side::White);
    }

    #[test]
    fn test_illegal_move_rejected() {
        let mut b = ChessBoard::new();
        assert!(b.make_move(&Move::simple(Pos::new(6, 0), Pos::new(3, 0))).is_err());
    }
}
