import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Bell,
  Loader2,
  Trash2,
  Edit2,
} from "lucide-react";
import { cn } from "@/utils/cn";
import {
  TRAINING_LIST_HEADER_ROW,
  TRAINING_LIST_HEADER_TEXT,
  COURSE_LIST_GRID,
  TRAINING_LIST_EMPTY_TEXT,
  TRAINING_LIST_STATE_TEXT,
  TRAINING_LIST_STATE_WRAP,
} from "./trainingListStates";
import {
  SessionBadge,
} from "./TrainingEventTable";
import type { TrainingCourseMock } from "../data/trainingMockData";

import { fetchCourseWorkersAttendance } from "@/api/course.api";
import { CourseWorkerList } from "@/components/common/CourseWorker/CourseWorkerList";

// Hàm helper format giờ (HH:MM) giống TrainingEventTable
const formatTimeOnly = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

const PREVIEW_COUNT = 4;

function UpcomingBadge({ small }: { small?: boolean }) {
  return (
    <span
      className={cn(
        "font-bold rounded whitespace-nowrap inline-flex items-center",
        small ? "text-[8px] px-1 py-0.5" : "text-[9px] px-1.5 py-0.5",
        "text-blue-400 bg-blue-500/15",
      )}
    >
      Sắp diễn ra
    </span>
  );
}

function CourseStatusCell({ course }: { course: TrainingCourseMock }) {
  if (course.group === "upcoming") {
    return <UpcomingBadge small />;
  }
  if (course.group === "cancelled") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap text-red-400 bg-red-500/15">
        Đã Huỷ
      </span>
    );
  }
  if (course.group === "completed") {
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap text-gray-400 bg-gray-500/15">
        Đã hoàn thành
      </span>
    );
  }
  return (
    <SessionBadge
      courseStart={course.startTime}
      courseEnd={course.endTime}
      courseDate={course.sessionDate}
      small
    />
  );
}

export function TrainingCourseListHeader() {
  return (
    <div className={cn(
      'grid gap-x-2 items-center px-3 py-1.5 min-h-[28px]',
      TRAINING_LIST_HEADER_ROW,
      COURSE_LIST_GRID,
    )}>
      <div />
      <span className={TRAINING_LIST_HEADER_TEXT}>Khóa học</span>
      <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right leading-none">TG</span>
      <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right leading-none">NL</span>
      <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-right leading-none">Trạng thái</span>
    </div>
  )
}

interface TrainingCourseListBodyProps {
  isLoading?: boolean
  isEmpty?: boolean
  emptyText?: string
  children: React.ReactNode
}

export function TrainingCourseListBody({
  isLoading = false,
  isEmpty = false,
  emptyText,
  children,
}: TrainingCourseListBodyProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-px p-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5 animate-pulse">
              <div className="w-3 h-3 rounded bg-[#1e2433]" />
              <div className="flex-1 h-3 rounded bg-[#1e2433]" />
              <div className="w-12 h-3 rounded bg-[#1e2433]" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <div className={TRAINING_LIST_STATE_WRAP}>
          <p className={TRAINING_LIST_STATE_TEXT}>{emptyText ?? TRAINING_LIST_EMPTY_TEXT}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#1e2433]">
      {children}
    </div>
  )
}

export interface TrainingCourseListRowProps {
  course: TrainingCourseMock;
  isOpen: boolean;
  showAllAtt: boolean;
  onToggle: () => void;
  onToggleAttendees: () => void;
  onNotify: () => void;
  onAssignWorkers?: (id: string, title: string) => void;
  onDeleteCourse?: (id: string) => void;
  onEditCourse?: (course: TrainingCourseMock) => void;
  showCustomBadge?: boolean;
  onPlayback?: (courseId: string, workerId: string, workerName: string, courseName: string) => void;
}

export function TrainingCourseListRow({
  course,
  isOpen,
  showAllAtt,
  onToggle,
  onToggleAttendees,
  onNotify,
  onAssignWorkers,
  onDeleteCourse,
  onEditCourse,
  showCustomBadge = false,
  onPlayback,
}: TrainingCourseListRowProps) {
  const [apiWorkers, setApiWorkers] = useState<any[]>([]);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingWorkers(true);
      
      fetchCourseWorkersAttendance({ courseId: course.id, limit: 200 })
        .then((workersRes) => {
          const mapped = workersRes.items.map((item) => {
            const w = item.worker;
            const attendedIndices = (item.courseBlocks || []).map((b: any) => b.blockIndex);
            
            // Map trạng thái từ API Backend sang UI AttendanceStatus
            let statusVal: any = "absent";
            const apiStatus = (item.attendanceStatus || "").toLowerCase();
            if (apiStatus === "completed") statusVal = "completed";
            else if (apiStatus === "insufficient") statusVal = "insufficient";
            else if (apiStatus === "attending") statusVal = "attending";
            else if (apiStatus === "away") statusVal = "away";
            else if (apiStatus === "late") statusVal = "late";
            else if (apiStatus === "early_leave") statusVal = "left-early";
            else if (apiStatus === "skip") statusVal = "skipped";
            else if (apiStatus === "absent") statusVal = "absent";

            // Tạo line time thực tế quét được
            const checkInStr = formatTimeOnly(item.firstSeenAt);
            const checkOutStr = formatTimeOnly(item.lastSeenAt);
            const actualTimeStr = checkInStr && checkOutStr ? `${checkInStr}–${checkOutStr}` : "—";

            // Tạo CourseRecord tương thích để rendering status list
            const historyRecord: any = {
              id: item.courseId,
              courseCode: "COURSE_CODE",
              courseName: course.title,
              sessionDate: course.sessionDate,
              startTime: formatTimeOnly(course.startTime),
              endTime: formatTimeOnly(course.endTime),
              zone: course.zone,
              status: statusVal,
              sessions: item.firstSeenAt ? [{ in: checkInStr, out: checkOutStr || null }] : [],
              flags: statusVal !== "completed" && statusVal !== "absent" && statusVal !== "attending" ? [statusVal] : []
            };

            return {
              id: item.id,
              courseId: item.courseId,
              workerId: w?.id || item.workerId,
              employeeCode: (w?.id || item.workerId).substring(0, 8),
              name: w?.name || "Học viên",
              avatarColor: "#3B82F6",
              avatarUrl: w?.faceFrontUrl || w?.faceLeftUrl || w?.faceRightUrl || undefined,
              company: w?.contractor?.name || "Chưa gán",
              companyCode: w?.contractor?.code || "—",
              contractorPhone: (w?.contractor as any)?.phone || "—",
              contractorEmail: (w?.contractor as any)?.email || "",
              role: w?.phone || "—",
              email: w?.email || "",
              currentStatus: statusVal,
              currentCourse: course.title,
              courseDate: course.sessionDate,
              courseStart: course.startTime,
              courseEnd: course.endTime,
              actualTime: actualTimeStr,
              exceptionMinutes: item.lateMinutes + item.earlyLeaveMinutes,
              courseHistory: [historyRecord],
              // Các trường thông tin bổ sung
              totalBlocks: item.totalBlocks,
              attendedBlocks: item.attendedBlocks,
              attendanceRate: item.attendanceRate,
              lateMinutes: item.lateMinutes,
              earlyLeaveMinutes: item.earlyLeaveMinutes,
              attendedIndices: attendedIndices, // Danh sách các block đã quét
            };
          });
          setApiWorkers(mapped);
        })
        .catch((err) => console.error(err))
        .finally(() => setIsLoadingWorkers(false));
    }
  }, [
    isOpen,
    course.id,
    course.title,
    course.sessionDate,
    course.startTime,
    course.endTime,
  ]);

  // If we fetched API workers successfully and the modal is open, use those.
  // Otherwise default to the mock ones.
  const displayAttendees = isOpen ? apiWorkers : course.attendees;
  const visibleAttendees = showAllAtt
    ? displayAttendees
    : displayAttendees.slice(0, PREVIEW_COUNT);
  const extra = displayAttendees.length - PREVIEW_COUNT;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        className={cn(
          "grid gap-x-2 items-center px-3 py-2.5 cursor-pointer",
          COURSE_LIST_GRID,
          "hover:bg-[#1a2235]/50 transition-colors group",
          isOpen && "bg-[#1a2235]/25",
        )}
      >
        <div className="flex items-center justify-center">
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-foreground truncate leading-tight">
            {course.title}
            {showCustomBadge && course.id.startsWith("custom-") && (
              <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-primary/15 text-primary align-middle">
                Mới tạo
              </span>
            )}
          </p>
        </div>

        <div className="min-w-0 text-[10px] text-foreground tabular-nums">
          <span>
            {course.present || 0}
            <span className="text-muted-foreground/50">
              /{course.total || 0}
            </span>
          </span>
        </div>

        <div
          className={cn(
            "min-w-0 text-[10px] tabular-nums font-medium",
            course.exceptions > 0
              ? "text-orange-400"
              : "text-muted-foreground/50",
          )}
        >
          {course.exceptions}
        </div>

        <div
          className="flex items-center justify-start gap-1 min-w-0 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {course.action === "notify" ? (
            <button
              type="button"
              onClick={onNotify}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 text-[8px] font-bold hover:bg-blue-500/25 transition-colors whitespace-nowrap"
            >
              <Bell className="w-2.5 h-2.5 shrink-0" />
              Thông báo
            </button>
          ) : (
            <CourseStatusCell course={course} />
          )}
          {onAssignWorkers && (
            <button
              type="button"
              onClick={() => onAssignWorkers(course.id, course.title)}
              className="ml-2 px-1.5 py-0.5 rounded bg-[#1a2235] text-primary hover:bg-[#1e2433] text-[8px] font-bold transition-colors whitespace-nowrap"
            >
              Gán học viên
            </button>
          )}
          {onEditCourse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditCourse(course);
              }}
              className="ml-2 p-1 rounded text-muted-foreground hover:bg-[#1a2235] hover:text-primary transition-colors"
              title="Sửa khoá học"
            >
              <Edit2 className="w-3 h-3 shrink-0" />
            </button>
          )}
          {onDeleteCourse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteCourse(course.id);
              }}
              className="ml-2 p-1 rounded text-muted-foreground hover:bg-red-500/15 hover:text-red-400 transition-colors"
              title="Xoá khoá học"
            >
              <Trash2 className="w-3 h-3 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="bg-[#07090f] border-b border-[#1e2433]/60">
          {isLoadingWorkers ? (
            <div className="flex justify-center items-center py-5">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : apiWorkers.length === 0 ? (
            <p className="px-3 pl-7 py-3 text-[10px] text-muted-foreground/60">
              {course.group === "cancelled"
                ? "Ca đã Huỷ — không có học viên"
                : "Chưa có học viên đăng ký"}
            </p>
          ) : (
          <>
              <CourseWorkerList
                items={visibleAttendees as any[]}
                course={course}
                columns={{
                  hideCourse: true,  // Đã biết khóa học rồi
                  hideAction: !onPlayback,
                  onPlayback: onPlayback,
                }}
              />

              {extra > 0 && (
                <button
                  type="button"
                  onClick={onToggleAttendees}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-[9px] text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors border-t border-[#1e2433]/30"
                >
                  {showAllAtt ? (
                    <>
                      <ChevronDown className="w-2.5 h-2.5 rotate-180" />
                      Thu gọn
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-2.5 h-2.5" />+ {extra} người
                      khác
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
