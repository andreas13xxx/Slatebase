import { useEffect, useState } from 'react'
import { fetchReleaseList } from './releaseApi'

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
        const { releases } = await fetchReleaseList()

        if (!cancelled) {
          setInfo({
            releases: releases.map((r) => ({ tagName: r.tagName, name: r.name, body: r.body, htmlUrl: r.htmlUrl })),
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
