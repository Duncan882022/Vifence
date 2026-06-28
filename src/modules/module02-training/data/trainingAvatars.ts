export {
  PERSON_AVATAR_FILES,
  getPersonAvatarUrl,
  getPersonAvatarColor,
} from '@/data/personAvatars'

import { getPersonAvatarUrl, PERSON_AVATAR_FILES } from '@/data/personAvatars'

/** @deprecated Dùng PERSON_AVATAR_FILES — giữ tương thích ngược. */
export const ATTENDEE_AVATAR_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(PERSON_AVATAR_FILES).map(([id]) => [id, getPersonAvatarUrl(id)]),
)

export function getAttendeeAvatarUrl(attendeeId: string, name?: string): string {
  return getPersonAvatarUrl(attendeeId, name)
}
