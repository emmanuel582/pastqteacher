import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sibling =
    command === 'serve'
      ? loadEnv(mode, path.resolve(process.cwd(), '../client'), 'VITE_SUPABASE_')
      : {};
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL || sibling.VITE_SUPABASE_URL || '',
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY || sibling.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      ),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            math: ['katex/contrib/auto-render'],
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5175,
      strictPort: true,
      proxy: { '/api': { target: 'http://127.0.0.1:3002', changeOrigin: true } },
    },
    preview: { host: '127.0.0.1', port: 5175, strictPort: true },
  };
});
