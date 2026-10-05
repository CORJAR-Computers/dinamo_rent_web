-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('ECONOMICO', 'SEDAN', 'SUV', 'CAMIONETA', 'VAN', 'LUJO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "Transmission" AS ENUM ('AUTOMATICA', 'MECANICA', 'AUTOMATICA_4X4');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINA', 'DIESEL', 'HIBRIDO', 'ELECTRICO');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'PAGADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "InsurancePlan" AS ENUM ('BASICO', 'TOTAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('APROBADO', 'RECHAZADO', 'REEMBOLSADO', 'PENDIENTE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncEntity" AS ENUM ('RESERVATION', 'VEHICLE', 'PAYMENT', 'INSURANCE_BLOCK', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SyncAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "docType" TEXT NOT NULL DEFAULT 'CC',
    "docNumber" TEXT NOT NULL,
    "names" TEXT NOT NULL,
    "lastnames" TEXT NOT NULL DEFAULT '',
    "fullName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone2" TEXT,
    "city" TEXT DEFAULT 'Cartagena',
    "country" TEXT DEFAULT 'Colombia',
    "address" TEXT,
    "hotel" TEXT,
    "license" TEXT,
    "licenseExp" TEXT,
    "desktopId" INTEGER,
    "syncedWithDesktop" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "categoryLabel" TEXT NOT NULL DEFAULT '',
    "badge" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "transmission" "Transmission" NOT NULL DEFAULT 'MECANICA',
    "fuelType" "FuelType" NOT NULL DEFAULT 'GASOLINA',
    "seats" INTEGER NOT NULL DEFAULT 5,
    "doors" INTEGER NOT NULL DEFAULT 4,
    "ac" BOOLEAN NOT NULL DEFAULT true,
    "luggage" TEXT NOT NULL DEFAULT '',
    "pricePerDay" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL DEFAULT 1000000,
    "image" TEXT NOT NULL,
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plate" TEXT,
    "units" INTEGER NOT NULL DEFAULT 1,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerLastname" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerIdType" TEXT NOT NULL DEFAULT 'CC',
    "customerIdNumber" TEXT NOT NULL,
    "customerLicense" TEXT,
    "customerLicenseExp" TEXT,
    "customerHotel" TEXT,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "pickupTime" TEXT NOT NULL DEFAULT '10:00',
    "returnTime" TEXT NOT NULL DEFAULT '10:00',
    "pickupLocation" TEXT NOT NULL DEFAULT 'Aeropuerto Internacional Rafael Núñez (CTG)',
    "returnLocation" TEXT NOT NULL DEFAULT 'Aeropuerto Internacional Rafael Núñez (CTG)',
    "days" INTEGER NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "extrasAmount" INTEGER NOT NULL DEFAULT 0,
    "insuranceAmount" INTEGER NOT NULL DEFAULT 0,
    "blockingAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDIENTE',
    "insurancePlan" "InsurancePlan" NOT NULL DEFAULT 'TOTAL',
    "extras" JSONB NOT NULL DEFAULT '{}',
    "signatureDataUrl" TEXT,
    "notes" TEXT,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "desktopRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "transactionId" TEXT,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "gateway" TEXT NOT NULL DEFAULT 'PLACETOPAY',
    "gatewayRef" TEXT,
    "cardHolder" TEXT NOT NULL DEFAULT '',
    "cardLast4" TEXT NOT NULL DEFAULT '',
    "cardBrand" TEXT NOT NULL DEFAULT '',
    "p2pRequestId" TEXT,
    "p2pProcessUrl" TEXT,
    "p2pSessionStatus" TEXT,
    "p2pStatusMessage" TEXT,
    "p2pOpType" TEXT,
    "token" TEXT,
    "tokenStatus" TEXT,
    "tokenValidUntil" TEXT,
    "tokenFranchise" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_charges" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "concept" TEXT NOT NULL,
    "description" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
    "transactionId" TEXT,
    "p2pRequestId" TEXT,
    "p2pStatusMessage" TEXT,
    "executedBy" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_blocks" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "InsurancePlan" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "entity" "SyncEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "SyncAction" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "payload" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_docNumber_key" ON "customers"("docNumber");

-- CreateIndex
CREATE UNIQUE INDEX "customers_desktopId_key" ON "customers"("desktopId");

-- CreateIndex
CREATE INDEX "customers_docNumber_idx" ON "customers"("docNumber");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "vehicles_category_idx" ON "vehicles"("category");

-- CreateIndex
CREATE INDEX "vehicles_available_idx" ON "vehicles"("available");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_code_key" ON "reservations"("code");

-- CreateIndex
CREATE INDEX "reservations_customerId_idx" ON "reservations"("customerId");

-- CreateIndex
CREATE INDEX "reservations_vehicleId_idx" ON "reservations"("vehicleId");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservations_customerEmail_idx" ON "reservations"("customerEmail");

-- CreateIndex
CREATE INDEX "reservations_customerIdNumber_idx" ON "reservations"("customerIdNumber");

-- CreateIndex
CREATE INDEX "reservations_pickupDate_returnDate_idx" ON "reservations"("pickupDate", "returnDate");

-- CreateIndex
CREATE INDEX "reservations_synced_idx" ON "reservations"("synced");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reservationId_key" ON "payments"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");

-- CreateIndex
CREATE INDEX "deposit_charges_reservationId_idx" ON "deposit_charges"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_blocks_reservationId_key" ON "insurance_blocks"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_blocks_code_key" ON "insurance_blocks"("code");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_entity_entityId_idx" ON "sync_logs"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_charges" ADD CONSTRAINT "deposit_charges_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_blocks" ADD CONSTRAINT "insurance_blocks_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

