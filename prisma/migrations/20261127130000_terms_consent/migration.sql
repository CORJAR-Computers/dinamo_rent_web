-- Evidencia de aceptación de los Términos y Condiciones en el checkout web.
ALTER TABLE "reservations" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "reservations" ADD COLUMN "termsHash" TEXT;
ALTER TABLE "reservations" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "reservations" ADD COLUMN "termsAcceptedIp" TEXT;

-- Snapshot del consentimiento en cada cobro de garantía: ata el cargo al
-- documento aceptado sin depender de que la reserva no cambie.
ALTER TABLE "deposit_charges" ADD COLUMN "consentVersion" TEXT;
ALTER TABLE "deposit_charges" ADD COLUMN "consentHash" TEXT;
