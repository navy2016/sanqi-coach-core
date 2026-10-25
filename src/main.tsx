/** 入口 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root 缺失');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
