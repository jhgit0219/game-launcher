import { useCallback, type ChangeEvent } from 'react';
import type { SortOption } from '../types/game';
import { SORT_OPTIONS } from '../../shared/constants';
import styles from './SortDropdown.module.css';

export interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as SortOption);
    },
    [onChange],
  );

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="sort-select">
        Sort by
      </label>
      <select
        id="sort-select"
        className={styles.select}
        value={value}
        onChange={handleChange}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
