import { defineConfig } from 'vite';

// Tauri v2 前端构建配置：
// - base './' 保证打包进 Tauri WebView 时资源相对路径可用
// - envPrefix 增加 TAURI_ 以兼容 Tauri CLI 注入的环境变量
export default defineConfig({
  base: './',
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    minify: 'esbuild',
  },
});
