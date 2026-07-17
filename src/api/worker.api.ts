import axiosInstance from '@/utils/axios'
import axios from 'axios'

export interface PaginationMeta {
  total: number
  offset: number
  limit: number
  next: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  meta: PaginationMeta
}

export interface ContractorApiItem {
  id: string
  name: string
  code: string | null
}

export interface WorkerApiItem {
  id: string
  name: string
  phone: string | null
  email: string | null
  cccd: string | null
  contractorId: string | null
  contractor: ContractorApiItem | null
  gender?: 'male' | 'female' | null
  birthDate?: string | null
  faceLeftUrl?: string | null
  faceRightUrl?: string | null
  faceFrontUrl?: string | null
}

// ─── Worker API ─────────────────────────────────────────────────────────────

export async function fetchWorkers(params?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<PaginatedResponse<WorkerApiItem>> {
  const response = await axiosInstance.get('/workers', { params })
  return response.data
}

export interface WorkerCreatePayload {
  name: string
  phone?: string | null
  email?: string | null
  cccd?: string | null
  contractorId?: string | null
  gender?: 'male' | 'female' | null
  birthDate?: string | null
}

export async function createWorker(payload: WorkerCreatePayload): Promise<WorkerApiItem> {
  const response = await axiosInstance.post('/workers', payload)
  return response.data
}

export async function updateWorker(id: string, payload: Partial<WorkerCreatePayload>): Promise<WorkerApiItem> {
  const response = await axiosInstance.patch(`/workers/${id}`, payload)
  return response.data
}

export interface WorkerAvatarFiles {
  faceFront?: File | null
  faceLeft?: File | null
  faceRight?: File | null
}

export async function uploadWorkerAvatar(id: string, files: WorkerAvatarFiles): Promise<WorkerApiItem> {
  // 1. Lấy presigned URLs và folder_name từ backend
  const presignedRes = await axiosInstance.post(`/workers/${id}/avatar/presigned-urls`)
  const { folder_name, urls } = presignedRes.data

  // 2. Upload song song các file ảnh trực tiếp lên MinIO bằng phương thức PUT
  const uploadPromises: Promise<any>[] = []
  if (files.faceFront && urls.face_front) {
    uploadPromises.push(axios.put(urls.face_front, files.faceFront, {
      headers: { 'Content-Type': files.faceFront.type || 'image/jpeg' }
    }))
  }
  if (files.faceLeft && urls.face_left) {
    uploadPromises.push(axios.put(urls.face_left, files.faceLeft, {
      headers: { 'Content-Type': files.faceLeft.type || 'image/jpeg' }
    }))
  }
  if (files.faceRight && urls.face_right) {
    uploadPromises.push(axios.put(urls.face_right, files.faceRight, {
      headers: { 'Content-Type': files.faceRight.type || 'image/jpeg' }
    }))
  }

  if (uploadPromises.length > 0) {
    await Promise.all(uploadPromises)
  }

  // 3. Gọi API confirm để backend lưu database và cập nhật face_external_id
  const confirmRes = await axiosInstance.post(`/workers/${id}/avatar/confirm`, {
    folder_name
  })
  return confirmRes.data
}

export async function deleteWorker(id: string): Promise<WorkerApiItem> {
  const response = await axiosInstance.delete(`/workers/${id}`)
  return response.data
}

// ─── Course-Worker Assignment ───────────────────────────────────────────────

export async function assignCourseToWorkers(courseId: string, workerIds: string[]): Promise<any> {
  const response = await axiosInstance.post(`/courses/${courseId}/workers`, workerIds)
  return response.data
}

export async function revokeCourseFromWorkers(courseId: string, workerIds: string[]): Promise<any> {
  const response = await axiosInstance.delete(`/courses/${courseId}/workers`, {
    data: workerIds
  })
  return response.data
}

export async function fetchCourseWorkers(courseId: string): Promise<WorkerApiItem[]> {
  const response = await axiosInstance.get(`/courses/${courseId}/workers`)
  return response.data
}

export async function downloadWorkersTemplate(): Promise<Blob> {
  const response = await axiosInstance.get('/workers/template', {
    responseType: 'blob'
  })
  return response.data
}

export async function exportWorkers(): Promise<Blob> {
  const response = await axiosInstance.get('/workers/export', {
    responseType: 'blob'
  })
  return response.data
}

export interface ImportWorkersDetail {
  row: number
  name: string
  cccd: string
  status: 'success' | 'skipped' | 'failed'
  reason?: string
}

export interface ImportWorkersResponse {
  total: number
  success: number
  skipped: number
  failed: number
  details: ImportWorkersDetail[]
}

export async function importWorkersZip(file: File): Promise<ImportWorkersResponse> {
  const form = new FormData()
  form.append('file', file)
  const response = await axiosInstance.post('/workers/import', form, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return response.data
}

