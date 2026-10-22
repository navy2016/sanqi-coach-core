/** 逐手评分列表：各手损失分 + 档位颜色 + 转折点高亮（全局复盘） */
import type { ScoredMove } from '../core/types';
import { GRADE_CLASS, GRADE_LABEL } from '../core/grade';

export class ScoreList {
  readonly root: HTMLElement;
  private listEl!: HTMLDivElement;
  private summaryEl!: HTMLParagraphElement;

  constructor(host: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'card';
    this.root.innerHTML = `
      <h3 class="card-title">复盘 · 逐手评分</h3>
      <div class="score-list"></div>
      <p class="summary" style="display:none;margin:10px 2px 0;font-size:13px;line-height:1.7;color:var(--text-sub)"></p>
    `;
    host.appendChild(this.root);
    this.listEl = this.root.querySelector('.score-list') as HTMLDivElement;
    this.summaryEl = this.root.querySelector('.summary') as HTMLParagraphElement;
  }

  show(moves: ScoredMove[], summary?: string): void {
    if (!moves.length) {
      this.listEl.innerHTML = '<div class="empty-state">对局结束后点「开始复盘」，这里会给出每手棋的损失分与档位。</div>';
      return;
    }
    this.listEl.replaceChildren();
    for (const m of moves) {
      const row = document.createElement('div');
      row.className = `score-row ${GRADE_CLASS[m.grade]}${m.turning ? ' turning' : ''}`;
      row.setAttribute('aria-label', `第${m.index}手 ${m.side} ${m.move} ${GRADE_LABEL[m.grade]} 损失${m.loss}分`);

      const no = document.createElement('span');
      no.className = 'no';
      no.textContent = String(m.index).padStart(2, '0');

      const side = document.createElement('span');
      side.className = 'no';
      side.style.width = '24px';
      side.textContent = m.side;

      const mv = document.createElement('span');
      mv.className = 'mv';
      mv.textContent = m.move;

      const badge = document.createElement('span');
      badge.className = `grade-badge ${GRADE_CLASS[m.grade]}`;
      badge.textContent = GRADE_LABEL[m.grade];

      const loss = document.createElement('span');
      loss.className = 'loss';
      loss.textContent = m.grade === 'global' ? '全局最优' : `-${m.loss} 分`;

      row.append(no, side, mv, badge, loss);
      if (m.turning) {
        const tp = document.createElement('span');
        tp.className = 'turning-badge';
        tp.textContent = '转折点';
        row.appendChild(tp);
      }
      if (m.note) {
        const note = document.createElement('span');
        note.className = 'var-reply';
        note.textContent = m.note;
        row.appendChild(note);
      }
      this.listEl.appendChild(row);
    }
    if (summary) {
      this.summaryEl.style.display = 'block';
      this.summaryEl.textContent = summary;
    }
  }
}