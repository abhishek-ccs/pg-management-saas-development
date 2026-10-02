import { AlertTriangle } from 'lucide-react'

export function LegalNoticeHeader() {
  return (
    <div className="mb-8 rounded-2xl border-2 border-[#f59e0b] bg-[#fffbeb] p-5 shadow-xs text-xs text-[#92400e]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 shrink-0 text-[#f59e0b] mt-0.5" />
        <div>
          <p className="font-bold tracking-wide uppercase text-[11px] text-[#b45309]">
            Legal Document Template · Status: Needs Final Lawyer Review
          </p>
          <p className="mt-1 leading-5 text-[#92400e]">
            This document is a standardized B2B SaaS legal framework prepared for StayBook compliant with the
            Digital Personal Data Protection (DPDP) Act 2023 (India) and the General Data Protection Regulation (GDPR).
            It must be reviewed and customized by your designated legal counsel prior to commercial enforcement.
          </p>
        </div>
      </div>
    </div>
  )
}
