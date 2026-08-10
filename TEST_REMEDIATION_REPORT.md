# Optima Web Test Remediation Report

**Target branch:** `JY's-test-demo-code`

**Baseline copied from:** `origin/main` → `smart-task-allocation` at `6bc502916c17d35d56b49a01db71ed081b1a4300`

**Previous live retest baseline:** 72 Passed / 92 Failed

**Date:** 10 August 2026

## Outcome

The old demo-branch application was replaced with the latest application from `main`, then remediated only on `JY's-test-demo-code`. The implementation targets 90 of the 92 previously failed cases. This is implementation coverage, not a claim that all 90 cases have passed against a deployed Supabase environment.

The application is stored under `smart-task-allocation`, matching the Vercel root-directory configuration used by `main`.

Two cases remain outside this remediation:

- `UA-TC-033` — configurable role-permission administration and enforcement.
- `MGR-TC-141` — User Admin or Manager editing another employee's full master data and observing eligibility recalculation.

## Remediated Case Coverage

### Authentication, access control, accounts, and organization

- `UA-TC-006`, `UA-TC-007`, `UA-TC-008`, `UA-TC-009`, `UA-TC-014`
- `UA-TC-039`, `UA-TC-040`, `UA-TC-041`
- `AUTH-TC-005`, `AUTH-TC-007`, `AUTH-TC-010`
- `GST-TC-197`, `GST-TC-202`

Changes include a no-flash protected-route guard, role mismatch redirects, suspended-account session termination, self-only profile API behavior, account editing with duplicate/required/email validation, and organization editing with required/email validation.

### Support, feedback, activity logs, and public pages

- `UA-TC-042` to `UA-TC-044`
- `PA-TC-056` to `PA-TC-059`, `PA-TC-069` to `PA-TC-082`
- `MGR-TC-142` to `MGR-TC-144`
- `EMP-TC-192` to `EMP-TC-194`
- `GST-TC-204` to `GST-TC-208`

Changes include authenticated and guest support forms, strict required/email validation, reference numbers, feedback submission with a 1,000-character maximum, Platform Admin activity/search, feedback analysis/filter/empty states, moderation, inquiry replies/status/history, public approved-only feedback, and a public empty state.

### Homepage and subscription management

- `PA-TC-062`, `PA-TC-067`

Changes include a private draft-preview overlay that does not publish content and server-side rejection of missing, nonnumeric, or negative plan prices.

### Task management, allocation, employee search, and requests

- `MGR-TC-096`, `MGR-TC-097`, `MGR-TC-103`, `MGR-TC-107`, `MGR-TC-110`
- `MGR-TC-114` to `MGR-TC-117`, `MGR-TC-121`, `MGR-TC-122`, `MGR-TC-126`, `MGR-TC-130`
- `MGR-TC-133`, `MGR-TC-134`, `MGR-TC-137` to `MGR-TC-140`
- `EMP-TC-160` to `EMP-TC-164`, `EMP-TC-169` to `EMP-TC-180`

Changes include start/end and past-date validation, active-assignment deletion protection, consistent manual/direct/AI eligibility checks, skill/availability/conflict/weekly-hour-limit enforcement, filled-position protection, allocation-history filters, employee skill/date-time availability filters, employee detail cards, open-task lists/details/empty states, request ownership and duplicate protection, cancellation rules, Manager approval/rejection, and eligibility re-check at approval time.

### Attendance

- `EMP-TC-181`, `EMP-TC-183` to `EMP-TC-186`, `EMP-TC-189` to `EMP-TC-191`

Changes include assigned-task/scheduled-shift eligibility, a ±30-minute clock-in window, nonnegative late/overtime values, task and schedule timestamps on attendance records, overnight-safe elapsed-time calculation, a one-hour unpaid break for sessions of six hours or more, and a single stored total-hours value shared by Employee and Manager views.

Run `database/20260810_test_case_workflows.sql` in Supabase before deploying this branch so attendance linkage and break fields are available.

## Verification Performed

- `npm run lint` — Passed.
- `npm run build` — Passed; 98 application routes generated.
- Browser: `/support` rendered all public inquiry fields and rejected `invalid-email` with native email-format validation.
- Browser: direct guest navigation to `/manager/workspace` redirected to `/login` before protected page content rendered.
- Browser: `/feedback` rendered the approved-only public page structure. Database content could not be loaded locally because production Supabase service credentials were intentionally not copied into the workspace.

## Deployment Retest Required

After applying the SQL migration and deploying `JY's-test-demo-code` with the normal Supabase environment variables, rerun the original test-plan cases using disposable records. Pay particular attention to attendance time boundaries, approval-time eligibility changes, moderation visibility, audit ordering, and cross-role direct API attempts.
