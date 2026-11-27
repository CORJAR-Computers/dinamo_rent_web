import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '#generated/client.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma 7 exige un driver adapter. `pg` no trae timeout de conexión (0 por
 * defecto) mientras que el engine de Prisma 6 cortaba a los 5 s, así que se fija
 * uno explícito para no dejar peticiones colgadas contra Neon.
 */
function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10_000,
    }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

export const prisma = db;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
