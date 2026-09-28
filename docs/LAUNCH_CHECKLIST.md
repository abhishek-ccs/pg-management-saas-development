# StayNest B2B SaaS — Production Launch Checklist & Runbook

**Target Product:** StayNest PG & Rental Property Management SaaS  
**Version:** 1.0.0 (Global Enterprise Edition)  
**Architecture:** Next.js 16 (App Router) + Supabase (PostgreSQL RLS) + Vercel Edge  
**Document Status:** Production Release Candidate  

---

## 1. Go / No-Go Decision Gate Matrix

Before promoting the production deployment to live traffic, all automated quality gates and acceptance criteria must pass without exception:

| Quality Gate | Acceptance Threshold | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **Type Integrity** | **0 errors** (Zero build error suppression) | `npm run typecheck` (`tsc --noEmit`) | ✅ **PASS** |
| **Money & Ledger Tests** | **100% passing** (Deposit liability isolated from revenue) | `npm test` (`scripts/unit-tests.test.mjs`) | ✅ **PASS** |
| **Next.js Production Build** | **Exit code 0** (Clean optimized bundle) | `npm run build` | ✅ **PASS** |
| **Accessibility (WCAG 2.2 AA)** | **0 critical/serious violations** | `@axe-core/playwright` on all pages | ✅ **PASS** |
| **Lighthouse CI** | **$\ge$ 90/100** across Performance, a11y, SEO, Best Practices | `lhci autorun` (`lighthouserc.json`) | ✅ **PASS** |
| **Edge Security Headers** | HSTS, strict CSP, X-Frame-Options: DENY, nosniff | Header inspection via `curl -I` | ✅ **PASS** |
| **Rate Limiter & Abuse Defense** | 429 Too Many Requests on burst abuse | Token bucket edge validation in `middleware.ts` | ✅ **PASS** |
| **Observability Health Check** | HTTP 200, DB latency < 60ms | `GET /api/health` | ✅ **PASS** |
| **Data Privacy Compliance** | Working Data Export (`/api/user/export`) & Account Erasure | Self-service JSON export & deletion endpoints | ✅ **PASS** |

---

## 2. Emergency Rollback & Disaster Recovery Runbook

If critical runtime defects, unexpected gateway failures, or database anomalies occur post-launch, execute the appropriate recovery procedure below:

### A. Vercel Instant Edge Rollback (< 60 Seconds)
1. Open the [Vercel Dashboard](https://vercel.com) and navigate to the **StayNest** project.
2. Under the **Deployments** tab, locate the last verified stable deployment hash prior to release.
3. Click the three dots `...` next to the deployment and select **Instant Rollback**.
4. Vercel instantly routes edge traffic to the previous immutable deployment bundle with zero downtime.

### B. Database Snapshot Recovery (< 15 Minutes)
1. **Supabase Point-in-Time Recovery (PITR)**:
   * Go to Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ Database $\rightarrow$ Backups.
   * Select the exact timestamp prior to the incident (e.g. 5 minutes before the breaking migration/mutation).
   * Click **Restore to point in time**.
2. **Local Snapshot Restoration (CLI)**:
   * If recovering from a cold snapshot generated via `npm run backup`:
     ```bash
     psql -h db.your-project.supabase.co -U postgres -d postgres -f backups/staynest-backup-YYYY-MM-DD.sql
     ```

### C. Emergency Maintenance Mode
If extended investigation is required:
1. In Vercel Project Settings $\rightarrow$ Environment Variables, set `MAINTENANCE_MODE=true`.
2. Redeploy; edge middleware will route all incoming traffic to an accessible 503 Maintenance landing screen while preserving database integrity.

---

## 3. Owner-Only Action Items (Tasks Only You Can Perform)

The following items involve legal authority, external credentials, and commercial agreements that cannot be automated in code:

### 1. Custom Domain & DNS Records
* **Host Provider:** Your domain registrar (e.g. Cloudflare, Namecheap, GoDaddy).
* **Records to Configure:**
  * `A` record `@` $\rightarrow$ `76.76.21.21` (Vercel IP)
  * `CNAME` record `www` $\rightarrow$ `cname.vercel-dns.com`
* **Email Authentication Records:**
  * `TXT` record for SPF: `v=spf1 include:mailgun.org include:resend.com ~all`
  * `CNAME` records for DKIM (provided by Resend / SendGrid)
  * `TXT` record for DMARC: `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@staynest.in`

### 2. Supabase Infrastructure Upgrade & Custom SMTP
* **Plan Upgrade:** Upgrade Supabase project to the **Pro Tier** ($25/mo) to eliminate the free tier 3-emails/hour restriction and pause-after-inactivity rule.
* **Custom SMTP Setup:**
  * Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ Email Settings.
  * Disable "Built-in email service" and toggle on **Custom SMTP Provider**.
  * Enter your Resend / SendGrid SMTP host, port (`587`), username, and API key.
  * Set Sender Email: `noreply@staynest.in` or `notifications@staynest.in`.

### 3. Payment Gateway Live KYC & Webhooks
* **Razorpay (Domestic India Payments — INR / UPI)**:
  1. Complete Business KYC on [Razorpay Dashboard](https://dashboard.razorpay.com).
  2. Switch from Test Mode to **Live Mode**.
  3. Generate Live Key ID and Live Key Secret; add to Vercel: `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`.
  4. In Webhooks tab, add endpoint: `https://staynest.in/api/webhooks/razorpay` and secret `RAZORPAY_WEBHOOK_SECRET`.
* **Stripe (Global Multi-Currency Payments)**:
  1. Complete business activation on [Stripe Dashboard](https://dashboard.stripe.com).
  2. Copy `pk_live_...` and `sk_live_...`; add to Vercel: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` & `STRIPE_SECRET_KEY`.
  3. Configure Webhook endpoint: `https://staynest.in/api/webhooks/stripe` listening for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.

### 4. Sentry Error Tracking Production DSN
1. Create a project at [sentry.io](https://sentry.io).
2. Copy the client and server DSN into Vercel: `NEXT_PUBLIC_SENTRY_DSN` & `SENTRY_DSN`.

### 5. Final Legal Review
* All legal pages ([`/terms`](/terms), [`/privacy`](/privacy), [`/cookies`](/cookies), [`/security`](/security)) are deployed as rigorous templates marked **"Needs Lawyer Review"**.
* Have your corporate legal counsel in India review the Terms of Service and Privacy Policy to verify company entity name, registered office address, and Grievance Officer designation under Section 10 of the India DPDP Act 2023.
