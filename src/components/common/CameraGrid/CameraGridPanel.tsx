/**
 * CameraGrid — panel camera dùng chung CMS (Module 02/03/05).
 * Implementation hiện tại từ Module 02; re-export để module khác không import dao-tao.
 */
export {
  TrainingCameraPanel as CameraGridPanel,
} from '@/modules/module02-training/components/TrainingCameraPanel'

export type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
