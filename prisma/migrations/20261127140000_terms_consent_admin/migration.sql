-- Rastro del consentimiento registrado a mano por un administrador para una
-- reserva anterior al control de aceptación en el checkout.
--
-- `termsAcceptedBy` nulo = el cliente lo aceptó en el checkout. Con valor =
-- registro manual: quién lo hizo, y `termsAcceptanceNote` con su soporte. La IP
-- de `termsAcceptedIp` en ese caso es la del registro, no la del cliente.
ALTER TABLE "reservations" ADD COLUMN "termsAcceptedBy" TEXT;
ALTER TABLE "reservations" ADD COLUMN "termsAcceptanceNote" TEXT;
