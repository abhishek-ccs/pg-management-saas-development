import React from 'react'

export interface StayBookLogoProps {
  className?: string
  iconSize?: number
  showSubtitle?: boolean
  subtitleText?: string
  layout?: 'horizontal' | 'vertical'
  theme?: 'dark' | 'light' | 'inherit'
}

export type BaseraBookLogoProps = StayBookLogoProps

/**
 * BaseraBook Brand Logo
 * Matches the reference image soft-luxury design:
 * - Circular outline badge with minimal architectural property/house line art
 * - Elegant serif 'BaseraBook' wordmark
 * - Tracked uppercase 'PROPERTY MANAGEMENT' subtitle or brand tagline
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
      role="img"
      aria-label="BaseraBook Property Management Software Logo"
    >
      <title>BaseraBook Property Management Software Logo</title>
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

export const BaseraBookIcon = StayBookIcon

export function StayBookLogo({
  className = '',
  iconSize = 38,
  showSubtitle = true,
  subtitleText = 'Your Property. Smartly Managed.',
  layout = 'horizontal',
}: StayBookLogoProps) {
  if (layout === 'vertical') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <StayBookIcon size={iconSize} />
        <div className="mt-2.5 flex flex-col items-center justify-center">
          <span className="block font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#2C221E] leading-tight">
            BaseraBook
          </span>
          {showSubtitle && (
            <span className="mt-1 block font-sans text-[10.5px] sm:text-[12px] font-medium text-[#8C6847] leading-tight tracking-normal">
              {subtitleText}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 ${className}`}>
      <StayBookIcon size={iconSize} />
      <div className="flex flex-col text-left leading-tight">
        <span className="font-serif text-[17px] sm:text-[19px] font-bold tracking-tight text-[#2C221E] leading-none">
          BaseraBook
        </span>
        {showSubtitle && (
          <span className="mt-1 font-sans text-[9.5px] sm:text-[11px] font-medium text-[#8C6847] tracking-normal leading-none whitespace-nowrap">
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  )
}

export const BaseraBookLogo = StayBookLogo

export default StayBookLogo
