import styles from './ThumbnailSizeSelector.module.css';

type ThumbnailSize = 'small' | 'medium' | 'large';

interface ThumbnailSizeSelectorProps {
  value: ThumbnailSize;
  onChange: (size: ThumbnailSize) => void;
}

const OPTIONS: { value: ThumbnailSize; label: string }[] = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
];

export function ThumbnailSizeSelector({ value, onChange }: ThumbnailSizeSelectorProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Thumbnail size">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`${styles.btn} ${value === opt.value ? styles.btnActive : ''}`}
          onClick={() => onChange(opt.value)}
          role="radio"
          aria-checked={value === opt.value}
          aria-label={`${opt.value} thumbnails`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
