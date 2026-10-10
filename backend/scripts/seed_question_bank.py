"""Load the original question bank (supabase/seed/question_bank_*.json) into public.question_bank.

Usage (from backend/):  python -m scripts.seed_question_bank

Safe to re-run: questions already present (same topic + text) are skipped. Uses the service role.
"""

import json
import sys
from pathlib import Path

from app.db import admin_db

SEED_DIR = Path(__file__).resolve().parents[2] / "supabase" / "seed"
KINDS = {"technical", "behavioral", "hr", "coding", "system_design", "resume"}


def main() -> int:
    items: list[dict] = []
    for f in sorted(SEED_DIR.glob("question_bank_*.json")):
        items.extend(json.loads(f.read_text(encoding="utf-8")))

    rows = []
    for i in items:
        if i["kind"] not in KINDS or not 1 <= int(i["difficulty"]) <= 5:
            print("skipping invalid item:", i.get("q", "")[:60])
            continue
        rows.append(
            {
                "topic": i["topic"],
                "kind": i["kind"],
                "difficulty": int(i["difficulty"]),
                "question_text": i["q"].strip(),
                "expected_points": i.get("p", []),
                "source_note": "InterviewOS original question bank",
                "is_active": True,
            }
        )

    db = admin_db()
    existing = {
        (r["topic"].lower(), r["question_text"].strip().lower())
        for r in db.table("question_bank").select("topic, question_text").execute().data or []
    }
    new = [r for r in rows if (r["topic"].lower(), r["question_text"].lower()) not in existing]
    for start in range(0, len(new), 100):
        db.table("question_bank").insert(new[start : start + 100]).execute()

    topics = sorted({r["topic"] for r in rows})
    print(f"{len(rows)} questions in seed files across {len(topics)} topics; inserted {len(new)}, already present {len(rows) - len(new)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
