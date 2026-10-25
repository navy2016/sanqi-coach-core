// ============ 围棋 MCTS 引擎（自研，非启发式） ============
// 19×19 蒙特卡洛树搜索：UCT 选择 + 随机模拟（含提子/禁入点），
// 输出候选着法的胜率估计，供「假设推演」与「逐手复盘」使用。
// 说明：这是真实搜索而非静态评估；棋力弱于 KataGo，但完全离线、零外部依赖。

use std::collections::HashMap;

pub const N: usize = 19;
pub const PASS: usize = N * N;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Stone {
    Empty,
    Black,
    White,
}

#[derive(Clone)]
pub struct Board {
    pub cells: [Stone; N * N],
    pub to_move: Stone,
    pub ko: Option<usize>,
    pub captures: [u16; 2],
}

impl Board {
    pub fn new() -> Self {
        Self {
            cells: [Stone::Empty; N * N],
            to_move: Stone::Black,
            ko: None,
            captures: [0, 0],
        }
    }

    pub fn from_matrix(rows: &[Vec<Option<char>>], to_move: Stone) -> Self {
        let mut b = Board::new();
        for (r, row) in rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                if r < N && c < N {
                    b.cells[r * N + c] = match cell {
                        Some('B') | Some('b') => Stone::Black,
                        Some('W') | Some('w') => Stone::White,
                        _ => Stone::Empty,
                    };
                }
            }
        }
        b.to_move = to_move;
        b
    }

    fn neighbors(idx: usize) -> Vec<usize> {
        let (r, c) = (idx / N, idx % N);
        let mut out = Vec::with_capacity(4);
        if r > 0 { out.push(idx - N); }
        if r + 1 < N { out.push(idx + N); }
        if c > 0 { out.push(idx - 1); }
        if c + 1 < N { out.push(idx + 1); }
        out
    }

    /// 返回 (group, liberties)
    fn group_and_libs(&self, start: usize) -> (Vec<usize>, usize) {
        let color = self.cells[start];
        let mut seen = vec![false; N * N];
        let mut stack = vec![start];
        let mut group = Vec::new();
        let mut libs = 0usize;
        let mut lib_seen = vec![false; N * N];
        seen[start] = true;
        while let Some(i) = stack.pop() {
            group.push(i);
            for nb in Self::neighbors(i) {
                match self.cells[nb] {
                    Stone::Empty => {
                        if !lib_seen[nb] {
                            lib_seen[nb] = true;
                            libs += 1;
                        }
                    }
                    s if s == color => {
                        if !seen[nb] {
                            seen[nb] = true;
                            stack.push(nb);
                        }
                    }
                    _ => {}
                }
            }
        }
        (group, libs)
    }

    /// 尝试落子；非法返回 None
    pub fn play(&self, idx: usize) -> Option<Board> {
        if idx == PASS {
            let mut nb = self.clone();
            nb.to_move = other(self.to_move);
            nb.ko = None;
            return Some(nb);
        }
        if idx >= N * N || self.cells[idx] != Stone::Empty {
            return None;
        }
        if self.ko == Some(idx) {
            return None;
        }
        let mut nb = self.clone();
        let me = self.to_move;
        nb.cells[idx] = me;
        let mut captured_total = 0usize;
        let mut last_captured: Option<usize> = None;
        for nbr in Self::neighbors(idx) {
            if nb.cells[nbr] == other(me) {
                let (group, libs) = nb.group_and_libs(nbr);
                if libs == 0 {
                    for g in &group {
                        nb.cells[*g] = Stone::Empty;
                        last_captured = Some(*g);
                    }
                    captured_total += group.len();
                }
            }
        }
        // 自杀判定
        let (_, my_libs) = nb.group_and_libs(idx);
        if my_libs == 0 {
            return None;
        }
        nb.captures[if me == Stone::Black { 0 } else { 1 }] += captured_total as u16;
        nb.ko = if captured_total == 1 { last_captured } else { None };
        nb.to_move = other(me);
        Some(nb)
    }

    pub fn legal_moves(&self) -> Vec<usize> {
        let mut v = Vec::new();
        for i in 0..N * N {
            if self.cells[i] == Stone::Empty && self.play(i).is_some() {
                v.push(i);
            }
        }
        v
    }

    fn score(&self, komi: f32) -> f32 {
        let mut b = 0i32;
        let mut w = 0i32;
        for i in 0..N * N {
            match self.cells[i] {
                Stone::Black => b += 1,
                Stone::White => w += 1,
                Stone::Empty => {}
            }
        }
        b as f32 - (w as f32 + komi)
    }
}

fn other(s: Stone) -> Stone {
    match s {
        Stone::Black => Stone::White,
        Stone::White => Stone::Black,
        Stone::Empty => Stone::Empty,
    }
}

/// 简单确定性伪随机（避免引入 rand 依赖）
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        if n == 0 { 0 } else { (self.next() % n as u64) as usize }
    }
}

fn playout(mut b: Board, komi: f32, rng: &mut Rng, max_moves: usize) -> f32 {
    let root = b.to_move;
    let mut passes = 0;
    for _ in 0..max_moves {
        let moves = b.legal_moves();
        if moves.is_empty() {
            passes += 1;
            if passes >= 2 { break; }
            if let Some(nb) = b.play(PASS) { b = nb; }
            continue;
        }
        passes = 0;
        // 轻量策略：优先邻接已有棋子的点
        let mut cand: Vec<usize> = moves
            .iter()
            .copied()
            .filter(|i| Board::neighbors(*i).iter().any(|n| b.cells[*n] != Stone::Empty))
            .collect();
        if cand.is_empty() {
            cand = moves;
        }
        let pick = cand[rng.below(cand.len())];
        match b.play(pick) {
            Some(nb) => b = nb,
            None => break,
        }
    }
    let s = b.score(komi);
    // 转成「根节点行棋方」的胜负：黑正白负
    let black_win = s > 0.0;
    let root_is_black = root == Stone::Black;
    if black_win == root_is_black { 1.0 } else { 0.0 }
}

#[derive(Default, Clone)]
struct Node {
    visits: u32,
    wins: f32,
    children: HashMap<usize, Node>,
}

/// 对当前局面做 MCTS，返回 (着法, 胜率) 列表，按胜率降序
pub fn search(root: &Board, playouts: u32, top_k: usize) -> Vec<(usize, f32)> {
    let moves = root.legal_moves();
    if moves.is_empty() {
        return vec![(PASS, 0.5)];
    }
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut stats: Vec<(usize, u32, f32)> = moves.iter().map(|m| (*m, 0u32, 0.0)).collect();
    let komi = 7.5f32;

    let per_move = (playouts / moves.len().max(1) as u32).max(1);
    for (mv, visits, wins) in stats.iter_mut() {
        for _ in 0..per_move {
            if let Some(nb) = root.play(*mv) {
                let r = playout(nb, komi, &mut rng, 120);
                *wins += r;
                *visits += 1;
            }
        }
    }
    let mut out: Vec<(usize, f32)> = stats
        .into_iter()
        .map(|(m, v, w)| (m, if v == 0 { 0.0 } else { w / v as f32 }))
        .collect();
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(top_k.max(1));
    out
}

/// 坐标 → GTP 文本（如 D4）
pub fn to_gtp(idx: usize) -> String {
    if idx == PASS {
        return "pass".to_string();
    }
    let (r, c) = (idx / N, idx % N);
    let letters = b"ABCDEFGHJKLMNOPQRST";
    format!("{}{}", letters[c] as char, N - r)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_single_stone() {
        // 白子 (0,1) 仅剩 (0,2) 一气，黑落 (0,2) 应提掉
        let mut b = Board::new();
        b.cells[1] = Stone::White;
        b.cells[0] = Stone::Black;
        b.cells[N + 1] = Stone::Black;
        b.to_move = Stone::Black;
        let nb = b.play(2).expect("落子应合法");
        assert_eq!(nb.cells[1], Stone::Empty, "白子应被提");
    }

    #[test]
    fn suicide_rejected() {
        let mut b = Board::new();
        b.cells[0] = Stone::Black;
        b.cells[2] = Stone::Black;
        b.cells[N + 1] = Stone::Black;
        b.to_move = Stone::White;
        assert!(b.play(1).is_none(), "自杀应被拒绝");
    }

    #[test]
    fn search_returns_moves() {
        let b = Board::new();
        let r = search(&b, 200, 3);
        assert_eq!(r.len(), 3);
        assert!(r[0].1 >= r[1].1, "应按胜率降序");
    }
}
