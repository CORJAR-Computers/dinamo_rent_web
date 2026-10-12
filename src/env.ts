import { defineEnvVars } from '@sveltejs/kit/env';

// Revisado (migración SvelteKit 3): todas las variables caen a `''` si no están
// definidas y sus consumidores usan comprobaciones de falsy:
//  - adminAuth.ts: `if (!secret)` / `if (!pass)` -> cae a los valores por defecto.
//  - adminAuth.ts: `DESKTOP_SYNC_TOKEN || <default>` -> `''` es falsy, cae al default.
//  - adminAuth.ts / seed: `NODE_ENV === 'production'` solo es true con NODE_ENV real.
// Es decir, el comportamiento es idéntico al de `undefined` en SK2; el fallback a
// `''` es seguro aquí. Si alguna variable nueva exige distinguir "ausente" de
// "vacío", cambiar el schema de esa entrada.
export const variables = defineEnvVars({
	NODE_ENV: { schema: (input) => input ?? '' },
	ADMIN_SECRET: { schema: (input) => input ?? '' },
	ADMIN_PASSWORD: { schema: (input) => input ?? '' },
	DESKTOP_SYNC_TOKEN: { schema: (input) => input ?? '' }
});
