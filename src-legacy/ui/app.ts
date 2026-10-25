/**
 * 应用主装配：布局 / 棋种切换 / 棋盘交互闭环
 * 交互闭环（SPEC 3.1）：点击棋子 → 高亮合法落点 → 点击落点 → 假设推演(变化树)
 * →「换一个走法」重选 或「确认这样走」正式落子。
 */
import type { CoachMode, GameKind, Move, Pos } from '../core/types';
import { api } from '../tauri/bridge';
import { XiangqiBoard } from '../boards/xiangqi';
import { ChessBoard } from '../boards/chess';
import { GoBoard, type GoStone } from '../boards/go';
import { startXiangqi, startChess } from './presets';
import { CoachPanel } from '../panels/coachPanel';
import { VariationTree } from '../panels/variationTree';
import { ScoreList } from '../panels/scoreList';
import { SettingsPage } from './settings';

export class App {
  private kind: GameKind = 'xiangqi';
  private board: XiangqiBoard | ChessBoard | GoBoard | null = null;
  private selected: Pos | null = null;
  /** 假设推演通过后待确认的走法 */
  private pendingMove: Move | null = null;
  private lastOpponentMove = '';
  private gameId = 'local-demo';
  /** 后端返回的真实局面标签矩阵；null 表示尚未开局，用初始局面 */
  private labels: (string | null)[][] | null = null;
  /** AI 难度（原文三级设计：入门/进阶/挑战） */
  private difficulty: 'beginner' | 'intermediate' | 'challenge' = 'intermediate';
  private goGrid: (GoStone | null)[][] = Array.from({ length: 19 }, () =>
    Array.from({ length: 19 }, () => null as GoStone | null),
  );

  private coach!: CoachPanel;
  private variations!: VariationTree;
  private scoreList!: ScoreList;
  private settings = new SettingsPage();

  mount(host: HTMLElement): void {
    host.innerHTML = `
      <header class="app-header">
        <div class="brand">🧠 三棋思维教练</div>
        <nav class="tabs" role="tablist" aria-label="棋种切换">
          <button class="tab-btn active" data-kind="xiangqi" role="tab" aria-selected="true">中国象棋</button>
          <button class="tab-btn" data-kind="chess" role="tab" aria-selected="false">国际象棋</button>
          <button class="tab-btn" data-kind="go" role="tab" aria-selected="false">围棋</button>
        </nav>
        <button class="btn btn-ghost" data-act="settings" type="button">⚙️ AI 设置</button>
        <select class="difficulty-select" data-act="difficulty" aria-label="AI 难度">
          <option value="beginner">入门</option>
          <option value="intermediate" selected>进阶</option>
          <option value="challenge">挑战</option>
        </select>
      </header>
      <main class="app-main">
        <div class="board-zone"><div class="board-wrap"></div></div>
        <aside class="side-panel"></aside>
      </main>
      <div class="bottom-bar" aria-hidden="false">
        <button class="btn btn-ghost" data-act="undo" type="button">↩ 悔棋</button>
        <button class="btn btn-primary" data-act="analyze" type="button">复盘</button>
        <button class="btn btn-ghost" data-act="coach" type="button">🧑‍🏫 AI 讲解当前局面</button>
      </div>
    `;
    this.boardHost = host.querySelector('.board-wrap') as HTMLDivElement;
    const side = host.querySelector('.side-panel') as HTMLElement;
    this.coach = new CoachPanel(side);
    this.variations = new VariationTree(side);
    this.scoreList = new ScoreList(side);
    document.body.appendChild(this.settings.root);

    host.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => {
      b.addEventListener('click', () => this.switchKind(b.dataset.kind as GameKind));
    });
    host.querySelector('[data-act="settings"]')?.addEventListener('click', () => void this.settings.open());
    host.querySelector('[data-act="undo"]')?.addEventListener('click', () => void this.undo());
    host.querySelector('[data-act="analyze"]')?.addEventListener('click', () => void this.analyze());
    host.querySelector('[data-act="coach"]')?.addEventListener('click', () => void this.requestCoach('situation'));
    host.querySelector<HTMLSelectElement>('[data-act="difficulty"]')?.addEventListener('change', (e) => {
      this.difficulty = (e.target as HTMLSelectElement).value as typeof this.difficulty;
    });

    this.coach.onModeRequest = (mode) => void this.requestCoach(mode);
    this.variations.onConfirm = (node) => this.confirmMove(node.move);
    this.variations.onRethink = () => {
      this.selected = null;
      this.pendingMove = null;
      this.renderBoardState();
      this.variations.clear();
    };

    this.switchKind('xiangqi');
  }

  private boardHost!: HTMLDivElement;

  private switchKind(kind: GameKind): void {
    if (!kind || (kind === this.kind && this.board)) return;
    this.kind = kind;
    this.selected = null;
    this.pendingMove = null;
    this.boardHost.replaceChildren();
    this.variations.clear();
    this.coach.stop();
    this.coach.showFallback('');

    let b: XiangqiBoard | ChessBoard | GoBoard;
    if (kind === 'xiangqi') b = new XiangqiBoard(this.boardHost);
    else if (kind === 'chess') b = new ChessBoard(this.boardHost);
    else b = new GoBoard(this.boardHost, 19);
    this.board = b;
    b.onClick = (pos) => this.onCellClick(pos);
    this.renderBoardState();

    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
      const active = btn.dataset.kind === kind;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
  }

  private onCellClick(pos: Pos): void {
    if (!this.board) return;
    const piece = (this.board as unknown as { pieceAt(p: Pos): unknown }).pieceAt(pos);

    // 未选中：点己方棋子 → 选中并高亮周边候选落点（正式合法落点由后端在推演时校验）
    if (!this.selected) {
      if (piece != null) {
        this.selected = pos;
        this.renderBoardState(this.surrounding(pos));
      }
      return;
    }

    // 已选中：点另一枚有子的格 → 换选
    if (piece != null) {
      this.selected = pos;
      this.renderBoardState(this.surrounding(pos));
      return;
    }

    // 点击空白落点 → 进入假设推演（不立即落子）
    const move = this.toMove(this.selected, pos);
    this.pendingMove = move;
    this.selected = pos;
    this.coach.setBusy(pos);
    this.variations.clear();
    this.renderBoardState([]);
    void api.getVariations(this.kind, this.gameId, move, this.difficulty)
      .then((res) => {
        this.coach.stop();
        this.variations.show(res.root);
      })
      .catch(() => this.coach.showFallback(this.lastOpponentMove));
  }

  private confirmMove(moveName: string): void {
    if (!this.board || !this.pendingMove) return;
    void api.makeMove(this.kind, this.gameId, this.pendingMove)
      .then((state) => {
        this.lastOpponentMove = moveName;
        this.pendingMove = null;
        this.selected = null;
        this.variations.clear();
        // 用后端返回的真实局面刷新棋盘（此前一直渲染初始局面，导致「落子没反应」）
        if (state.labels) this.labels = state.labels;
        this.renderBoardState();
      });
  }

  private async undo(): Promise<void> {
    const state = await api.undoMove(this.kind, this.gameId);
    this.selected = null;
    this.pendingMove = null;
    this.variations.clear();
    if (state.labels) this.labels = state.labels;
    this.renderBoardState();
  }

  private async analyze(): Promise<void> {
    const { moves, summary } = await api.analyzeGame(this.kind, this.gameId);
    this.scoreList.show(moves, summary);
  }

  private async requestCoach(mode: CoachMode): Promise<void> {
    const pos = this.selected; // 「讲解这枚棋」取当前选中子
    if (mode === 'piece' && !pos) {
      this.coach.showFallback('请先点击一枚己方棋子，再选择「AI 讲解这枚棋」。');
      return;
    }
    this.coach.startStream('');
    try {
      const { text } = await api.getCoaching(this.kind, this.gameId, mode, pos ?? undefined);
      this.coach.startStream(text);
    } catch {
      this.coach.showFallback(this.lastOpponentMove);
    }
  }

  private surrounding(pos: Pos): Pos[] {
    const cols = this.board?.cols ?? 9;
    const rows = this.board?.rows ?? 10;
    const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    const res: Pos[] = [];
    for (const [dc, dr] of offsets) {
      const c = pos.col + dc;
      const r = pos.row + dr;
      if (c >= 0 && r >= 0 && c < cols && r < rows) res.push({ col: c, row: r });
    }
    return res;
  }

  private toMove(from: Pos, to: Pos): Move {
    return this.kind === 'go' ? { from: null, to } : { from, to };
  }

  private renderBoardState(hints: Pos[] = []): void {
    if (!this.board) return;
    const shared = { selected: this.selected, hints, lastMove: null };
    const L = this.labels;
    if (this.board instanceof XiangqiBoard) {
      this.board.setState({ pieces: L ? this.toXiangqi(L) : startXiangqi(), ...shared });
    } else if (this.board instanceof ChessBoard) {
      this.board.setState({ pieces: L ? this.toChess(L) : startChess(), ...shared });
    } else {
      this.board.setState({ pieces: L ? this.toGo(L) : this.goGrid, ...shared });
    }
  }

  /** "white:K" → 象棋棋子（white=红方） */
  private toXiangqi(L: (string | null)[][]): (import('../boards/xiangqi').XiangqiPiece | null)[][] {
    const NAMES: Record<string, [string, string]> = {
      K: ['帅', '将'], A: ['仕', '士'], E: ['相', '象'], H: ['马', '马'],
      R: ['车', '车'], C: ['炮', '炮'], P: ['兵', '卒'], B: ['相', '象'], N: ['马', '马'],
    };
    return L.map((row) =>
      row.map((cell) => {
        if (!cell) return null;
        const [side, name] = cell.split(':');
        const isRed = side === 'white';
        const pair = NAMES[name] ?? ['?', '?'];
        return { side: isRed ? ('red' as const) : ('black' as const), label: isRed ? pair[0] : pair[1] };
      }),
    );
  }

  /** "white:K" → 国象棋子 */
  private toChess(L: (string | null)[][]): (import('../boards/chess').ChessPiece | null)[][] {
    return L.map((row) =>
      row.map((cell) => {
        if (!cell) return null;
        const [side, name] = cell.split(':');
        return {
          side: side === 'white' ? ('white' as const) : ('black' as const),
          kind: name as import('../boards/chess').ChessPiece['kind'],
        };
      }),
    );
  }

  /** "white:S" → 围棋棋子 */
  private toGo(L: (string | null)[][]): (GoStone | null)[][] {
    return L.map((row) =>
      row.map((cell) => {
        if (!cell) return null;
        return cell.startsWith('white') ? ('white' as const) : ('black' as const);
      }),
    );
  }
}
