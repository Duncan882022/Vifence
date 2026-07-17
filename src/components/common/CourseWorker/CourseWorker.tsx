import React from "react";
import { cn } from "@/utils/cn";
import {
  Avatar,
  StatusBadges,
  attendanceStatusConfig,
  getAttendeeBadges,
  getAttendanceDetailLine,
} from "@/modules/dao-tao-tuan-thu/components/TrainingEventTable";
import { Play } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AttendanceStatus = keyof typeof attendanceStatusConfig;

export interface CourseWorkerAttData {
  id: string;
  workerId?: string;
  courseId?: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string;
  employeeCode: string;
  role: string;
  email?: string;
  company: string;
  companyCode: string;
  contractorPhone?: string;
  currentStatus: string;
  attendanceRate?: number;
  attendedBlocks: number;
  totalBlocks: number;
  attendedIndices?: number[];
  lateMinutes: number;
  earlyLeaveMinutes: number;
  // Optional fields for course column
  currentCourse?: string;
  courseStart?: string;
  courseEnd?: string;
  courseDate?: string;
}

/**
 * Cấu hình hiển thị 5 cột của CourseWorkerItem.
 *
 * Mặc định: tất cả cột đều hiển thị.
 * Muốn ẩn cột nào → truyền `hideXxx: true`.
 *
 * Cột action luôn giữ khoảng trống 32px trong grid dù ẩn nút playback.
 */
export interface CourseWorkerColumns {
  // ── Ẩn/hiện từng cột ──────────────────────────────────────
  /** Ẩn cột Học viên */
  hideWorker?: boolean;
  /** Ẩn cột Nhà thầu */
  hideContractor?: boolean;
  /** Ẩn cột Khóa học */
  hideCourse?: boolean;
  /** Ẩn cột Điểm danh */
  hideAttendance?: boolean;
  /**
   * Ẩn nút Playback trong cột Hành động.
   * Cột action vẫn giữ khoảng trống 32px trong grid.
   */
  hideAction?: boolean;

  // ── Callbacks ─────────────────────────────────────────────
  /** Click vào nhà thầu để lọc */
  onSelectContractor?: (company: string) => void;
  /** Click vào dòng để chọn học viên */
  onSelectWorker?: () => void;
  /** Callback khi bấm nút Playback */
  onPlayback?: (
    courseId: string,
    workerId: string,
    workerName: string,
    courseName: string
  ) => void;

  // ── Render overrides ──────────────────────────────────────
  /** Tùy biến render cột Học viên */
  renderWorker?: (att: CourseWorkerAttData) => React.ReactNode;
  /** Tùy biến render cột Nhà thầu */
  renderContractor?: (att: CourseWorkerAttData) => React.ReactNode;
  /** Tùy biến render cột Khóa học */
  renderCourse?: (att: CourseWorkerAttData) => React.ReactNode;
  /**
   * Tùy biến render cột Điểm danh
   * @param badges  - danh sách badge trạng thái
   * @param detail  - chuỗi chi tiết giờ quét / vắng
   */
  renderAttendance?: (
    att: CourseWorkerAttData,
    badges: AttendanceStatus[],
    detail: string | null
  ) => React.ReactNode;
  /** Tùy biến render cột Hành động (override toàn bộ, kể cả nút playback mặc định) */
  renderAction?: (att: CourseWorkerAttData) => React.ReactNode;
}

export interface CourseWorkerItemProps {
  att: CourseWorkerAttData;
  course?: { group: string };
  columns?: CourseWorkerColumns;
}

// ─────────────────────────────────────────────────────────────
// Grid helper – tự động tính grid-template-columns từ config
// ─────────────────────────────────────────────────────────────

/**
 * Trả về chuỗi Tailwind grid-cols-[...] dựa trên cột nào đang hiển thị.
 * Layout: avatar(28px) | worker | contractor | course | attendance | action(32px)
 *
 * Cột action luôn có (dù ẩn nút playback) để giữ khoảng trống canh đều.
 */
function buildGridCols(cols?: CourseWorkerColumns): string {
  const worker      = !cols?.hideWorker      ? "minmax(0,1.5fr)" : null;
  const contractor  = !cols?.hideContractor  ? "minmax(0,1.2fr)" : null;
  const course      = !cols?.hideCourse      ? "minmax(0,1.8fr)" : null;
  const attendance  = !cols?.hideAttendance  ? "minmax(0,1fr)"   : null;

  const parts = [
    "28px",                    // avatar cố định
    worker,
    contractor,
    course,
    attendance,
    "32px",                    // action luôn cố định
  ].filter(Boolean);

  return `grid-cols-[${parts.join("_")}]`;
}

/**
 * Tạo chuỗi header columns (dùng cho phần tiêu đề bảng bên ngoài).
 * Export để nơi dùng có thể sync header với rows.
 */
export function buildHeaderGridCols(cols?: CourseWorkerColumns): string {
  return buildGridCols(cols);
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const CourseWorkerItem: React.FC<CourseWorkerItemProps> = ({
  att,
  course = { group: "active" },
  columns,
}) => {
  const badges = getAttendeeBadges(att as any) as AttendanceStatus[];
  const primary = badges[0] as AttendanceStatus;
  const detail = getAttendanceDetailLine(att as any);

  const colsClass = buildGridCols(columns);

  return (
    <div
      onClick={columns?.onSelectWorker}
      className={cn(
        "grid gap-x-2 items-center px-3 py-2.5 transition-colors group",
        columns?.onSelectWorker
          ? "cursor-pointer hover:bg-[#1a2235]/50"
          : "hover:bg-[#1a2235]/20",
        colsClass
      )}
    >
      {/* ── Avatar (luôn hiển thị) ───────────────────────── */}
      <Avatar
        name={att.name}
        color={att.avatarColor}
        src={att.avatarUrl || undefined}
        size="sm"
      />

      {/* ── Cột 1: Học viên ─────────────────────────────── */}
      {!columns?.hideWorker && (
        columns?.renderWorker ? (
          columns.renderWorker(att)
        ) : (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-foreground truncate leading-tight">
              {att.name}
            </p>
            <p className="text-[8px] text-muted-foreground/60 mt-0.5 font-medium tabular-nums">
              MSHV: {att.employeeCode}
            </p>
            <p className="text-[8px] text-muted-foreground/50 truncate">
              SĐT: {att.role}
            </p>
            {att.email && (
              <p
                className="text-[8px] text-muted-foreground/45 truncate"
                title={att.email}
              >
                {att.email}
              </p>
            )}
          </div>
        )
      )}

      {/* ── Cột 2: Nhà thầu ─────────────────────────────── */}
      {!columns?.hideContractor && (
        columns?.renderContractor ? (
          columns.renderContractor(att)
        ) : columns?.onSelectContractor ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              columns.onSelectContractor!(att.company);
            }}
            className="min-w-0 text-left"
            title={`${att.company} (${att.companyCode})`}
          >
            <p className="text-[10px] text-primary/75 hover:text-primary truncate transition-colors hover:underline underline-offset-2 decoration-dotted leading-tight font-medium">
              {att.company}
            </p>
            <p className="text-[8px] text-muted-foreground/40 mt-0.5">
              {att.companyCode}
            </p>
          </button>
        ) : (
          <div
            className="min-w-0"
            title={`${att.company} (${att.companyCode})`}
          >
            <p className="text-[10px] text-primary/75 truncate leading-tight font-medium">
              {att.company}
            </p>
            <p className="text-[8px] text-muted-foreground/50 mt-0.5">
              {att.companyCode}
            </p>
          </div>
        )
      )}

      {/* ── Cột 3: Khóa học ─────────────────────────────── */}
      {!columns?.hideCourse && (
        columns?.renderCourse ? (
          columns.renderCourse(att)
        ) : (
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-foreground truncate leading-tight">
              {att.currentCourse || "Khóa đào tạo"}
            </p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5 truncate leading-snug">
              {att.courseStart && att.courseEnd
                ? `${att.courseStart} – ${att.courseEnd}${att.courseDate ? ` · ${att.courseDate}` : ""}`
                : "—"}
            </p>
          </div>
        )
      )}

      {/* ── Cột 4: Điểm danh ────────────────────────────── */}
      {!columns?.hideAttendance && (
        columns?.renderAttendance ? (
          columns.renderAttendance(att, badges, detail)
        ) : (
          <div className="min-w-0 flex flex-col items-start gap-1">
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
                  <p
                    className={cn(
                      "text-[9px] font-medium leading-normal truncate",
                      primary
                        ? attendanceStatusConfig[primary].color + "/90"
                        : "text-muted-foreground/60"
                    )}
                  >
                    {detail}
                  </p>
                )}
              </>
            )}
          </div>
        )
      )}

      {/* ── Cột 5: Hành động (luôn giữ 32px) ───────────── */}
      {columns?.renderAction ? (
        columns.renderAction(att)
      ) : !columns?.hideAction && att.courseId ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            columns?.onPlayback?.(
              att.courseId!,
              att.id,
              att.name,
              att.currentCourse || ""
            );
          }}
          className="p-1 justify-self-center rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
          title="Xem lại video"
        >
          <Play className="w-3.5 h-3.5 text-blue-400 fill-blue-400/15" />
        </button>
      ) : (
        // Giữ khoảng trống, không render gì cả
        <div />
      )}
    </div>
  );
};
