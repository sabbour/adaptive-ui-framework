// ─── Resize Handle ───
// A draggable divider between two panels.
// Renders a thin bar that highlights on hover and changes cursor while dragging.

import React, { useCallback, useRef, useEffect, useState } from 'react';

interface ResizeHandleProps {
  /** "vertical" splits left/right, "horizontal" splits top/bottom */
  direction?: 'vertical' | 'horizontal';
  /** Called continuously with the pixel delta while dragging */
  onResize: (delta: number) => void;
}

export function ResizeHandle({ direction = 'vertical', onResize }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startPos.current = direction === 'vertical' ? e.clientX : e.clientY;
    setDragging(true);
  }, [direction]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const current = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = current - startPos.current;
      if (delta !== 0) {
        onResize(delta);
        startPos.current = current;
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, direction, onResize]);

  const isVertical = direction === 'vertical';
  const active = dragging || hovered;

  return React.createElement('div', {
    onMouseDown: handleMouseDown,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    style: {
      flexShrink: 0,
      width: isVertical ? '5px' : '100%',
      height: isVertical ? '100%' : '5px',
      cursor: isVertical ? 'col-resize' : 'row-resize',
      backgroundColor: active ? 'var(--adaptive-primary, #2563eb)' : 'transparent',
      transition: dragging ? 'none' : 'background-color 0.15s ease',
      position: 'relative' as const,
      zIndex: 10,
    } as React.CSSProperties,
  },
    // Wider invisible hit area
    React.createElement('div', {
      style: {
        position: 'absolute' as const,
        top: isVertical ? 0 : '-3px',
        left: isVertical ? '-3px' : 0,
        right: isVertical ? '-3px' : 0,
        bottom: isVertical ? 0 : '-3px',
      } as React.CSSProperties,
    })
  );
}
