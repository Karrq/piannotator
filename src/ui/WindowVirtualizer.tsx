import { useEffect, useState } from "react";
import { Virtualizer } from "@pierre/diffs";
import { VirtualizerContext } from "@pierre/diffs/react";

/**
 * Provides a pierre Virtualizer that uses window-level scrolling.
 *
 * Pierre's built-in <Virtualizer> component creates its own scroll container div,
 * which breaks our page-level scrolling. The underlying Virtualizer class supports
 * window scrolling via `setup(document)` - this component uses that path.
 *
 * This enables `VirtualizedFileDiff` (instead of plain `FileDiff`) for each
 * `FileDiff`/`PatchDiff`, which gives us:
 * - Scroll anchoring on hunk expansion (VirtualizedFileDiff.expandHunk notifies the
 *   virtualizer which applies scrollFix before/after DOM updates)
 * - Scroll anchoring on annotation changes and any other content reflow
 */
export function WindowVirtualizer({ children }: { children: React.ReactNode }) {
  const [instance] = useState(() => {
    if (typeof window === "undefined") return undefined;
    return new Virtualizer();
  });

  useEffect(() => {
    if (!instance) return;
    instance.setup(document);
    return () => instance.cleanUp();
  }, [instance]);

  return (
    <VirtualizerContext.Provider value={instance}>
      {children}
    </VirtualizerContext.Provider>
  );
}
