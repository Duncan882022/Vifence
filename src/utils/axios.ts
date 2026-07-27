import axios from 'axios';
import { API_BASE_URL } from '@/config';
import { IS_DEMO_AUTH } from '@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service';

export function logout() {
  if (IS_DEMO_AUTH) return

  localStorage.removeItem('vifence_access_token');
  localStorage.removeItem('vifence_refresh_token');
  localStorage.removeItem('vifence_user');
  
  const path = window.location.pathname;
  if (!path.endsWith('/signin')) {
    const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '';
    window.location.href = `${window.location.origin}${basename}/signin`;
  }
}

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

axiosInstance.interceptors.request.use(
  async (config) => {
    if (IS_DEMO_AUTH) return config

    // Skip token validation for signin and refresh endpoints
    if (config.url?.includes('/auth/signin') || config.url?.includes('/auth/refresh')) {
      return config;
    }

    const token = localStorage.getItem('vifence_access_token');

    // 1. Check if token exists
    if (!token) {
      logout();
      return Promise.reject(new axios.Cancel('No access token, redirecting to signin...'));
    }

    // Attach token to headers
    config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for catching unexpected 401s
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (IS_DEMO_AUTH) return Promise.reject(error)

    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/signin') || originalRequest.url?.includes('/auth/refresh')) {
        return Promise.reject(error);
      }
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('vifence_refresh_token');
      if (!refreshToken) {
        logout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            axiosInstance(originalRequest).then(resolve).catch(reject);
          });
        });
      }

      isRefreshing = true;
      try {
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, {
          headers: { Authorization: `Bearer ${refreshToken}` },
        });
        const { accessToken: newAccessToken, refreshToken: newRefreshToken, user: refreshedUser } = res.data;

        localStorage.setItem('vifence_access_token', newAccessToken);
        localStorage.setItem('vifence_refresh_token', newRefreshToken);
        if (refreshedUser) {
          localStorage.setItem('vifence_user', JSON.stringify(refreshedUser));
        }

        isRefreshing = false;
        onRefreshed(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
