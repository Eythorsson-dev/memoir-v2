import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium', headless: true }],
    },
    include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
    expect: { requireAssertions: true },
  },
})
