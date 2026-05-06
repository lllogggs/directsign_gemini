import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const productNameHtmlPlugin = (productName: string) => ({
  name: 'product-name-html',
  transformIndexHtml(html: string) {
    return html.replaceAll('%PRODUCT_NAME%', productName);
  },
});

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const productName = env.VITE_PRODUCT_NAME || env.PRODUCT_NAME || 'yeollock.me';

  return {
    plugins: [productNameHtmlPlugin(productName), react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_PRODUCT_NAME': JSON.stringify(productName),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
