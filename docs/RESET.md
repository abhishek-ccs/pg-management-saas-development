# StayNest Database Fresh Start & Reset Guide

This guide details the procedure for wiping test/trial data and resetting the StayNest SaaS database to a pristine, production-ready state prior to public launch.

> **CRITICAL SAFETY DIRECTIVE**:
> The automated AI agent is strictly forbidden from executing this reset on remote production databases. Only authorized human administrators (Founders / Super Admins) may execute this command with explicit flags.

---

## 1. Prerequisites

1. **Environment Variables**:
   Verify that `.env.local` contains the following keys:
   ```env
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<your-secret-service-role-key>
   SUPER_ADMIN_EMAILS=abhishekrawat67320@gmail.com,sharmavn258@gmail.com
   SUPER_ADMIN_BOOTSTRAP_PASSWORD=<temporary-bootstrap-password>
   ```

2. **Project Reference**:
   Find your Supabase project ref from your `SUPABASE_URL`.
   For example, if your URL is:
   `https://rjxcbglfebleogauzyys.supabase.co`
   Your project ref is: `rjxcbglfebleogauzyys`.

---

## 2. Dry-Run Verification (Safe Inspection)

Before performing any destructive actions, run the script in **dry-run mode** to preview the exact tables, row counts, and users that will be impacted without deleting anything:

```bash
node scripts/reset-database.mjs --confirm-project=rjxcbglfebleogauzyys --dry-run
```

**Expected Dry-Run Output**:
- Validates the project reference against the live Supabase host.
- Displays the protected Super Admin accounts.
- Summarizes the number of customer auth accounts and table rows that would be purged.
- Exits with `0` modifications.

---

## 3. Performing the Live Reset

When you are ready for a clean launch:

```bash
node scripts/reset-database.mjs --confirm-project=rjxcbglfebleogauzyys
```

### What the Script Executes Automatically:

1. **Automated Pre-Deletion Backup**:
   - Creates a complete JSON archive of all tables and stores it under:
     `backups/backup-<timestamp>.json`
2. **Customer Data Purge**:
   - Safely removes records from:
     - `complaints`
     - `electricity_readings`
     - `expenses`
     - `payments`
     - `tenants`
     - `beds`
     - `rooms`
     - `properties`
     - `subscriptions` (non-super-admin)
     - `profiles` (non-super-admin)
3. **Customer Auth Account Deletion**:
   - Calls `supabase.auth.admin.deleteUser()` to remove all non-super-admin accounts from Supabase Auth.
4. **Founder Account Preservation**:
   - Super admin accounts specified in `SUPER_ADMIN_EMAILS` are never deleted.
5. **Super Admin Re-Bootstrap**:
   - Executes `scripts/bootstrap-super-admin.mjs` to ensure founder accounts exist with super admin roles, temporary credentials, and security enforcement flags (`must_change_password`, `mfa_enrolled`).
6. **Platform Audit Entry**:
   - Logs a permanent record of the reset event in `platform_audit_logs`.

---

## 4. Rollback & Disaster Recovery

If you ever need to restore data that was purged during a reset:

1. Locate the snapshot generated during step 1 in `backups/backup-<timestamp>.json`.
2. Inspect the JSON structure to review historical customer properties and accounting ledgers.
3. If necessary, write a restoration script or use Supabase Studio's table import to re-insert the archived rows.
