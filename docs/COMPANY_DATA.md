# Company data: policy and admin workflow

## Policy
- Only **verifiable public information from official sources** is stored: company name, official website, official careers URL, job listings from official pages or official public job-board APIs.
- Every source has a URL and `last_checked_at`; every listing has `source_url`, `last_verified_at` and a status (`active`, `stale`, `closed`).
- No proprietary interview question banks, no scraping of private or candidate data, no crawling beyond the exact URLs an admin registers.
- `robots.txt` is honoured for availability checks; if it can't be read, the check is skipped (conservative).
- Interview questions are generated as **original practice questions**. A session is marked company-specific only when it uses an active listing from an official source; otherwise the UI labels it "General role-based practice".
- Role competency frameworks (`job_roles`) are general industry frameworks, not claims about any company.

## Seeded data
`20261009000004_reference_data.sql` seeds nine companies with their official website and careers URL. Careers URLs were checked on 2026-10-09. Infosys, TCS and HCLTech blocked or timed out automated checks, so they are seeded with `last_verified_at = NULL` and appear as "Not yet verified" until an admin confirms them.

## Admin API (requires a row in `admin_users`)
All calls need `Authorization: Bearer <your access token>` (copy it from the browser's Supabase session or sign in via the Supabase API).

Add or update a company:
```bash
curl -X POST $API/api/admin/companies -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "name": "Example Corp", "slug": "example-corp",
  "official_website": "https://www.example.com", "careers_url": "https://careers.example.com",
  "industry": "Technology",
  "job_board_provider": "greenhouse", "job_board_token": "examplecorp"
}'
```
`job_board_provider`/`job_board_token` are only for companies that publish listings through the **official** Greenhouse Job Board API or Lever Postings API.

Import listings from that official API (closes listings that disappeared):
```bash
curl -X POST $API/api/admin/companies/<company_id>/sync -H "Authorization: Bearer $TOKEN"
```

Register a listing from an official careers page (URL must be on the company's domain or a known applicant-tracking host; paste the public description text):
```bash
curl -X POST $API/api/admin/companies/<company_id>/listings -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "title": "Graduate Engineer Trainee",
  "source_url": "https://careers.example.com/jobs/12345",
  "location": "Pune, India",
  "description_text": "…text copied from the official listing…"
}'
```
Skills, experience range and the matching role framework are derived automatically and deterministically (no AI).

Refresh workflow (run weekly, e.g. from a cron job or GitHub Action):
```bash
curl -X POST "$API/api/admin/refresh-listings" -H "Authorization: Bearer $TOKEN"
```
404/410 ⇒ `closed`; 200 ⇒ re-verified; not re-verified for 30 days ⇒ `stale` (shown as "May be outdated").

To mark a seeded company as verified after checking it manually:
```sql
update public.companies set last_verified_at = now() where slug = 'infosys';
update public.company_sources set last_checked_at = now(), notes = null where url = 'https://www.infosys.com/careers.html';
```

Add a verified question to the bank (written by an admin, original):
```bash
curl -X POST $API/api/admin/question-bank -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "topic": "Database Management Systems", "kind": "technical", "difficulty": 2,
  "question_text": "What is normalisation and why is it used?",
  "expected_points": ["reduces redundancy", "1NF/2NF/3NF", "update anomalies", "trade-off with joins"]
}'
```
