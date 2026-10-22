/** 变化树面板：候选走法 + 质量档位 + 对方最强回应树；双出口「换一个走法 / 确认这样走」 */
import type { VariationNode } from '../core/types';
import { GRADE_CLASS, GRADE_LABEL } from '../core/grade';

export class VariationTree {
  readonly root: HTMLElement;
  private listEl!: HTMLDivElement;
  private actions!: HTMLDivElement;
  private nodes: VariationNode[] = [];
  private selectedIdx = -1;
  onPickVariation: ((node: VariationNode) => void) | null = null;
  onConfirm: ((node: VariationNode) => void) | null = null;
  onRethink: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'card';
    this.root.innerHTML = `
      <h3 class="card-title">假设推演 · 变化树</h3>
      <div class="var-tree"></div>
      <div class="actions action-bar" style="margin-top:10px"></div>
    `;
    host.appendChild(this.root);
    this.listEl = this.root.querySelector('.var-tree') as HTMLDivElement;
    this.actions = this.root.querySelector('.actions') as HTMLDivElement;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.type = 'button';
    confirmBtn.textContent = '确认这样走';
    confirmBtn.addEventListener('click', () => {
      const node = this.nodes[this.selectedIdx];
      if (node) this.onConfirm?.(node);
    });
    const rethinkBtn = document.createElement('button');
    rethinkBtn.className = 'btn btn-ghost';
    rethinkBtn.type = 'button';
    rethinkBtn.textContent = '换一个走法';
    rethinkBtn.addEventListener('click', () => this.onRethink?.());
    this.actions.append(confirmBtn, rethinkBtn);
    this.actions.style.display = 'none';
  }

  /** 展示变化树（约 1.2s 内由引擎返回） */
  show(nodes: VariationNode[]): void {
    this.nodes = nodes;
    this.selectedIdx = nodes.length > 0 ? 0 : -1;
    this.actions.style.display = 'flex';
    this.render();
  }

  clear(): void {
    this.nodes = [];
    this.selectedIdx = -1;
    this.actions.style.display = 'none';
    this.listEl.innerHTML = '<div class="var-empty">点击己方棋子并选择落点后，这里会展示候选走法与对方最强回应。</div>';
  }

  private render(): void {
    if (this.nodes.length === 0) {
      this.clear();
      return;
    }
    this.listEl.replaceChildren();
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const branch = document.createElement('div');
      branch.className = 'var-node' + (i === 0 ? ' root' : '');

      const row = document.createElement('div');
      row.className = 'var-row' + (i === this.selectedIdx ? ' selected' : '');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      const grade = document.createElement('span');
      grade.className = `grade-badge ${GRADE_CLASS[node.grade]}`;
      grade.textContent = GRADE_LABEL[node.grade];

      const mv = document.createElement('strong');
      mv.textContent = node.move;

      const tags = (node.tags ?? []).map((t) => {
        const s = document.createElement('span');
        s.className = 'var-tag';
        s.textContent = t;
        return s;
      });

      row.append(grade, mv, ...tags);
      if (node.score != null) {
        const sc = document.createElement('span');
        sc.className = 'var-reply';
        sc.textContent = `评分 ${node.score > 0 ? '+' : ''}${node.score}`;
        row.appendChild(sc);
      }
      row.addEventListener('click', () => {
        this.selectedIdx = i;
        this.render();
        this.onPickVariation?.(node);
      });
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          row.click();
        }
      });
      branch.appendChild(row);

      if (node.bestReply) {
        const reply = document.createElement('div');
        reply.className = 'var-row';
        reply.style.cursor = 'default';
        const r1 = document.createElement('span');
        r1.className = 'var-reply';
        r1.textContent = `↳ 对方最强回应：${node.bestReply.move}`;
        reply.appendChild(r1);
        for (const fu of node.bestReply.followUps ?? []) {
          const r2 = document.createElement('span');
          r2.className = 'var-tag';
          r2.textContent = `${fu.move}${fu.tags?.length ? ' ' + fu.tags.join('/') : ''}`;
          reply.appendChild(r2);
        }
        branch.appendChild(reply);
      }
      for (const alt of node.altReplies ?? []) {
        const altRow = document.createElement('div');
        altRow.className = 'var-row';
        altRow.style.cursor = 'default';
        const a1 = document.createElement('span');
        a1.className = 'var-reply';
        a1.textContent = `↳ 次选 ${alt.move} → 建议 ${alt.reply}`;
        altRow.appendChild(a1);
        branch.appendChild(altRow);
      }
      this.listEl.appendChild(branch);
    }
  }
}
