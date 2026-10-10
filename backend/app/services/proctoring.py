"""AI proctoring: scoring the signals recorded in the candidate's browser.

Detection runs client-side (MediaPipe face landmarks + object detection, browser focus events),
so no video leaves the candidate's device; only events and occasional low-resolution snapshots
are uploaded. The integrity score is a transparent penalty sum. It is a signal for human review,
never an automatic decision.
"""

from collections import Counter

# kind -> (penalty per occurrence, maximum occurrences counted, label)
RULES: dict[str, tuple[float, int, str]] = {
    "multiple_faces": (15, 3, "More than one person in view"),
    "phone_detected": (15, 3, "Phone visible"),
    "camera_off": (15, 2, "Camera turned off or blocked"),
    "tab_hidden": (10, 4, "Switched to another tab or app"),
    "no_face": (8, 4, "Face not visible"),
    "copy_paste": (8, 3, "Copy or paste"),
    "window_blur": (5, 4, "Interview window lost focus"),
    "fullscreen_exit": (5, 3, "Left fullscreen"),
    "looking_away": (4, 5, "Looking away for a long time"),
}
INFO_KINDS = {"session_start", "session_end"}
ALL_KINDS = set(RULES) | INFO_KINDS


def summarize(events: list[dict]) -> tuple[float, dict]:
    """Return (integrity score 0-100, summary) from proctoring events."""
    counts = Counter(e["kind"] for e in events if e["kind"] in RULES)
    penalty = 0.0
    breakdown = []
    for kind, (per, cap, label) in RULES.items():
        n = counts.get(kind, 0)
        if not n:
            continue
        p = per * min(n, cap)
        penalty += p
        breakdown.append({"kind": kind, "label": label, "count": n, "penalty": p})
    score = round(max(0.0, 100.0 - penalty), 1)
    if score >= 85:
        verdict = "No major concerns"
    elif score >= 60:
        verdict = "Review recommended"
    else:
        verdict = "Significant concerns - review the recording evidence"
    breakdown.sort(key=lambda b: -b["penalty"])
    return score, {
        "verdict": verdict,
        "flags": breakdown,
        "total_flags": sum(counts.values()),
        "note": "Automated signals for human review. They are not proof of misconduct.",
    }
