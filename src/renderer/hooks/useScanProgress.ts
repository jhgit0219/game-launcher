import { useState, useEffect, useCallback } from 'react';
import { ipc } from '../lib/ipc';
import type { ScanProgress, ScanSummary } from '../types/game';

interface UseScanProgressResult {
  scanning: boolean;
  progress: ScanProgress | null;
  summary: ScanSummary | null;
  error: string | null;
  startScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
  clearSummary: () => void;
}

export function useScanProgress(): UseScanProgressResult {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubProgress = ipc.scan.onProgress((data) => {
      setProgress(data);
      setScanning(true);
    });

    const unsubComplete = ipc.scan.onComplete((data) => {
      setSummary(data);
      setScanning(false);
      setProgress(null);
    });

    const unsubError = ipc.scan.onError((err) => {
      setError(err);
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, []);

  const startScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setSummary(null);
    await ipc.scan.start();
  }, []);

  const cancelScan = useCallback(async () => {
    await ipc.scan.cancel();
    setScanning(false);
  }, []);

  const clearSummary = useCallback(() => {
    setSummary(null);
  }, []);

  return {
    scanning,
    progress,
    summary,
    error,
    startScan,
    cancelScan,
    clearSummary,
  };
}
