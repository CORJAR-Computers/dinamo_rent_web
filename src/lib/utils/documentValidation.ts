/**
 * documentValidation.ts — Tipos de documentos y validaciones oficiales de Evertec PlacetoPay
 * Documentación oficial: https://docs.placetopay.dev/checkout/document-types/
 */

export interface DocumentTypeConfig {
  code: string;
  name: string;
  regex: RegExp;
  placeholder: string;
  hint: string;
  inputMode: 'numeric' | 'text';
  maxLength: number;
}

/**
 * Catálogo oficial de tipos de documento soportados por PlacetoPay (Colombia y Global).
 */
export const PLACETOPAY_DOCUMENT_TYPES: Record<string, DocumentTypeConfig> = {
  CC: {
    code: 'CC',
    name: 'Cédula de Ciudadanía (CC)',
    regex: /^[1-9][0-9]{3,9}$/,
    placeholder: 'Ej: 1047412345',
    hint: 'De 4 a 10 dígitos numéricos (no puede iniciar en 0)',
    inputMode: 'numeric',
    maxLength: 10,
  },
  CE: {
    code: 'CE',
    name: 'Cédula de Extranjería (CE)',
    regex: /^([a-zA-Z]{1,5})?[1-9][0-9]{3,7}$/,
    placeholder: 'Ej: 123456 o E123456',
    hint: 'Hasta 5 letras iniciales opcionales y de 4 a 8 dígitos numéricos',
    inputMode: 'text',
    maxLength: 12,
  },
  PPN: {
    code: 'PPN',
    name: 'Pasaporte (PPN)',
    regex: /^[a-zA-Z0-9_]{4,16}$/,
    placeholder: 'Ej: AB1234567',
    hint: 'Alfanumérico de 4 a 16 caracteres (para ciudadanos extranjeros)',
    inputMode: 'text',
    maxLength: 16,
  },
  TI: {
    code: 'TI',
    name: 'Tarjeta de Identidad (TI)',
    regex: /^[1-9][0-9]{4,11}$/,
    placeholder: 'Ej: 1047412345',
    hint: 'De 5 a 12 dígitos numéricos (no puede iniciar en 0)',
    inputMode: 'numeric',
    maxLength: 12,
  },
  NIT: {
    code: 'NIT',
    name: 'Número de Identificación Tributaria (NIT)',
    regex: /^[1-9]\d{6,9}$/,
    placeholder: 'Ej: 901812836',
    hint: 'De 7 a 10 dígitos numéricos (sin dígito de verificación)',
    inputMode: 'numeric',
    maxLength: 10,
  },
  RUT: {
    code: 'RUT',
    name: 'Registro Único Tributario (RUT)',
    regex: /^[1-9]\d{6,9}$/,
    placeholder: 'Ej: 901812836',
    hint: 'De 7 a 10 dígitos numéricos (sin dígito de verificación)',
    inputMode: 'numeric',
    maxLength: 10,
  },
};

/**
 * Normaliza códigos legacy como PAS a PPN para garantizar compatibilidad con PlacetoPay.
 */
export function normalizeDocType(type: string | null | undefined): string {
  const clean = (type || '').trim().toUpperCase();
  if (clean === 'PAS') return 'PPN';
  if (PLACETOPAY_DOCUMENT_TYPES[clean]) return clean;
  return 'CC';
}

/**
 * Filtra caracteres inválidos en tiempo de digitación según el tipo de documento.
 */
export function sanitizeDocNumberInput(type: string, value: string): string {
  const docType = normalizeDocType(type);
  if (docType === 'CC' || docType === 'TI' || docType === 'NIT' || docType === 'RUT') {
    return value.replace(/\D/g, '');
  }
  // CE y PPN permiten letras y números
  return value.replace(/[^a-zA-Z0-9_]/g, '');
}

/**
 * Valida un número de documento contra las expresiones regulares oficiales de PlacetoPay.
 */
export function validateDocumentNumber(
  type: string,
  docNumber: string
): { valid: boolean; error?: string } {
  const docType = normalizeDocType(type);
  const config = PLACETOPAY_DOCUMENT_TYPES[docType];
  const clean = (docNumber || '').trim();

  if (!clean) {
    return { valid: false, error: 'El número de documento es obligatorio.' };
  }

  if (!config) {
    return { valid: false, error: `Tipo de documento no soportado: ${type}` };
  }

  if (!config.regex.test(clean)) {
    return {
      valid: false,
      error: `Formato inválido para ${config.name}. ${config.hint}.`,
    };
  }

  return { valid: true };
}
