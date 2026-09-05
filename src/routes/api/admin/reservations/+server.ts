import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { isUserAdmin } from '$lib/server/adminAuth';

export const GET: RequestHandler = async ({ cookies }) => {
	if (!isUserAdmin(cookies)) {
		return json({ ok: false, message: 'No autorizado.' }, { status: 401 });
	}

	try {
		const reservations = await prisma.reservation.findMany({
			orderBy: { createdAt: 'desc' },
			include: {
				vehicle: {
					select: {
						id: true,
						name: true,
						category: true,
						plate: true,
						image: true
					}
				},
				customer: {
					select: {
						id: true,
						docNumber: true,
						fullName: true,
						phone: true,
						email: true,
						desktopId: true
					}
				},
				payment: {
					select: {
						id: true,
						status: true,
						amount: true,
						transactionId: true,
						cardBrand: true,
						cardLast4: true,
						p2pRequestId: true,
						createdAt: true
					}
				}
			}
		});

		return json({
			ok: true,
			count: reservations.length,
			reservations
		});
	} catch (err) {
		console.error('Error en GET /api/admin/reservations:', err);
		return json({ ok: false, message: 'Error consultando reservas.' }, { status: 500 });
	}
};
