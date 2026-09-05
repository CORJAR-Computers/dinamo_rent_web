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
 * PUT /api/vehicles/[id]
 * Modifica un vehículo o cambia su estado de disponibilidad (inhabilitar/habilitar).
 */
export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	if (!isUserAdmin(cookies)) {
		return json({ ok: false, message: 'No autorizado.' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ ok: false, message: 'ID de vehículo requerido.' }, { status: 400 });
	}

	try {
		const existing = await prisma.vehicle.findUnique({ where: { id } });
		if (!existing) {
			return json({ ok: false, message: 'Vehículo no encontrado.' }, { status: 404 });
		}

		const data = await request.json();

		// Construir objeto de actualización selectiva
		const updateData: Record<string, unknown> = {};

		if (data.name !== undefined) updateData.name = data.name.trim();
		if (data.brand !== undefined) updateData.brand = data.brand.trim();
		if (data.category !== undefined) updateData.category = normalizeCategory(data.category);
		if (data.categoryLabel !== undefined) updateData.categoryLabel = data.categoryLabel;
		if (data.badge !== undefined) updateData.badge = data.badge;
		if (data.transmission !== undefined) updateData.transmission = normalizeTransmission(data.transmission);
		if (data.fuelType !== undefined) updateData.fuelType = normalizeFuel(data.fuelType);
		if (data.seats !== undefined) updateData.seats = Number(data.seats);
		if (data.doors !== undefined) updateData.doors = Number(data.doors);
		if (data.ac !== undefined) updateData.ac = Boolean(data.ac);
		if (data.luggage !== undefined) updateData.luggage = data.luggage;
		if (data.pricePerDay !== undefined) updateData.pricePerDay = Math.round(Number(data.pricePerDay));
		if (data.deposit !== undefined) updateData.deposit = Math.round(Number(data.deposit));
		if (data.image !== undefined) updateData.image = data.image;
		if (data.features !== undefined && Array.isArray(data.features)) updateData.features = data.features;
		if (data.plate !== undefined) updateData.plate = data.plate ? data.plate.toUpperCase().trim() : null;
		if (data.available !== undefined) updateData.available = Boolean(data.available);

		const updated = await prisma.vehicle.update({
			where: { id },
			data: updateData
		});

		return json({
			ok: true,
			message: 'Vehículo actualizado correctamente.',
			vehicle: updated
		});
	} catch (err) {
		console.error(`Error en PUT /api/vehicles/${id}:`, err);
		return json({ ok: false, message: 'Error actualizando vehículo.' }, { status: 500 });
	}
};

/**
 * DELETE /api/vehicles/[id]
 * Inhabilita el vehículo (disponible = false) de forma segura.
 */
export const DELETE: RequestHandler = async ({ params, cookies }) => {
	if (!isUserAdmin(cookies)) {
		return json({ ok: false, message: 'No autorizado.' }, { status: 401 });
	}

	const { id } = params;
	if (!id) {
		return json({ ok: false, message: 'ID de vehículo requerido.' }, { status: 400 });
	}

	try {
		// Inhabilitar en vez de destruir para proteger el histórico
		const updated = await prisma.vehicle.update({
			where: { id },
			data: { available: false }
		});

		return json({
			ok: true,
			message: 'Vehículo inhabilitado correctamente. Ya no se mostrará a los clientes.',
			vehicle: updated
		});
	} catch (err) {
		console.error(`Error en DELETE /api/vehicles/${id}:`, err);
		return json({ ok: false, message: 'Error al inhabilitar vehículo.' }, { status: 500 });
	}
};
