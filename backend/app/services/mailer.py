"""Outgoing email (SMTP) for invitations. Optional: when SMTP is not configured, nothing is sent
and callers fall back to showing the invite link in the app."""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from ..config import get_settings

logger = logging.getLogger("interviewos.mail")


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host and s.smtp_user and s.smtp_password)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    s = get_settings()
    if not smtp_configured():
        return False
    msg = EmailMessage()
    msg["From"] = f"{s.smtp_from_name} <{s.smtp_user}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("email to candidate failed: %s", type(exc).__name__)
        return False


def invitation_email(*, company: str, assessment: str, mode: str, link: str, scheduled: str | None) -> tuple[str, str, str]:
    what = "a live video interview" if mode == "live" else "an AI-led interview"
    when = f" scheduled for {scheduled}" if scheduled else ""
    subject = f"{company} invited you to {what}"
    text = (
        f"Hello,\n\n{company} has invited you to {what}{when} for: {assessment}.\n\n"
        f"Open your invitation: {link}\n\n"
        "You'll need a laptop with a camera and microphone. The interview may use AI camera proctoring; "
        "you'll be asked for consent before it starts.\n\n— InterviewOS"
    )
    html = (
        f"<p>Hello,</p><p><strong>{escape(company)}</strong> has invited you to {what}{escape(when)} for "
        f"<strong>{escape(assessment)}</strong>.</p>"
        f'<p><a href="{escape(link)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;'
        f'text-decoration:none">Open your invitation</a></p>'
        "<p style='color:#64748b'>You'll need a laptop with a camera and microphone. The interview may use AI camera "
        "proctoring; you'll be asked for consent before it starts.</p>"
    )
    return subject, text, html
