import { defineConfig } from 'vite'
import { resolve } from 'path'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BlockEditorAi2',
      fileName: 'block-editor-ai2'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
