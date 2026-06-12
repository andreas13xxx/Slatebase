import { useEffect, useState } from 'react'
import { compareSemver } from '../utils/semver'

interface VersionInfo {
  installed: string | null
  latest: string | null
  latestUrl: string | null
  loading: boolean
}

/**
 * Lightweight hook that fetches the installed version and checks for updates.
 * Designed for the sidebar version badge (visible to all users).
 */
export function useVersionInfo(): VersionInfo {
  const [info, setInfo] = useState<VersionInfo>({
    installed: null,
    latest: null,
    latestUrl: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function check() {
      let installed: string | null = null

      try {
        const res = await fetch('/api/v1/version')
        if (res.ok) {
          const data = await res.json() as { version?: string }
          installed = data.version ?? null
        }
      } catch {
        // Backend unreachable — leave as null
      }

      let latest: string | null = null
      let latestUrl: string | null = null

      // Only check GitHub if we have a real version (not 'development')
      if (installed && installed !== 'development') {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)
          const ghRes = await fetch(
            'https://api.github.com/repos/andreas13xxx/Slatebase/releases/latest',
            { signal: controller.signal, headers: { 'Accept': 'application/vnd.github.v3+json' } }
          )
          clearTimeout(timeoutId)
          if (ghRes.ok) {
            const release = await ghRes.json() as { tag_name?: string; html_url?: string }
            if (release.tag_name) {
              const ver = release.tag_name.startsWith('v') ? release.tag_name.slice(1) : release.tag_name
              // Only show as "latest" if it's actually newer
              if (compareSemver(installed, ver) < 0) {
                latest = ver
                latestUrl = release.html_url ?? null
              }
            }
          }
        } catch {
          // GitHub unreachable — no update info
        }
      }

      if (!cancelled) {
        setInfo({ installed, latest, latestUrl, loading: false })
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check()
    return () => { cancelled = true }
  }, [])

  return info
}
