import { describe, it, expect } from 'vitest'
import { detectPlatform, type PlatformEnvironment } from './platform-detection'

/** Real user-agent strings, so the heuristics are pinned to actual devices. */
const UA = {
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
} as const

const desktop = (userAgent: string): PlatformEnvironment => ({
  userAgent,
  maxTouchPoints: 0,
  coarsePointer: false,
  screenWidth: 1920,
  screenHeight: 1080,
})

const touch = (
  userAgent: string,
  screenWidth: number,
  screenHeight: number,
  maxTouchPoints = 5,
): PlatformEnvironment => ({
  userAgent,
  maxTouchPoints,
  coarsePointer: true,
  screenWidth,
  screenHeight,
})

describe('detectPlatform', () => {
  describe('desktop browsers', () => {
    it.each([
      ['macOS', UA.macChrome],
      ['Windows', UA.windows],
      ['Linux', UA.linux],
    ])('reports %s as desktop, not mobile', (_name, ua) => {
      const p = detectPlatform(desktop(ua))

      expect(p.isDesktop).toBe(true)
      expect(p.isMobile).toBe(false)
      expect(p.isPhone).toBe(false)
      expect(p.isTablet).toBe(false)
    })

    it.each([
      ['isMacOS', UA.macChrome, 'isMacOS'],
      ['isWin', UA.windows, 'isWin'],
      ['isLinux', UA.linux, 'isLinux'],
    ] as const)('sets %s for the matching OS', (_name, ua, flag) => {
      expect(detectPlatform(desktop(ua))[flag]).toBe(true)
    })

    it('detects Safari but not Chrome as Safari', () => {
      expect(detectPlatform(desktop(UA.macSafari)).isSafari).toBe(true)
      expect(detectPlatform(desktop(UA.macChrome)).isSafari).toBe(false)
    })
  })

  describe('phones', () => {
    it('detects an iPhone', () => {
      const p = detectPlatform(touch(UA.iphone, 393, 852))

      expect(p).toMatchObject({ isPhone: true, isTablet: false, isMobile: true, isDesktop: false })
      expect(p.isIosOS).toBe(true)
    })

    it('detects an Android phone by the "Mobile" token', () => {
      const p = detectPlatform(touch(UA.androidPhone, 412, 915))

      expect(p).toMatchObject({ isPhone: true, isTablet: false, isMobile: true })
      expect(p.isAndroidOS).toBe(true)
    })

    it('does not report an Android phone as Linux', () => {
      // The Android UA contains "Linux"; a plugin branching on isLinux would
      // otherwise take the desktop path.
      expect(detectPlatform(touch(UA.androidPhone, 412, 915)).isLinux).toBe(false)
    })
  })

  describe('tablets', () => {
    it('detects a legacy iPad UA', () => {
      const p = detectPlatform(touch(UA.ipadLegacy, 820, 1180))

      expect(p).toMatchObject({ isTablet: true, isPhone: false, isMobile: true, isDesktop: false })
    })

    it('detects an Android tablet by the absent "Mobile" token', () => {
      const p = detectPlatform(touch(UA.androidTablet, 800, 1280))

      expect(p).toMatchObject({ isTablet: true, isPhone: false, isMobile: true })
    })

    describe('iPadOS 13+, which reports a desktop Safari user agent', () => {
      const ipadOS = touch(UA.macSafari, 820, 1180, 5)

      it('is detected as a tablet despite the Macintosh UA', () => {
        expect(detectPlatform(ipadOS)).toMatchObject({ isTablet: true, isMobile: true })
      })

      it('is not reported as macOS, so plugins cannot infer desktop from it', () => {
        expect(detectPlatform(ipadOS).isMacOS).toBe(false)
      })

      it('is distinguished from a real Mac by touch points alone', () => {
        // Same user agent, no touch — a genuine Mac.
        const realMac = { ...ipadOS, maxTouchPoints: 0, coarsePointer: false }

        expect(detectPlatform(realMac)).toMatchObject({ isMacOS: true, isDesktop: true })
      })
    })
  })

  describe('unknown touch devices fall back to screen size', () => {
    const unknownUA = 'Mozilla/5.0 (Unknown) AppleWebKit/537.36 Chrome/120.0.0.0'

    it('treats a small screen as a phone', () => {
      expect(detectPlatform(touch(unknownUA, 400, 800)).isPhone).toBe(true)
    })

    it('treats a large screen as a tablet', () => {
      expect(detectPlatform(touch(unknownUA, 1024, 1366)).isTablet).toBe(true)
    })

    it('uses the short side, so orientation does not change the verdict', () => {
      const portrait = detectPlatform(touch(unknownUA, 400, 800))
      const landscape = detectPlatform(touch(unknownUA, 800, 400))

      expect(landscape.isPhone).toBe(portrait.isPhone)
    })
  })

  describe('native-app flags are always false in a browser', () => {
    it.each([
      ['isDesktopApp', UA.macChrome],
      ['isMobileApp', UA.iphone],
      ['isIosApp', UA.iphone],
      ['isAndroidApp', UA.androidPhone],
    ] as const)('%s is false', (flag, ua) => {
      const env = ua === UA.macChrome ? desktop(ua) : touch(ua, 400, 800)

      expect(detectPlatform(env)[flag]).toBe(false)
    })
  })

  describe('invariants', () => {
    it.each([
      ['desktop', desktop(UA.macChrome)],
      ['iphone', touch(UA.iphone, 393, 852)],
      ['android tablet', touch(UA.androidTablet, 800, 1280)],
    ])('isDesktop is the negation of isMobile on %s', (_name, env) => {
      const p = detectPlatform(env)

      expect(p.isDesktop).toBe(!p.isMobile)
      expect(p.isMobile).toBe(p.isPhone || p.isTablet)
    })

    it('never reports phone and tablet at the same time', () => {
      for (const env of [desktop(UA.windows), touch(UA.iphone, 393, 852), touch(UA.androidTablet, 800, 1280)]) {
        const p = detectPlatform(env)
        expect(p.isPhone && p.isTablet).toBe(false)
      }
    })
  })
})
