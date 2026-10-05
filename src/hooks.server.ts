import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Cabeceras de Seguridad HTTP (OWASP Best Practices)
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

	// Strict-Transport-Security (HSTS)
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

	// Content-Security-Policy (CSP) equilibrada para SvelteKit, Google Fonts, FontAwesome, Place to Pay
	// y el mapa embebido de Google Maps (frame-src) en la sección de contacto.
	const csp = [
		"default-src 'self'",
		"base-uri 'self'",
		"font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
		"script-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https: blob:",
		"connect-src 'self' https://checkout.placetopay.com https://checkout-test.placetopay.com",
		"frame-ancestors 'none'",
		"frame-src 'self' https://www.google.com https://maps.google.com",
		"form-action 'self' https://checkout.placetopay.com https://checkout-test.placetopay.com"
	].join('; ');

	response.headers.set('Content-Security-Policy', csp);

	return response;
};
