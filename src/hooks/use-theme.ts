import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const THEME_STORAGE_KEY = 'tabby_theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

function applyThemeClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
  }
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setLocalTheme] = useState<Theme>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(storageKey) as Theme | null;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    }
    return defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  // Apply theme class to DOM and handle system preference changes
  useEffect(() => {
    const active = resolveTheme(theme);
    setResolvedTheme(active);
    applyThemeClass(active);

    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (theme === 'system') {
        const newResolved = getSystemTheme();
        setResolvedTheme(newResolved);
        applyThemeClass(newResolved);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      // Compatibility with older browsers
      mediaQuery.addListener(handleMediaChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, [theme]);

  // Sync across tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        const val = event.newValue as Theme;
        if (val === 'light' || val === 'dark' || val === 'system') {
          setLocalTheme(val);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setLocalTheme(newTheme);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, newTheme);
      }
      const active = resolveTheme(newTheme);
      setResolvedTheme(active);
      applyThemeClass(active);
    },
    [storageKey]
  );

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme, resolvedTheme, setTheme } },
    children
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    // If used outside of ThemeProvider, provide a self-contained fallback
    if (typeof window === 'undefined') {
      return {
        theme: 'system',
        resolvedTheme: 'light',
        setTheme: () => {},
      };
    }

    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || 'system';
    const resolved = resolveTheme(stored);
    return {
      theme: stored,
      resolvedTheme: resolved,
      setTheme: (newTheme: Theme) => {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        applyThemeClass(resolveTheme(newTheme));
      },
    };
  }
  return context;
}

export { ThemeContext };
