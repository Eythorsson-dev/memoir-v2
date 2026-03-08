import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
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
