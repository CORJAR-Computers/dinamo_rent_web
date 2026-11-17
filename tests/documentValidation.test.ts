import { describe, it, expect } from 'vitest';
import {
  validateDocumentNumber,
  sanitizeDocNumberInput,
  normalizeDocType,
  PLACETOPAY_DOCUMENT_TYPES,
} from '../src/lib/utils/documentValidation.js';

describe('Document Validation according to PlacetoPay rules', () => {
  it('normaliza correctamente códigos legacy como PAS a PPN', () => {
    expect(normalizeDocType('PAS')).toBe('PPN');
    expect(normalizeDocType('pas')).toBe('PPN');
    expect(normalizeDocType('CC')).toBe('CC');
    expect(normalizeDocType('ce')).toBe('CE');
    expect(normalizeDocType('INVALID')).toBe('CC');
  });

  describe('Cédula de Ciudadanía (CC)', () => {
    it('acepta cédulas válidas (4 a 10 dígitos, no inician en 0)', () => {
      expect(validateDocumentNumber('CC', '1047412345').valid).toBe(true);
      expect(validateDocumentNumber('CC', '73123456').valid).toBe(true);
      expect(validateDocumentNumber('CC', '1234').valid).toBe(true);
    });

    it('rechaza cédulas inválidas (inician en 0, letras, menos de 4 o más de 10 dígitos)', () => {
      expect(validateDocumentNumber('CC', '0104741234').valid).toBe(false);
      expect(validateDocumentNumber('CC', '123').valid).toBe(false);
      expect(validateDocumentNumber('CC', '104741234567').valid).toBe(false);
      expect(validateDocumentNumber('CC', '10474A2345').valid).toBe(false);
      expect(validateDocumentNumber('CC', '').valid).toBe(false);
    });

    it('sanitiza inputs removiendo caracteres no numéricos', () => {
      expect(sanitizeDocNumberInput('CC', '10.474.123-K')).toBe('10474123');
    });
  });

  describe('Pasaporte (PPN)', () => {
    it('acepta pasaportes alfanuméricos entre 4 y 16 caracteres', () => {
      expect(validateDocumentNumber('PPN', 'A1234567').valid).toBe(true);
      expect(validateDocumentNumber('PPN', 'PASSPORT_99').valid).toBe(true);
      expect(validateDocumentNumber('PPN', '1234').valid).toBe(true);
    });

    it('rechaza pasaportes menores a 4 o mayores a 16 o con caracteres especiales', () => {
      expect(validateDocumentNumber('PPN', 'A12').valid).toBe(false);
      expect(validateDocumentNumber('PPN', '12345678901234567').valid).toBe(false);
      expect(validateDocumentNumber('PPN', 'PAS-SPORT!').valid).toBe(false);
    });
  });

  describe('Cédula de Extranjería (CE)', () => {
    it('acepta formatos válidos de CE', () => {
      expect(validateDocumentNumber('CE', '123456').valid).toBe(true);
      expect(validateDocumentNumber('CE', 'E123456').valid).toBe(true);
    });
  });

  describe('NIT y Tarjeta de Identidad', () => {
    it('valida NIT y TI según reglas PlacetoPay', () => {
      expect(validateDocumentNumber('NIT', '901812836').valid).toBe(true);
      expect(validateDocumentNumber('TI', '1047412345').valid).toBe(true);
    });
  });
});
