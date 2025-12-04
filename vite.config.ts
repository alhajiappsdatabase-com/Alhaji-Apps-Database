
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve((process as any).cwd(), './'),
      },
    },
    define: {
      // Polyfill process.env for the Gemini SDK which expects it
      // Use JSON.stringify to ensure it is replaced as a string literal, avoiding "undefined" syntax errors
      'process.env': {
        API_KEY: JSON.stringify(env.API_KEY || ''),
      }
    }
  };
});
