import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from '@/components/common/Sidebar/Sidebar'
import { Module01Page } from '@/modules/module01-access-control/Module01Page'
import { Module02Page } from '@/modules/module02-training/Module02Page'
import { Module03Page } from '@/modules/module03-safety/Module03Page'
import { Module04Page } from '@/modules/module04-housekeeping/Module04Page'
import { Module05Page } from '@/modules/module05-productivity/Module05Page'
import { Module06Page } from '@/modules/module06-assets/Module06Page'
import { Module07Page } from '@/modules/module07-inspection/Module07Page'
import { Module08Page } from '@/modules/module08-reporting/Module08Page'

export default function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Navigate to="/module01" replace />} />
          <Route path="/module01/*" element={<Module01Page />} />
          <Route path="/module02/*" element={<Module02Page />} />
          <Route path="/module03/*" element={<Module03Page />} />
          <Route path="/module04/*" element={<Module04Page />} />
          <Route path="/module05/*" element={<Module05Page />} />
          <Route path="/module06/*" element={<Module06Page />} />
          <Route path="/module07/*" element={<Module07Page />} />
          <Route path="/module08/*" element={<Module08Page />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
