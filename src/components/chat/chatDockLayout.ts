export const CHAT_DOCK_MARGIN = 24;
export const CHAT_LAUNCHER_SIZE = 40;
export const CHAT_BUBBLE_SIZE = 48;
export const CHAT_DOCK_GAP = 8;
export const CHAT_PANEL_GAP = 12;
export const CHAT_PANEL_TAIL_OFFSET = 28;

/** Distance from the viewport's right edge to a bubble's right edge. */
export function chatBubbleRightEdge(openCount: number, indexFromLeft: number): number {
  const indexFromRight = Math.max(0, openCount - 1 - indexFromLeft);
  return (
    CHAT_DOCK_MARGIN +
    CHAT_LAUNCHER_SIZE +
    CHAT_DOCK_GAP +
    indexFromRight * (CHAT_BUBBLE_SIZE + CHAT_DOCK_GAP)
  );
}

/** Panel `right` so the bottom tail sits over the active bubble. */
export function chatPanelRightForBubble(openCount: number, indexFromLeft: number): number {
  const bubbleRight = chatBubbleRightEdge(openCount, indexFromLeft);
  const bubbleCenter = bubbleRight + CHAT_BUBBLE_SIZE / 2;
  return Math.max(CHAT_DOCK_MARGIN, bubbleCenter - CHAT_PANEL_TAIL_OFFSET);
}
