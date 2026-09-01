/**
 * PWA shell cho /phat-song — full màn, ít chrome Safari (vẫn cần tab foreground).
 */
import { useEffect } from 'react'

function upsertMeta(name: string, content: string, property = false): void {
  const attr = property ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertLink(rel: string, href: string): void {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

export function usePublisherPwa(): void {
  useEffect(() => {
    const base = import.meta.env.BASE_URL
    document.title = 'Vifence · Phát sóng'

    upsertLink('manifest', `${base}publisher.webmanifest`)
    upsertMeta('apple-mobile-web-app-capable', 'yes')
    upsertMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
    upsertMeta('apple-mobile-web-app-title', 'Phát sóng')
    upsertMeta('mobile-web-app-capable', 'yes')
    upsertMeta('theme-color', '#0a0f16')

    return () => {
      document.title = 'Vifence CMS'
    }
  }, [])
}
