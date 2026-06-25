import type { CourseRecord, TrainingAttendee, TrainingEvent } from '../components/TrainingEventTable'

function resolveCourseRecord(attendee: TrainingAttendee, record?: CourseRecord): CourseRecord | undefined {
  if (record) return record
  const [dd, mm] = attendee.courseDate.split('/')
  const isoDate = `2026-${mm}-${dd}`
  return attendee.courseHistory.find(
    r => r.courseName === attendee.currentCourse && r.sessionDate === isoDate,
  )
}

function playbackTimestamp(rec: CourseRecord): string {
  const firstIn = rec.sessions[0]?.in ?? rec.startTime
  return `${rec.sessionDate}T${firstIn}:00`
}

/** Build playback payload from attendee + course record — single source for Sự kiện listing. */
export function buildTrainingPlaybackEvent(
  attendee: TrainingAttendee,
  record?: CourseRecord,
): TrainingEvent | null {
  const rec = resolveCourseRecord(attendee, record)
  if (!rec) return null

  return {
    id: `${attendee.id}-${rec.id}`,
    time: playbackTimestamp(rec),
    workerName: attendee.name,
    workerCode: attendee.employeeCode,
    contractor: attendee.company,
    companyCode: attendee.companyCode,
    role: attendee.role,
    course: rec.courseName,
    type: rec.status,
    status: 'pending',
    courseRecord: rec,
  }
}

/** Build playback payload from a history row (contractor / student detail). */
export function buildTrainingPlaybackEventFromRecord(
  record: CourseRecord,
  worker: Pick<TrainingAttendee, 'id' | 'name' | 'employeeCode' | 'company' | 'companyCode' | 'role'>,
): TrainingEvent {
  return {
    id: `${worker.id}-${record.id}`,
    time: playbackTimestamp(record),
    workerName: worker.name,
    workerCode: worker.employeeCode,
    contractor: worker.company,
    companyCode: worker.companyCode,
    role: worker.role,
    course: record.courseName,
    type: record.status,
    status: 'pending',
    courseRecord: record,
  }
}
