import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Category, CategoryScope, SyncOperation } from '@/domain/models/types';
import { db } from '@/storage/local/database';
import { syncRepository } from '@/storage/repositories/sync-repository';
import { generateId, generateOperationId } from '@/lib/id';
import { notifySyncQueueUpdated } from './use-sync';

export const SYSTEM_CATEGORIES: Array<Omit<Category, 'createdAt' | 'updatedAt'>> = [
  { id: 'cat_food', name: 'Food & Dining', icon: 'Utensils', color: '#f97316', scope: 'system' },
  { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10b981', scope: 'system' },
  { id: 'cat_transport', name: 'Transportation', icon: 'Car', color: '#3b82f6', scope: 'system' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: 'Film', color: '#8b5cf6', scope: 'system' },
  { id: 'cat_housing', name: 'Housing & Rent', icon: 'Home', color: '#ec4899', scope: 'system' },
  { id: 'cat_utilities', name: 'Utilities', icon: 'Zap', color: '#eab308', scope: 'system' },
  { id: 'cat_travel', name: 'Travel', icon: 'Plane', color: '#06b6d4', scope: 'system' },
  { id: 'cat_health', name: 'Health & Medical', icon: 'HeartPulse', color: '#ef4444', scope: 'system' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#6366f1', scope: 'system' },
  { id: 'cat_other', name: 'General & Other', icon: 'MoreHorizontal', color: '#64748b', scope: 'system' },
];

export interface CreateCategoryInput {
  name: string;
  icon?: string;
  color?: string;
  scope?: CategoryScope;
  ownerId?: string;
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  icon?: string;
  color?: string;
}

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(50),
  icon: z.string().optional(),
  color: z.string().optional(),
  scope: z.enum(['personal', 'group', 'system']).default('personal'),
  ownerId: z.string().optional(),
});

export interface UseCategoriesResult {
  categories: Category[];
  createCategory: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory: (input: UpdateCategoryInput) => Promise<Category>;
  deleteCategory: (id: string) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export function useCategories(scope?: CategoryScope): UseCategoriesResult {
  const queryClient = useQueryClient();
  const queryKey = ['categories', scope];

  const {
    data: categories = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Category[], Error>({
    queryKey,
    queryFn: async () => {
      // Initialize system categories if table is empty
      const count = await db.categories.count();
      if (count === 0) {
        const now = new Date().toISOString();
        const initialCategories: Category[] = SYSTEM_CATEGORIES.map((cat) => ({
          ...cat,
          createdAt: now,
          updatedAt: now,
        }));
        await db.categories.bulkPut(initialCategories);
      }

      let all: Category[];
      if (scope) {
        all = await db.categories.where('scope').equals(scope).toArray();
      } else {
        all = await db.categories.toArray();
      }

      return all.sort((a, b) => {
        // System categories first, then alphabetical
        if (a.scope === 'system' && b.scope !== 'system') return -1;
        if (a.scope !== 'system' && b.scope === 'system') return 1;
        return a.name.localeCompare(b.name);
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateCategoryInput): Promise<Category> => {
      createCategorySchema.parse(input);

      const now = new Date().toISOString();
      const id = generateId();
      const category: Category = {
        id,
        name: input.name.trim(),
        icon: input.icon || 'Tag',
        color: input.color || '#64748b',
        scope: input.scope || 'personal',
        ownerId: input.ownerId,
        createdAt: now,
        updatedAt: now,
      };

      await db.categories.put(category);

      const operationId = generateOperationId();
      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'category',
        entityId: id,
        sourceId: input.ownerId || 'system',
        operationType: 'create',
        payload: JSON.stringify(category),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return category;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateCategoryInput): Promise<Category> => {
      const existing = await db.categories.get(input.id);
      if (!existing) {
        throw new Error(`Category with id ${input.id} not found`);
      }

      const now = new Date().toISOString();
      const updated: Category = {
        ...existing,
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        updatedAt: now,
      };

      await db.categories.put(updated);

      const operationId = generateOperationId();
      const syncOp: SyncOperation = {
        id: generateId(),
        operationId,
        entityType: 'category',
        entityId: input.id,
        sourceId: existing.ownerId || 'system',
        operationType: 'update',
        payload: JSON.stringify(updated),
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };
      await syncRepository.addOperation(syncOp);
      notifySyncQueueUpdated();

      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const existing = await db.categories.get(id);
      if (existing?.scope === 'system') {
        throw new Error('Cannot delete system default categories');
      }

      await db.categories.delete(id);

      if (existing) {
        const now = new Date().toISOString();
        const operationId = generateOperationId();
        const syncOp: SyncOperation = {
          id: generateId(),
          operationId,
          entityType: 'category',
          entityId: id,
          sourceId: existing.ownerId || 'system',
          operationType: 'delete',
          payload: JSON.stringify({ id, deletedAt: now }),
          createdAt: now,
          attemptCount: 0,
          status: 'pending',
        };
        await syncRepository.addOperation(syncOp);
        notifySyncQueueUpdated();
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  return {
    categories,
    createCategory: (input: CreateCategoryInput) => createMutation.mutateAsync(input),
    updateCategory: (input: UpdateCategoryInput) => updateMutation.mutateAsync(input),
    deleteCategory: (id: string) => deleteMutation.mutateAsync(id),
    isLoading,
    error,
    refetch,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
