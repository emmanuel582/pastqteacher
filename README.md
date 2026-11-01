# PastQ Teacher

A separate teacher application and API. This folder has its own dependencies, build, authentication session, database, and deployment. It uses the existing PastQ accounts and calls the PastQ API for extraction and the shared question library. It does not change the student interface.

## Run locally

Use Node 22.13 or newer.

```powershell
git clone https://github.com/emmanuel582/pastqteacher.git
cd pastqteacher
npm ci
Copy-Item .env.example .env
# Configure the Supabase public URL/key and a stable storage secret.
npm run dev:api
```

In another terminal, run `npm run dev`. Open [the teacher app](http://127.0.0.1:5175). The API runs on port 3002. If working inside the original PastQ workspace, use `cd teacher` instead of cloning. In local development only, missing public Supabase settings can fall back to sibling `client` and `server` environment files when those projects are present. Standalone clones and production deployments need their own configuration. No Supabase service-role key is used.

[The demo](http://127.0.0.1:5175/?demo=1) is clearly labeled and uses isolated sample data. Its edits last only until reload. Document extraction and real payments are unavailable in the demo.

## Features

- A phone layout with bottom navigation, 44–48 px controls, full-screen editors, fixed exam-builder actions, readable result cards, keyboard focus handling, and safe-area spacing. Desktop retains tables and a sidebar.
- Private PDF/photo uploads, extraction progress, retry, question review, and source diagrams.
- Individual question selection from the shared library, with server-side topic/subject search and pagination. Only selected source assets enter an exam.
- Manual multiple-choice and written questions, topic labels, marks, answer keys, and marking guides. Rich source formatting, MathML, and LaTeX rendering are supported.
- Drafts, branded exams, public/private access, encrypted and rotatable private invite codes, optional paid entry in NGN/USD, and duplication.
- Opening/closing dates, duration, attempt limits, pass marks, wrong-answer penalties, question/option shuffling, optional solutions, and three result-release policies. Enrollment limits are available for free exams; paid exams admit every verified buyer.
- Server-owned deadlines, durable answer saves, repeat-submit protection, and server grading. Written answers wait for teacher marking.
- Student attempt histories, best/latest scores, improvement, time spent, topics missed, question/distractor analysis, score distributions, and CSV exports.
- Question-level matches against weak topics in existing library collections. Teachers review and select questions before creating a follow-up exam draft.
- Bachs connected-account onboarding, hosted checkout, signed payment webhooks, verified enrollment, and an exam-payment ledger. No teacher messaging or alerts.

## Storage and access

`TEACHER_DATA_DIR/teacher.db` uses SQLite WAL. Profiles, exam snapshots, memberships, attempts, orders, webhook receipts, and an action log live here. Branding files live under `TEACHER_DATA_DIR/media`. Question content stays on your server and never enters Supabase.

Authenticated users explicitly activate their own teacher workspace. `TEACHER_USER_IDS` can restrict activation to a server-configured UUID allowlist. A teacher workspace does not grant student-data access, a Supabase administrator role, or access to another teacher’s exams. Teacher views include only students enrolled in that teacher’s exams.

Keep `TEACHER_STORAGE_SECRET` stable: it encrypts private invite codes. Back up the database with SQLite’s online backup API, or stop the API before copying the complete data directory. Preserve this secret with the backup. Each published exam freezes its questions/settings; later edits require a duplicate.

## Existing PastQ API requirement

Deploy the matching PastQ backend before enabling teacher uploads. Small additive changes outside this folder:

- Extraction sessions accept and return `libraryVisibility: "private"`.
- The library synchronizer skips those sessions.
- Private source figures require the verified session owner.

Existing student sessions keep their current public-library behavior. The teacher API refuses to accept uploads if the upstream API does not confirm private-storage support. It embeds protected diagram bytes into its own private exam snapshot before student delivery.

## Bachs configuration

Read [PAYMENTS.md](PAYMENTS.md) for the researched API contract and setup. Set the API key and webhook secret only on the server. The platform must have Bachs Connect enabled; each teacher completes Bachs onboarding and needs an active collection capability for the exam’s currency. Paid publishing fails closed without these requirements.

The local payment tests use a fake provider and signed fixtures. Live collection, onboarding approval, payouts, real webhook delivery, and refunds require provider configuration and sandbox verification before launch. Refunds/disputes and payout management remain in the Bachs dashboard; this app does not automatically revoke an enrollment after a refund.

## Student integration boundary

The teacher API implements the enrollment and exam-taking contract in [STUDENT-API.md](STUDENT-API.md). The existing student Discover screen currently uses `/api/discover`; it has not been changed to call this service. Teacher exams therefore do not yet appear in that existing screen. The next student-side integration should use the new contract, including payment confirmation, durable answer saves, and server result-release rules.

## Build and deployment

```powershell
npm test
npm run build
npm start
```

The API serves `dist/` and `/api` from one origin in production. Set the public teacher/student HTTPS origins, the existing PastQ API URL, the Supabase public URL/key, persistent data directory, and a strong storage secret. Add the teacher origin and recovery callback to the Supabase redirect allowlist. Frontend public Supabase values are supplied at build time. Never use a service-role or Bachs secret in a `VITE_` variable.

Terminate HTTPS at your existing reverse proxy. Forward to this service separately from the student and admin services. Preserve the persistent data directory between releases. Set upload limits to match the teacher’s 25 MB per file / eight-file batches and allow at least five minutes for upload proxy requests. The provided Dockerfile builds and runs this folder independently; connect `PASTQ_API_URL` to a reachable API origin rather than the container’s own localhost.

Rate limiting is process-local; use one API writer for this SQLite deployment. A shared limiter and a different persistence strategy are required before horizontal scaling. No existing Supabase schema migration is needed.

## Verification

`npm test` covers account separation, private discovery/code rotation, frozen published snapshots, schedules/limits, grading, deadline expiry, duplicate submissions, manual marks, persistence, signed webhooks, payment mismatch rejection, source-image privacy, library paging, and protected figure imports. The main API has an additional teacher-private-extraction regression test.

Browser checks cover the teacher workflow and responsive breakpoints using the labeled demo. Those checks do not certify physical iPhone/Android behavior or real Bachs/Supabase hosting settings.
