import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev-server proxy: core-api chưa vào docker-compose/Caddy (xem ghi chú trong TASKS.md M2) —
// dashboard chạy qua `npm run dev`, gọi thẳng core-api tại localhost:3001.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
