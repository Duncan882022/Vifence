import { cn } from "@/utils/cn";
import {
  TRAINING_LIST_HEADER_ROW,
  TRAINING_LIST_HEADER_TEXT,
  TRAINING_LIST_STATE_TEXT,
  TRAINING_LIST_STATE_WRAP,
} from "@/modules/dao-tao-tuan-thu/components/trainingListStates";
import {
  Avatar,
  StatusBadges,
  SessionBadge,
  attendanceStatusConfig,
  getAttendeeBadges,
  getAttendanceDetailLine,
} from "@/modules/dao-tao-tuan-thu/components/TrainingEventTable";
import { Play } from "lucide-react";
import type { CourseWorkerAttData, CourseWorkerColumns, AttendanceStatus } from "./CourseWorker";

// ─────────────────────────────────────────────────────────────
// Static grid presets — Tailwind JIT cần thấy literal string
// avatar(28px) | worker | contractor | course | attendance | action(32px)
// ─────────────────────────────────────────────────────────────
// Tất cả cột
const GRID_FULL         = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_32px]'
// Không có cột Khóa học
const GRID_NO_COURSE    = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_32px]'
// Không có cột Nhà thầu
const GRID_NO_CONTR     = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_32px]'
// Không có cả Khóa học + Nhà thầu
const GRID_WORKER_ATT   = 'grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_32px]'

/** Chọn preset đúng dựa trên config */
function pickGrid(cols?: CourseWorkerColumns): string {
  const noC  = !!cols?.hideCourse;
  const noCo = !!cols?.hideContractor;
  if (noC  && noCo) return GRID_WORKER_ATT;
  if (noC)          return GRID_NO_COURSE;
  if (noCo)         return GRID_NO_CONTR;
  return GRID_FULL;
}

// ─────────────────────────────────────────────────────────────
// Row — internal
// ─────────────────────────────────────────────────────────────

interface RowProps {
  att: CourseWorkerAttData;
  gridClass: string;
  course?: { group: string };
  columns?: CourseWorkerColumns;
}

function CourseWorkerRow({ att, gridClass, course = { group: "active" }, columns }: RowProps) {
  const badges = getAttendeeBadges(att as any) as AttendanceStatus[];
  const primary = badges[0] as AttendanceStatus;
  const detail  = getAttendanceDetailLine(att as any);

  return (
    <div
      onClick={columns?.onSelectWorker}
      className={cn(
        "grid gap-x-2 items-center px-3 py-2.5 transition-colors group",
        columns?.onSelectWorker
          ? "cursor-pointer hover:bg-[#1a2235]/50"
          : "hover:bg-[#1a2235]/20",
        gridClass
      )}
    >
      {/* Avatar */}
      <Avatar name={att.name} color={att.avatarColor} src={att.avatarUrl || undefined} size="sm" />

      {/* Cột 1: Học viên */}
      {!columns?.hideWorker && (
        columns?.renderWorker ? columns.renderWorker(att) : (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{att.name}</p>
            <p className="text-[9px] text-muted-foreground/60 truncate mt-0.5">{att.role}</p>
          </div>
        )
      )}

      {/* Cột 2: Nhà thầu */}
      {!columns?.hideContractor && (
        columns?.renderContractor ? columns.renderContractor(att) : (
          columns?.onSelectContractor ? (
            <button
              onClick={e => { e.stopPropagation(); columns.onSelectContractor!(att.company); }}
              className="min-w-0 text-left"
            >
              <p className="text-[10px] text-primary/75 hover:text-primary truncate transition-colors hover:underline underline-offset-2 decoration-dotted leading-tight font-medium">
                {att.company}
              </p>
              <p className="text-[8px] text-muted-foreground/40 mt-0.5">{att.companyCode}</p>
            </button>
          ) : (
            <div className="min-w-0">
              <p className="text-[10px] text-primary/75 truncate leading-tight font-medium">{att.company}</p>
              <p className="text-[8px] text-muted-foreground/50 mt-0.5">{att.companyCode}</p>
            </div>
          )
        )
      )}

      {/* Cột 3: Khóa học */}
      {!columns?.hideCourse && (
        columns?.renderCourse ? columns.renderCourse(att) : (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-foreground truncate leading-tight">
              {att.currentCourse || "Khóa đào tạo"}
            </p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate leading-snug">
              {att.courseStart && att.courseEnd
                ? `${att.courseStart}–${att.courseEnd}${att.courseDate ? ` · ${att.courseDate}` : ""}`
                : "—"}
            </p>
            {att.courseStart && att.courseEnd && (
              <div className="mt-0.5">
                <SessionBadge courseStart={att.courseStart} courseEnd={att.courseEnd} courseDate={att.courseDate} small />
              </div>
            )}
          </div>
        )
      )}

      {/* Cột 4: Điểm danh */}
      {!columns?.hideAttendance && (
        columns?.renderAttendance ? columns.renderAttendance(att, badges, detail) : (
          <div className="min-w-0">
            {course.group === "upcoming" && att.currentStatus === "absent" ? (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded text-muted-foreground/60 bg-[#1a2235]">
                Chưa bắt đầu
              </span>
            ) : course.group === "cancelled" ? (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded text-red-400/80 bg-red-500/10">
                Đã Huỷ
              </span>
            ) : (
              <>
                <StatusBadges badges={badges} small />
                {detail && (
                  <p className={cn(
                    "text-[9px] mt-0.5 leading-snug truncate",
                    primary ? attendanceStatusConfig[primary].color + "/80" : "text-muted-foreground/60"
                  )}>
                    {detail}
                  </p>
                )}
              </>
            )}
          </div>
        )
      )}

      {/* Cột 5: Action — 32px cố định */}
      {columns?.renderAction ? (
        columns.renderAction(att)
      ) : !columns?.hideAction && att.courseId ? (
        <button
          onClick={e => {
            e.stopPropagation();
            columns?.onPlayback?.(att.courseId!, att.workerId || att.id, att.name, att.currentCourse || "");
          }}
          className="p-1 justify-self-center rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
          title="Xem lại video"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div /> /* giữ khoảng trống action */
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header labels theo cùng thứ tự cột
// ─────────────────────────────────────────────────────────────

const HEADERS: { label: string; hideKey?: keyof CourseWorkerColumns }[] = [
  { label: "Học viên",  hideKey: "hideWorker"      },
  { label: "Nhà thầu",  hideKey: "hideContractor"  },
  { label: "Khóa học",  hideKey: "hideCourse"      },
  { label: "Điểm danh", hideKey: "hideAttendance"  },
  { label: ""           /* action — không có tên */ },
];

// ─────────────────────────────────────────────────────────────
// CourseWorkerList — export
// ─────────────────────────────────────────────────────────────

export interface CourseWorkerListProps {
  items: CourseWorkerAttData[];
  columns?: CourseWorkerColumns;
  /** Click vào row — nhận item tương ứng */
  onSelectItem?: (item: CourseWorkerAttData) => void;
  course?: { group: string };
  className?: string;
  hideHeader?: boolean;
  emptyText?: string;
}

export function CourseWorkerList({
  items,
  columns,
  onSelectItem,
  course,
  className,
  hideHeader = false,
  emptyText = "Không có dữ liệu",
}: CourseWorkerListProps) {
  // 1 class dùng cho cả header lẫn rows → không bao giờ lệch
  const gridClass = pickGrid(columns);

  const visibleHeaders = HEADERS.filter(h =>
    !h.hideKey || !columns?.[h.hideKey]
  );

  return (
    <div className={cn('flex flex-col flex-1 min-h-0', className)}>
      {/* Sticky header */}
      {!hideHeader && (
        <div className={cn(
          'grid gap-x-2 px-3 py-1.5',
          TRAINING_LIST_HEADER_ROW,
          gridClass
        )}>
          <div /> {/* avatar slot */}
          {visibleHeaders.map((h, i) => (
            <span key={i} className={TRAINING_LIST_HEADER_TEXT}>
              {h.label}
            </span>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className={TRAINING_LIST_STATE_WRAP}>
          <p className={TRAINING_LIST_STATE_TEXT}>{emptyText}</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#1e2433]">
          {items.map(att => (
            <CourseWorkerRow
              key={att.id}
              att={att}
              gridClass={gridClass}
              course={course}
              columns={{
                ...columns,
                onSelectWorker: onSelectItem ? () => onSelectItem(att) : columns?.onSelectWorker,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
