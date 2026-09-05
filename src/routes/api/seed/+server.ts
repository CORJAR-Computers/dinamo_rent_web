import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { FLEET_DATABASE } from '$lib/data/fleet';
import type { VehicleCategory, Transmission, FuelType } from '@prisma/client';

export const POST: RequestHandler = async () => {
  try {
    let created = 0;
    let updated = 0;

    for (const v of FLEET_DATABASE) {
      let category: VehicleCategory = 'ECONOMICO';
      if (v.category === 'sedan') category = 'SEDAN';
      else if (v.category === 'suv') category = 'SUV';
      else if (v.category === 'premium') category = 'PREMIUM';

      let transmission: Transmission = 'MECANICA';
      if (v.transmission === 'Automático') transmission = 'AUTOMATICA';
      else if (v.transmission === 'Automático 4x4') transmission = 'AUTOMATICA_4X4';

      let fuelType: FuelType = 'GASOLINA';
      if (v.fuel === 'Diésel') fuelType = 'DIESEL';

      const existing = await db.vehicle.findUnique({ where: { id: v.id } });
      if (existing) {
        await db.vehicle.update({
          where: { id: v.id },
          data: {
            name: v.name,
            category,
            categoryLabel: v.categoryLabel,
            badge: v.badge,
            pricePerDay: v.priceCOP,
            deposit: v.depositCOP,
            seats: v.passengers,
            transmission,
            fuelType,
            luggage: v.luggage,
            ac: v.ac,
            plate: v.plate,
            image: v.image,
            features: v.features,
            available: true,
          },
        });
        updated++;
      } else {
        await db.vehicle.create({
          data: {
            id: v.id,
            name: v.name,
            category,
            categoryLabel: v.categoryLabel,
            badge: v.badge,
            pricePerDay: v.priceCOP,
            deposit: v.depositCOP,
            seats: v.passengers,
            transmission,
            fuelType,
            luggage: v.luggage,
            ac: v.ac,
            plate: v.plate,
            image: v.image,
            features: v.features,
            available: true,
          },
        });
        created++;
      }
    }

    return json({
      ok: true,
      message: `Semilla completada: ${created} vehículos creados, ${updated} actualizados en Neon`,
      total: FLEET_DATABASE.length,
    });
  } catch (e) {
    console.error('[seed error]:', e);
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};
