import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({ preprocess: vitePreprocess(), adapter: adapter() })
	],
	server: {
		port: 5174,
		host: true,
		watch: {
			ignored: ['**/*.patch', '**/*.zip', '**/*.pdf', '**/*.md']
		}
	}
});
