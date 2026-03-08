import { createContext, useState, useContext, useEffect, ReactNode, useCallback } from 'react';
import { THEME } from '@excalidraw/excalidraw';

type Theme = typeof THEME.LIGHT | typeof THEME.DARK;

interface ThemeContextProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setThemeState] = useState<Theme>(THEME.LIGHT);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(prevTheme => {
      if (prevTheme !== newTheme) {
        localStorage.setItem('appTheme', newTheme);
        return newTheme;
      }
      return prevTheme;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(theme === THEME.LIGHT ? 'theme--light' : 'theme--dark');
    root.classList.remove(theme === THEME.LIGHT ? 'theme--dark' : 'theme--light');
  }, [theme]);

  useEffect(() => {
    const storedTheme = localStorage.getItem('appTheme') as Theme;
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (prefersDark ? THEME.DARK : THEME.LIGHT);
    setThemeState(initialTheme);
  }, []);

  const value = { theme, setTheme };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextProps => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
