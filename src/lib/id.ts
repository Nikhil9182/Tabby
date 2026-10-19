import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';

/**
 * Generates a unique UUID v4 identifier.
 *
 * @returns A standard UUID v4 string.
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generates an operation identifier prefixed with 'op_'.
 * Used for sync tracking and idempotent operations.
 *
 * @returns An operation ID formatted as 'op_<uuidv4>'.
 */
export function generateOperationId(): string {
  return `op_${uuidv4()}`;
}

/**
 * Validates whether the given string is a valid UUID v4.
 *
 * @param id The string to validate.
 * @returns True if valid UUID v4, false otherwise.
 */
export function isValidId(id: string): boolean {
  if (typeof id !== 'string') {
    return false;
  }
  return uuidValidate(id) && uuidVersion(id) === 4;
}

/**
 * Validates whether the given string is a valid operation ID ('op_<uuidv4>').
 *
 * @param id The string to validate.
 * @returns True if valid operation ID, false otherwise.
 */
export function isValidOperationId(id: string): boolean {
  if (typeof id !== 'string' || !id.startsWith('op_')) {
    return false;
  }
  const rawUuid = id.slice(3);
  return isValidId(rawUuid);
}
