export const APP_VERSION = "1.1.7";

/** Default landing route after sign-in and for `/` */
export const DEFAULT_HOME_PATH = "/dttt";

/** Vision API — auth, cameras, courses, events, records */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://api_vision.bosky.vn/api/v1";

/** MinIO / media CDN for video & thumbnails */
export const MEDIA_BASE_URL =
  import.meta.env.VITE_MEDIA_BASE_URL || "http://157.66.100.182:9000";
