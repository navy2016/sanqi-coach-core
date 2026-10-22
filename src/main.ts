/** 三棋思维教练 · 前端入口 */
import './styles/app.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app 节点缺失');

const app = new App();
app.mount(root);

// Tauri 内由前端发起；纯浏览器 dev 模式同样可用（数据层已降级 mock）
if (import.meta.env.DEV) {
  console.info('[sanqi-coach] dev mode ready');
}