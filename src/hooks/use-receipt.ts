import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  receiptService,
  type ReceiptAttachment,
  type UploadReceiptInput,
  type SaveReceiptItemsInput,
} from '@/services/receipts/receipt-service';

export interface UseReceiptUploadInput {
  expenseId?: string;
  file: File | Blob;
  originalFilename?: string;
  width?: number;
  height?: number;
}

export function useReceipt(expenseId?: string) {
  const queryClient = useQueryClient();

  const queryKey = ['receipt', expenseId];

  const {
    data: receipt = null,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!expenseId) return null;
      return receiptService.getReceiptForExpense(expenseId);
    },
    enabled: Boolean(expenseId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: UseReceiptUploadInput) => {
      const targetExpenseId = input.expenseId || expenseId;
      if (!targetExpenseId) {
        throw new Error('Expense ID is required to upload a receipt attachment.');
      }
      return receiptService.uploadReceiptAttachment({
        expenseId: targetExpenseId,
        file: input.file,
        originalFilename: input.originalFilename,
      });
    },
    onSuccess: (newReceipt) => {
      queryClient.setQueryData(queryKey, newReceipt);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (args: { receiptId: string; storagePath?: string | null }) => {
      return receiptService.deleteReceiptAttachment(args.receiptId, args.storagePath);
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKey, null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
    },
  });

  const saveItemsMutation = useMutation({
    mutationFn: async (input: SaveReceiptItemsInput) => {
      const targetExpenseId = input.expenseId || expenseId;
      if (!targetExpenseId) throw new Error('Expense ID is required to save receipt items.');
      return receiptService.saveReceiptItems({
        ...input,
        expenseId: targetExpenseId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', expenseId] });
    },
  });

  return {
    receipt,
    signedUrl: receipt?.signedUrl,
    isLoading,
    error,
    refetch,
    uploadReceipt: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    deleteReceipt: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    saveReceiptItems: saveItemsMutation.mutateAsync,
    isSavingItems: saveItemsMutation.isPending,
  };
}
