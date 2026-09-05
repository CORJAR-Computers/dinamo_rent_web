import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	try {
		const vehicles = await prisma.vehicle.findMany({
			orderBy: [{ available: 'desc' }, { name: 'asc' }]
		});

		return {
			vehicles
		};
	} catch (err) {
		console.error('Error cargando flota en admin:', err);
		return {
			vehicles: []
		};
	}
};
