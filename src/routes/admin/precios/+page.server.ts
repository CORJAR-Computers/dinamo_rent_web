import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	try {
		const vehicles = await prisma.vehicle.findMany({
			select: {
				id: true,
				name: true,
				category: true,
				plate: true,
				image: true,
				pricePerDay: true,
				deposit: true,
				available: true
			},
			orderBy: [{ category: 'asc' }, { pricePerDay: 'asc' }]
		});

		return {
			vehicles
		};
	} catch (err) {
		console.error('Error cargando precios en admin:', err);
		return { vehicles: [] };
	}
};
