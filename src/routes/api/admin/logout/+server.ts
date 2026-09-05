import { json, type RequestHandler } from '@sveltejs/kit';
import { clearAdminSessionCookie } from '$lib/server/adminAuth';

export const POST: RequestHandler = async ({ cookies }) => {
	clearAdminSessionCookie(cookies);
	return json({ ok: true, message: 'Sesión cerrada.' });
};
