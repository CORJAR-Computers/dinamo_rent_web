import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default ts.config(
	{
		// mejoras/ son páginas borradoras fuera de src/routes: no se compilan ni se sirven.
		ignores: ['.svelte-kit/**', 'build/**', 'dist/**', '.vercel/**', 'node_modules/**', 'mejoras/**']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	}
);
