import { useState, useEffect, useCallback } from 'react';
import {
  geminiReceiptService,
  GEMINI_API_KEY_STORAGE_KEY,
} from '@/services/ai/gemini-receipt-service';

export interface UseGeminiConfigResult {
  apiKey: string;
  hasKey: boolean;
  saveKey: (key: string) => void;
  clearKey: () => void;
  testKey: (key: string) => Promise<{ success: boolean; message: string }>;
  isTesting: boolean;
}

export function useGeminiConfig(): UseGeminiConfigResult {
  const [apiKey, setApiKey] = useState<string>(() => geminiReceiptService.getApiKey() || '');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === GEMINI_API_KEY_STORAGE_KEY) {
        setApiKey(geminiReceiptService.getApiKey() || '');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const saveKey = useCallback((newKey: string) => {
    geminiReceiptService.setApiKey(newKey);
    setApiKey(newKey.trim());
  }, []);

  const clearKey = useCallback(() => {
    geminiReceiptService.clearApiKey();
    setApiKey('');
  }, []);

  const testKey = useCallback(async (keyToTest: string) => {
    setIsTesting(true);
    try {
      return await geminiReceiptService.testApiKey(keyToTest);
    } finally {
      setIsTesting(false);
    }
  }, []);

  return {
    apiKey,
    hasKey: Boolean(apiKey.trim()),
    saveKey,
    clearKey,
    testKey,
    isTesting,
  };
}
