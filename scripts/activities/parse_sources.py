#!/usr/bin/env python3
"""
Read trivia operator and directory pages (fetched by the database with pg_net; saved as text) into
observations: one row per venue, weekday and start time, with what the page itself says.

  python3 scripts/activities/parse_sources.py <pages_dir> <observed_at YYYY-MM-DD> > observations.json

observed_at is when we read the page. source_updated_at is filled only from a date the page states
(NYC Trivia League: "Monday, October 12th, 2026 through Sunday, October 18th, 2026").
"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from activities import DAY_OF, day_of, fold, parse_time

MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}


def status_from_note(note: str) -> str | None:
    n = fold(note)
    if re.search(r"hiatus|on hold|paused|break until|back (in|on) [a-z]+ \d{4}|back [a-z]+ \d{4}", n):
        return "paused"
    if re.search(r"starts|coming soon|beginning|debuts", n):
        return "upcoming"
    if re.search(r"no trivia", n):
        return "skips_a_date"
    return None


def nyc_trivia_league(text: str) -> tuple[list[dict], str | None]:
    week = re.search(r"Monday, (\w+) (\d+)\w*, (\d{4}) through Sunday, (\w+) (\d+)\w*, (\d{4})", text)
    stated = None
    if week:
        m1, d1, y1, m2, d2, y2 = week.groups()
        stated = f"{y1}-{MONTHS[m1.lower()]:02d}-{int(d1):02d}/{y2}-{MONTHS[m2.lower()]:02d}-{int(d2):02d}"
    out, day, pending_kind = [], None, None
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for i, l in enumerate(lines):
        h = re.match(r"Trivia (Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days$", l)
        if h:
            day = day_of(h.group(1))
            continue
        if not day:
            continue
        if l.startswith("Mixtape Bingo"):
            pending_kind = "music_bingo"
            continue
        m = re.match(r"^,\s*([^,]+),\s*([0-9:]+\s*[ap]m)(?:\s*start)?\s*(.*)$", l, re.I)
        if m and i > 0:
            name = re.sub(r"^—\s*|^-\s*", "", lines[i - 1]).strip()
            note = m.group(3).strip(" *")
            out.append({"source": "NYC Trivia League", "type": "operator", "url": "https://nyctrivialeague.com", "name": name,
                        "hood": m.group(1).strip(), "day": day, "start": parse_time(m.group(2)), "kind": pending_kind or "trivia",
                        "note": note or None, "status": status_from_note(note) if note else None, "host": "NYC Trivia League"})
            pending_kind = None
        if l.startswith("Every new season"):
            break
    return out, stated


def trivia_nyc(text: str) -> list[dict]:
    out, day = [], None
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for i, l in enumerate(lines):
        if l.upper() in {d.upper() for d in DAY_OF}:
            day = DAY_OF[l.lower()]
            continue
        m = re.match(r"^(\d{1,2}(?::\d{2})?\s*[ap]m)\s*[–-]\s*(.+)$", l, re.I)
        if m and day:
            name = m.group(2)
            note = (re.search(r"\(([^)]*)\)", name) or [None, None])[1]
            addr = lines[i + 1] if i + 1 < len(lines) and re.match(r"^\d", lines[i + 1]) else None
            out.append({"source": "TriviaNYC", "type": "operator", "url": "https://trivianyc.net", "name": re.sub(r"\s*\(.*?\)", "", name).strip(),
                        "day": day, "start": parse_time(m.group(1)), "kind": "trivia", "address": addr, "note": note,
                        "status": status_from_note(note) if note else None, "host": "TriviaNYC"})
    return out


def nyc_trivia_list(text: str) -> list[dict]:
    out, day = [], None
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for i, l in enumerate(lines):
        if l.lower() in DAY_OF and l[0].isupper():
            day = DAY_OF[l.lower()]
            continue
        m = re.match(r"^\|\s*(.+?)\s*@\s*(.+?)(\s*\*)?$", l)
        if m and day and i > 0:
            note = lines[i + 1] if m.group(3) and i + 1 < len(lines) and not lines[i + 1].startswith("|") else None
            kind = "music_bingo" if re.search(r"bingo", lines[i - 1], re.I) else "trivia"
            out.append({"source": "NYC Trivia List", "type": "directory", "url": "https://www.nyctrivialist.com", "name": lines[i - 1],
                        "hood": m.group(1), "day": day, "start": parse_time(m.group(2)), "start_raw": m.group(2), "kind": kind,
                        "note": note, "status": status_from_note(note) if note else None})
    return out


def brooklyn_trivia(text: str) -> list[dict]:
    out = []
    blocks = re.split(r"Click here if you’ve played this trivia night!|Click here if you've played this trivia night!", text)
    for b in blocks:
        lines = [l.strip() for l in b.split("\n") if l.strip()]
        for j, l in enumerate(lines):
            cad = re.match(r"^((?:every other |1st |2nd |3rd |4th |last |first |second |third )?(?:and \w+ )?(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days?(?: of (?:the |each |every )?month)?)\s*@\s*([0-9:]+)\s*([ap]\.?m)?\b(.*)$", l, re.I)
            if not cad:
                continue
            # the "Name – Neighborhood" line, not the "@ 8 pm – Every other week" line under it
            head = next((x for x in reversed(lines[:j]) if re.search(r"\s[–-]\s", x) and not x.startswith("@")), None)
            if not head:
                break
            name, hood = [s.strip() for s in re.split(r"\s[–-]\s", head, maxsplit=1)]
            hood = re.sub(r"\s*@.*$", "", hood)
            addr = next((x for x in lines[j + 1:j + 3] if re.match(r"^\d+[\w-]*\s+\w", x)), None)
            extra = cad.group(5)
            # "Mondays @ 8:30" has no am/pm: take it from the header ("Post No Bills – East Williamsburg @ 8:30pm")
            # or the line under it ("@ 7 pm"), only when the number is the same; otherwise the time stays unknown
            hm = cad.group(3)
            ap = cad.group(4)
            if not ap:
                near = " ".join(lines[max(0, j - 3):j])
                m2 = re.search(rf"@\s*{re.escape(hm)}\s*([ap])\.?m", near, re.I)
                ap = (m2.group(1) + "m") if m2 else None
            start = parse_time(f"{hm}{ap}") if ap else None
            # "Every other week," / "Semi-monthly" sits on the line above the weekday
            prev = lines[j - 1] if j else ""
            cadence_note = prev.strip(" ,") if re.match(r"(?i)^(every other|bi-?weekly|semi-?monthly|monthly|1st|2nd|3rd|4th|first|second|third|last)", prev) else None
            if not cadence_note and re.match(r"(?i)^(every other|1st|2nd|3rd|4th|first|second|third|last)\b|.* of (the |each |every )?month", cad.group(1)):
                cadence_note = cad.group(1)
            host = re.search(r"(?:Company|Host):\s*([^)]+)\)", extra) or re.search(r"\(([^)]+)\)", extra)
            out.append({"source": "Brooklyn Trivia Finder", "type": "directory", "url": "https://brooklyntrivia.org", "name": name, "hood": hood,
                        "day": day_of(cad.group(2)), "start": start, "kind": "trivia", "address": addr,
                        "cadence_text": cad.group(1), "host": host.group(1).strip() if host else None, "note": cadence_note, "status": None})
            break
    return out


def uptown_pub_quiz(text: str) -> list[dict]:
    m = re.search(r"(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day at (\d{1,2}(?::\d{2})?\s*[ap]m),? at\s*\n?\s*([^,\n]+),\s*([^,\n]+)", text, re.I)
    if not m:
        return []
    return [{"source": "Uptown Pub Quiz", "type": "operator", "url": "https://www.pubquiz.nyc/", "name": m.group(3).strip(),
             "day": day_of(m.group(1)), "start": parse_time(m.group(2)), "kind": "trivia", "address": f"{m.group(4).strip()}, New York, NY",
             "note": None, "status": None, "host": "Uptown Pub Quiz"}]


def run(pages: str, observed_at: str) -> dict:
    read = lambda f: open(os.path.join(pages, f), encoding="utf-8").read()
    obs, stated = nyc_trivia_league(read("nyctrivialeague.txt"))
    for o in obs:
        o["source_updated_at"] = stated
    obs += trivia_nyc(read("trivianyc.txt")) + nyc_trivia_list(read("nyctrivialist.txt")) + brooklyn_trivia(read("brooklyntrivia.txt")) + uptown_pub_quiz(read("pubquiz.txt"))
    for o in obs:
        o["observed_at"] = observed_at
        o.setdefault("source_updated_at", None)
    return {"observed_at": observed_at, "observations": obs,
            "not_used": [{"source": "Geeks Who Drink", "url": "https://www.geekswhodrink.com/venues/", "why": "venue list loads by script; the page text has no venues"}]}


if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1], sys.argv[2]), indent=1, ensure_ascii=False))
