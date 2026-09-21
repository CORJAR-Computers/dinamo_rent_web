import type { PageServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async () => {
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
						createdAt: true,
						token: true,
						tokenStatus: true,
						tokenValidUntil: true,
						tokenFranchise: true,
					}
				},
				depositCharges: {
					select: {
						id: true,
						amount: true,
						concept: true,
						description: true,
						status: true,
						transactionId: true,
						createdAt: true,
					},
					orderBy: { createdAt: 'desc' }
				}
			}
		});

		return {
			reservations
		};
	} catch (err) {
		console.error('Error cargando reservas en admin:', err);
		return { reservations: [] };
	}
};
