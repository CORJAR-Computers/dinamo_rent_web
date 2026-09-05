import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isUserAdmin } from '$lib/server/adminAuth';

export const load: LayoutServerLoad = async ({ url, cookies }) => {
	const authenticated = isUserAdmin(cookies);
	const isLoginPage = url.pathname === '/admin/login';

	if (!authenticated && !isLoginPage) {
		throw redirect(303, '/admin/login');
	}

	if (authenticated && isLoginPage) {
		throw redirect(303, '/admin/flota');
	}

	return {
		authenticated
	};
};
