import { type RequestHandler } from '@sveltejs/kit';
import { clearAdminSessionCookie } from '#lib/server/adminAuth.js';

export const POST: RequestHandler = async ({ cookies }) => {
	clearAdminSessionCookie(cookies);
	return Response.json({ ok: true, message: 'Sesión cerrada.' });
};
