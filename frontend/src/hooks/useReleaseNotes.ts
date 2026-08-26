import { useEffect, useState } from 'react'

/** A single GitHub release, trimmed to what the release-notes modal needs. */
export interface ReleaseNote {
  tagName: string
  name: string | null
  body: string | null
  htmlUrl: string
}

interface ReleaseNotesInfo {
  releases: ReleaseNote[]
  loading: boolean
  error: boolean
}

const REPO = 'andreas13xxx/Slatebase'
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=5`

/**
 * Fetches the most recent GitHub releases (including their Markdown release
 * notes body) for display in the "Show release notes" command. Only fetches
 * while `active` is true, so opening the app doesn't hit GitHub's API on
 * every load for a feature most sessions never open — mirrors useVersionInfo's
 * fetch pattern (timeout + silent failure) but is lazy.
 */
export function useReleaseNotes(active: boolean): ReleaseNotesInfo {
  const [info, setInfo] = useState<ReleaseNotesInfo>({ releases: [], loading: true, error: false })

  useEffect(() => {
    if (!active) return

    let cancelled = false

    async function load() {
      setInfo({ releases: [], loading: true, error: false })
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(RELEASES_URL, {
          signal: controller.signal,
          headers: { 'Accept': 'application/vnd.github.v3+json' },
        })
        clearTimeout(timeoutId)
        if (!res.ok) throw new Error(`GitHub API responded ${res.status}`)

        const data = await res.json() as Array<{
          tag_name: string
          name: string | null
          body: string | null
          html_url: string
        }>

        if (!cancelled) {
          setInfo({
            releases: data.map((r) => ({ tagName: r.tag_name, name: r.name, body: r.body, htmlUrl: r.html_url })),
            loading: false,
            error: false,
          })
        }
      } catch {
        if (!cancelled) setInfo({ releases: [], loading: false, error: true })
      }
    }

    void load()
    return () => { cancelled = true }
  }, [active])

  return info
}
