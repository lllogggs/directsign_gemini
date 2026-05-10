import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig, loadEnv} from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));

const productNameHtmlPlugin = (productName: string) => ({
  name: 'product-name-html',
  transformIndexHtml(html: string) {
    return html.replaceAll('%PRODUCT_NAME%', productName);
  },
});

const normalizeProductName = (value?: string) => {
  const trimmed = value?.trim();
  const normalized = trimmed?.toLowerCase();

  if (
    !trimmed ||
    normalized === 'yeollock' ||
    normalized === 'yeollock.me' ||
    normalized === 'directsign'
  ) {
    return '연락미';
  }

  return trimmed;
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const productName = normalizeProductName(
    env.VITE_PRODUCT_NAME || env.PRODUCT_NAME,
  );

  return {
    plugins: [productNameHtmlPlugin(productName), react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_PRODUCT_NAME': JSON.stringify(productName),
    },
    resolve: {
      alias: {
        '@': path.resolve(configDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
