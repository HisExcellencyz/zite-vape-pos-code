import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'appTheme';
const EVENT = 'app-theme-change';

function read(): Theme {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

export function applyStoredTheme() {
  document.documentElement.classList.toggle('dark', read() === 'dark');
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(read);
  useEffect(() => {
    const on = () => setThemeState(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const setTheme = (t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch {}
    document.documentElement.classList.toggle('dark', t === 'dark');
    window.dispatchEvent(new Event(EVENT));
  };
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
