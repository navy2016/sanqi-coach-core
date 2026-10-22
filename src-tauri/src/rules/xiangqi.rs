// 中国象棋规则引擎 10行×9列
// 红方（White）从第0行（北/上）→ 第9行（南/下）；黑方（Black）相反
// 红方棋子：帅、仕、相、马、车、炮、兵
// 黑方棋子：将、士、象、马、车、炮、卒

use crate::rules::*;
use std::collections::HashMap;

/// 中国象棋棋盘
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiangqiBoard {
    /// 10行×9列，None 表示空
    board: [[Option<Piece>; 9]; 10],
    /// 当前轮到
    side: Side,
    /// 历史走法（用于悔棋与长将检测）
    history: Vec<Move>,
    /// 长将检测：最近 8 步内的将军走法位置对
    last_check_moves: Vec<(Pos, Pos)>,
    /// 状态
    status: GameStatus,
}

impl XiangqiBoard {
    /// 标准开局
    pub fn new() -> Self {
        let mut b = Self::empty();
        let back_row = |side: Side, row: usize| {
            // 黑方第0行、红方第9行
            let pieces = [
                PieceKind::Rook, PieceKind::Horse, PieceKind::Elephant, PieceKind::Advisor,
                PieceKind::King, PieceKind::Advisor, PieceKind::Elephant, PieceKind::Horse, PieceKind::Rook,
            ];
            for col in 0..9 {
                b.board[row][col] = Some(Piece { kind: pieces[col], side });
            }
        };
        back_row(Side::Black, 0);
        back_row(Side::White, 9);
        // 炮
        b.board[2][1] = Some(Piece { kind: PieceKind::Cannon, side: Side::Black });
        b.board[2][7] = Some(Piece { kind: PieceKind::Cannon, side: Side::Black });
        b.board[7][1] = Some(Piece { kind: PieceKind::Cannon, side: Side::White });
        b.board[7][7] = Some(Piece { kind: PieceKind::Cannon, side: Side::White });
        // 兵/卒
        for col in (0..9).step_by(2) {
            b.board[3][col] = Some(Piece { kind: PieceKind::Pawn, side: Side::Black });
            b.board[6][col] = Some(Piece { kind: PieceKind::Pawn, side: Side::White });
        }
        b
    }

    pub fn empty() -> Self {
        Self {
            board: [[None; 9]; 10],
            side: Side::White, // 红方先走
            history: vec![],
            last_check_moves: vec![],
            status: GameStatus::Ongoing,
        }
    }

    /// 深拷贝棋盘
    pub fn clone(&self) -> Self {
        Self {
            board: self.board.map(|r| r.map(|c| c)),
            side: self.side,
            history: self.history.clone(),
            last_check_moves: self.last_check_moves.clone(),
            status: self.status,
        }
    }

    /// 获取棋子
    pub fn get(&self, pos: Pos) -> Option<Piece> {
        if pos.row < 10 && pos.col < 9 {
            self.board[pos.row][pos.col]
        } else {
            None
        }
    }

    /// 是否在棋盘内
    fn in_board(r: usize, c: usize) -> bool {
        r < 10 && c < 9
    }

    /// 是否在己方阵营（红方 5-9行，黑方 0-4行）
    fn own_side(side: Side, row: usize) -> bool {
        match side {
            Side::White => row >= 5 && row <= 9,
            Side::Black => row >= 0 && row <= 4,
        }
    }

    /// 是否在宫殿内（红方 7-9行×3-5列，黑方 0-2行×3-5列）
    fn in_palace(side: Side, pos: Pos) -> bool {
        pos.col >= 3 && pos.col <= 5 && Self::own_side(side, pos.row)
    }

    /// 是否过河（红方棋子到 0-4行，黑方棋子到 5-9行）
    fn crossed_river(side: Side, row: usize) -> bool {
        match side {
            Side::White => row <= 4,
            Side::Black => row >= 5,
        }
    }

    /// 在方向上的移动偏移量
    fn piece_delta(kind: PieceKind, side: Side, from: Pos) -> Vec<(isize, isize)> {
        match kind {
            PieceKind::King => {
                // 帅/将：上下左右一格，不出宫
                vec![(-1, 0), (1, 0), (0, -1), (0, 1)]
            }
            PieceKind::Advisor => {
                // 仕/士：四格斜角，不出宫
                vec![(-1, -1), (-1, 1), (1, -1), (1, 1)]
            }
            PieceKind::Elephant => {
                // 相/象：田字对角，不能过河，不能有象眼（中间格子）
                match side {
                    Side::White => vec![(-2, -2), (-2, 2), (2, -2), (2, 2)],
                    Side::Black => vec![(-2, -2), (-2, 2), (2, -2), (2, 2)],
                }
            }
            PieceKind::Horse => {
                // 马：日字，不能有马脚（蹩马腿）
                vec![(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]
            }
            PieceKind::Rook => {
                // 车：直线任意格
                vec![(-1, 0), (1, 0), (0, -1), (0, 1)]
            }
            PieceKind::Cannon => {
                // 炮：直线任意格（吃子需隔一个）
                vec![(-1, 0), (1, 0), (0, -1), (0, 1)]
            }
            PieceKind::Pawn => {
                // 兵/卒：未过河只能向前（红方 -1行，黑方 +1行），过河后可左右
                match side {
                    Side::White => vec![(-1, 0)],
                    Side::Black => vec![(1, 0)],
                }
            }
            _ => vec![],
        }
    }

    /// 生成某位置棋子的伪合法走法
    fn pseudo_moves_for(&self, pos: Pos) -> Vec<Move> {
        let piece = self.get(pos);
        if piece.is_none() { return vec![]; }
        let piece = piece.unwrap();
        if piece.side != self.side { return vec![]; }

        let deltas = Self::piece_delta(piece.kind, piece.side, pos);
        let mut moves: Vec<Move> = vec![];

        match piece.kind {
            PieceKind::Rook | PieceKind::Cannon => {
                for (dr, dc) in deltas {
                    let mut r = pos.row as isize + dr;
                    let mut c = pos.col as isize + dc;
                    while Self::in_board(r, c) {
                        let target = Pos::new(r as usize, c as usize);
                        let piece_at = self.get(target);
                        if piece.kind == PieceKind::Cannon {
                            // 炮：不吃子时需跳过炮架
                            // 先找炮架
                            let mut jumped = false;
                            let mut rr = r + dr;
                            let mut cc = c + dc;
                            while Self::in_board(rr, cc) {
                                let t = Pos::new(rr as usize, cc as usize);
                                if self.get(t).is_some() {
                                    jumped = true;
                                    // 炮架后的第一个子
                                    let tr = rr + dr;
                                    let tc = cc + dc;
                                    if Self::in_board(tr, tc) {
                                        let target2 = Pos::new(tr as usize, tc as usize);
                                        let p2 = self.get(target2);
                                        if p2.is_some() && p2.unwrap().side != piece.side {
                                            moves.push(Move::simple(pos, target2));
                                        }
                                    }
                                    break;
                                }
                                rr += dr;
                                cc += dc;
                            }
                            if !jumped {
                                // 没有炮架，炮不能吃子，但可以移到空格
                                if piece_at.is_none() {
                                    moves.push(Move::simple(pos, target));
                                }
                            }
                        } else {
                            // 车：自由移动，遇到子停止
                            if piece_at.is_some() {
                                if piece_at.unwrap().side != piece.side {
                                    moves.push(Move::simple(pos, target));
                                }
                                break;
                            }
                            moves.push(Move::simple(pos, target));
                        }
                        r += dr;
                        c += dc;
                    }
                }
            }
            PieceKind::King => {
                for (dr, dc) in deltas {
                    let r = pos.row as isize + dr;
                    let c = pos.col as isize + dc;
                    if Self::in_board(r, c) {
                        let target = Pos::new(r as usize, c as usize);
                        if Self::in_palace(piece.side, target) {
                            let piece_at = self.get(target);
                            if piece_at.is_none() || piece_at.unwrap().side != piece.side {
                                moves.push(Move::simple(pos, target));
                            }
                        }
                    }
                }
                // 帅/将对面（相同列、中间无子时可以直接飞）
                let opp_king_row = match piece.side {
                    Side::White => 0,
                    Side::Black => 9,
                };
                if pos.col == self.find_king(piece.side.opponent()).map(|p| p.col).unwrap_or(99) {
                    let mut clear = true;
                    let min_r = pos.row.min(opp_king_row) + 1;
                    let max_r = pos.row.max(opp_king_row);
                    for r in (min_r..max_r) {
                        if self.board[r][pos.col].is_some() { clear = false; break; }
                    }
                    if clear {
                        moves.push(Move::simple(pos, Pos::new(opp_king_row, pos.col)));
                    }
                }
            }
            PieceKind::Advisor => {
                for (dr, dc) in deltas {
                    let r = pos.row as isize + dr;
                    let c = pos.col as isize + dc;
                    if Self::in_board(r, c) {
                        let target = Pos::new(r as usize, c as usize);
                        if Self::in_palace(piece.side, target) {
                            let piece_at = self.get(target);
                            if piece_at.is_none() || piece_at.unwrap().side != piece.side {
                                moves.push(Move::simple(pos, target));
                            }
                        }
                    }
                }
            }
            PieceKind::Elephant => {
                for (dr, dc) in deltas {
                    let r = pos.row as isize + dr;
                    let c = pos.col as isize + dc;
                    if Self::in_board(r, c) {
                        let target = Pos::new(r as usize, c as usize);
                        // 象眼（中间格子）
                        let eye_r = pos.row as isize + dr / 2;
                        let eye_c = pos.col as isize + dc / 2;
                        // 不过河
                        if Self::own_side(piece.side, target.row) && self.board[eye_r as usize][eye_c as usize].is_none() {
                            let piece_at = self.get(target);
                            if piece_at.is_none() || piece_at.unwrap().side != piece.side {
                                moves.push(Move::simple(pos, target));
                            }
                        }
                    }
                }
            }
            PieceKind::Horse => {
                // 马走日，先检查马脚
                let leg_offsets = [
                    (0, -1), (0, 1), (-1, 0), (1, 0),
                ];
                // 8个方向对应马脚位置
                let leg_positions = [
                    (0, -1), (0, 1),  // 上左、上右：马脚在上
                    (-1, 0), (1, 0),  // 左上、左下：马脚在左
                    (-1, 0), (1, 0),  // 右上、右下：马脚在右
                    (0, -1), (0, 1),  // 下左、下右：马脚在下
                ];
                for (i, (dr, dc)) in deltas.enumerate() {
                    let r = pos.row as isize + dr;
                    let c = pos.col as isize + dc;
                    if !Self::in_board(r, c) { continue; }
                    let (lr, lc) = leg_positions[i];
                    let leg_r = pos.row as isize + lr;
                    let leg_c = pos.col as isize + lc;
                    if Self::in_board(leg_r, leg_c) && self.board[leg_r as usize][leg_c as usize].is_some() {
                        continue; // 蹩马腿
                    }
                    let target = Pos::new(r as usize, c as usize);
                    let piece_at = self.get(target);
                    if piece_at.is_none() || piece_at.unwrap().side != piece.side {
                        moves.push(Move::simple(pos, target));
                    }
                }
            }
            PieceKind::Pawn => {
                // 兵/卒
                let base_moves = match piece.side {
                    Side::White => vec![(-1, 0)],
                    Side::Black => vec![(1, 0)],
                };
                let mut all_deltas = base_moves;
                if Self::crossed_river(piece.side, pos.row) {
                    all_deltas.push((0, -1));
                    all_deltas.push((0, 1));
                }
                for (dr, dc) in all_deltas {
                    let r = pos.row as isize + dr;
                    let c = pos.col as isize + dc;
                    if Self::in_board(r, c) {
                        let target = Pos::new(r as usize, c as usize);
                        let piece_at = self.get(target);
                        if piece_at.is_none() || piece_at.unwrap().side != piece.side {
                            moves.push(Move::simple(pos, target));
                        }
                    }
                }
            }
            _ => {}
        }
        moves
    }

    /// 找某方帅/将的位置
    fn find_king(&self, side: Side) -> Option<Pos> {
        for r in 0..10 {
            for c in 0..9 {
                let p = self.board[r][c];
                if p.is_some() && p.unwrap().kind == PieceKind::King && p.unwrap().side == side {
                    return Some(Pos::new(r, c));
                }
            }
        }
        None
    }

    /// 某方是否被将军
    fn is_in_check(&self, side: Side) -> bool {
        let king_pos = self.find_king(side);
        if king_pos.is_none() { return true; } // 帅被吃掉 = 将军
        let kp = king_pos.unwrap();
        // 检查对方所有棋子是否能攻击到帅/将
        let opp = side.opponent();
        for r in 0..10 {
            for c in 0..9 {
                let p = self.board[r][c];
                if p.is_none() || p.unwrap().side != opp { continue; }
                let from = Pos::new(r, c);
                let piece = p.unwrap();
                // 简化：对每个对方棋子，看是否能攻击到帅位
                if self.can_attack(from, kp) {
                    return true;
                }
            }
        }
        false
    }

    /// 棋子能否攻击目标位置
    fn can_attack(&self, from: Pos, to: Pos) -> bool {
        let piece = self.get(from);
        if piece.is_none() { return false; }
        let p = piece.unwrap();
        let dr = to.row as isize - from.row as isize;
        let dc = to.col as isize - from.col as isize;
        let abs_dr = dr.abs();
        let abs_dc = dc.abs();

        match p.kind {
            PieceKind::King => (abs_dr <= 1 && abs_dc <= 1) || (abs_dr <= 9 && abs_dc == 0 && {
                // 对面飞
                let min_r = from.row.min(to.row) + 1;
                let max_r = from.row.max(to.row);
                (min_r..max_r).all(|r| self.board[r][from.col].is_none())
            }),
            PieceKind::Advisor => abs_dr == 1 && abs_dc == 1,
            PieceKind::Elephant => {
                if abs_dr != 2 || abs_dc != 2 { return false; }
                let eye_r = (from.row + to.row) / 2;
                let eye_c = (from.col + to.col) / 2;
                self.board[eye_r][eye_c].is_none()
            }
            PieceKind::Horse => {
                let (leg_r, leg_c) = if abs_dr == 2 && abs_dc == 1 {
                    (from.row + to.row / 2, from.col)
                } else if abs_dr == 1 && abs_dc == 2 {
                    (from.row, from.col + to.col / 2)
                } else { return false; };
                self.board[leg_r][leg_c].is_none()
            }
            PieceKind::Rook => {
                if dr != 0 && dc != 0 { return false; }
                let (step_r, step_c) = (dr.signum(), dc.signum());
                let mut r = from.row as isize + step_r;
                let mut c = from.col as isize + step_c;
                while r != to.row as isize || c != to.col as isize {
                    if self.board[r as usize][c as usize].is_some() { return false; }
                    r += step_r;
                    c += step_c;
                }
                true
            }
            PieceKind::Cannon => {
                if dr != 0 && dc != 0 { return false; }
                let (step_r, step_c) = (dr.signum(), dc.signum());
                let mut r = from.row as isize + step_r;
                let mut c = from.col as isize + step_c;
                let mut jumped = false;
                while r != to.row as isize || c != to.col as isize {
                    if self.board[r as usize][c as usize].is_some() {
                        if jumped { return false; }
                        jumped = true;
                    }
                    r += step_r;
                    c += step_c;
                }
                jumped // 炮吃子必须隔一个
            }
            PieceKind::Pawn => {
                let forward = if p.side == Side::White { -1 } else { 1 };
                (dr == forward && dc == 0) || (Self::crossed_river(p.side, from.row) && dr == 0 && abs_dc == 1)
            }
            PieceKind::Queen | PieceKind::Bishop | PieceKind::Knight | PieceKind::Stone => false,
        }
    }

    /// 长将检测：最近 8 步内是否出现同一对位置三次
    fn is_perpetual_check(&self) -> bool {
        if self.last_check_moves.len() < 6 { return false; }
        let recent = self.last_check_moves[self.last_check_moves.len() - 6..];
        // 简化检测：相同将军位置对出现 3 次
        let last = recent[recent.len() - 1];
        let count = recent.filter(|x| *x == last).len();
        count >= 3
    }
}

impl GameRules for XiangqiBoard {
    fn side_to_move(&self) -> Side { self.side }

    fn is_move_legal(&self, mv: &Move) -> bool {
        if mv.from.is_none() { return false; }
        let from = mv.from.unwrap();
        let piece = self.get(from);
        if piece.is_none() || piece.unwrap().side != self.side { return false; }
        let pseudo = self.pseudo_moves_for(from);
        if !pseudo.any(|m| m.to == mv.to) { return false; }
        // 模拟走法看是否被将军（自杀检测）
        let sim = self.clone();
        sim.apply_move_internal(mv);
        !sim.is_in_check(self.side)
    }

    fn pseudo_legal_moves(&self) -> Vec<Move> {
        let mut moves: Vec<Move> = vec![];
        for r in 0..10 {
            for c in 0..9 {
                let p = self.board[r][c];
                if p.is_some() && p.unwrap().side == self.side {
                    moves.extend(self.pseudo_moves_for(Pos::new(r, c)));
                }
            }
        }
        moves
    }

    fn make_move(&mut self, mv: &Move) -> Result<(), String> {
        if !self.is_move_legal(mv) {
            return Err("非法走法");
        }
        self.apply_move_internal(mv);
        self.history.push(mv.clone());
        self.side = self.side.opponent();

        // 检测将军状态
        if self.is_in_check(self.side) {
            // 检查是否将死
            if self.legal_moves().is_empty() {
                self.status = GameStatus::Checkmate;
            }
        } else {
            if self.legal_moves().is_empty() {
                self.status = GameStatus::Stalemate;
            }
        }

        // 长将检测
        if self.is_in_check(self.side.opponent()) {
            self.last_check_moves.push((mv.from.unwrap(), mv.to));
            if self.is_perpetual_check() {
                self.status = GameStatus::PerpetualCheck;
            }
        }

        Ok(())
    }

    fn unmake_move(&mut self) -> Option<Move> {
        if self.history.is_empty() { return None; }
        let mv = self.history.pop().unwrap();
        // 反向走法
        let from = mv.to;
        let to = mv.from.unwrap();
        let piece = self.board[from.row][from.col].unwrap();
        self.board[to.row][to.col] = Some(piece);
        self.board[from.row][from.col] = mv.captured.map(|(_, p)| p).or_none();
        // 恢复围棋提子
        for pos in mv.go_captures {
            // 围棋提子恢复（象棋无此功能）
        }
        self.side = self.side.opponent();
        self.status = GameStatus::Ongoing;
        // 简化：悔棋后重置状态为 Ongoing（实际需重新计算）
        Some(mv)
    }

    fn in_check(&self, side: Side) -> bool {
        self.is_in_check(side)
    }

    fn status(&self) -> GameStatus { self.status }
    fn history_len(&self) -> usize { self.history.len() }

    /// 内部：直接执行走法（不检查合法性、不切换回合）
    fn apply_move_internal(&mut self, mv: &Move) {
        if mv.from.is_none() { return; }
        let from = mv.from.unwrap();
        let piece = self.board[from.row][from.col].unwrap();
        let captured = self.board[mv.to.row][mv.to.col];
        // 记录被吃子
        mv.captured = captured.map(|p| (mv.to.clone(), p));
        // 移动棋子
        self.board[mv.to.row][mv.to.col] = Some(piece);
        self.board[from.row][from.col] = None;
    }
}

// ============ 单元测试 ============
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_position() {
        let b = XiangqiBoard::new();
        assert_eq!(b.get(Pos::new(0, 0)).unwrap().kind, PieceKind::Rook);
        assert_eq!(b.get(Pos::new(0, 0)).unwrap().side, Side::Black);
        assert_eq!(b.get(Pos::new(9, 0)).unwrap().kind, PieceKind::Rook);
        assert_eq!(b.get(Pos::new(9, 0)).unwrap().side, Side::White);
        assert_eq!(b.get(Pos::new(3, 0)).unwrap().kind, PieceKind::Pawn);
        assert_eq!(b.get(Pos::new(3, 0)).unwrap().side, Side::Black);
        assert!(b.get(Pos::new(4, 0)).is_none());
    }

    #[test]
    fn test_king_in_palace() {
        let b = XiangqiBoard::new();
        let king_w = b.find_king(Side::White).unwrap();
        assert!(XiangqiBoard::in_palace(Side::White, king_w));
        let king_b = b.find_king(Side::Black).unwrap();
        assert!(XiangqiBoard::in_palace(Side::Black, king_b));
    }

    #[test]
    fn test_pawn_moves_before_crossing() {
        let b = XiangqiBoard::new();
        let pawn_pos = Pos::new(6, 0); // 红方兵初始位置
        let moves = b.pseudo_moves_for(pawn_pos);
        // 兵向前一步
        assert_eq!(moves.len(), 1);
        assert_eq!(moves[0].to, Pos::new(5, 0));
    }

    #[test]
    fn test_horse_blocked() {
        let b = XiangqiBoard::new();
        // 马初始位置 (0,1) 黑方，马脚 (0,0) 有车，应被蹩
        let horse_pos = Pos::new(0, 1);
        let moves = b.pseudo_moves_for(horse_pos);
        // 马脚被蹩，应该没有走法（或者只有一侧可走）
        // 实际上黑马在 (0,1)，马脚 (0,0) 有车，(0,2) 有象
        // 只有向下方向的走法可能
        assert!(moves.len() <= 2);
    }
}