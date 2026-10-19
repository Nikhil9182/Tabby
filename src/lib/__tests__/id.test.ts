import { describe, it, expect } from 'vitest';
import {
  generateId,
  generateOperationId,
  isValidId,
  isValidOperationId,
} from '../id';

describe('ID Utilities (src/lib/id.ts)', () => {
  describe('generateId', () => {
    it('generates a valid UUID v4 string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(isValidId(id)).toBe(true);

      // Verify UUID v4 regex pattern: 8-4-4-4-12 hex with 4 in version position and 8,9,a,b in variant
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidV4Regex.test(id)).toBe(true);
    });

    it('generates unique values across thousands of invocations', () => {
      const count = 5000;
      const idSet = new Set<string>();

      for (let i = 0; i < count; i++) {
        idSet.add(generateId());
      }

      expect(idSet.size).toBe(count);
    });
  });

  describe('generateOperationId', () => {
    it('generates an operation ID prefixed with op_', () => {
      const opId = generateOperationId();
      expect(typeof opId).toBe('string');
      expect(opId.startsWith('op_')).toBe(true);
      expect(isValidOperationId(opId)).toBe(true);

      const rawUuid = opId.slice(3);
      expect(isValidId(rawUuid)).toBe(true);
    });

    it('generates unique operation IDs', () => {
      const count = 1000;
      const opSet = new Set<string>();

      for (let i = 0; i < count; i++) {
        opSet.add(generateOperationId());
      }

      expect(opSet.size).toBe(count);
    });
  });

  describe('isValidId', () => {
    it('accepts valid UUID v4 strings', () => {
      // Known valid v4 UUIDs
      const validUuids = [
        '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        'c73bcdcc-2669-4bf6-81d3-e4ae73fb11fd',
        '109156be-c4fb-41ea-b1b4-efe1671c5836',
        'A984E290-7F45-4B8D-A746-88F47EBDE983', // Uppercase
      ];

      for (const id of validUuids) {
        expect(isValidId(id)).toBe(true);
      }
    });

    it('rejects empty strings and malformed strings', () => {
      expect(isValidId('')).toBe(false);
      expect(isValidId('   ')).toBe(false);
      expect(isValidId('invalid-uuid')).toBe(false);
      expect(isValidId('12345')).toBe(false);
      expect(isValidId('9b1deb4d-3b7d-4bad-9bdd')).toBe(false);
      expect(isValidId('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d-extra')).toBe(false);
    });

    it('rejects non-v4 UUIDs (e.g., UUID v1, v5, or nil UUID)', () => {
      // UUID v1 (MAC address and timestamp-based)
      const v1Uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      expect(isValidId(v1Uuid)).toBe(false);

      // UUID v5 (SHA-1 name-based)
      const v5Uuid = '886313e1-3b8a-5372-9b90-0c9aee199e5d';
      expect(isValidId(v5Uuid)).toBe(false);

      // Nil UUID (all zeros)
      const nilUuid = '00000000-0000-0000-0000-000000000000';
      expect(isValidId(nilUuid)).toBe(false);
    });

    it('rejects non-string types safely', () => {
      expect(isValidId(null as unknown as string)).toBe(false);
      expect(isValidId(undefined as unknown as string)).toBe(false);
      expect(isValidId(12345 as unknown as string)).toBe(false);
      expect(isValidId({} as unknown as string)).toBe(false);
      expect(isValidId([] as unknown as string)).toBe(false);
    });
  });

  describe('isValidOperationId', () => {
    it('accepts valid operation IDs starting with op_ followed by UUID v4', () => {
      const validOp = `op_${generateId()}`;
      expect(isValidOperationId(validOp)).toBe(true);

      expect(isValidOperationId('op_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(true);
    });

    it('rejects IDs without op_ prefix', () => {
      const rawUuid = generateId();
      expect(isValidOperationId(rawUuid)).toBe(false);
      expect(isValidOperationId(`operation_${rawUuid}`)).toBe(false);
      expect(isValidOperationId(`task_${rawUuid}`)).toBe(false);
      expect(isValidOperationId(`_op_${rawUuid}`)).toBe(false);
    });

    it('rejects prefix only or invalid suffix', () => {
      expect(isValidOperationId('op_')).toBe(false);
      expect(isValidOperationId('op_invalid')).toBe(false);
      expect(isValidOperationId('op_12345')).toBe(false);
      expect(isValidOperationId('op_6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(false); // v1 suffix
    });

    it('rejects non-string types safely', () => {
      expect(isValidOperationId(null as unknown as string)).toBe(false);
      expect(isValidOperationId(undefined as unknown as string)).toBe(false);
      expect(isValidOperationId(123 as unknown as string)).toBe(false);
      expect(isValidOperationId({} as unknown as string)).toBe(false);
    });
  });
});
