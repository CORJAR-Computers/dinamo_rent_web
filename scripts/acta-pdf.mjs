#!/usr/bin/env node
/**
 * Exporta el acta de certificación a PDF con el formato de impresión que usamos
 * para Evertec: A4 con márgenes de 18×16 mm, tablas que no se parten entre
 * páginas, encabezados que no quedan solos al pie y la §7 (la declaración con la
 * tabla de firmas) en página propia.
 *
 * Uso:
 *   npm run docs:pdf
 *   node scripts/acta-pdf.mjs [entrada.md] [salida.pdf]
 *
 * Necesita Chrome o Edge instalados: se imprime con `--headless --print-to-pdf`.
 * Si el navegador está en otra ruta:
 *   CHROME_PATH="C:\ruta\chrome.exe" npm run docs:pdf
 *
 * El PDF es un derivado: no se versiona (`.gitignore`) y se regenera cada vez que
 * el Markdown cambie.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';

/** Sección que arranca en página nueva. Si el acta la cambia de número, se ajusta aquí. */
const SECCION_EN_PAGINA_PROPIA = '7.';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.resolve(root, process.argv[2] ?? 'docs/ACTA_CERTIFICACION_EVERTEC_2026-11-26.md');
const output = path.resolve(root, process.argv[3] ?? input.replace(/\.md$/i, '.pdf'));

function fail(message) {
	console.error(`[acta-pdf] ${message}`);
	process.exit(1);
}

if (!fs.existsSync(input)) fail(`no existe el Markdown de entrada: ${input}`);
if (path.extname(output).toLowerCase() !== '.pdf') fail(`la salida debe ser un .pdf: ${output}`);

/** Navegadores buscados cuando no se indica una ruta a mano, en orden. */
const BROWSERS = [
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
	'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
].filter(Boolean);

function findBrowser() {
	// Una ruta indicada a mano es una decisión, no una preferencia: si no existe,
	// se falla en vez de imprimir en silencio con otro navegador.
	const indicado = process.env.CHROME_PATH || process.env.EDGE_PATH;
	if (indicado) {
		if (fs.existsSync(indicado)) return indicado;
		fail(
			`la ruta indicada en ${process.env.CHROME_PATH ? 'CHROME_PATH' : 'EDGE_PATH'} no existe: ${indicado}`
		);
	}

	const installed = BROWSERS.find((candidate) => fs.existsSync(candidate));
	if (installed) return installed;
	// Último recurso: que el sistema resuelva el nombre en el PATH.
	for (const name of ['google-chrome', 'chromium']) {
		try {
			execFileSync(name, ['--version'], { stdio: 'ignore', timeout: 10_000 });
			return name;
		} catch {
			// no está: se prueba el siguiente
		}
	}
	return null;
}

const CSS = `
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1a1a1a; }
h1 { font-size: 17pt; margin: 0 0 6pt; }
h2 { font-size: 12.5pt; margin: 16pt 0 6pt; border-bottom: 1px solid #d4d4d4; padding-bottom: 3pt; page-break-after: avoid; }
h2.pagina-propia { page-break-before: always; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; page-break-after: avoid; }
p, li { margin: 4pt 0; }
p { orphans: 3; widows: 3; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.3pt; page-break-inside: avoid; }
th, td { border: 1px solid #c9c9c9; padding: 3.5pt 5pt; text-align: left; vertical-align: top; }
th { background: #f1f3f5; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #f4f4f5; padding: 0 2pt; border-radius: 2px; }
hr { border: none; border-top: 1px solid #d4d4d4; margin: 12pt 0; }
blockquote { margin: 6pt 0; padding-left: 8pt; border-left: 3px solid #d4d4d4; color: #444; }
`;

const markdown = fs.readFileSync(input, 'utf8');
const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(input, '.md');

// El salto se marca sobre la sección por su número, no con `h2:last-of-type`: si
// mañana el acta gana una §8, `last-of-type` movería el salto en silencio.
let body = marked.parse(markdown);
const marcada = new RegExp(`<h2(\\s[^>]*)?>(?=\\s*${SECCION_EN_PAGINA_PROPIA.replace('.', '\\.')})`);
if (!marcada.test(body)) {
	console.warn(
		`[acta-pdf] Aviso: no se encontró la sección «${SECCION_EN_PAGINA_PROPIA}»; el PDF sale sin salto de página forzado.`
	);
}
body = body.replace(marcada, (heading) => heading.replace('<h2', '<h2 class="pagina-propia"'));

const browser = findBrowser();
if (!browser) {
	fail(
		'no se encontró Chrome ni Edge. Indica la ruta con CHROME_PATH=/ruta/al/navegador npm run docs:pdf'
	);
}

const tmpHtml = path.join(os.tmpdir(), `acta-pdf-${process.pid}.html`);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
	tmpHtml,
	`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head>
<body>${body}</body></html>`,
	'utf8'
);

try {
	execFileSync(
		browser,
		[
			'--headless',
			'--disable-gpu',
			'--no-pdf-header-footer',
			'--run-all-compositor-stages-before-draw',
			'--virtual-time-budget=8000',
			`--print-to-pdf=${output}`,
			pathToFileURL(tmpHtml).href,
		],
		{ stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000 }
	);
} catch (error) {
	const details = (error.stderr || '').toString().trim().split('\n').slice(-3).join('\n');
	fail(`el navegador (${browser}) no pudo imprimir.${details ? `\n${details}` : ''}`);
} finally {
	fs.rmSync(tmpHtml, { force: true });
}

if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
	fail(`el navegador terminó sin generar el PDF: ${output}`);
}

const kb = Math.round(fs.statSync(output).size / 1024);
console.log(`[acta-pdf] ${path.relative(root, input)} → ${path.relative(root, output)} (${kb} KB)`);
