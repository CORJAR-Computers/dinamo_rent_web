import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const category = url.searchParams.get('category');
    const availableOnly = url.searchParams.get('available') !== 'false';

    const where: Record<string, unknown> = {};
    if (availableOnly) where.available = true;
    if (category && category !== 'ALL') where.category = category;

    const vehicles = await db.vehicle.findMany({
      where,
      orderBy: { pricePerDay: 'asc' },
    });

    return json({ ok: true, vehicles, count: vehicles.length });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};
