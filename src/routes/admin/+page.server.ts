import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isUserAdmin } from '#lib/server/adminAuth.js';

export const load: PageServerLoad = async ({ cookies }) => {
	if (isUserAdmin(cookies)) {
		throw redirect(303, '/admin/flota');
	} else {
		throw redirect(303, '/admin/login');
	}
};
