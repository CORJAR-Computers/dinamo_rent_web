-- Cobro con token: referencia persistida antes de llamar a la pasarela y
-- cierre manual de los cargos que quedan PENDIENTES sin veredicto.
ALTER TABLE "deposit_charges" ADD COLUMN "reference" TEXT;
ALTER TABLE "deposit_charges" ADD COLUMN "resolution" TEXT;
ALTER TABLE "deposit_charges" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "deposit_charges" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- Una referencia nunca puede repetirse: es la marca que se busca en PlacetoPay
-- cuando se pierde la respuesta del cobro.
CREATE UNIQUE INDEX "deposit_charges_reference_key" ON "deposit_charges"("reference");

-- Consulta caliente del bloqueo anti-doble cobro.
CREATE INDEX "deposit_charges_reservationId_status_idx" ON "deposit_charges"("reservationId", "status");
