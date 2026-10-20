import { db } from '../local/database';
import type { User } from '../../domain/models/types';

export class UserRepository {
  async adoptGoogleIdentity(user: User, previousId?: string): Promise<void> {
    if (!previousId || previousId === user.id) return this.setCurrentUser(user);
    // One Google subject must resolve to the same participant ID on every device.
    // Move references atomically, including queued offline writes.
    await db.transaction('rw', db.tables, async () => {
      const replace = (value: any): any => {
        if (value === previousId) return user.id;
        if (Array.isArray(value)) return value.map(replace);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
        return value;
      };
      for (const table of [db.groups, db.expenses, db.expenseSplits, db.settlements, db.categories, db.fileMetadata, db.syncOperations]) {
        for (const row of await table.toArray()) {
          const updated = replace(row);
          if ('payload' in updated && typeof updated.payload === 'string') {
            try { updated.payload = JSON.stringify(replace(JSON.parse(updated.payload))); } catch { /* Retain legacy payload for the sync error handler. */ }
          }
          await (table as any).put(updated);
        }
      }
      const memberships = await db.groupMemberships.where('userId').equals(previousId).toArray();
      for (const member of memberships) {
        await db.groupMemberships.delete([member.groupId, previousId]);
        await db.groupMemberships.put({ ...member, userId: user.id });
      }
      for (const group of await db.groups.where('createdBy').equals(user.id).toArray()) {
        await db.syncOperations.put({
          id: crypto.randomUUID(), operationId: crypto.randomUUID(), entityType: 'group', entityId: group.id, sourceId: group.id,
          operationType: 'update', payload: JSON.stringify(group), status: 'pending', createdAt: new Date().toISOString(), attemptCount: 0,
        });
      }
      await db.users.delete(previousId);
      const previous = await db.users.filter(u => !!u.isCurrentUser).toArray();
      for (const person of previous) await db.users.update(person.id, { isCurrentUser: false });
      await db.users.put({ ...user, isCurrentUser: true });
    });
  }

  async getCurrentUser(): Promise<User | undefined> {
    return await db.users.filter((user) => !!user.isCurrentUser).first();
  }

  async setCurrentUser(user: User): Promise<void> {
    await db.transaction('rw', db.users, async () => {
      const existingCurrentUsers = await db.users.filter((u) => !!u.isCurrentUser).toArray();
      for (const u of existingCurrentUsers) {
        if (u.id !== user.id) {
          await db.users.put({ ...u, isCurrentUser: false });
        }
      }
      await db.users.put({ ...user, isCurrentUser: true });
      // Remove any duplicate alias rows
      await db.users.bulkDelete(['user_self', 'current_user']);
    });
  }

  async getUserById(id: string): Promise<User | undefined> {
    if (id === 'user_self' || id === 'current_user') {
      return await this.getCurrentUser();
    }
    const current = await this.getCurrentUser();
    if (current && (current.id === id || (current.googleSub && current.googleSub === id))) {
      return current;
    }
    return await db.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    return await db.users.filter((u) => u.email.trim().toLowerCase() === normalized).first();
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return await db.users.where('id').anyOf(ids).toArray();
  }

  async upsertUser(user: User): Promise<void> {
    await db.users.put(user);
  }

  async deleteUser(id: string): Promise<void> {
    await db.users.delete(id);
  }

  async cleanLegacyAliases(): Promise<void> {
    await db.users.bulkDelete(['user_self', 'current_user']);
  }

  async getAllUsers(): Promise<User[]> {
    const all = await db.users.toArray();
    // Exclude dummy alias rows and return only real users
    return all.filter((u) => u.id !== 'user_self' && u.id !== 'current_user');
  }
}

export const userRepository = new UserRepository();
