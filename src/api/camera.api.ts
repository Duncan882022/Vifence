/**
 * Camera API client
 * Proxy qua be_vifence → be_vision_ai
 */

import axiosInstance from "@/utils/axios";

export interface CameraApiItem {
  id: string;
  name: string;
  rtspUrl: string;
  rtspType: "pull" | "push";
  status: "stopped" | "streaming" | "recording_continuous" | "recording_event" | "recording_continuous_event";
  address: string;
  workerId: string | null;
  spaceId: string | null;
  lat: number | null;
  lng: number | null;
  ptz: boolean | null;
  onvifIp: string | null;
  onvifPort: number | null;
  onvifUsername: string | null;
  onvifPassword: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated by Vision / CMS API when ai-workers list is unavailable */
  worker?: AiWorkerApiItem | null;
}

export interface AiWorkerApiItem {
  id: string;
  macId: string;
  name: string;
  socket: string;
  port: number;
  isActive: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; offset: number; limit: number; next: boolean };
}

export interface CameraCreatePayload {
  name: string;
  rtspUrl: string;
  rtspType?: "pull" | "push";
  address: string;
  workerId?: string | null;
  spaceId?: string | null;
  lat: number;
  lng: number;
}

export interface CameraUpdatePayload {
  name?: string;
  rtspUrl?: string;
  rtspType?: "pull" | "push";
  address?: string;
  workerId?: string | null;
  spaceId?: string | null;
  lat?: number;
  lng?: number;
  status?: "stopped" | "streaming" | "recording_continuous" | "recording_event" | "recording_continuous_event";
}

export async function fetchCameras(params?: {
  search?: string;
  offset?: number;
  limit?: number;
  status?: string;
}): Promise<PaginatedResponse<CameraApiItem>> {
  const response = await axiosInstance.get("/cameras", { params });
  return response.data;
}

export async function fetchCamera(id: string): Promise<CameraApiItem> {
  const response = await axiosInstance.get(`/cameras/${id}`);
  return response.data;
}

export async function createCamera(
  payload: CameraCreatePayload,
): Promise<CameraApiItem> {
  const response = await axiosInstance.post("/cameras", payload);
  return response.data;
}

export async function updateCamera(
  id: string,
  payload: CameraUpdatePayload,
): Promise<CameraApiItem> {
  const response = await axiosInstance.patch(`/cameras/${id}`, payload);
  return response.data;
}

export async function deleteCamera(id: string): Promise<void> {
  await axiosInstance.delete(`/cameras/${id}`);
}

export async function fetchAiWorkers(): Promise<
  PaginatedResponse<AiWorkerApiItem>
> {
  const response = await axiosInstance.get("/ai-workers");
  return response.data;
}

export async function fetchAiWorker(id: string): Promise<AiWorkerApiItem> {
  const response = await axiosInstance.get(`/ai-workers/${id}`);
  return response.data;
}

// ─── Playback (camera records & AI detections) ────────────────────────────────

export interface CameraRecordItem {
  id: string;
  cameraId: string;
  type: string;
  name: string;
  description: string;
  videoId: string;
  thumbnailId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface DetectedObjectItem {
  id: string;
  videoId: string;
  recordId: string;
  label: string;
  confidenceScore: number;
  detectionResult: string;
  createdAt: string;
  extraData?: Record<string, unknown>;
}

export async function fetchCameraRecords(
  cameraId: string,
  params: { startDate: string; endDate: string; limit?: number },
): Promise<PaginatedResponse<CameraRecordItem>> {
  const response = await axiosInstance.get(`/cameras/${cameraId}/records`, {
    params: {
      limit: params.limit ?? 9999,
      startDate: params.startDate,
      endDate: params.endDate,
    },
  });
  return response.data;
}

export async function fetchDetectedObjects(
  recordId: string,
  params?: { offset?: number; limit?: number },
): Promise<PaginatedResponse<DetectedObjectItem>> {
  const response = await axiosInstance.get('/detected-objects', {
    params: {
      recordId,
      offset: params?.offset ?? 0,
      limit: params?.limit ?? 100,
    },
  });
  return response.data;
}

