/** §13 RECORD COMMENT — ghi âm qua mic iPad, chuyển giọng nói (tuỳ chọn, nếu trình duyệt hỗ trợ). */

interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function speechCtor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function isSpeechToTextSupported(): boolean {
  return Boolean(speechCtor())
}

export interface VoiceClip {
  blob: Blob
  mime: string
  durationSec: number
  transcript?: string
}

export interface VoiceSession {
  stop: () => Promise<VoiceClip | null>
  cancel: () => void
}

function pickAudioMime(): string | undefined {
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(m => MediaRecorder.isTypeSupported(m))
}

export async function startVoiceComment(withTranscript: boolean): Promise<VoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt không hỗ trợ micro (cần HTTPS)')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mime = pickAudioMime()
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  const startedAt = performance.now()
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start()

  let transcript = ''
  let recognition: SpeechRecognitionLike | null = null
  const Ctor = withTranscript ? speechCtor() : undefined
  if (Ctor) {
    try {
      recognition = new Ctor()
      recognition.lang = 'vi-VN'
      recognition.continuous = true
      recognition.interimResults = false
      recognition.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) transcript += `${e.results[i][0].transcript} `
        }
      }
      recognition.onerror = () => {}
      recognition.start()
    } catch {
      recognition = null
    }
  }

  const release = () => {
    stream.getTracks().forEach(t => t.stop())
    try {
      recognition?.stop()
    } catch { /* đã dừng */ }
  }

  return {
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop: () => new Promise(resolve => {
      recorder.onstop = () => {
        release()
        // SpeechRecognition trả kết quả cuối sau khi stop một nhịp.
        window.setTimeout(() => {
          const type = recorder.mimeType || mime || 'audio/webm'
          resolve(chunks.length
            ? { blob: new Blob(chunks, { type }), mime: type, durationSec: (performance.now() - startedAt) / 1000, transcript: transcript.trim() || undefined }
            : null)
        }, recognition ? 400 : 0)
      }
      recorder.stop()
    }),
  }
}
