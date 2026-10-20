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
