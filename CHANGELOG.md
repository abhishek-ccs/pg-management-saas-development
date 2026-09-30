# StayNest SaaS — Enterprise Upgrade & Final Launch Changelog

All notable changes, bug fixes, security enhancements, and production launch features delivered on branch `feature/enterprise-upgrade-and-reset`.

---

## [1.0.0-enterprise] — 2026-09-30

### 1. Support Email Architecture
- **Single Source of Truth**: Replaced hardcoded and disparate contact emails across the repository with canonical `getstaynest@gmail.com` driven by `process.env.NEXT_PUBLIC_SUPPORT_EMAIL`.
- **Centralized Helper**: Created [lib/constants.ts](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/lib/constants.ts) defining `SUPPORT_EMAIL` and `getMailtoSupport(subject, body)` URL generator.
- **Ubiquitous Propagation**: Updated all public footers, contact blocks, FAQ sections, Terms of Service ([app/terms/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/terms/page.tsx)), Privacy Policy ([app/privacy/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/privacy/page.tsx)), Cookie Policy ([app/cookies/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/cookies/page.tsx)), Security documentation ([app/security/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/security/page.tsx)), Error boundaries ([app/error.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/error.tsx), [app/global-error.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/global-error.tsx), [app/not-found.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/not-found.tsx)), Structured Data schemas, and transactional email templates.

### 2. Hindi / English Translation System (Live Reactive i18n)
- **Root Cause Resolution**: Resolved bug where `LocaleSwitcher` only set cookies without triggering React re-renders or consuming dictionaries.
- **React Context Provider**: Built [lib/i18n/context.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/lib/i18n/context.tsx) featuring `I18nProvider`, `useI18n()`, and `useTranslation()`.
- **Zero-Reload Instant Switching**: Switching between English and हिन्दी updates the UI state instantly, updates `<html lang="hi|en">`, persists to cookies & `localStorage`, and updates the user's `preferred_language` in their Supabase profile.
- **Natural Hindi Translations**: Complete domain dictionaries in [lib/i18n/dictionaries/hi.ts](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/lib/i18n/dictionaries/hi.ts) and [lib/i18n/dictionaries/en.ts](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/lib/i18n/dictionaries/en.ts) tailored specifically for Indian PG owners.
- **Devanagari Typography**: Configured [app/globals.css](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/globals.css) with font-family stacks supporting `Noto Sans Devanagari` and Indian numerical rendering.

### 3. Canonical Pricing Engine & Yearly Default
- **Single Source of Truth**: Created [lib/pricing.ts](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/lib/pricing.ts) establishing canonical pricing:
  - **Monthly Plan**: ₹1,699 / month
  - **Yearly Plan**: ₹14,999 / year (Save 26%, equivalent to ₹1,250 / month)
  - **Free Trial**: ₹0 for 7 days
- **Yearly as Default**: Configured landing page ([app/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/page.tsx)) and dashboard upgrade modal ([app/dashboard/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/dashboard/page.tsx)) to default to Yearly billing with dynamic badge: *"Save 26% (₹5,389/yr)"*.

### 4. Rent & Payment Control (Full Owner Authority)
- **Edit Any Payment**: Added full payment modification modal allowing owners to adjust amount, payment method, payment type, payment date/time, covered billing month, and transaction notes.
- **Soft Deletion & Audit Trail**: Implemented `deleted_at` timestamp across `payments` and `tenants`. Payments and tenants are soft-deleted to maintain strict ledger integrity.
- **5-Second Floating Undo Toast**: Introduced instant undo countdown toast following any deletion. If clicked, records are restored immediately without reloading.
- **Deleted Records Recovery Tab**: Dedicated dashboard view listing soft-deleted payments and resident records with 1-click restore functionality.
- **Database RPCs**: Added PostgreSQL functions `soft_delete_payment`, `restore_payment`, `soft_delete_tenant`, `restore_tenant` with automated audit logging to `audit_logs`.

### 5. Payment Datetime & Rent Due Dates
- **Exact Timestamps in Owner Timezone**: Formatted all payment receipts and ledger entries with exact 12-hour AM/PM timestamps in IST (`Asia/Kolkata`) via `Intl.DateTimeFormat`.
- **Configurable Rent Due Day**: Added `rent_due_day` (1st - 31st of each month) to resident profiles, onboarding modal, and edit forms.
- **Real-Time Status Badges**: Integrated `calculateRentDueStatus()` providing real-time color-coded badges:
  - *Paid On Time* (Green)
  - *Due Today* (Amber)
  - *Due in X days* (Warm Gray)
  - *Overdue by X days* (Light Red)
  - *Overdue > 1 month* (Bold Red)
- **Overdue Rent Filter**: 1-click filter pill in the resident directory displaying only residents with overdue balances.
- **1-Click WhatsApp & SMS Reminders**: Automated pre-filled payment reminder generator formatting Indian mobile numbers to E.164 (`+91`) with personalized messages containing tenant name, due amount, and due date.

### 6. Dual Super Admin (Co-Founder) Governance
- **Zero Hardcoding**: Decoupled founder email addresses from SQL schemas and code. All super admin privileges are driven dynamically by `process.env.SUPER_ADMIN_EMAILS`.
- **Co-Founders Configured**:
  - `abhishekrawat67320@gmail.com`
  - `sharmavn258@gmail.com`
- **Idempotent Bootstrap Script**: Updated [scripts/bootstrap-super-admin.mjs](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/scripts/bootstrap-super-admin.mjs) reading `SUPER_ADMIN_BOOTSTRAP_PASSWORD` and provisioning initial admin accounts with `must_change_password = true` and `mfa_enrolled = false`.
- **First-Login Security Barrier**: Built [app/admin/setup-security/page.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/app/admin/setup-security/page.tsx) requiring founders to set a new 12+ character complex password and enroll in TOTP Multi-Factor Authentication before accessing `/admin`.

### 7. Super Admin Management Powers
- **Customer Control Console**: Created [components/admin/AdminCustomerControls.tsx](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/components/admin/AdminCustomerControls.tsx) supporting search, filtering, and pagination.
- **Direct Plan Modification**: Super admins can manually assign trial, monthly, or yearly plans to any customer.
- **Account Suspension & Deletion**: Safeguarded deletion requiring typing the customer's email or `DELETE ACCOUNT`.
- **Founder Deletion Immunity**: Enforced at both the database trigger level (`trg_protect_super_admin`) and server API level to prevent accidental deletion of co-founder accounts.
- **Audit Logs & CSV Export**: Real-time admin audit stream with 1-click CSV download.

### 8. Database Fresh Start & Reset Routine
- **Automated Script**: Created [scripts/reset-database.mjs](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/scripts/reset-database.mjs) taking `--confirm-project=<ref>` and optional `--dry-run`.
- **Automated Pre-Deletion Backup**: Archives all database tables to `backups/backup-<timestamp>.json` before executing any deletions.
- **Documentation**: Comprehensive operational instructions documented in [docs/RESET.md](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/docs/RESET.md).

### 9. Automated Testing & Verification
- **Automated Test Suite**: Expanded [scripts/unit-tests.test.mjs](file:///c:/Users/abhis/Desktop/pg%20ide/pg-management-saas-development/scripts/unit-tests.test.mjs) testing pricing calculations, overdue status logic, support email generation, rate limiting, and accounting reconciliation. All 6 tests passing.
- **Clean Type Checking**: Zero errors with `npx tsc --noEmit`.
- **Clean Production Build**: Successfully compiled Next.js production build (`npm run build`).
