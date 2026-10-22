/** AI 服务设置页：baseUrl / key / model（DeepSeek、智谱 GLM、火山引擎），不填可降级使用 */
import { DEFAULT_SETTINGS, PROVIDER_PRESETS, type CoachSettings } from '../core/types';
import { api } from '../tauri/bridge';

export class SettingsPage {
  readonly root: HTMLElement;
  private overlay!: HTMLElement;
  private form!: HTMLFormElement;
  private settings: CoachSettings = { ...DEFAULT_SETTINGS };
  onSave: ((s: CoachSettings) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.display = 'contents';
    this.overlay = document.createElement('div');
    this.overlay.className = 'settings-overlay';
    this.overlay.style.display = 'none';
    this.overlay.innerHTML = `
      <form class="settings-page" role="dialog" aria-modal="true" aria-label="AI 服务设置">
        <h2>AI 服务设置</h2>
        <p class="settings-note">不填 Key 也能完整下棋：引擎分析、假设推演全程可用，AI 讲解自动降级为基础提示。
          支持 DeepSeek、智谱 GLM、火山引擎 Doubao 等OpenAI 兼容端点。</p>
        <div class="field">
          <label for="set-provider">服务商预设</label>
          <select id="set-provider">
            <option value="">自定义 / 不配置（降级使用）</option>
            ${PROVIDER_PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="set-baseurl">API Base URL</label>
          <input id="set-baseurl" name="baseUrl" type="url" placeholder="https://api.deepseek.com/v1" autocomplete="off" />
        </div>
        <div class="field">
          <label for="set-key">API Key</label>
          <input id="set-key" name="apiKey" type="password" placeholder="sk-…" autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="set-model">模型名</label>
          <input id="set-model" name="model" type="text" placeholder="deepseek-chat / glm-4-flash / doubao-seed-1.6" autocomplete="off" />
        </div>
        <div class="field">
          <label for="set-diff">AI 难度</label>
          <select id="set-diff" name="difficulty">
            <option value="beginner">入门（前 5 候选带权）</option>
            <option value="intermediate">进阶（前 3 候选带权）</option>
            <option value="challenge">挑战（始终最优 + 高深度）</option>
          </select>
        </div>
        <div class="field">
          <label><input type="checkbox" name="coachEnabled" style="width:auto" /> 启用 AI 棋理讲解</label>
        </div>
        <div class="field">
          <label><input type="checkbox" name="ttsEnabled" style="width:auto" /> 语音播报（TTS）</label>
        </div>
        <p class="degrade-tip" id="degrade-tip" style="display:none">已降级模式：AI 讲解将使用基础提示，不配置也可正常下棋、复盘与假设推演。</p>
        <div class="settings-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    `;
    this.root.appendChild(this.overlay);
    this.form = this.overlay.querySelector('form') as HTMLFormElement;

    this.overlay.addEventListener('click', (ev) => {
      if (ev.target === this.overlay) this.close();
    });
    this.form.querySelector('[data-act="cancel"]')?.addEventListener('click', () => this.close());
    this.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(this.form);
      const next: CoachSettings = {
        baseUrl: String(fd.get('baseUrl') ?? ''),
        apiKey: String(fd.get('apiKey') ?? ''),
        model: String(fd.get('model') ?? ''),
        coachEnabled: fd.get('coachEnabled') != null,
        ttsEnabled: fd.get('ttsEnabled') != null,
        difficulty: (String(fd.get('difficulty') ?? 'intermediate') as CoachSettings['difficulty']),
      };
      this.settings = next;
      void api.saveSettings(next);
      this.onSave?.(next);
      this.close();
    });
    this.form.querySelector('#set-provider')?.addEventListener('change', (ev) => {
      const idx = Number((ev.target as HTMLSelectElement).value);
      if (!Number.isInteger(idx) || idx < 0) return;
      const p = PROVIDER_PRESETS[idx];
      (this.form.querySelector('#set-baseurl') as HTMLInputElement).value = p.baseUrl;
      (this.form.querySelector('#set-model') as HTMLInputElement).value = p.model;
      this.updateDegradeTip();
    });
    this.form.addEventListener('input', () => this.updateDegradeTip());
  }

  private updateDegradeTip(): void {
    const baseUrl = (this.form.querySelector('#set-baseurl') as HTMLInputElement).value.trim();
    const key = (this.form.querySelector('#set-key') as HTMLInputElement).value.trim();
    const tip = this.form.querySelector('#degrade-tip') as HTMLElement;
    tip.style.display = !baseUrl || !key ? 'block' : 'none';
  }

  async open(): Promise<void> {
    this.settings = await api.loadSettings();
    (this.form.querySelector('#set-baseurl') as HTMLInputElement).value = this.settings.baseUrl;
    (this.form.querySelector('#set-key') as HTMLInputElement).value = this.settings.apiKey;
    (this.form.querySelector('#set-model') as HTMLInputElement).value = this.settings.model;
    (this.form.querySelector('#set-diff') as HTMLSelectElement).value = this.settings.difficulty;
    (this.form.querySelector('[name="coachEnabled"]') as HTMLInputElement).checked = this.settings.coachEnabled;
    (this.form.querySelector('[name="ttsEnabled"]') as HTMLInputElement).checked = this.settings.ttsEnabled;
    this.updateDegradeTip();
    this.overlay.style.display = 'flex';
  }

  close(): void {
    this.overlay.style.display = 'none';
  }
}
