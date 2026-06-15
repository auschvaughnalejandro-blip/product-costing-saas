import { randomUUID } from 'node:crypto';

/** Generate a new UUID. Ids are minted in the app so no DB extension is needed. */
export function newId(): string {
  return randomUUID();
}
