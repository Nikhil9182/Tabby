import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase-types';

export type DbCategory = Database['public']['Tables']['categories']['Row'];

class CategoryService {
  async getCategories(groupId?: string): Promise<DbCategory[]> {
    let query = supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (groupId) {
      query = query.or(`is_system.eq.true,group_id.eq.${groupId}`);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Error fetching categories from Supabase:', error.message);
      // Fallback default categories
      return [
        { id: 'cat-general', name: 'General', icon: 'receipt', color: '#6366f1', owner_id: null, group_id: null, is_system: true, created_at: '', updated_at: '' },
        { id: 'cat-food', name: 'Food & Drink', icon: 'utensils', color: '#ef4444', owner_id: null, group_id: null, is_system: true, created_at: '', updated_at: '' },
        { id: 'cat-groceries', name: 'Groceries', icon: 'shopping-cart', color: '#10b981', owner_id: null, group_id: null, is_system: true, created_at: '', updated_at: '' },
        { id: 'cat-transport', name: 'Transportation', icon: 'car', color: '#f59e0b', owner_id: null, group_id: null, is_system: true, created_at: '', updated_at: '' },
        { id: 'cat-housing', name: 'Housing', icon: 'home', color: '#3b82f6', owner_id: null, group_id: null, is_system: true, created_at: '', updated_at: '' },
        { id: 'cat-travel', name: 'Travel', icon: 'plane', color: '#8b5cf6', owner_id: null, group_id: null, is_system: true, created_at: '', updated_at: '' },
      ];
    }

    return data || [];
  }

  async createCategory(input: { name: string; icon?: string; color?: string; groupId?: string }): Promise<DbCategory> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('categories')
      .insert({
        name: input.name.trim(),
        icon: input.icon || 'receipt',
        color: input.color || '#6366f1',
        owner_id: user.id,
        group_id: input.groupId || null,
        is_system: false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}

export const categoryService = new CategoryService();
