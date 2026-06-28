import { useMemo, useState } from 'react'
import { Search, User, Truck } from 'lucide-react'
import { cn } from '@/utils/cn'
import { ACCESS_MOVEMENT_TRACKS, findMovementTrack } from '../data/accessMovements'
import { AccessMovementMap } from './AccessMovementMap'

type TrackTab = 'person' | 'vehicle'

export function AccessMovementTracker() {
  const [tab, setTab] = useState<TrackTab>('person')
  const [query, setQuery] = useState('Nguyễn Văn An')
  const [activeWaypointId, setActiveWaypointId] = useState<number | null>(null)

  const track = useMemo(() => {
    const found = findMovementTrack(query)
    if (!found) return ACCESS_MOVEMENT_TRACKS[0]
    if (tab === 'vehicle' && found.subjectType !== 'vehicle') {
      return ACCESS_MOVEMENT_TRACKS.find(t => t.subjectType === 'vehicle') ?? found
    }
    if (tab === 'person' && found.subjectType !== 'person') {
      return ACCESS_MOVEMENT_TRACKS.find(t => t.subjectType === 'person') ?? found
    }
    return found
  }, [query, tab])

  const highlightedPointId = useMemo(() => {
    if (!activeWaypointId) return null
    const wp = track.waypoints.find(w => w.id === activeWaypointId)
    if (!wp) return null
    const match = track.points.find(p => p.location.includes(wp.label))
    return match?.id ?? null
  }, [activeWaypointId, track])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1e2433] shrink-0">
        <div className="flex items-center gap-1">
          {([
            { key: 'person' as const, label: 'Người', icon: User },
            { key: 'vehicle' as const, label: 'Xe', icon: Truck },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-[9px] font-semibold rounded transition-colors',
                tab === key ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-[#1a2235]',
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setActiveWaypointId(null)
            }}
            placeholder="Tìm người / biển số / ID…"
            className="w-full pl-7 pr-2 py-1.5 text-[10px] bg-[#1a2235] border border-[#1e2433] rounded text-foreground"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <div className="lg:w-[42%] min-h-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-[#1e2433]">
          <div className="px-3 py-2 border-b border-[#1e2433]/60 bg-[#0a0e1a]">
            <p className="text-[10px] font-semibold text-foreground truncate">{track.personName}</p>
            <p className="text-[9px] text-muted-foreground tabular-nums">{track.personId}</p>
          </div>
          <div className="divide-y divide-[#1e2433]/60">
            {track.points.map(point => (
              <div
                key={point.id}
                className={cn(
                  'px-3 py-2 flex items-start gap-2 transition-colors',
                  highlightedPointId === point.id && 'bg-primary/10',
                )}
              >
                <span className="text-[9px] text-primary font-mono tabular-nums shrink-0 w-[52px]">{point.time}</span>
                <span className="text-[10px] text-foreground/90 leading-snug">{point.location}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-[180px] relative">
          <AccessMovementMap
            waypoints={track.waypoints}
            pathWaypointIds={track.pathWaypointIds}
            activeWaypointId={activeWaypointId}
            onSelectWaypoint={id => setActiveWaypointId(prev => (prev === id ? null : id))}
            showHeat
          />
        </div>
      </div>
    </div>
  )
}
