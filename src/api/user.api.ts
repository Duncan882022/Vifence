import axiosInstance from "@/utils/axios";

export interface RoleApiItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserApiItem {
  id: string;
  username: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  roleId: string | null;
  role: RoleApiItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: { total: number; offset: number; limit: number; next: boolean };
}

export interface UserCreatePayload {
  username: string;
  fullName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  password?: string;
  roleId?: string | null;
}

export interface UserUpdatePayload {
  fullName?: string;
  email?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  password?: string | null;
  roleId?: string | null;
}

export async function fetchUsers(params?: {
  search?: string;
  offset?: number;
  limit?: number;
  role_id?: string;
}): Promise<PaginatedResponse<UserApiItem>> {
  const response = await axiosInstance.get("/users", { params });
  return response.data;
}

export async function fetchUser(id: string): Promise<UserApiItem> {
  const response = await axiosInstance.get(`/users/${id}`);
  return response.data;
}

export async function createUser(payload: UserCreatePayload): Promise<UserApiItem> {
  const response = await axiosInstance.post("/users", payload);
  return response.data;
}

export async function updateUser(
  id: string,
  payload: UserUpdatePayload,
): Promise<UserApiItem> {
  const response = await axiosInstance.patch(`/users/${id}`, payload);
  return response.data;
}

export async function deleteUser(id: string): Promise<UserApiItem> {
  const response = await axiosInstance.delete(`/users/${id}`);
  return response.data;
}

export async function fetchRoles(params?: {
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<PaginatedResponse<RoleApiItem>> {
  const response = await axiosInstance.get("/roles", { params });
  return response.data;
}

export async function createRole(payload: { name: string; code: string }): Promise<RoleApiItem> {
  const response = await axiosInstance.post("/roles", payload);
  return response.data;
}

export async function updateRole(
  id: string,
  payload: { name?: string; code?: string },
): Promise<RoleApiItem> {
  const response = await axiosInstance.patch(`/roles/${id}`, payload);
  return response.data;
}

export async function deleteRole(id: string): Promise<RoleApiItem> {
  const response = await axiosInstance.delete(`/roles/${id}`);
  return response.data;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<{ message: string }> {
  const response = await axiosInstance.put("/auth/password", payload);
  return response.data;
}
