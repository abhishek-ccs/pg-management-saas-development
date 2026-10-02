import React from 'react'

interface StayBookLogoProps {
  className?: string
  iconSize?: number
  showSubtitle?: boolean
  subtitleText?: string
  layout?: 'horizontal' | 'vertical'
  theme?: 'dark' | 'light' | 'inherit'
}

/**
 * StayBook Brand Logo
 * Matches the reference image soft-luxury design:
 * - Circular outline badge with minimal architectural property/house line art
 * - Elegant serif 'StayBook' wordmark
 * - Tracked uppercase 'PROPERTY MANAGEMENT' subtitle
 */
export function StayBookIcon({
  size = 40,
  className = '',
  strokeColor = '#8B5A2B',
  badgeBg = '#FAF6F0',
}: {
  size?: number
  className?: string
  strokeColor?: string
  badgeBg?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Outer circular badge */}
      <circle
        cx="24"
        cy="24"
        r="22"
        fill={badgeBg}
        stroke={strokeColor}
        strokeWidth="1.5"
      />

      {/* Chimney on the main house */}
      <path
        d="M30 17.5V14H32.5V19.5"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main tall house pitched roof */}
      <path
        d="M17 24L26.5 15L36 24"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main house walls */}
      <path
        d="M20 23.5V33H33V23.5"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left overlapping house pitched roof */}
      <path
        d="M11 27.5L16.5 22.5L21 26.5"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left house wall */}
      <path
        d="M13.5 26.5V33"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Minimal door / window arch in main house */}
      <path
        d="M24.5 33V27.5C24.5 26.6716 25.1716 26 26 26H27C27.8284 26 28.5 26.6716 28.5 27.5V33"
        stroke={strokeColor}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Architectural base ground line */}
      <path
        d="M11 33H36"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function StayBookLogo({
  className = '',
  iconSize = 38,
  showSubtitle = true,
  subtitleText = 'PROPERTY MANAGEMENT',
  layout = 'horizontal',
}: StayBookLogoProps) {
  if (layout === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <StayBookIcon size={iconSize} />
        <div className="mt-2.5">
          <span className="block font-serif text-xl font-bold tracking-tight text-[#2C221E]">
            StayBook
          </span>
          {showSubtitle && (
            <span className="block font-sans text-[8.5px] font-semibold uppercase tracking-[0.22em] text-[#8C6847]">
              {subtitleText}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <StayBookIcon size={iconSize} />
      <div className="flex flex-col leading-none">
        <span className="font-serif text-[17px] font-bold tracking-tight text-[#2C221E]">
          StayBook
        </span>
        {showSubtitle && (
          <span className="mt-1 font-sans text-[8px] font-semibold uppercase tracking-[0.22em] text-[#8C6847]">
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  )
}

export default StayBookLogo
