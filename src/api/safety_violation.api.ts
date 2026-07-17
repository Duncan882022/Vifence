import axiosInstance from '@/utils/axios'

export interface ApiSafetyViolation {
  id: string
  type: string
  severity: string
  description: string
  workerId?: string
  location: string
  cameraId?: string
  thumbnailId?: string
  videoId?: string
  status: string
  notes?: string
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
  worker?: {
    id: string
    name: string
    phone?: string
    email?: string
    faceFrontUrl?: string
    faceLeftUrl?: string
    faceRightUrl?: string
    contractor?: {
      id: string
      name: string
      code?: string
    }
  }
  resolver?: {
    id: string
    username: string
  }
}

export interface GetSafetyViolationsResponse {
  items: ApiSafetyViolation[]
  meta: {
    total: number
    offset: number
    limit: number
    next: boolean
  }
}

export const safetyViolationApi = {
  getViolations: async (params?: any): Promise<GetSafetyViolationsResponse> => {
    const response = await axiosInstance.get('/safety-violations', { params })
    return response.data
  }
}
