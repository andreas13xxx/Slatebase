/**
 * Device detection behind Obsidian's `Platform` API.
 *
 * Obsidian ships as a desktop (Electron) and a mobile app, so its `Platform`
 * flags are effectively build constants. Slatebase is a web app: the same build
 * runs on a laptop and on a phone browser, so the flags have to be derived at
 * runtime. They used to be hardcoded to desktop, which told every plugin it had
 * a mouse and a wide window even when it was running on a phone.
 *
 * Two deliberate choices:
 *
 * - `isDesktopApp`, `isMobileApp`, `isIosApp` and `isAndroidApp` are always
 *   false. Those mean "running inside the native Obsidian app", which a browser
 *   never is. Reporting false is the honest answer, not a missing feature.
 *
 * - Phone/tablet is decided from the *device screen* and touch capability, not
 *   the window size. Obsidian's flags describe the device, and resizing a
 *   desktop browser window must not make plugins think they moved to a phone.
 *
 * @module platform-detection
 */

/** The inputs detection depends on, injectable so the logic stays testable. */
export interface PlatformEnvironment {
  userAgent: string
  /** `navigator.maxTouchPoints`; > 1 also disambiguates iPadOS from macOS. */
  maxTouchPoints: number
  /** Whether `(pointer: coarse)` matches — a touch-first input device. */
  coarsePointer: boolean
  /** Physical screen size, not the window. */
  screenWidth: number
  screenHeight: number
}

/** Obsidian's `Platform` shape. */
export interface ObsidianPlatform {
  isMobile: boolean
  isPhone: boolean
  isTablet: boolean
  isDesktop: boolean
  isDesktopApp: boolean
  isMobileApp: boolean
  isIosApp: boolean
  isAndroidApp: boolean
  isMacOS: boolean
  isWin: boolean
  isLinux: boolean
  isIosOS: boolean
  isAndroidOS: boolean
  isSafari: boolean
}

/** Largest short-side, in CSS px, still treated as a phone rather than a tablet. */
const PHONE_MAX_SHORT_SIDE = 600

/**
 * Derive Obsidian's Platform flags from a device description.
 *
 * Exported separately from {@link readPlatformEnvironment} so the heuristics can
 * be tested against known devices without touching globals.
 */
export function detectPlatform(env: PlatformEnvironment): ObsidianPlatform {
  const ua = env.userAgent

  const isAndroidOS = /Android/i.test(ua)
  // iPadOS 13+ reports a desktop Safari user agent; multi-touch is what gives
  // it away, since no Mac reports more than one touch point.
  const isIpadOS = /Macintosh/.test(ua) && env.maxTouchPoints > 1
  const isIosOS = /iPhone|iPad|iPod/i.test(ua) || isIpadOS

  const touchCapable = env.maxTouchPoints > 0 || env.coarsePointer
  const shortSide = Math.min(env.screenWidth, env.screenHeight)

  let isPhone: boolean
  let isTablet: boolean

  if (isIosOS) {
    isPhone = /iPhone|iPod/i.test(ua)
    isTablet = !isPhone
  } else if (isAndroidOS) {
    // Android convention: phone browsers put "Mobile" in the UA, tablets omit it.
    isPhone = /Mobile/i.test(ua)
    isTablet = !isPhone
  } else if (touchCapable) {
    // Some other touch device — fall back to screen size.
    isPhone = shortSide > 0 && shortSide <= PHONE_MAX_SHORT_SIDE
    isTablet = !isPhone
  } else {
    isPhone = false
    isTablet = false
  }

  const isMobile = isPhone || isTablet

  return {
    isMobile,
    isPhone,
    isTablet,
    isDesktop: !isMobile,

    // Always false in a browser: these mean "inside the native Obsidian app".
    isDesktopApp: false,
    isMobileApp: false,
    isIosApp: false,
    isAndroidApp: false,

    // Desktop OS flags stay false on mobile, so a plugin cannot conclude
    // "macOS, therefore desktop" from an iPad reporting a Macintosh UA.
    isMacOS: /Mac/i.test(ua) && !isIosOS,
    isWin: /Win/i.test(ua),
    isLinux: /Linux/i.test(ua) && !isAndroidOS,

    isIosOS,
    isAndroidOS,
    isSafari: /^((?!chrome|android|crios|fxios).)*safari/i.test(ua),
  }
}

/** Read the current environment from the browser globals. */
export function readPlatformEnvironment(): PlatformEnvironment {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
  }
}
