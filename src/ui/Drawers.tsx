/** 棋谱教学（514 局六类）与残局挑战（10 排局）抽屉 */
import { useState } from 'react';

const CATEGORIES = ['启蒙', '开局', '中局', '杀法', '战术', '残局'] as const;

/** 说明：原文为「514 局，六类」，此处提供分类骨架与示例条目；
 *  完整 514 局棋谱数据需从原项目导入（见 SPEC-V2 §5）。 */
const SAMPLE_STUDY: Record<(typeof CATEGORIES)[number], string[]> = {
  启蒙: ['当头炮开局示范', '屏风马应对示范'],
  开局: ['中炮对屏风马', '顺炮直车对横车'],
  中局: ['中路突破范例', '侧翼牵制范例'],
  杀法: ['双车错杀法', '马后炮杀法'],
  战术: ['捉双战术', '弃子引离战术'],
  残局: ['单车例胜单士', '马兵例胜单士'],
};

const ENDGAMES = [
  { name: '野马操田', goal: '红方胜' },
  { name: '七星聚会', goal: '红方胜' },
  { name: '蚯蚓降龙', goal: '红方胜' },
  { name: '千里独行', goal: '和棋' },
  { name: '火烧连营', goal: '红方胜' },
  { name: '大九连环', goal: '和棋' },
  { name: '小征东', goal: '红方胜' },
  { name: '带子入朝', goal: '红方胜' },
  { name: '炮打两狼关', goal: '红方胜' },
  { name: '车马临门', goal: '红方胜' },
];

export function StudyDrawer({ onClose }: { onClose: () => void }) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('开局');
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal drawer" onClick={(e) => e.stopPropagation()}>
        <h3>棋谱教学 · 514 局六类</h3>
        <nav className="tabs">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`tab-btn ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </nav>
        <ul className="list">
          {SAMPLE_STUDY[cat].map((name) => (
            <li key={name} className="list-row">
              <span>{name}</span>
              <button className="btn btn-ghost" type="button">
                打谱
              </button>
            </li>
          ))}
        </ul>
        <p className="muted">
          打谱时会校验「和原谱不一致，要不要回到原谱」，并支持从任意局面「开始训练」。
          完整 514 局棋谱数据待从原项目导入（见 SPEC-V2 §5）。
        </p>
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndgameDrawer({ onClose, onLoad }: { onClose: () => void; onLoad: (fen: string) => void }) {
  const [fen, setFen] = useState('');
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal drawer" onClick={(e) => e.stopPropagation()}>
        <h3>残局挑战 · 10 个经典排局</h3>
        <ul className="list">
          {ENDGAMES.map((e) => (
            <li key={e.name} className="list-row">
              <span>
                {e.name} <em className="tag">[{e.goal}]</em>
              </span>
              <button className="btn btn-ghost" type="button" onClick={() => onLoad(e.name)}>
                开始
              </button>
            </li>
          ))}
        </ul>
        <label className="fen-input">
          自定义残局（粘贴 FEN）
          <input value={fen} onChange={(e) => setFen(e.target.value)} placeholder="如 3k5/9/9/9/9/9/9/9/9/4K4 w" />
        </label>
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            关闭
          </button>
          <button className="btn btn-primary" type="button" disabled={!fen.trim()} onClick={() => onLoad(fen.trim())}>
            载入局面
          </button>
        </div>
        <p className="muted">排局 FEN 数据待补；载入后走错会提示引擎给出的最佳应对。</p>
      </div>
    </div>
  );
}
