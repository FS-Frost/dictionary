import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5000,
	},
	preview: {
		port: 5000,
	},
	// Sin esto, Vitest resuelve Svelte a su build de servidor y `mount()` no existe,
	// así que cualquier test de componente falla con `lifecycle_function_unavailable`.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'jsdom',
		setupFiles: ['./src/tests/setup.ts'],
		include: ['src/**/*.test.ts'],
	},
});
