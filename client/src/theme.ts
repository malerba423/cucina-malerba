import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

// Light by default. Until someone picks, follow the device's dark-mode
// setting; once they pick, remember it in this browser.
function initialTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage blocked (private mode etc.): the choice just won't persist
    }
  };

  return { theme, toggle };
}
