import { useEffect, useState } from "react";
import { X, Loader2, Search } from "lucide-react";
import {
  fetchWorkers,
  assignCourseToWorkers,
  revokeCourseFromWorkers,
  fetchCourseWorkers,
  type WorkerApiItem,
} from "@/api/worker.api";
import { cn } from "@/utils/cn";

interface AssignWorkersModalProps {
  courseId: string;
  courseTitle: string;
  // Currently assigned workers from API, wait, our course list might only have the mockup attendees right now.
  // We need to fetch course workers from API. Let's just fetch them when opening the modal.
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignWorkersModal({
  courseId,
  courseTitle,
  onClose,
  onSuccess,
}: AssignWorkersModalProps) {
  const [workers, setWorkers] = useState<WorkerApiItem[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");

  // We should ideally fetch all workers and also the workers assigned to the course.
  useEffect(() => {
    async function load() {
      try {
        const [workersRes, assignedRes] = await Promise.all([
          fetchWorkers({ limit: 1000 }),
          fetchCourseWorkers(courseId),
        ]);
        setWorkers(workersRes.items);
        const aIds = new Set<string>(assignedRes.map((w) => w.id));
        setAssignedIds(aIds);
      } catch (err) {
        console.error("Error loading workers for modal", err);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [courseId]);

  const filteredWorkers = workers.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.phone?.includes(search),
  );

  const toggleWorker = (id: string) => {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Very simple diffing: just assign all selected and revoke all unselected.
      // Or we can just use the backend to handle it, but wait, the backend assigns only new and revokes only existing.
      const selected = Array.from(assignedIds);
      const unselected = workers
        .filter((w) => !assignedIds.has(w.id))
        .map((w) => w.id);

      if (selected.length > 0) {
        await assignCourseToWorkers(courseId, selected).catch((e) =>
          console.error(e),
        );
      }
      if (unselected.length > 0) {
        await revokeCourseFromWorkers(courseId, unselected).catch((e) =>
          console.error(e),
        );
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0b0f1a] border border-[#1e2433] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2433]">
          <h2 className="text-sm font-semibold text-foreground">
            Gán nhân sự: {courseTitle}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1a2235] text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-[#1e2433]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên, SĐT..."
              className="w-full pl-8 pr-3 py-2 rounded bg-[#1a2235] border border-[#1e2433] text-sm text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {filteredWorkers.map((w) => {
                const isSelected = assignedIds.has(w.id);
                return (
                  <label
                    key={w.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-[#1a2235] border border-transparent",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleWorker(w.id)}
                      className="w-4 h-4 rounded border-[#1e2433] bg-transparent checked:bg-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {w.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {w.phone || "Không có SĐT"} •{" "}
                        {w.contractor?.name || "Chưa gán nhà thầu"}
                      </p>
                    </div>
                  </label>
                );
              })}
              {filteredWorkers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Không tìm thấy nhân sự
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-[#1e2433]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}
