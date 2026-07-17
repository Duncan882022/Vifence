import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CameraLiveState {
  selectedIds: string[];
  setSelectedIds: (ids: string[] | ((prev: string[]) => string[])) => void;
}

export const useCameraLiveStore = create<CameraLiveState>()(
  persist(
    (set, get: () => CameraLiveState) => ({
      selectedIds: [],
      setSelectedIds: (ids: string[] | ((prev: string[]) => string[])) => {
        if (typeof ids === "function") {
          set({ selectedIds: ids(get().selectedIds) });
        } else {
          set({ selectedIds: ids });
        }
      },
    }),
    {
      name: "vifence_camera",
    },
  ) as any,
);
