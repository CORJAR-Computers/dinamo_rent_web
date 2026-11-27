/**
 * Conceptos admitidos en el cobro de garantía con token.
 *
 * Esta es la ÚNICA lista: la usa el servidor como allowlist
 * (`/api/payments/collect`) y el panel para el selector del modal. Añadir un
 * concepto aquí lo habilita en ambos sitios a la vez; no existe una copia en el
 * cliente que pueda desincronizarse del backend.
 */
export const COLLECT_CONCEPTS = [
	{ value: 'DEDUCIBLE', label: 'Deducible por Siniestro o Daños Menores' },
	{ value: 'GASOLINA', label: 'Combustible / Gasolina Faltante' },
	{ value: 'DIAS_EXTRA', label: 'Día(s) u Horas Adicionales de Retraso' },
	{ value: 'MULTA', label: 'Infracción o Fotomulta de Tránsito' },
	{ value: 'OTRO', label: 'Otro Cargo Justificado en Contrato' }
] as const;

export type CollectConcept = (typeof COLLECT_CONCEPTS)[number]['value'];

export const COLLECT_CONCEPT_VALUES: readonly string[] = COLLECT_CONCEPTS.map(
	(concept) => concept.value
);
