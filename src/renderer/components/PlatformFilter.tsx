import { useCallback, type ChangeEvent } from 'react';
import type { Platform } from '../types/game';
import { ALL_PLATFORMS, PLATFORM_LABELS } from '../../shared/constants';
import styles from './SortDropdown.module.css';

export interface PlatformFilterProps {
  value: Platform | 'all';
  onChange: (value: Platform | 'all') => void;
}

export function PlatformFilter({ value, onChange }: PlatformFilterProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as Platform | 'all');
    },
    [onChange],
  );

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="platform-filter">
        Platform
      </label>
      <select
        id="platform-filter"
        className={styles.select}
        value={value}
        onChange={handleChange}
      >
        <option value="all">All</option>
        {ALL_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {PLATFORM_LABELS[p]}
          </option>
        ))}
      </select>
    </div>
  );
}
