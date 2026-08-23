/** CSS class cho bbox overlay — transition nhẹ giữa các poll VMS. */
export function overlayBoxMotionClass(snapOverlay = false): string {
  return snapOverlay
    ? 'absolute pointer-events-none'
    : 'absolute pointer-events-none transition-[left,top,width,height] duration-200 ease-out'
}

/** Bodycam track lock — không CSS transition (EMA + rAF predict đủ mượt). */
export function overlayBoxTrackingClass(): string {
  return 'absolute pointer-events-none will-change-[left,top,width,height]'
}
