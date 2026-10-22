import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { Category, CategoryScope } from '@/domain/models/types';
import { categoryService } from '@/services/supabase/category-service';

export const SYSTEM_CATEGORIES: Array<Category> = [
  { id: 'cat_food', name: 'Food & Dining', icon: 'Utensils', color: '#f97316', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10b981', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_transport', name: 'Transportation', icon: 'Car', color: '#3b82f6', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: 'Film', color: '#8b5cf6', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_housing', name: 'Housing & Rent', icon: 'Home', color: '#ec4899', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_utilities', name: 'Utilities', icon: 'Zap', color: '#eab308', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_travel', name: 'Travel', icon: 'Plane', color: '#06b6d4', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_health', name: 'Health & Medical', icon: 'HeartPulse', color: '#ef4444', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#6366f1', scope: 'system', createdAt: '', updatedAt: '' },
  { id: 'cat_other', name: 'General & Other', icon: 'MoreHorizontal', color: '#64748b', scope: 'system', createdAt: '', updatedAt: '' },
];

export interface CreateCategoryInput {
  name: string;
  icon?: string;
  color?: string;
  scope?: CategoryScope;
  ownerId?: string;
  groupId?: string;
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
  groupId: z.string().optional(),
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

export function useCategories(scope?: CategoryScope, groupId?: string): UseCategoriesResult {
  const queryClient = useQueryClient();
  const queryKey = ['categories', scope, groupId];

  const {
    data: categories = SYSTEM_CATEGORIES,
    isLoading,
    error,
    refetch,
  } = useQuery<Category[], Error>({
    queryKey,
    queryFn: async () => {
      const dbCategories = await categoryService.getCategories(groupId);
      if (dbCategories.length === 0) {
        return SYSTEM_CATEGORIES;
      }
      return dbCategories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        scope: c.is_system ? 'system' : c.group_id ? 'group' : 'personal',
        ownerId: c.owner_id || undefined,
        groupId: c.group_id || undefined,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateCategoryInput): Promise<Category> => {
      createCategorySchema.parse(input);
      const created = await categoryService.createCategory({
        name: input.name,
        icon: input.icon,
        color: input.color,
        groupId: input.groupId,
      });
      return {
        id: created.id,
        name: created.name,
        icon: created.icon,
        color: created.color,
        scope: input.scope || 'personal',
        ownerId: created.owner_id || undefined,
        groupId: created.group_id || undefined,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (_input: UpdateCategoryInput): Promise<Category> => {
      throw new Error('Category update not implemented');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (_id: string): Promise<void> => {
      throw new Error('Category deletion not implemented');
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
