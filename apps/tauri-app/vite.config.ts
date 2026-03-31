import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: host || false,
		port: 5173,
		strictPort: true,
	},
	ssr: {
		noExternal: ['@memoir/block-editor', '@memoir/ui', '@memoir/block-editor-svelte'],
	},
})
