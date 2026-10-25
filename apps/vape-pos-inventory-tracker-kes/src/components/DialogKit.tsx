import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';
import { Button, ButtonProps } from '@project/components/ui/button';
import { Label } from '@project/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { cn } from '@project/components/lib/utils';
import { Loader2 } from 'lucide-react';

/**
 * Shared building blocks so every dialog follows the same layout:
 * header (title + short description), fields with a label, a red message under an invalid
 * value, optional numbered sections, and a footer with Cancel then the main action.
 */

/** Class for the red, destructive confirm button in confirmation dialogs. */
export const DESTRUCTIVE = 'bg-destructive text-destructive-foreground hover:bg-destructive/90';

/** A labelled form field. Shows `error` in red under the input, otherwise the grey `hint`. */
export function Field({ label, required, error, hint, className, htmlFor, children }: {
  label: ReactNode; required?: boolean; error?: string | false | null; hint?: ReactNode;
  className?: string; htmlFor?: string; children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5 min-w-0', className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive break-words">{error}</p>
        : hint ? <p className="text-xs text-muted-foreground break-words">{hint}</p> : null}
    </div>
  );
}

/** A boxed group of fields with a heading, e.g. "1. Download the template". `dashed` for upload areas. */
export function FormSection({ title, description, dashed, className, children }: {
  title: ReactNode; description?: ReactNode; dashed?: boolean; className?: string; children?: ReactNode;
}) {
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', dashed ? 'border-dashed border-border' : 'border-border bg-muted/40', className)}>
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground break-words">{description}</div>}
      </div>
      {children}
    </div>
  );
}

/** The dialog's main action. Shows a spinner and stays disabled while `busy`. */
export function SubmitButton({ busy, disabled, children, ...props }: ButtonProps & { busy?: boolean }) {
  return (
    <Button disabled={busy || disabled} {...props}>
      {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{children}
    </Button>
  );
}

// ---------- In-app confirmation (replaces the browser's confirm box) ----------

type ConfirmOptions = { title: string; description?: ReactNode; confirmLabel?: string; destructive?: boolean };
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (!(await confirm({ title: 'Delete?' }))) return;` */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOpts(o);
  }), []);
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = undefined; setOpts(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(o) => { if (!o) close(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={opts?.destructive ? DESTRUCTIVE : undefined} onClick={() => close(true)}>
              {opts?.confirmLabel || 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
