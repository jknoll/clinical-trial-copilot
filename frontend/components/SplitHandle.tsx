"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  currentWidth: number;
}

export function SplitHandle({ onResize, minWidth = 280, maxWidth = 600, currentWidth }: Props) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;
      setDragging(true);
    },
    [currentWidth]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      onResize(newWidth);
    };

    const onMouseUp = () => setDragging(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, minWidth, maxWidth, onResize]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 20;
      if (e.key === "ArrowLeft") {
        onResize(Math.max(minWidth, currentWidth - step));
      } else if (e.key === "ArrowRight") {
        onResize(Math.min(maxWidth, currentWidth + step));
      }
    },
    [currentWidth, minWidth, maxWidth, onResize]
  );

  return (
    <>
      {dragging && <div className="dragging-overlay" />}
      <div
        className={`split-handle ${dragging ? "split-handle-active" : ""}`}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={currentWidth}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
      >
        <div className="split-handle-line" />
      </div>
    </>
  );
}
