-- Contador de rate limiting compartido entre instancias serverless.
-- Reemplaza el Map en memoria (por instancia) por una fila atómica por
-- endpoint + IP, para que el límite no se reinicie al cambiar de instancia.

CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_counters_resetAt_idx" ON "rate_limit_counters"("resetAt");
