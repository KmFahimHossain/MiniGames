import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Board component (measures cell positions to draw animated winning line)
 *
 * Props:
 *  - board: array(9) of null|'X'|'O'
 *  - onCellClick(i)
 *  - disabled: bool
 *  - winningLine: array of 3 indexes (e.g. [0,1,2]) or null
 */
export default function Board({
  board = [],
  onCellClick = () => {},
  disabled = false,
  winningLine = null,
}) {
  const safeBoard =
    Array.isArray(board) && board.length === 9 ? board : Array(9).fill(null);

  const boardRef = useRef(null);
  // refs for each cell element
  const cellRefs = useRef([]);
  cellRefs.current = [];

  // win line computed state
  const [lineProps, setLineProps] = useState(null);

  // helper to register refs
  const setCellRef = (el, i) => {
    cellRefs.current[i] = el;
  };

  useLayoutEffect(() => {
    computeWinLine();
    // only rerun when winningLine changes
    // refs themselves don’t need to be deps
  }, [winningLine]);

  useEffect(() => {
    // when window resizes, recompute (so line stays aligned)
    function onResize() {
      computeWinLine();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningLine]);

  function computeWinLine() {
    if (
      !winningLine ||
      !Array.isArray(winningLine) ||
      winningLine.length !== 3
    ) {
      setLineProps(null);
      return;
    }
    // find first and last cell elements
    const firstEl = cellRefs.current[winningLine[0]];
    const lastEl = cellRefs.current[winningLine[2]];
    const boardEl = boardRef.current;
    if (!firstEl || !lastEl || !boardEl) {
      setLineProps(null);
      return;
    }

    const firstRect = firstEl.getBoundingClientRect();
    const lastRect = lastEl.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();

    // centers relative to board container (px)
    const c1 = {
      x: firstRect.left + firstRect.width / 2 - boardRect.left,
      y: firstRect.top + firstRect.height / 2 - boardRect.top,
    };
    const c2 = {
      x: lastRect.left + lastRect.width / 2 - boardRect.left,
      y: lastRect.top + lastRect.height / 2 - boardRect.top,
    };

    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const length = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // degrees

    // center point between c1 and c2
    const center = {
      x: (c1.x + c2.x) / 2,
      y: (c1.y + c2.y) / 2,
    };

    // set line props for rendering
    setLineProps((prev) => {
      const next = {
        left: center.x,
        top: center.y,
        length,
        angle,
      };
      if (
        !prev ||
        prev.left !== next.left ||
        prev.top !== next.top ||
        prev.length !== next.length ||
        prev.angle !== next.angle
      ) {
        return next;
      }
      return prev;
    });
  }

  return (
    <div
      ref={boardRef}
      className="ttt-board"
      role="grid"
      aria-label="tic-tac-toe board"
    >
      {safeBoard.map((cell, i) => {
        const isDisabled = disabled || cell !== null;
        return (
          <button
            key={i}
            ref={(el) => setCellRef(el, i)}
            onClick={() => {
              if (isDisabled) return;
              onCellClick(i);
            }}
            className={`ttt-cell ${
              cell === "X" ? "cell-x" : cell === "O" ? "cell-o" : ""
            } ${isDisabled ? "disabled" : "clickable"}`}
            aria-label={`cell-${i}`}
          >
            {cell}
          </button>
        );
      })}

      {/* Win line: outer positioned & rotated, inner scales horizontally */}
      {lineProps && (
        <div
          className="win-line"
          style={{
            left: `${lineProps.left}px`,
            top: `${lineProps.top}px`,
            width: `${lineProps.length}px`,
            transform: `translate(-50%, -50%) rotate(${lineProps.angle}deg)`,
          }}
        >
          <div className="win-line-inner" />
        </div>
      )}
    </div>
  );
}
