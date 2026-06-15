import { afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../db/testing';
import { createTenant } from '../tenants/tenants.repo';
import { createUser, getUserById } from './users.repo';

describe('users repo — tenant scoping', () => {
  let h: TestDb | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('finds a user by id only within its own tenant', async () => {
    h = await createTestDb();
    const { db } = h;
    const t1 = await createTenant(db, 'Tenant 1');
    const t2 = await createTenant(db, 'Tenant 2');

    const user = await createUser(db, t1.id, {
      email: 'a@b.com',
      name: 'Admin',
      password: 'secret123',
      role: 'admin',
    });

    // The owning tenant can load the user.
    expect((await getUserById(db, t1.id, user.id))?.id).toBe(user.id);
    // Another tenant cannot — even with the (globally unique) user id.
    expect(await getUserById(db, t2.id, user.id)).toBeNull();
  });
});
