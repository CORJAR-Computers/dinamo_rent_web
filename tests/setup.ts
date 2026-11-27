/**
 * Setup de Vitest.
 *
 * Prisma 7 ya no carga `.env` por su cuenta (el engine de Prisma 6 lo hacía), y
 * `pg` no lee archivos de entorno: los tests que tocan la base necesitan
 * `DATABASE_URL` en `process.env`. En CI las variables ya vienen del workflow,
 * así que la ausencia de `.env` no es un error.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se usan las variables de entorno ya presentes.
}
