import React, { useState, useEffect, useRef } from "react";
import { X, Play, Pause, Film, RefreshCw } from "lucide-react";
import { cn } from "@/utils/cn";
import dayjs from "dayjs";
import { MEDIA_BASE_URL } from "@/config";
import { fetchCourseBlocks, type CourseBlockApiItem } from "@/api/course.api";

interface CourseWorkerPlaybackModalProps {
  courseId: string;
  workerId: string;
  workerName: string;
  courseName: string;
  onClose: () => void;
}

export const CourseWorkerPlaybackModal: React.FC<CourseWorkerPlaybackModalProps> = ({
  courseId,
  workerId,
  workerName,
  courseName,
  onClose,
}) => {
  const [blocks, setBlocks] = useState<CourseBlockApiItem[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<CourseBlockApiItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch blocks when component mounts
  useEffect(() => {
    setLoading(true);
    fetchCourseBlocks({ courseId, workerId, limit: 100 })
      .then((res) => {
        const items = res.items || [];
        const sorted = [...items].sort((a, b) => a.blockIndex - b.blockIndex);
        setBlocks(sorted);
        if (sorted.length > 0) {
          const firstWithVideo = sorted.find((b) => b.videoId) || sorted[0];
          setSelectedBlock(firstWithVideo);
        }
      })
      .catch((err) => {
        console.error("Failed to load blocks for playback:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [courseId, workerId]);

  // Video listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };
    const onDur = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [selectedBlock]);

  // Auto-play when block changes
  useEffect(() => {
    const video = videoRef.current;
    if (video && selectedBlock?.videoId) {
      video.load();
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [selectedBlock]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  };

  const handleScrub = (pct: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = (pct / 100) * duration;
    setCurrentTime(video.currentTime);
    setProgress(pct);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const videoSrc = selectedBlock?.videoId
    ? `${MEDIA_BASE_URL}/ai-data/${selectedBlock.videoId}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col bg-[#0a0e1a] border border-[#1e2433] rounded-xl shadow-2xl overflow-hidden"
        style={{ width: "min(95vw, 1100px)", height: "min(90vh, 700px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2433] bg-[#080c17] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded tracking-widest uppercase">
              🎬 XEM LẠI THEO BLOCK
            </span>
            <span className="text-xs font-semibold text-white/95 truncate">
              {workerName} &middot; {courseName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Player Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-black relative justify-center">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="w-full h-full max-h-[420px] object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/20 py-20">
              <Film className="w-16 h-16" />
              <span className="text-xs">
                {loading ? "Đang tải blocks..." : "Chọn block học viên bên dưới để xem lại video"}
              </span>
            </div>
          )}

          {/* Controls overlay */}
          {videoSrc && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent flex flex-col gap-2">
              <div
                className="relative w-full h-1 bg-white/10 rounded-full cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleScrub(((e.clientX - rect.left) / rect.width) * 100);
                }}
              >
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-white text-[10px] font-mono">
                <div className="flex items-center gap-3">
                  <button onClick={togglePlay} className="text-white hover:text-blue-400">
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <span>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                {selectedBlock && (
                  <span className="text-white/60">
                    Block {selectedBlock.blockIndex + 1} ({dayjs(selectedBlock.blockStartAt).format("HH:mm")})
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Blocks selector panel */}
        <div className="h-[180px] border-t border-[#1e2433] bg-[#080c17] flex flex-col shrink-0">
          <div className="px-4 py-2 border-b border-[#1e2433] shrink-0 flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
              Danh sách block nhận diện ({blocks.length})
            </span>
            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-white/40" />}
          </div>

          <div className="flex-1 overflow-x-auto p-4 flex gap-3 items-center">
            {blocks.length === 0 && !loading ? (
              <span className="text-[10px] text-white/20 mx-auto">Không có dữ liệu camera cho ca học này</span>
            ) : (
              blocks.map((b) => {
                const isSelected = selectedBlock?.id === b.id;
                const blockTime = dayjs(b.blockStartAt).format("HH:mm");
                const hasVideo = !!b.videoId;

                return (
                  <button
                    key={b.id}
                    disabled={!hasVideo}
                    onClick={() => setSelectedBlock(b)}
                    className={cn(
                      "flex-shrink-0 w-24 aspect-video rounded border overflow-hidden relative transition-all flex flex-col justify-between p-1.5",
                      isSelected
                        ? "border-blue-400 bg-blue-500/10 shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                        : hasVideo
                        ? "border-white/10 bg-[#0d1117] hover:border-white/30"
                        : "border-white/5 bg-white/5 opacity-40 cursor-not-allowed"
                    )}
                  >
                    {b.thumbnailId && hasVideo ? (
                      <img
                        src={`${MEDIA_BASE_URL}/ai-data/${b.thumbnailId}`}
                        className="absolute inset-0 w-full h-full object-cover z-0"
                        alt=""
                      />
                    ) : (
                      <div className="absolute inset-0 bg-[#121620] z-0 flex items-center justify-center">
                        <Film className="w-4 h-4 text-white/10" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent z-[1]" />
                    <div className="z-10 text-[7px] font-semibold text-white/50">
                      B{b.blockIndex + 1}
                    </div>
                    <div className="z-10 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-white font-mono">{blockTime}</span>
                      {hasVideo && <Play className="w-2 h-2 text-blue-400 fill-blue-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
