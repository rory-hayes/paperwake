import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {pdfJsRenderErrors} from './scripts/pdfjs-render-errors.ts';

export default defineConfig(({mode}) => {
  const environment=loadEnv(mode,process.cwd(),'');
  const apiPort=Number(environment.PORT||4328);
  return {
  plugins: [pdfJsRenderErrors(),react()],
  // Keep development on the same guarded PDF.js transform as production builds.
  optimizeDeps: {exclude:['pdfjs-dist']},
  server: { host: '127.0.0.1', port: 5189, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
  build: { sourcemap: true },
  };
});
