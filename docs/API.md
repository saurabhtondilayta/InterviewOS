# API reference

Base URL: your backend host (local: `http://localhost:8000`). Interactive docs: `/api/docs`. Machine-readable spec: [openapi.json](openapi.json) (regenerate after API changes).

All endpoints except `/api/health` require `Authorization: Bearer <Supabase access token>` for a user with a verified email. Errors always have the shape `{"error": {"code": "...", "message": "..."}}`.

| Status | Meaning |
|---|---|
| 401 | Not logged in or session expired (`unauthorized`, `session_expired`) |
| 403 | Email not verified, not an admin, or RLS denied access |
| 404 | Record not found (or not yours) |
| 409 | Conflict, e.g. question already answered, interview ended |
| 422 | Validation failed (submitted values are never echoed back) |
| 429 | Per-user AI rate limit reached |
| 502 | AI provider failed, timed out or returned invalid output (`ai_unavailable`, `ai_timeout`, `ai_rate_limited`, `ai_invalid_output`) |
| 503 | Server integration not configured (`not_configured`) |

## Meta

| Method | Path | Summary |
|---|---|---|
| GET | `/api/health` | Health |

## Profile

| Method | Path | Summary |
|---|---|---|
| GET | `/api/profile` | Get Profile |
| PATCH | `/api/profile` | Update Profile |
| PUT | `/api/profile/skills` | Replace Skills |

## Resumes

| Method | Path | Summary |
|---|---|---|
| POST | `/api/resumes` | Upload |
| GET | `/api/resumes` | List Resumes |
| GET | `/api/resumes/{resume_id}` | Get Resume |
| DELETE | `/api/resumes/{resume_id}` | Delete Resume |
| POST | `/api/resumes/{resume_id}/primary` | Make Primary |
| GET | `/api/resumes/{resume_id}/download-url` | Download Url |
| POST | `/api/resumes/{resume_id}/analyses` | Analyze |
| GET | `/api/resume-analyses` | List Analyses |
| GET | `/api/resume-analyses/{analysis_id}` | Get Analysis |
| DELETE | `/api/resume-analyses/{analysis_id}` | Delete Analysis |
| GET | `/api/resume-analyses/{analysis_id}/report.md` | Analysis Report |

## Companies

| Method | Path | Summary |
|---|---|---|
| GET | `/api/companies` | List Companies |
| GET | `/api/companies/{slug}` | Get Company |
| GET | `/api/job-listings/{listing_id}` | Get Listing |
| GET | `/api/job-roles` | List Roles |
| POST | `/api/role-prep` | Role Prep |
| GET | `/api/saved-jobs` | List Saved |
| POST | `/api/saved-jobs` | Save Job |
| DELETE | `/api/saved-jobs/{saved_id}` | Delete Saved |

## Interviews

| Method | Path | Summary |
|---|---|---|
| POST | `/api/interviews` | Create |
| GET | `/api/interviews` | History |
| GET | `/api/interviews/trends` | Trends |
| GET | `/api/interviews/{session_id}` | Detail |
| DELETE | `/api/interviews/{session_id}` | Delete |
| POST | `/api/interviews/{session_id}/next` | Next Question |
| POST | `/api/interviews/{session_id}/questions/{question_id}/answer` | Answer |
| POST | `/api/interviews/{session_id}/end` | End |
| POST | `/api/coding/practice` | Coding Practice |

## Chat

| Method | Path | Summary |
|---|---|---|
| GET | `/api/chat/conversations` | List Conversations |
| GET | `/api/chat/conversations/{conversation_id}` | Get Conversation |
| PATCH | `/api/chat/conversations/{conversation_id}` | Rename |
| DELETE | `/api/chat/conversations/{conversation_id}` | Delete |
| POST | `/api/chat/messages` | Send |
| DELETE | `/api/chat/conversations/{conversation_id}/messages` | Clear |

## Learning

| Method | Path | Summary |
|---|---|---|
| POST | `/api/learning-plans` | Create |
| GET | `/api/learning-plans` | List Plans |
| GET | `/api/learning-plans/active` | Active |
| GET | `/api/learning-plans/{plan_id}` | Get |
| DELETE | `/api/learning-plans/{plan_id}` | Delete |
| POST | `/api/learning-plans/{plan_id}/activate` | Activate |
| PATCH | `/api/learning-plans/tasks/{task_id}` | Update Task |

## Dashboard

| Method | Path | Summary |
|---|---|---|
| GET | `/api/dashboard` | Dashboard |

## Account

| Method | Path | Summary |
|---|---|---|
| GET | `/api/account/export` | Export |
| DELETE | `/api/account` | Delete Account |

## Admin

| Method | Path | Summary |
|---|---|---|
| POST | `/api/admin/companies` | Upsert Company |
| POST | `/api/admin/companies/{company_id}/sync` | Sync Company |
| POST | `/api/admin/companies/{company_id}/listings` | Add Listing |
| POST | `/api/admin/refresh-listings` | Refresh |
| POST | `/api/admin/question-bank` | Add Question |
