import { Link } from 'react-router-dom'
import { ArrowLeft, Database } from 'lucide-react'

export function RawSanyDataPage() {
  return (
    <div className="min-h-screen bg-[#07111F] text-slate-200 p-4">
      <Link
        to="/equipment"
        className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Về CEO Dashboard
      </Link>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-8 text-center max-w-lg mx-auto mt-12">
        <div className="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center mx-auto mb-4">
          <Database className="w-6 h-6 text-sky-400" />
        </div>
        <p className="text-sm font-semibold text-white">Tra cứu raw SANY</p>
        <p className="text-[11px] text-slate-400 mt-2">Dữ liệu telemetry thô — sẽ bổ sung sau.</p>
      </div>
    </div>
  )
}
