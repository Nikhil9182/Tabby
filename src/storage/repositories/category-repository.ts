import { db } from '../local/database';
import type { Category, CategoryScope } from '../../domain/models/types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food & Dining', icon: 'Utensils', color: '#F97316', scope: 'system' },
  { id: 'cat-groceries', name: 'Groceries', icon: 'ShoppingCart', color: '#10B981', scope: 'system' },
  { id: 'cat-housing', name: 'Housing & Rent', icon: 'Home', color: '#3B82F6', scope: 'system' },
  { id: 'cat-utilities', name: 'Utilities', icon: 'Zap', color: '#EAB308', scope: 'system' },
  { id: 'cat-transport', name: 'Transportation', icon: 'Car', color: '#8B5CF6', scope: 'system' },
  { id: 'cat-entertainment', name: 'Entertainment', icon: 'Film', color: '#EC4899', scope: 'system' },
  { id: 'cat-shopping', name: 'Shopping', icon: 'ShoppingBag', color: '#06B6D4', scope: 'system' },
  { id: 'cat-travel', name: 'Travel', icon: 'Plane', color: '#14B8A6', scope: 'system' },
  { id: 'cat-health', name: 'Healthcare', icon: 'HeartPulse', color: '#EF4444', scope: 'system' },
  { id: 'cat-other', name: 'Other', icon: 'CircleEllipsis', color: '#6B7280', scope: 'system' },
];

export class CategoryRepository {
  getDefaultCategories(): Category[] {
    return [...DEFAULT_CATEGORIES];
  }

  async getAllCategories(): Promise<Category[]> {
    const categories = await db.categories.toArray();
    if (categories.length === 0) {
      const defaults = this.getDefaultCategories();
      await db.categories.bulkPut(defaults);
      return defaults;
    }
    return categories;
  }

  async getCategoriesByScope(scope: CategoryScope | string, ownerId?: string): Promise<Category[]> {
    if (ownerId) {
      return await db.categories
        .where('scope')
        .equals(scope)
        .filter((cat) => cat.ownerId === ownerId)
        .toArray();
    }

    return await db.categories
      .where('scope')
      .equals(scope)
      .toArray();
  }

  async createCategory(category: Category): Promise<void> {
    await db.categories.put(category);
  }

  async updateCategory(category: Category): Promise<void> {
    await db.categories.put(category);
  }

  async deleteCategory(id: string): Promise<void> {
    await db.categories.delete(id);
  }
}

export const categoryRepository = new CategoryRepository();
