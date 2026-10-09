"""Company data: verified context for prompts, plus the admin ingestion/refresh workflow.

Data sources (authorised only):
* Greenhouse Job Board API  (public, documented: boards-api.greenhouse.io)
* Lever Postings API        (public, documented: api.lever.co/v0/postings)
* Admin-entered listings from an official careers page URL (text pasted by an admin)

Every listing stores its source URL and last_verified_at. The refresh workflow re-checks
sources (honouring robots.txt), marks listings 'stale' after STALE_AFTER_DAYS without
verification and 'closed' when the official URL returns 404/410. No page is crawled
beyond the single URL an admin registered, and no candidate data is collected.
"""

import html
import logging
import re
import urllib.robotparser
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import httpx
from postgrest import SyncPostgrestClient

from ..errors import NotFoundError, ValidationFailed

logger = logging.getLogger("interviewos.companies")

USER_AGENT = "InterviewOSBot/1.0 (+student interview-practice project; respects robots.txt)"
STALE_AFTER_DAYS = 30

# Keyword rules mapping listing titles to the general role frameworks (first match wins).
ROLE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("machine-learning-engineer", ("machine learning", "ml engineer", "ai engineer", "data scientist")),
    ("data-analyst", ("data analyst", "business analyst", "analytics")),
    ("devops-engineer", ("devops", "site reliability", "sre", "platform engineer")),
    ("cloud-engineer", ("cloud",)),
    ("cybersecurity-analyst", ("security", "cyber")),
    ("qa-test-engineer", ("qa ", "quality assurance", "test engineer", "sdet", "tester")),
    ("frontend-developer", ("frontend", "front-end", "front end", "ui engineer")),
    ("backend-developer", ("backend", "back-end", "back end")),
    ("full-stack-developer", ("full stack", "full-stack", "fullstack")),
    ("graduate-engineer-trainee", ("trainee", "graduate engineer", "fresher", "associate engineer")),
    ("software-engineer", ("software", "sde", "developer", "engineer")),
]

SKILL_VOCABULARY = [
    "Python",
    "Java",
    "C++",
    "C#",
    "JavaScript",
    "TypeScript",
    "Go",
    "Rust",
    "Kotlin",
    "Swift",
    "SQL",
    "React",
    "Angular",
    "Vue",
    "Node.js",
    "Spring",
    "Django",
    "Flask",
    "FastAPI",
    ".NET",
    "AWS",
    "Azure",
    "Google Cloud",
    "GCP",
    "Docker",
    "Kubernetes",
    "Terraform",
    "Linux",
    "Git",
    "CI/CD",
    "Jenkins",
    "REST",
    "GraphQL",
    "Microservices",
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "Kafka",
    "Spark",
    "Hadoop",
    "Pandas",
    "NumPy",
    "TensorFlow",
    "PyTorch",
    "scikit-learn",
    "Machine Learning",
    "Deep Learning",
    "NLP",
    "Data Structures",
    "Algorithms",
    "System Design",
    "Distributed Systems",
    "Networking",
    "Selenium",
    "Power BI",
    "Tableau",
    "Excel",
    "Statistics",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def html_to_text(raw: str | None) -> str:
    if not raw:
        return ""
    text = html.unescape(raw)
    text = re.sub(r"<(br|/p|/li|/h\d)[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "- ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def match_role_slug(title: str) -> str | None:
    t = f" {title.lower()} "
    for slug, words in ROLE_RULES:
        if any(w in t for w in words):
            return slug
    return None


def extract_skills(text: str) -> list[str]:
    found = []
    for skill in SKILL_VOCABULARY:
        pattern = r"(?<![A-Za-z0-9])" + re.escape(skill) + r"(?![A-Za-z0-9])"
        if re.search(pattern, text, flags=re.IGNORECASE):
            found.append(skill)
    return found


def parse_experience(text: str) -> tuple[float | None, float | None]:
    m = re.search(r"(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*\+?\s*years?", text, flags=re.IGNORECASE)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"(\d{1,2})\s*\+?\s*years?", text, flags=re.IGNORECASE)
    if m:
        return float(m.group(1)), None
    return None, None


def robots_allows(url: str, client: httpx.Client) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = urllib.robotparser.RobotFileParser()
    try:
        resp = client.get(robots_url, headers={"User-Agent": USER_AGENT}, timeout=10)
    except httpx.HTTPError:
        return False  # be conservative if robots.txt cannot be read
    if resp.status_code in (401, 403):
        return False
    if resp.status_code >= 400:
        return True  # no robots.txt => no restrictions declared
    rp.parse(resp.text.splitlines())
    return rp.can_fetch(USER_AGENT, url)


# ---------------------------------------------------------------------------
# Verified context for prompts
# ---------------------------------------------------------------------------
def verified_company_context(db: SyncPostgrestClient, company_id: str | None, listing_id: str | None) -> tuple[str | None, bool]:
    """Return (context_text, is_company_specific). Company-specific only when a verified job
    listing from an official source is used."""
    if not company_id:
        return None, False
    rows = (
        db.table("companies").select("name, official_website, careers_url, last_verified_at").eq("id", company_id).limit(1).execute().data
    )
    if not rows:
        raise NotFoundError("Company not found.")
    c = rows[0]
    lines = [
        f"Company: {c['name']}",
        f"Official website: {c['official_website']}",
        f"Official careers page: {c.get('careers_url') or 'unknown'}",
        f"Company record last verified: {c.get('last_verified_at') or 'not verified'}",
        "No official interview process information is stored for this company.",
    ]
    specific = False
    if listing_id:
        lrows = (
            db.table("job_listings")
            .select(
                "title, location, experience_min, experience_max, required_skills, description_text, source_url, last_verified_at, status, company_id"
            )
            .eq("id", listing_id)
            .limit(1)
            .execute()
            .data
        )
        if not lrows or lrows[0]["company_id"] != company_id:
            raise NotFoundError("Job listing not found for this company.")
        jl = lrows[0]
        lines += [
            "",
            f"Job listing (from official source {jl['source_url']}, last verified {jl['last_verified_at']}, status {jl['status']}):",
            f"Title: {jl['title']}",
            f"Location: {jl.get('location') or 'not stated'}",
            f"Experience: {jl.get('experience_min') or 'not stated'} - {jl.get('experience_max') or ''} years",
            "Required skills: " + (", ".join(jl.get("required_skills") or []) or "not stated"),
            "Description:\n" + (jl.get("description_text") or "")[:3000],
        ]
        specific = jl["status"] == "active"
    return "\n".join(lines), specific


# ---------------------------------------------------------------------------
# Ingestion adapters
# ---------------------------------------------------------------------------
def _fetch_greenhouse(token: str, client: httpx.Client) -> list[dict]:
    resp = client.get(
        f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs",
        params={"content": "true"},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    out = []
    for j in resp.json().get("jobs", []):
        desc = html_to_text(j.get("content"))
        out.append(
            {
                "external_id": f"greenhouse:{j['id']}",
                "title": j.get("title", "").strip(),
                "location": (j.get("location") or {}).get("name"),
                "employment_type": None,
                "description_text": desc[:20000],
                "source_url": j.get("absolute_url"),
                "posted_at": j.get("updated_at"),
            }
        )
    return out


def _fetch_lever(company: str, client: httpx.Client) -> list[dict]:
    resp = client.get(
        f"https://api.lever.co/v0/postings/{company}",
        params={"mode": "json"},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    out = []
    for j in resp.json():
        cats = j.get("categories") or {}
        desc = j.get("descriptionPlain") or ""
        for lst in j.get("lists") or []:
            desc += f"\n\n{lst.get('text', '')}\n{html_to_text(lst.get('content'))}"
        created = j.get("createdAt")
        out.append(
            {
                "external_id": f"lever:{j['id']}",
                "title": (j.get("text") or "").strip(),
                "location": cats.get("location"),
                "employment_type": cats.get("commitment"),
                "description_text": desc.strip()[:20000],
                "source_url": j.get("hostedUrl"),
                "posted_at": datetime.fromtimestamp(created / 1000, UTC).isoformat() if created else None,
            }
        )
    return out


def _role_ids(admin: SyncPostgrestClient) -> dict[str, str]:
    return {r["slug"]: r["id"] for r in admin.table("job_roles").select("id, slug").execute().data or []}


def _enrich(listing: dict, role_ids: dict[str, str]) -> dict:
    text = f"{listing['title']}\n{listing.get('description_text') or ''}"
    exp_min, exp_max = parse_experience(text)
    slug = match_role_slug(listing["title"])
    return {
        **listing,
        "job_role_id": role_ids.get(slug) if slug else None,
        "required_skills": extract_skills(text),
        "experience_min": exp_min,
        "experience_max": exp_max,
    }


def sync_job_board(admin: SyncPostgrestClient, company_id: str, client: httpx.Client | None = None) -> dict:
    rows = admin.table("companies").select("id, name, job_board_provider, job_board_token").eq("id", company_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Company not found.")
    c = rows[0]
    provider, token = c.get("job_board_provider"), c.get("job_board_token")
    if not provider or not token:
        raise ValidationFailed(
            "This company has no official public job-board API configured. Add listings manually from its official careers page."
        )
    client = client or httpx.Client(follow_redirects=True)
    fetched = _fetch_greenhouse(token, client) if provider == "greenhouse" else _fetch_lever(token, client)

    api_url = (
        f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs"
        if provider == "greenhouse"
        else f"https://api.lever.co/v0/postings/{token}"
    )
    src = (
        admin.table("company_sources")
        .upsert(
            {
                "company_id": company_id,
                "source_type": "public_api",
                "url": api_url,
                "title": f"{provider.title()} public job board API",
                "last_checked_at": datetime.now(UTC).isoformat(),
                "last_status_code": 200,
                "robots_allowed": True,
            },
            on_conflict="company_id,url",
        )
        .execute()
        .data
    )
    source_id = src[0]["id"] if src else None

    role_ids = _role_ids(admin)
    now = datetime.now(UTC).isoformat()
    seen_urls: set[str] = set()
    upserts = []
    for item in fetched:
        if not item.get("source_url") or not str(item["source_url"]).startswith("https://") or not item["title"]:
            continue
        seen_urls.add(item["source_url"])
        upserts.append(
            {
                **_enrich(item, role_ids),
                "company_id": company_id,
                "source_id": source_id,
                "last_verified_at": now,
                "status": "active",
            }
        )
    for i in range(0, len(upserts), 200):
        admin.table("job_listings").upsert(upserts[i : i + 200], on_conflict="company_id,source_url").execute()

    # Anything from this API that is no longer listed is closed.
    existing = (
        admin.table("job_listings").select("id, source_url").eq("company_id", company_id).eq("source_id", source_id).execute().data or []
    )
    closed = [e["id"] for e in existing if e["source_url"] not in seen_urls]
    if closed:
        admin.table("job_listings").update({"status": "closed"}).in_("id", closed).execute()

    admin.table("companies").update({"last_verified_at": now}).eq("id", company_id).execute()
    return {"fetched": len(fetched), "upserted": len(upserts), "closed": len(closed)}


def add_manual_listing(admin: SyncPostgrestClient, company_id: str, data: dict, client: httpx.Client | None = None) -> dict:
    """Register a listing an admin copied from an official careers page. The URL must be on
    the company's official domain (or a known applicant-tracking host) and allowed by robots.txt
    for the availability check."""
    rows = admin.table("companies").select("id, official_website, careers_url").eq("id", company_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Company not found.")
    c = rows[0]
    url = data["source_url"]
    host = urlparse(url).netloc.lower()
    official_hosts = {urlparse(c["official_website"]).netloc.lower().removeprefix("www.")}
    if c.get("careers_url"):
        official_hosts.add(urlparse(c["careers_url"]).netloc.lower().removeprefix("www."))
    ats_hosts = ("myworkdayjobs.com", "greenhouse.io", "lever.co", "smartrecruiters.com", "icims.com", "taleo.net", "successfactors.com")
    if not any(host == h or host.endswith("." + h) for h in official_hosts) and not host.endswith(ats_hosts):
        raise ValidationFailed("The listing URL must be on the company's official website or careers system.")

    client = client or httpx.Client(follow_redirects=True)
    allowed = robots_allows(url, client)
    status_code = None
    if allowed:
        try:
            status_code = client.get(url, headers={"User-Agent": USER_AGENT}, timeout=15).status_code
        except httpx.HTTPError:
            status_code = None

    src = (
        admin.table("company_sources")
        .upsert(
            {
                "company_id": company_id,
                "source_type": "job_listing",
                "url": url,
                "title": data["title"],
                "robots_allowed": allowed,
                "last_status_code": status_code,
                "last_checked_at": datetime.now(UTC).isoformat(),
            },
            on_conflict="company_id,url",
        )
        .execute()
        .data
    )
    listing = _enrich(
        {
            "title": data["title"],
            "location": data.get("location"),
            "employment_type": data.get("employment_type"),
            "description_text": data.get("description_text"),
            "source_url": url,
            "external_id": None,
            "posted_at": data.get("posted_at"),
        },
        _role_ids(admin),
    )
    if data.get("job_role_id"):
        listing["job_role_id"] = data["job_role_id"]
    listing.update(
        {
            "company_id": company_id,
            "source_id": src[0]["id"] if src else None,
            "status": "closed" if status_code in (404, 410) else "active",
            "last_verified_at": datetime.now(UTC).isoformat(),
        }
    )
    saved = admin.table("job_listings").upsert(listing, on_conflict="company_id,source_url").execute().data
    return saved[0] if saved else listing


def refresh_listings(admin: SyncPostgrestClient, company_id: str | None = None, client: httpx.Client | None = None) -> dict:
    """Re-check registered listing URLs and age out unverified listings."""
    client = client or httpx.Client(follow_redirects=True)
    now = datetime.now(UTC)
    q = admin.table("job_listings").select("id, source_url, company_id, last_verified_at, status").neq("status", "closed")
    if company_id:
        q = q.eq("company_id", company_id)
    listings = q.execute().data or []

    checked = closed = stale = 0
    for jl in listings:
        url = jl["source_url"]
        if robots_allows(url, client):
            try:
                code = client.get(url, headers={"User-Agent": USER_AGENT}, timeout=15).status_code
            except httpx.HTTPError:
                code = None
            checked += 1
            if code in (404, 410):
                admin.table("job_listings").update({"status": "closed"}).eq("id", jl["id"]).execute()
                closed += 1
                continue
            if code == 200:
                admin.table("job_listings").update({"status": "active", "last_verified_at": now.isoformat()}).eq("id", jl["id"]).execute()
                continue
        verified = datetime.fromisoformat(jl["last_verified_at"].replace("Z", "+00:00"))
        if now - verified > timedelta(days=STALE_AFTER_DAYS) and jl["status"] != "stale":
            admin.table("job_listings").update({"status": "stale"}).eq("id", jl["id"]).execute()
            stale += 1
    return {"checked": checked, "closed": closed, "marked_stale": stale, "total": len(listings)}
