# StayNest — Global Rental & PG Management SaaS

[![CI/CD Quality Gate](https://github.com/abhishek-ccs/pg-management-saas-development/actions/workflows/ci.yml/badge.svg)](https://github.com/abhishek-ccs/pg-management-saas-development/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20RLS-green.svg)](https://supabase.com/)
[![WCAG 2.2 AA](https://img.shields.io/badge/Accessibility-WCAG%202.2%20AA-success.svg)](https://www.w3.org/WAI/standards-guidelines/wcag/)

StayNest is an enterprise-grade, multi-tenant B2B SaaS platform engineered for operators of Paying Guest (PG) facilities, student hostels, co-living spaces, and residential rental properties.

---

## 🏗️ Architecture & Technology Stack

* **Framework:** Next.js 16 (App Router, Server Components, Edge Middleware)
* **Language & Runtime:** TypeScript 5.7 (Strict mode, zero build-error suppression)
* **Database & Auth:** Supabase (PostgreSQL with Row Level Security & cryptographic session isolation)
* **Styling & Design System:** TailwindCSS v4 with OKLCH accessible color tokens
* **Internationalization:** Typed i18n supporting English (`en`) and Hindi (`hi`), multi-currency (`INR`, `USD`, `EUR`, `GBP`), and timezone formatting
* **Compliance:** India Digital Personal Data Protection (DPDP) Act 2023 & EU GDPR
* **Observability:** Sentry error tracking, structured JSON logging, and `/api/health` probes
* **Hosting:** Vercel Edge Network with HSTS preloading and Strict Content Security Policy (CSP)

---

## 🔐 Security & Regulatory Compliance

1. **Row Level Security (RLS) Tenant Isolation:** Every database query executes with `auth.uid() = owner_id`. Cross-tenant data leakage is cryptographically impossible at the PostgreSQL engine level.
2. **Privileged Super-Admin Protection:** Super Admin privileges cannot be assigned via public signups or client mutations. Role changes are protected via database triggers and audited to `platform_audit_logs`.
3. **Enterprise Security Headers:** Full HSTS (2 years), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, and strict CSP whitelisting only authorized gateways (Razorpay, Stripe) and fonts.
4. **Data Portability & Erasure:** Self-service machine-readable data export (`GET /api/user/export`) and GDPR/DPDP compliant account erasure (`POST /api/user/delete-account`).
5. **Edge Rate Limiting:** Sliding-window token bucket algorithm protects authentication and API endpoints against brute force and scraping.

---

## 💰 Financial Ledger & Reconciliation Rules

StayNest operates on double-entry accounting principles:
* **Operating Revenue:** $\sum \text{Rent} + \text{Electricity} + \text{Maintenance Fees}$.
* **Deposit Escrow Liability:** Security deposits are balance-sheet liabilities held in escrow and **strictly isolated from monthly operating revenue**.
* **Advance & Overdue Balancing:** Partial payments decrement pending balances; overpayments roll over into tenant advance credit balances.
* **Non-Destructive Soft Deletes:** Tenant and property deletions use `deleted_at` timestamps to preserve tax and payment receipt audit history.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
* Node.js v20.x or higher
* npm or pnpm (`corepack enable pnpm`)
* A Supabase project with database access

### 2. Installation
```bash
git clone https://github.com/abhishek-ccs/pg-management-saas-development.git
cd pg-management-saas-development
npm install
```

### 3. Environment Setup
Copy the environment template and populate your credentials:
```bash
cp .env.example .env.local
```

### 4. Database Setup
Execute the migrations in sequential order in your Supabase SQL Editor:
1. `supabase/migrations/20260927000001_initial_schema.sql`
2. `supabase/schema.sql`

### 5. Super Admin Bootstrapping (Server CLI)
To bootstrap your verified Super Admin account:
```bash
npm run bootstrap:admin
```

### 6. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Code Quality Gates

StayNest enforces a zero-tolerance policy for broken types, untested money logic, or accessibility regressions:

```bash
# Strict TypeScript Typecheck (0 errors required)
npm run typecheck

# Run Financial Ledger & Money Logic Unit Tests
npm test

# Verify Production Build
npm run build

# Run Playwright E2E & Accessibility Tests
npm run test:e2e

# Execute Disaster Recovery Database Snapshot
npm run backup
```

---

## 📋 Launch Runbook & Operational Checklist

For go/no-go acceptance criteria, emergency rollback runbooks, and domain/KYC setup instructions, refer to:
* **[docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)**

---

## 📄 License & Legal Notice

Copyright &copy; 2026 StayNest Technologies. All rights reserved.  
Legal documents located in `/terms`, `/privacy`, `/cookies`, and `/security` are operational templates marked for designated legal counsel review before public launch.
