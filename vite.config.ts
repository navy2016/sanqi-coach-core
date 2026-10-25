import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 三棋思维教练 v2：React + TS（对齐原文「Rust 引擎层 + TS 业务层 + React UI 层」）
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2021', outDir: 'dist', emptyOutDir: true },
});
