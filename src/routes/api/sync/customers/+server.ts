import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

/**
 * GET /api/sync/customers
 * Permite al software de escritorio consultar clientes registrados en la Web
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const unsyncedOnly = url.searchParams.get('unsynced') === 'true';
    const where: Record<string, unknown> = {};
    if (unsyncedOnly) where.syncedWithDesktop = false;

    const customers = await db.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return json({ ok: true, count: customers.length, customers });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};

/**
 * POST /api/sync/customers
 * Permite al software de escritorio sincronizar su padrón de clientes hacia la Web (Neon)
 * Garantiza deduplicación estricta por documento (docNumber)
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { customers = [] } = body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return json({ ok: false, error: 'Se requiere una lista de clientes en el campo "customers"' }, { status: 400 });
    }

    let created = 0;
    let updated = 0;

    for (const c of customers) {
      const cleanDoc = String(c.noDoc || c.docNumber || '').trim();
      if (!cleanDoc) continue;

      const names = String(c.nombres || c.names || '').trim();
      const lastnames = String(c.apellidos || c.lastnames || '').trim();
      const fullName = (c.nombreCompleto || `${names} ${lastnames}`).trim();
      const email = String(c.email || '').trim().toLowerCase();
      const phone = String(c.celular || c.phone || '').trim();
      const desktopId = c.id ? Number(c.id) : (c.desktopId ? Number(c.desktopId) : undefined);

      const existing = await db.customer.findUnique({
        where: { docNumber: cleanDoc },
      });

      if (existing) {
        await db.customer.update({
          where: { id: existing.id },
          data: {
            names: names || existing.names,
            lastnames: lastnames || existing.lastnames,
            fullName: fullName || existing.fullName,
            email: email || existing.email,
            phone: phone || existing.phone,
            license: c.noLicencia || c.license || existing.license,
            hotel: c.hotel || existing.hotel,
            desktopId: desktopId || existing.desktopId,
            syncedWithDesktop: true,
          },
        });
        updated++;
      } else {
        await db.customer.create({
          data: {
            docType: c.tipoDoc || c.docType || 'CC',
            docNumber: cleanDoc,
            names,
            lastnames,
            fullName,
            email,
            phone,
            license: c.noLicencia || c.license || null,
            hotel: c.hotel || null,
            desktopId: desktopId || null,
            syncedWithDesktop: true,
          },
        });
        created++;
      }
    }

    return json({
      ok: true,
      message: `Sincronización de clientes completada: ${created} creados, ${updated} actualizados`,
      created,
      updated,
      totalProcessed: customers.length,
    });
  } catch (e) {
    console.error('[sync/customers error]:', e);
    return json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
};
