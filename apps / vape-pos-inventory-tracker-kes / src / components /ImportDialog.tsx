import { useState, useEffect, useRef, ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Label } from '@project/components/ui/label';
import { Progress } from '@project/components/ui/progress';
import { FileDown, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { parseCsv, downloadTemplate, TemplateKey } from '../lib/exportHelper';

export interface ImportSummary {
  imported: number;
  updated?: number;
  skipped?: number;
  errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  template: TemplateKey;
  /** Optional checkbox shown above the buttons (e.g. "also adjust stock"). */
  optionLabel?: string;
  optionDefault?: boolean;
  /** When rows are independent, send them in batches of this size. */
  chunkSize?: number;
  onImport: (rows: Record<string, string>[], option: boolean) => Promise<ImportSummary>;
  onDone?: () => void;
}

/** "1m 05s remaining" / "12s remaining" / "finishing up..." */
function formatEta(seconds: number): string {
  if (seconds <= 1) return 'finishing up...';
  if (seconds < 60) return `about ${Math.round(seconds)}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `about ${m}m ${s.toString().padStart(2, '0')}s remaining`;
}

// Rough heuristic for the very first estimate, before any real batch has
// completed to measure an actual rate against. Refined live once real
// timing is available (see below).
const ASSUMED_ROWS_PER_SECOND = 40;

export default function ImportDialog({
  open, onOpenChange, title, description, template,
  optionLabel, optionDefault = false, chunkSize, onImport, onDone,
}: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [option, setOption] = useState(optionDefault);
  const inputRef = useRef<HTMLInputElement>(null);
  const simulateTimer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!open) {
      setRows([]); setFileName(''); setResult(null);
      setRunning(false); setProgressPct(0); setEtaSeconds(null); setProgressLabel('');
      setOption(optionDefault);
      if (inputRef.current) inputRef.current.value = '';
      if (simulateTimer.current) clearInterval(simulateTimer.current);
    }
  }, [open]);

  useEffect(() => () => { if (simulateTimer.current) clearInterval(simulateTimer.current); }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResult(null);
    if (!file) { setRows([]); setFileName(''); return; }
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length === 0) {
        toast.error('No data rows found. Make sure the file is a CSV with a header row.');
        setRows([]); setFileName('');
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      toast.error('Could not read that file');
      setRows([]); setFileName('');
    }
  };

  const handleOk = async () => {
    if (rows.length === 0 || running) return;
    setRunning(true);
    setProgressPct(0);
    setResult(null);
    const startedAt = Date.now();

    try {
      let total: ImportSummary = { imported: 0, updated: 0, skipped: 0, errors: [] };

      if (chunkSize && rows.length > chunkSize) {
        // Real, measured progress: each batch is a data point, so after the
        // first one completes the ETA is based on this file's own actual speed.
        const batches: Record<string, string>[][] = [];
        for (let i = 0; i < rows.length; i += chunkSize) batches.push(rows.slice(i, i + chunkSize));

        for (let i = 0; i < batches.length; i++) {
          setProgressLabel(`Importing batch ${i + 1} of ${batches.length}...`);
          if (i > 0) {
            const elapsedMs = Date.now() - startedAt;
            const avgMsPerBatch = elapsedMs / i;
            const remainingBatches = batches.length - i;
            setEtaSeconds((avgMsPerBatch * remainingBatches) / 1000);
          } else {
            // Before we have a real measurement, estimate from row count.
            setEtaSeconds(rows.length / ASSUMED_ROWS_PER_SECOND);
          }
          setProgressPct(Math.round((i / batches.length) * 100));

          const r = await onImport(batches[i], option);
          total = {
            imported: total.imported + (r.imported || 0),
            updated: (total.updated || 0) + (r.updated || 0),
            skipped: (total.skipped || 0) + (r.skipped || 0),
            errors: [...total.errors, ...(r.errors || [])],
          };
        }
        setProgressPct(100);
        setEtaSeconds(0);
      } else {
        // A single request with no per-batch feedback from the server, so the
        // bar is simulated: it climbs toward an estimated duration (based on
        // row count) and settles at 100% only once the real response lands.
        setProgressLabel('Importing...');
        const estimateSeconds = Math.max(2, rows.length / ASSUMED_ROWS_PER_SECOND);
        setEtaSeconds(estimateSeconds);
        let elapsedMs = 0;
        simulateTimer.current = setInterval(() => {
          elapsedMs += 200;
          const pct = Math.min(92, Math.round((elapsedMs / (estimateSeconds * 1000)) * 92));
          setProgressPct(pct);
          setEtaSeconds(Math.max(0.5, estimateSeconds - elapsedMs / 1000));
        }, 200);

        const r = await onImport(rows, option);
        if (simulateTimer.current) clearInterval(simulateTimer.current);
        setProgressPct(100);
        setEtaSeconds(0);
        total = { imported: r.imported || 0, updated: r.updated || 0, skipped: r.skipped || 0, errors: r.errors || [] };
      }

      setResult(total);
      if (total.imported + (total.updated || 0) > 0) {
        toast.success(`Imported ${total.imported}${total.updated ? `, updated ${total.updated}` : ''}`);
        onDone?.();
      } else {
        toast.error('Nothing was imported. Check the details below.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      if (simulateTimer.current) clearInterval(simulateTimer.current);
      setRunning(false);
      setProgressLabel('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!running) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground break-words">{description}</div>

          <Button
            type="button" variant="outline" size="sm"
            className="border-yellow-500 text-yellow-400 hover:bg-yellow-500/10"
            onClick={() => downloadTemplate(template)}
            disabled={running}
          >
            <FileDown className="w-4 h-4 mr-1" /> Download Template
          </Button>

          <div>
            <Label className="text-sm mb-1 block">Select CSV file</Label>
            <Input ref={inputRef} type="file" accept=".csv,.txt" onChange={handleFile} disabled={running} />
            {fileName && !running && !result && (
              <p className="text-xs text-muted-foreground mt-1 break-all">
                {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} ready
              </p>
            )}
          </div>

          {optionLabel && (
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={option} onChange={e => setOption(e.target.checked)} className="mt-1 rounded" disabled={running} />
              <span className="break-words">{optionLabel}</span>
            </label>
          )}

          {running && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Progress value={progressPct} />
              <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                <span className="break-words">{progressLabel || 'Importing...'}</span>
                <span className="shrink-0 font-medium text-foreground">{progressPct}%</span>
              </div>
              {etaSeconds !== null && (
                <p className="flex items-center gap-1.5 text-xs text-primary">
                  <Clock className="w-3.5 h-3.5 shrink-0" /> {formatEta(etaSeconds)}
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Imported {result.imported}
                {result.updated ? `, updated ${result.updated}` : ''}
                {result.skipped ? `, skipped ${result.skipped}` : ''}
              </p>
              {result.errors.length > 0 && (
                <div>
                  <p className="flex items-center gap-2 text-amber-400 text-xs mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {result.errors.length} issue{result.errors.length === 1 ? '' : 's'}
                  </p>
                  <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                    {result.errors.slice(0, 30).map((er, i) => <li key={i} className="break-words">{er}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleOk} disabled={rows.length === 0 || running}>
              {running ? 'Importing...' : rows.length > 0 ? `OK — Import ${rows.length} row${rows.length === 1 ? '' : 's'}` : 'OK'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
