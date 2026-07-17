/**
 * Course API client
 * Kết nối với backend FastAPI tại /api/v1/courses
 * Backend dùng alias_generator=to_camel → response là camelCase
 */

import axiosInstance from "@/utils/axios";

// ─── Response types khớp với CourseResponse của backend ───────────────────────

export interface CourseWorkerItem {
  id: string;
  workerId: string;
  attendanceStatus: string | null;
  totalBlocks: number | null;
  attendedBlocks: number | null;
  attendanceRate: number | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface CourseApiItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  /** 'active' | 'inactive' | 'cancelled' */
  status: string;
  zone: string | null;
  /** ISO datetime string, e.g. "2026-06-24T00:00:00+07:00" */
  startDate: string | null;
  /** ISO datetime — chỉ lấy phần HH:mm */
  startTime: string | null;
  /** ISO datetime — chỉ lấy phần HH:mm */
  endTime: string | null;
  present: number;
  exceptions: number;
  expectedAttendees: number;
  createdAt: string | null;
  updatedAt: string | null;
  /** Danh sách đánh giá chuyên cần (joinedload từ course_workers) */
  courseWorkers: CourseWorkerItem[];
}

export interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  next: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface CourseWorkerApiItem {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  contractorId: string | null;
}

// ─── API functions ─────────────────────────────────────────────────────────────

export async function fetchCourses(params?: {
  search?: string;
  limit?: number;
  offset?: number;
  startDateFrom?: string;
  startDateTo?: string;
}): Promise<PaginatedResponse<CourseApiItem>> {
  const response = await axiosInstance.get("/courses", { params });
  return response.data;
}

export async function fetchCourseById(id: string): Promise<CourseApiItem> {
  const response = await axiosInstance.get(`/courses/${id}`);
  return response.data;
}

export async function fetchCourseWorkers(
  courseId: string,
): Promise<CourseWorkerApiItem[]> {
  const response = await axiosInstance.get(`/courses/${courseId}/workers`);
  return response.data;
}

// ─── Create / Update / Delete ──────────────────────────────────────────────────

export interface CourseCreatePayload {
  name: string;
  code: string;
  description: string | null;
  status: "active" | "inactive" | "cancelled";
  startDate: string | null;
  startTime: string | null;
  endTime: string | null;
  zone: string | null;
  expectedAttendees: number;
}

export interface CourseUpdatePayload {
  name?: string;
  code?: string;
  description?: string | null;
  status?: "active" | "inactive" | "cancelled";
  zone?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  expectedAttendees?: number;
}

export async function createCourse(
  payload: CourseCreatePayload,
): Promise<CourseApiItem> {
  const response = await axiosInstance.post("/courses", payload);
  return response.data;
}

export async function updateCourse(
  id: string,
  payload: CourseUpdatePayload,
): Promise<CourseApiItem> {
  const response = await axiosInstance.patch(`/courses/${id}`, payload);
  return response.data;
}

export async function deleteCourse(id: string): Promise<CourseApiItem> {
  const response = await axiosInstance.delete(`/courses/${id}`);
  return response.data;
}

// ─── Course Event (Ngoại lệ & Điểm danh) ───────────────────────────────────────

export interface CourseEventApiItem {
  id: string;
  courseId: string;
  workerId: string;
  eventType: string;
  severity: string;
  expectedStart: string | null;
  actualStart: string | null;
  expectedEnd: string | null;
  actualEnd: string | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  missedBlocks: number | null;
  thumbnailId: string | null;
  videoId: string | null;
  status: string;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  worker?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    contractorId: string | null;
    faceFrontUrl?: string | null;
    faceLeftUrl?: string | null;
    faceRightUrl?: string | null;
    faceExternalId?: string | null;
    contractor?: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  } | null;
  course?: CourseApiItem | null;
}

export async function fetchCourseEvents(params?: {
  courseId?: string;
  workerId?: string;
  eventType?: string;
  status?: string;
  limit?: number;
  offset?: number;
  startDateFrom?: string;
  startDateTo?: string;
}): Promise<PaginatedResponse<CourseEventApiItem>> {
  // Map camelCase parameters to backend snake_case or alias expectations
  const apiParams: Record<string, any> = {};
  if (params?.courseId) apiParams.course_id = params.courseId;
  if (params?.workerId) apiParams.worker_id = params.workerId;
  if (params?.eventType) apiParams.event_type = params.eventType;
  if (params?.status) apiParams.status = params.status;
  if (params?.limit !== undefined) apiParams.limit = params.limit;
  if (params?.offset !== undefined) apiParams.offset = params.offset;
  if (params?.startDateFrom) apiParams.startDateFrom = params.startDateFrom;
  if (params?.startDateTo) apiParams.startDateTo = params.startDateTo;

  const response = await axiosInstance.get("/course-events", { params: apiParams });
  return response.data;
}

// ─── Course Blocks (Dữ liệu từng block 10 phút) ───────────────────────────────

export interface CourseBlockApiItem {
  id: string;
  courseId: string;
  workerId: string;
  blockIndex: number;
  blockStartAt: string;
  cameraEventId: string | null;
  videoId: string | null;
  thumbnailId: string | null;
  confidenceScore: number | null;
  cameraId: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  detectionCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function fetchCourseBlocks(params?: {
  courseId?: string;
  workerId?: string;
  blockIndex?: number;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<CourseBlockApiItem>> {
  const response = await axiosInstance.get("/course-blocks", { params });
  return response.data;
}

// ─── Course Workers (Dữ liệu quan hệ điểm danh học viên trong lớp) ──────────

export interface CourseWorkerApiItem {
  id: string;
  workerId: string;
  courseId: string;
  attendanceStatus: string;
  totalBlocks: number;
  attendedBlocks: number;
  attendanceRate: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  createdAt: string | null;
  updatedAt: string | null;
  courseBlocks?: any[];
  worker?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    contractorId: string | null;
    faceFrontUrl?: string | null;
    faceLeftUrl?: string | null;
    faceRightUrl?: string | null;
    faceExternalId?: string | null;
    contractor?: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  } | null;
  course?: {
    id: string;
    name: string;
    code: string;
    zone: string | null;
    startTime: string | null;
    endTime: string | null;
    startDate: string | null;
  } | null;
}

export async function fetchCourseWorkersAttendance(params?: {
  courseId?: string;
  limit?: number;
  offset?: number;
  startDateFrom?: string;
  startDateTo?: string;
}): Promise<PaginatedResponse<CourseWorkerApiItem>> {
  const response = await axiosInstance.get("/course-workers", { params });
  return response.data;
}

// ─── Statistics (Dữ liệu thống kê KPIs bảng tổng quan) ───────────────────────

export async function fetchDashboardSummary(todayStr: string): Promise<any> {
  const response = await axiosInstance.get("/statistics/dashboard-summary", {
    params: { today: todayStr }
  });
  return response.data;
}

