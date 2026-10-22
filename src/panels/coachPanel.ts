/** AI 棋理讲解面板：流式打字机（点棋子 0.5s 内开始吐字）+ 两种讲解模式入口 */
import type { CoachMode, Pos } from '../core/types';
import { onCoachStream } from '../tauri/bridge';

export class CoachPanel {
  readonly root: HTMLElement;
  private body!: HTMLDivElement;
  private buffer = '';
  private shown = 0;
  private timer: number | null = null;
  onModeRequest: ((mode: CoachMode) => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'card';
    this.root.innerHTML = `
      <h3 class="card-title">🧑‍🏫 AI 棋理讲解</h3>
      <div class="coach-mode-row">
        <button class="btn btn-primary" data-mode="situation" type="button">AI 讲解当前局面</button>
        <button class="btn btn-ghost" data-mode="piece" type="button">AI 讲解这枚棋</button>
      </div>
      <div class="coach-body" aria-live="polite"></div>
    `;
    host.appendChild(this.root);
    this.body = this.root.querySelector('.coach-body') as HTMLDivElement;
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      b.addEventListener('click', () => this.onModeRequest?.(b.dataset.mode as CoachMode));
    });
    void onCoachStream((delta) => this.appendStream(delta));
  }

  /** 开始一段新的讲解（打字机逐字输出） */
  startStream(text: string): void {
    this.stop();
    this.buffer = text;
    this.shown = 0;
    this.body.textContent = '';
    const caret = document.createElement('span');
    caret.className = 'coach-caret';
    this.body.appendChild(caret);
    this.timer = window.setInterval(() => this.tick(), 28);
  }

  private tick(): void {
    if (this.shown >= this.buffer.length) {
      this.stop();
      return;
    }
    // 每次吐 1-2 字，模拟流式分段
    const step = Math.min(2, this.buffer.length - this.shown);
    this.shown += step;
    const caret = this.body.querySelector('.coach-caret');
    const textNode = document.createTextNode(this.buffer.slice(this.shown - step, this.shown));
    this.body.insertBefore(textNode, caret);
    this.body.scrollTop = this.body.scrollHeight;
  }

  /** 后端增量推送（Tauri event coach://stream）直接追加 */
  appendStream(delta: string): void {
    if (this.timer != null) return; // 打字机进行中则并入缓冲
    const caret = this.body.querySelector('.coach-caret');
    const node = document.createTextNode(delta);
    if (caret) this.body.insertBefore(node, caret);
    else this.body.appendChild(node);
    this.body.scrollTop = this.body.scrollHeight;
  }

  /** AI 不可用时降级基础提示（art2 三层保险） */
  showFallback(lastOpponentMove: string): void {
    this.stop();
    this.body.textContent =
      `AI 服务暂不可用，已降级为基础提示：对方刚走 ${lastOpponentMove || '—'}，` +
      '建议点击棋子查看引擎给出的最佳走法。';
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.body.querySelector('.coach-caret')?.remove();
  }

  setBusy(pos: Pos | null): void {
    this.body.textContent = pos
      ? '正在替对手寻找最有力的回应……'
      : '';
  }
}
