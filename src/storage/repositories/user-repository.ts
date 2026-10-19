import { db } from '../local/database';
import type { User } from '../../domain/models/types';

export class UserRepository {
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
    });
  }

  async getUserById(id: string): Promise<User | undefined> {
    return await db.users.get(id);
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return await db.users.where('id').anyOf(ids).toArray();
  }

  async upsertUser(user: User): Promise<void> {
    await db.users.put(user);
  }

  async getAllUsers(): Promise<User[]> {
    return await db.users.toArray();
  }
}

export const userRepository = new UserRepository();
