import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';
import { FLEET_DATABASE, type Vehicle } from '$lib/data/fleet';

function mapPrismaVehicle(v: {
	id: string;
	name: string;
	brand: string;
	category: string;
	categoryLabel: string;
	badge: string;
	pricePerDay: number;
	deposit: number;
	seats: number;
	transmission: string;
	luggage: string;
	fuelType: string;
	ac: boolean;
	plate: string | null;
	image: string;
	features: string[];
}): Vehicle {
	let cat: 'economico' | 'sedan' | 'suv' | 'premium' = 'economico';
	const c = (v.category || '').toLowerCase();
	if (c.includes('sedan')) cat = 'sedan';
	else if (c.includes('suv') || c.includes('camioneta') || c.includes('van')) cat = 'suv';
	else if (c.includes('prem') || c.includes('lujo')) cat = 'premium';
	else cat = 'economico';

	let tr: 'Automático' | 'Mecánico' | 'Automático 4x4' = 'Automático';
	if (v.transmission === 'AUTOMATICA_4X4') tr = 'Automático 4x4';
	else if (v.transmission === 'MECANICA') tr = 'Mecánico';
	else tr = 'Automático';

	let fuel: 'Gasolina' | 'Diésel' = 'Gasolina';
	if (v.fuelType === 'DIESEL') fuel = 'Diésel';

	return {
		id: v.id,
		name: v.name,
		category: cat,
		categoryLabel: v.categoryLabel || `${v.brand || ''} • 2024`,
		badge: v.badge || (v.pricePerDay < 150000 ? 'Ultra Económico' : 'Recomendado'),
		priceCOP: v.pricePerDay,
		depositCOP: v.deposit,
		passengers: v.seats,
		transmission: tr,
		luggage: v.luggage || '2 Maletas Grandes',
		fuel,
		ac: v.ac,
		plate: v.plate || 'Ref',
		image: v.image,
		features: v.features && v.features.length ? v.features : ['Aire Acondicionado', 'Bluetooth']
	};
}

export const load: PageServerLoad = async () => {
	try {
		const dbVehicles = await prisma.vehicle.findMany({
			where: { available: true },
			orderBy: [{ pricePerDay: 'asc' }]
		});

		if (dbVehicles && dbVehicles.length > 0) {
			return {
				vehicles: dbVehicles.map(mapPrismaVehicle)
			};
		}

		return {
			vehicles: FLEET_DATABASE
		};
	} catch (err) {
		console.warn('Fallback a FLEET_DATABASE por error conectando a Neon:', err);
		return {
			vehicles: FLEET_DATABASE
		};
	}
};
