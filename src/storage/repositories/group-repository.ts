import { db } from '../local/database';
import type { Group, GroupMembership } from '../../domain/models/types';

export class GroupRepository {
  async getAllGroups(): Promise<Group[]> {
    return await db.groups.toArray();
  }

  async getGroupById(id: string): Promise<Group | undefined> {
    return await db.groups.get(id);
  }

  async createGroup(group: Group, membership: GroupMembership): Promise<void> {
    await db.transaction('rw', db.groups, db.groupMemberships, async () => {
      await db.groups.put(group);
      await db.groupMemberships.put(membership);
    });
  }

  async updateGroup(group: Group): Promise<void> {
    await db.groups.put(group);
  }

  async archiveGroup(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.groups.update(id, {
      isArchived: true,
      updatedAt: now,
    });
  }

  async getGroupMembers(groupId: string): Promise<GroupMembership[]> {
    return await db.groupMemberships
      .where('groupId')
      .equals(groupId)
      .toArray();
  }

  async addMember(membership: GroupMembership): Promise<void> {
    await db.groupMemberships.put(membership);
  }

  async updateMemberRole(groupId: string, userId: string, role: string): Promise<void> {
    const existing = await db.groupMemberships.get([groupId, userId]);
    if (existing) {
      await db.groupMemberships.put({
        ...existing,
        role: role as any,
      });
    }
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await db.groupMemberships.delete([groupId, userId]);
  }
}

export const groupRepository = new GroupRepository();
