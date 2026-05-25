/**
 * Slatebase SVG logo component.
 * Renders the stylized database-stack icon used in sidebar and login page.
 */
export function SlatebaseLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="#6d28d9" />
      <ellipse cx="16" cy="11" rx="8" ry="3" fill="white" opacity="0.9" />
      <path d="M8 11v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" fill="#a78bfa" />
      <path d="M8 15v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4" fill="#7c3aed" />
      <ellipse cx="16" cy="11" rx="8" ry="3" fill="none" stroke="white" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}
