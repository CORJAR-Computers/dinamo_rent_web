import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { isUserAdmin } from '$lib/server/adminAuth';
import type { VehicleCategory, Transmission, FuelType } from '@prisma/client';

function normalizeCategory(cat: string): VehicleCategory {
	const c = (cat || '').toUpperCase().trim();
	if (c === 'ECONOMICO' || c === 'ECONOMICOS') return 'ECONOMICO';
	if (c === 'SEDAN' || c === 'SEDANES') return 'SEDAN';
	if (c === 'SUV' || c === 'SUVS') return 'SUV';
	if (c === 'CAMIONETA' || c === 'CAMIONETAS') return 'CAMIONETA';
	if (c === 'VAN' || c === 'VANS') return 'VAN';
	if (c === 'LUJO') return 'LUJO';
	if (c === 'PREMIUM' || c === 'GAMA ALTA') return 'PREMIUM';
	return 'ECONOMICO';
}

function normalizeTransmission(t: string): Transmission {
	const tr = (t || '').toUpperCase().trim();
	if (tr.includes('4X4')) return 'AUTOMATICA_4X4';
	if (tr.includes('AUTO')) return 'AUTOMATICA';
	return 'MECANICA';
}

function normalizeFuel(f: string): FuelType {
	const fu = (f || '').toUpperCase().trim();
	if (fu.includes('DIESEL') || fu.includes('DIÉSEL')) return 'DIESEL';
	if (fu.includes('HIB') || fu.includes('HÍB')) return 'HIBRIDO';
	if (fu.includes('ELEC')) return 'ELECTRICO';
	return 'GASOLINA';
}

/**
 * GET /api/vehicles
 * Lista vehículos. Si all=true y es admin, incluye inhabilitados.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	try {
		const showAll = url.searchParams.get('all') === 'true' && isUserAdmin(cookies);

		const vehicles = await prisma.vehicle.findMany({
			where: showAll ? undefined : { available: true },
			orderBy: [{ available: 'desc' }, { pricePerDay: 'asc' }]
		});

		return json({
			ok: true,
			count: vehicles.length,
			vehicles
		});
	} catch (err) {
		console.error('Error en GET /api/vehicles:', err);
		return json({ ok: false, message: 'Error consultando vehículos.' }, { status: 500 });
	}
};

/**
 * POST /api/vehicles
 * Crea un nuevo vehículo en la flota (Solo Admin).
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!isUserAdmin(cookies)) {
		return json({ ok: false, message: 'No autorizado.' }, { status: 401 });
	}

	try {
		const data = await request.json();

		if (!data.name || !data.pricePerDay) {
			return json(
				{ ok: false, message: 'El nombre y el precio por día son obligatorios.' },
				{ status: 400 }
			);
		}

		const vehicle = await prisma.vehicle.create({
			data: {
				name: data.name.trim(),
				brand: data.brand ? data.brand.trim() : data.name.split(' ')[0],
				category: normalizeCategory(data.category),
				categoryLabel: data.categoryLabel || `${data.category || 'Automóvil'} • 2024`,
				badge: data.badge || '',
				transmission: normalizeTransmission(data.transmission),
				fuelType: normalizeFuel(data.fuelType),
				seats: Number(data.seats) || 5,
				doors: Number(data.doors) || 4,
				ac: data.ac !== undefined ? Boolean(data.ac) : true,
				luggage: data.luggage || '2 Maletas Grandes',
				pricePerDay: Math.round(Number(data.pricePerDay)),
				deposit: Math.round(Number(data.deposit) || 1000000),
				image: data.image || 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=85',
				features: Array.isArray(data.features) ? data.features : ['Aire Acondicionado', 'Bluetooth'],
				plate: data.plate ? data.plate.toUpperCase().trim() : null,
				units: Math.max(1, Math.round(Number(data.units) || 1)),
				available: data.available !== undefined ? Boolean(data.available) : true
			}
		});

		return json({
			ok: true,
			message: 'Vehículo creado exitosamente.',
			vehicle
		});
	} catch (err) {
		console.error('Error en POST /api/vehicles:', err);
		return json({ ok: false, message: 'Error al crear el vehículo.' }, { status: 500 });
	}
};
