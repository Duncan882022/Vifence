import { type PaginatedResponse } from './worker.api'
import axiosInstance from '@/utils/axios'

export interface ContractorApiItem {
  id: string
  name: string
  code: string | null
  phone: string | null
  email: string | null
}

export interface ContractorCreatePayload {
  name: string
  code?: string | null
  phone?: string | null
  email?: string | null
}

export async function fetchContractors(params?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<PaginatedResponse<ContractorApiItem>> {
  const response = await axiosInstance.get('/contractors', { params })
  return response.data
}

export async function createContractor(payload: ContractorCreatePayload): Promise<ContractorApiItem> {
  const response = await axiosInstance.post('/contractors', payload)
  return response.data
}

export async function deleteContractor(id: string): Promise<ContractorApiItem> {
  const response = await axiosInstance.delete(`/contractors/${id}`)
  return response.data
}

