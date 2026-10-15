import type { CSSProperties } from "react";

// Cells of a 3×3 grid forming "↗": top row, right column and the diagonal.
const arrowCells = new Set([0, 1, 2, 4, 5, 6, 8]);

/**
 * A tiny pixel matrix that redraws itself as an arrow when its button is
 * hovered or focused — the hero matrix in miniature. Purely decorative.
 */
export function PixelArrow() {
  return (
    <span className="pixel-arrow" aria-hidden="true">
      {Array.from({ length: 9 }, (_, cell) => (
        <span
          key={cell}
          data-arrow={arrowCells.has(cell) || undefined}
          style={
            {
              // Cells light up along the arrow's diagonal, bottom-left first.
              "--delay": `${(2 - Math.floor(cell / 3) + (cell % 3)) * 35}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
