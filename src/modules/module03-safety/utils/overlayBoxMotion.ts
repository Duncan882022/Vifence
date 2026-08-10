/** CSS class cho bbox overlay — live VMS không transition để tránh ROI “dính” frame cũ. */
export function overlayBoxMotionClass(snapOverlay = false): string {
  return snapOverlay
    ? 'absolute pointer-events-none'
    : 'absolute pointer-events-none transition-[left,top,width,height] duration-150 ease-out'
}
