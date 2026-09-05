import { json, type RequestHandler } from '@sveltejs/kit';
import { getAdminPassword, setAdminSessionCookie } from '$lib/server/adminAuth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { password } = await request.json();

		if (!password || typeof password !== 'string') {
			return json({ ok: false, message: 'La contraseña es requerida.' }, { status: 400 });
		}

		const expected = getAdminPassword();

		if (password !== expected) {
			return json({ ok: false, message: 'Contraseña incorrecta.' }, { status: 401 });
		}

		setAdminSessionCookie(cookies);

		return json({
			ok: true,
			message: 'Sesión iniciada correctamente.'
		});
	} catch (err) {
		console.error('Error en /api/admin/login:', err);
		return json({ ok: false, message: 'Error en el servidor.' }, { status: 500 });
	}
};
