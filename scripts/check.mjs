#!/usr/bin/env node
/**
 * `npm run check` sin tumbar el dev server.
 *
 * `svelte-kit sync` regenera `.svelte-kit`, y eso obliga al dev server a
 * recargar todo el programa (SSR incluido). Con el servidor levantado esa
 * recarga puede dejarlo colgado, así que cuando hay un dev server escuchando se
 * omite el sync: los tipos ya los generó y los mantiene el propio dev server.
 *
 * Puertos: `DEV_PORTS=5199,5173` para cambiarlos. `FORCE_SYNC=1` fuerza el sync
 * (útil si cambiaste `svelte.config.js`/`vite.config.ts` y no quieres parar el
 * servidor a mano).
 */
import { execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const DEFAULT_PORTS = [5199, 5173];
const configured = (process.env.DEV_PORTS || '')
	.split(',')
	.map((port) => Number(port.trim()))
	.filter((port) => Number.isInteger(port) && port > 0);
const ports = configured.length > 0 ? configured : DEFAULT_PORTS;

/** true si hay algo escuchando en 127.0.0.1:port (con 400 ms de margen). */
function isListening(port) {
	return new Promise((resolve) => {
		const socket = net.connect({ host: '127.0.0.1', port });
		const finish = (result) => {
			socket.destroy();
			resolve(result);
		};
		socket.setTimeout(400);
		socket.once('connect', () => finish(true));
		socket.once('timeout', () => finish(false));
		socket.once('error', () => finish(false));
	});
}

const running = [];
for (const port of ports) {
	if (await isListening(port)) running.push(port);
}

const steps = [];
if (running.length > 0 && process.env.FORCE_SYNC !== '1') {
	const where = running.map((port) => `127.0.0.1:${port}`).join(', ');
	console.warn(
		`\n[check] Dev server detectado en ${where}: se omite \`svelte-kit sync\` para no forzar una recarga completa.`
	);
	console.warn(
		'[check] Los tipos de .svelte-kit ya los mantiene el dev server. Si cambiaste svelte.config.js o vite.config.ts, páralo y repite, o usa FORCE_SYNC=1.\n'
	);
} else {
	steps.push('svelte-kit sync');
}
steps.push('svelte-check --tsconfig ./tsconfig.json', 'node scripts/check-contact.mjs');

// El PATH de npm ya incluye node_modules/.bin, pero el script también debe
// funcionar con `node scripts/check.mjs` a secas.
const env = {
	...process.env,
	PATH: `${path.join(process.cwd(), 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`
};

for (const step of steps) {
	try {
		execSync(step, { stdio: 'inherit', env });
	} catch (error) {
		process.exit(error.status ?? 1);
	}
}
