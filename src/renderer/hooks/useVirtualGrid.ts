import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface VirtualGridConfig {
  totalItems: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  bufferRows: number;
}

interface VirtualGridResult {
  containerRef: React.RefObject<HTMLDivElement>;
  totalHeight: number;
  visibleRange: { start: number; end: number };
  columnCount: number;
  getItemStyle: (index: number) => React.CSSProperties;
}

export function useVirtualGrid(config: VirtualGridConfig): VirtualGridResult {
  const { totalItems, itemWidth, itemHeight, gap, bufferRows } = config;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const columnCount = useMemo(() => {
    if (containerWidth === 0) return 1;
    return Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
  }, [containerWidth, itemWidth, gap]);

  const rowCount = Math.ceil(totalItems / columnCount);
  const totalHeight = rowCount * (itemHeight + gap) - gap;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const visibleRange = useMemo(() => {
    const rowHeight = itemHeight + gap;
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - bufferRows);
    const visibleRows = Math.ceil(containerHeight / rowHeight);
    const endRow = Math.min(
      rowCount,
      startRow + visibleRows + bufferRows * 2,
    );

    return {
      start: startRow * columnCount,
      end: Math.min(endRow * columnCount, totalItems),
    };
  }, [
    scrollTop,
    containerHeight,
    itemHeight,
    gap,
    bufferRows,
    columnCount,
    rowCount,
    totalItems,
  ]);

  const getItemStyle = useCallback(
    (index: number): React.CSSProperties => {
      const row = Math.floor(index / columnCount);
      const col = index % columnCount;

      return {
        position: 'absolute',
        top: row * (itemHeight + gap),
        left: col * (itemWidth + gap),
        width: itemWidth,
        height: itemHeight,
      };
    },
    [columnCount, itemWidth, itemHeight, gap],
  );

  return {
    containerRef,
    totalHeight,
    visibleRange,
    columnCount,
    getItemStyle,
  };
}
