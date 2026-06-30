import { Link } from 'react-router-dom'
import { ArrowLeft, Database } from 'lucide-react'
import { PageLayout, Panel } from '@/components/common/PageLayout/PageLayout'

export function RawSanyDataPage() {
  return (
    <PageLayout scrollable>
      <Link
        to="/equipment"
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Về tổng quan MMTB
      </Link>

      <Panel title="Tra Cứu Raw SANY" fit className="shrink-0">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
            <Database className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Tra cứu raw SANY</p>
          <p className="text-[11px] text-muted-foreground mt-2">Dữ liệu telemetry thô — sẽ bổ sung sau.</p>
        </div>
      </Panel>
    </PageLayout>
  )
}
