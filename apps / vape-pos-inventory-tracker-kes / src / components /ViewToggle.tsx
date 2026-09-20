import { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@project/components/ui/button';

export type ViewMode = 'grid' | 'list';

/**
 * Remembers each page's chosen view (grid/list) in the browser,
 * so the choice survives page reloads.
 */
export function useViewMode(
  storageKey: string,
  defaultMode: ViewMode = 'list',
): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(`view:${storageKey}`);
      if (saved === 'grid' || saved === 'list') return saved;
    } catch {}
    return defaultMode;
  });

  const update = (next: ViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(`view:${storageKey}`, next);
    } catch {}
  };

  return [mode, update];
}

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

export default function ViewToggle({ value, onChange, className = '' }: ViewToggleProps) {
  return (
    <div className={`flex items-center border border-border rounded-md overflow-hidden shrink-0 ${className}`}>
      <Button
        type="button"
        variant={value === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-none h-8 px-2"
        onClick={() => onChange('list')}
        title="List view"
        aria-label="List view"
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        type="button"
        variant={value === 'grid' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-none h-8 px-2"
        onClick={() => onChange('grid')}
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGrid className="w-4 h-4" />
      </Button>
    </div>
  );
}
