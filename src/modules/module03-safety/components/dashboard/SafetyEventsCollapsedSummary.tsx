interface SafetyEventsCollapsedSummaryProps {
  count: number
  criticalCount: number
}

export function SafetyEventsCollapsedSummary({ count, criticalCount }: SafetyEventsCollapsedSummaryProps) {
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
      <span className="text-primary font-semibold">{count}</span> sự kiện
      {criticalCount > 0 && (
        <>
          {' · '}
          <span className="text-red-400 font-semibold">{criticalCount}</span>
          {' khẩn cấp'}
        </>
      )}
    </span>
  )
}
