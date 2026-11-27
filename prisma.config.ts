import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// El CLI usa la conexión directa (necesaria para migrar). El build de Vercel no
// necesita ninguna URL: si no hay variables, se omite el bloque y `prisma
// generate` sigue funcionando.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
