"""Configure Supabase Auth for InterviewOS via the Supabase Management API.

Sets: custom SMTP, 6-digit OTP email templates (signup + password reset), Site URL,
email confirmation required. Run from backend/:

    $env:SUPABASE_ACCESS_TOKEN = "sbp_..."     # https://supabase.com/dashboard/account/tokens
    $env:SMTP_USER = "you@gmail.com"
    $env:SMTP_PASS = "16-char-app-password"
    python -m scripts.configure_auth

Secrets are read from environment variables only and are never written to disk or printed.
Revoke the access token after running.
"""

import os
import sys
from urllib.parse import urlparse

import httpx

from app.config import get_settings

SITE_URL = os.environ.get("SITE_URL", "http://localhost:5173")

CONFIRM_TEMPLATE = """<h2>Verify your InterviewOS account</h2>
<p>Use this code to verify your email address:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>The code expires soon. If you didn't create an InterviewOS account, you can ignore this email.</p>"""

RECOVERY_TEMPLATE = """<h2>Reset your InterviewOS password</h2>
<p>Use this code to reset your password:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>If you didn't request a password reset, you can ignore this email.</p>"""


def main() -> int:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    smtp_user = os.environ.get("SMTP_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").replace(" ", "").strip()
    missing = [n for n, v in (("SUPABASE_ACCESS_TOKEN", token), ("SMTP_USER", smtp_user), ("SMTP_PASS", smtp_pass)) if not v]
    if missing:
        print("Missing environment variables:", ", ".join(missing))
        return 1

    project_ref = urlparse(get_settings().supabase_url).netloc.split(".")[0]
    body = {
        "site_url": SITE_URL,
        "external_email_enabled": True,
        "mailer_autoconfirm": False,  # email must be verified
        "mailer_otp_length": 6,
        "smtp_admin_email": smtp_user,
        "smtp_sender_name": "InterviewOS",
        "smtp_host": os.environ.get("SMTP_HOST", "smtp.gmail.com"),
        "smtp_port": os.environ.get("SMTP_PORT", "587"),
        "smtp_user": smtp_user,
        "smtp_pass": smtp_pass,
        "smtp_max_frequency": 60,
        "mailer_subjects_confirmation": "Your InterviewOS verification code",
        "mailer_templates_confirmation_content": CONFIRM_TEMPLATE,
        "mailer_subjects_recovery": "Your InterviewOS password reset code",
        "mailer_templates_recovery_content": RECOVERY_TEMPLATE,
    }
    resp = httpx.patch(
        f"https://api.supabase.com/v1/projects/{project_ref}/config/auth",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    if resp.status_code not in (200, 204):
        print(f"Supabase rejected the update ({resp.status_code}): {resp.text[:400]}")
        return 1

    cfg = resp.json() if resp.content else {}
    print(f"Project {project_ref} updated:")
    print("  site_url               =", cfg.get("site_url", SITE_URL))
    print("  smtp_host              =", cfg.get("smtp_host"))
    print("  smtp_user              =", cfg.get("smtp_user"))
    print("  email confirmation     =", "required" if not cfg.get("mailer_autoconfirm") else "OFF")
    print("  confirm template code  =", "{{ .Token }}" in (cfg.get("mailer_templates_confirmation_content") or ""))
    print("  recovery template code =", "{{ .Token }}" in (cfg.get("mailer_templates_recovery_content") or ""))
    print("\nDone. Revoke the access token at https://supabase.com/dashboard/account/tokens")
    return 0


if __name__ == "__main__":
    sys.exit(main())
