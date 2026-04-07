import { useEffect, useState } from 'react';
import { ipc } from '../lib/ipc';
import styles from './DownloadToast.module.css';

export function DownloadToast() {
  const [status, setStatus] = useState<{ title: string; provider: string } | null>(null);

  useEffect(() => {
    const unsub = ipc.art.onDownloadStatus((data) => {
      if (data.title) {
        setStatus(data);
      } else {
        setStatus(null);
      }
    });
    return unsub;
  }, []);

  if (!status) return null;

  return (
    <div className={styles.toast}>
      <div className={styles.spinner} />
      <span className={styles.text}>
        Downloading art: {status.title}
      </span>
    </div>
  );
}
