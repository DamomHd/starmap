import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import preact from '@preact/preset-vite'
import manifest from './src/manifest'

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  build: {
    target: 'chrome120',
    rollupOptions: {
      input: {
        app: 'src/app/index.html',
      },
    },
  },
})