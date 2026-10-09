# Supabase setup

## 1. Create the project
Create a project at https://supabase.com/dashboard. Note the **Project URL**, the **anon / publishable key** and the **service_role / secret key** (Project Settings → API).

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` → frontend (`VITE_…`) and backend
- `SUPABASE_SERVICE_ROLE_KEY` → **backend only**. It bypasses Row Level Security; never put it in the frontend or commit it.

## 2. Run the migrations (in order)

Either paste each file into **SQL Editor → New query → Run**, in this order:

1. `supabase/migrations/20261009000001_schema.sql` — tables, enums, indexes, profile-creation trigger
2. `supabase/migrations/20261009000002_rls.sql` — Row Level Security policies and column grants
3. `supabase/migrations/20261009000003_storage.sql` — private `resumes` bucket and storage policies
4. `supabase/migrations/20261009000004_reference_data.sql` — initial companies (official URLs only) and role frameworks

…or with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.

## 3. Configure email OTP (required)

InterviewOS verifies email addresses with a **one-time code**, not a link. Supabase sends codes when the email template contains `{{ .Token }}`.

**Authentication → Sign In / Providers → Email**
- Enable **Email** provider, keep **Confirm email** ON.
- **Email OTP expiration**: e.g. 600–3600 seconds.
- **Email OTP length**: 6 (the UI accepts 6–10 digits).

**Authentication → Emails → Templates**

*Confirm signup* — replace the body with, for example:
```html
<h2>Verify your InterviewOS account</h2>
<p>Your verification code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>This code expires soon. If you didn't sign up, ignore this email.</p>
```

*Reset password* — replace the body with:
```html
<h2>Reset your InterviewOS password</h2>
<p>Your password reset code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>If you didn't request this, you can ignore this email.</p>
```

The app calls:
- `supabase.auth.signUp()` → *Confirm signup* email → `verifyOtp({ type: 'signup' })`
- `supabase.auth.resend({ type: 'signup' })` for resends (60 s cooldown in the UI, matching Supabase's default limit)
- `supabase.auth.resetPasswordForEmail()` → *Reset password* email → `verifyOtp({ type: 'recovery' })` → `updateUser({ password })`

**Rate limits** (Authentication → Rate Limits): keep the defaults or tighten them. Supabase enforces one OTP request per 60 seconds per address by default.

**Production email**: the built-in email sender is limited and intended for development. Configure **custom SMTP** (Authentication → Emails → SMTP Settings) before inviting real users.

## 4. URL configuration
**Authentication → URL Configuration**: set *Site URL* to your frontend URL (e.g. `http://localhost:5173` in development, your Vercel URL in production).

## 5. Make yourself an administrator (optional)
Admins can add companies, import listings from official job-board APIs and refresh stale listings. After registering in the app, run in the SQL editor:
```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'you@example.com';
```

## 6. Verify
From `backend/`: `python -m scripts.check_setup`. It checks tables, seed data, that the bucket is private, that anonymous clients cannot read profiles, and that the xAI key works.

## What lives where
- Passwords and OTP codes: **only** in Supabase Auth (`auth.users`); no application table stores credentials.
- Profiles are created by a trigger only **after** the email is verified.
- Resumes: private bucket `resumes`, path `<user_id>/<uuid>.<ext>`; downloads use 2-minute signed URLs.
