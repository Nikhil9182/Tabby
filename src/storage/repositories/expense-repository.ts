import { db } from '../local/database';
import type { Expense, ExpenseSplit, ExpenseFilters } from '../../domain/models/types';

export class ExpenseRepository {
  async getAllExpenses(sourceId?: string): Promise<Expense[]> {
    if (sourceId) {
      return await db.expenses
        .where('sourceId')
        .equals(sourceId)
        .filter((expense) => !expense.deletedAt)
        .toArray();
    }

    return await db.expenses
      .filter((expense) => !expense.deletedAt)
      .toArray();
  }

  async getExpenseById(id: string): Promise<Expense | undefined> {
    return await db.expenses.get(id);
  }

  async getExpensesByGroup(groupId: string): Promise<Expense[]> {
    return await db.expenses
      .where('groupId')
      .equals(groupId)
      .filter((expense) => !expense.deletedAt)
      .toArray();
  }

  async getPersonalExpenses(userId: string): Promise<Expense[]> {
    return await db.expenses
      .filter((expense) => 
        !expense.deletedAt && 
        expense.sourceType === 'personal' && 
        (expense.sourceId === userId || expense.paidBy === userId)
      )
      .toArray();
  }

  async createExpense(expense: Expense, splits: ExpenseSplit[]): Promise<void> {
    await db.transaction('rw', db.expenses, db.expenseSplits, async () => {
      await db.expenses.put(expense);
      if (splits && splits.length > 0) {
        await db.expenseSplits.bulkPut(splits);
      }
    });
  }

  async updateExpense(expense: Expense, splits?: ExpenseSplit[]): Promise<void> {
    await db.transaction('rw', db.expenses, db.expenseSplits, async () => {
      await db.expenses.put(expense);
      if (splits !== undefined) {
        await db.expenseSplits.where('expenseId').equals(expense.id).delete();
        if (splits.length > 0) {
          await db.expenseSplits.bulkPut(splits);
        }
      }
    });
  }

  async deleteExpense(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.expenses.update(id, {
      deletedAt: now,
      updatedAt: now,
    });
  }

  async getExpenseSplits(expenseId: string): Promise<ExpenseSplit[]> {
    return await db.expenseSplits
      .where('expenseId')
      .equals(expenseId)
      .toArray();
  }

  async searchExpenses(query: string, filters?: ExpenseFilters): Promise<Expense[]> {
    const normalizedQuery = query.trim().toLowerCase();

    return await db.expenses
      .filter((expense) => {
        // Soft delete check
        if (!filters?.includeDeleted && expense.deletedAt) {
          return false;
        }

        // Text query check
        if (normalizedQuery && !expense.description.toLowerCase().includes(normalizedQuery)) {
          return false;
        }

        // Filters check
        if (filters?.groupId && expense.groupId !== filters.groupId) {
          return false;
        }

        if (filters?.sourceId && expense.sourceId !== filters.sourceId) {
          return false;
        }

        if (filters?.sourceType && expense.sourceType !== filters.sourceType) {
          return false;
        }

        if (filters?.categoryId && expense.categoryId !== filters.categoryId) {
          return false;
        }

        if (filters?.paidBy && expense.paidBy !== filters.paidBy) {
          return false;
        }

        if (filters?.startDate && expense.expenseDate < filters.startDate) {
          return false;
        }

        if (filters?.endDate && expense.expenseDate > filters.endDate) {
          return false;
        }

        const expenseAmount = expense.amountMinor ?? expense.originalAmountMinor ?? 0;

        if (filters?.minAmountMinor !== undefined && expenseAmount < filters.minAmountMinor) {
          return false;
        }

        if (filters?.maxAmountMinor !== undefined && expenseAmount > filters.maxAmountMinor) {
          return false;
        }

        return true;
      })
      .toArray();
  }
}

export const expenseRepository = new ExpenseRepository();
