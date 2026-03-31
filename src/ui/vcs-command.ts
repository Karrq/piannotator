import type { TimelineItem } from "../types.js";

/**
 * Construct the VCS diff command for a given timeline selection.
 * Mirrors the ref-walking logic that was in the extension's buildScopedReview().
 *
 * Returns null when no VCS diff is possible (missing refs or VCS type).
 */
export function buildVcsCommand(
  vcsType: "git" | "jj" | null,
  baselineRef: string | undefined,
  timeline: TimelineItem[],
  fromIndex: number,
  toIndex: number
): string | null {
  if (!vcsType) return null;

  // Find the "from" ref: the ref of the item BEFORE the first selected item, or the baseline
  let fromRef: string | undefined;
  for (let i = fromIndex - 1; i >= 0; i--) {
    const ref = timeline[i].ref;
    if (ref) {
      fromRef = ref;
      break;
    }
  }
  if (!fromRef) {
    fromRef = baselineRef;
  }
  if (!fromRef) return null;

  // Find the "to" ref: the last ref at or before toIndex
  let toRef: string | undefined;
  for (let i = toIndex; i >= fromIndex; i--) {
    const ref = timeline[i].ref;
    if (ref) {
      toRef = ref;
      break;
    }
  }

  // If selection extends to the latest turn, diff against working copy (omit --to)
  const hasLaterTurn = timeline.slice(toIndex + 1).some((item) => item.kind === "turn");
  if (!toRef || !hasLaterTurn) {
    toRef = undefined;
  }

  if (vcsType === "jj") {
    return toRef
      ? `jj diff --from '${fromRef}' --to '${toRef}' --git`
      : `jj diff --from '${fromRef}' --git`;
  }

  return toRef
    ? `git diff '${fromRef}' '${toRef}'`
    : `git diff '${fromRef}'`;
}
