#!/usr/bin/env python3
"""
Weekly re-read of the published trivia and music bingo nights (GitHub Actions, Mondays).

  python3 scripts/activities/weekly_refresh.py site/src/data/activities.json site/rechecks/trivia-latest.json [YYYY-MM-DD]

For every public night it re-reads the source the night was published on:
  * the trivia company (NYC Trivia League, TriviaNYC, Uptown Pub Quiz): a hiatus / "on hold" / "starts later"
    note takes the night off the site; a new start time replaces the old one; no longer listed = off the site
  * otherwise the curated directory that backed it (NYC Trivia List, Brooklyn Trivia Finder): no longer listed on
    that day at that time = off the site (the night no longer meets the evidence policy)
A night that is still listed gets today's "read" date. New nights a company lists are reported, not published:
a new venue needs an address check first.

Safety: if a page cannot be read, or a run would take more than 15% of the nights off at once (a redesigned page
parses as empty), nothing changes and the report says why. Nothing is ever added by this script.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.request
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
from activities import name_sim
from parse_sources import brooklyn_trivia, nyc_trivia_league, nyc_trivia_list, trivia_nyc, uptown_pub_quiz

PAGES = {
    "NYC Trivia League": ("https://nyctrivialeague.com", lambda t: nyc_trivia_league(t)),
    "TriviaNYC": ("https://trivianyc.net", trivia_nyc),
    "Uptown Pub Quiz": ("https://www.pubquiz.nyc/", uptown_pub_quiz),
    "NYC Trivia List": ("https://www.nyctrivialist.com", nyc_trivia_list),
    "Brooklyn Trivia Finder": ("https://brooklyntrivia.org", brooklyn_trivia),
}
OPERATORS = {"NYC Trivia League", "TriviaNYC", "Uptown Pub Quiz"}
CURATED = {"NYC Trivia List", "Brooklyn Trivia Finder"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 YaYNYC-check/1.0 (+https://yaynyc.com/about)"
MAX_REMOVE_SHARE = 0.15


def text_of(h: str) -> str:
    t = re.sub(r"(?is)<(script|style|svg|noscript)\b.*?</\1>", " ", h)
    t = re.sub(r"(?i)<(br|/p|/div|/li|/tr|/h[1-6]|/td|/a|/span)[^>]*>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t\r\xa0]+", " ", t)
    return re.sub(r"\s*\n\s*", "\n", t)


LOCAL = {"https://nyctrivialeague.com": "nyctrivialeague", "https://trivianyc.net": "trivianyc", "https://www.pubquiz.nyc/": "pubquiz",
         "https://www.nyctrivialist.com": "nyctrivialist", "https://brooklyntrivia.org": "brooklyntrivia"}


def fetch(url: str) -> str:
    # tests read saved copies (WEEKLY_PAGES_DIR=<dir with nyctrivialeague.html ...>)
    if os.environ.get("WEEKLY_PAGES_DIR"):
        return open(os.path.join(os.environ["WEEKLY_PAGES_DIR"], LOCAL[url] + ".html"), encoding="utf-8").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def core(n: str) -> str:
    return re.sub(r"\s+[—–-]\s+.*$", "", n or "")


def label(t: str) -> str:
    h, m = map(int, t.split(":"))
    return f"{h % 12 or 12}{':%02d' % m if m else ''}{'am' if h < 12 else 'pm'}"


def main(path: str, report_path: str, today: str) -> int:
    data = json.load(open(path))
    venues = data["venues"]
    report = {"date": today, "read": {}, "removed": [], "time_changed": [], "still_listed": 0, "new_at_operators": [], "aborted": None}
    obs = {}
    for name, (url, parse) in PAGES.items():
        try:
            got = parse(text_of(fetch(url)))
            if isinstance(got, tuple):  # NYC Trivia League also returns the week it states
                got, week = got
                for o in got:
                    o["source_updated_at"] = week
            obs[name] = got
            report["read"][name] = len(got)
        except Exception as e:  # noqa: BLE001
            report["read"][name] = f"failed: {e}"
    failed = [n for n, v in report["read"].items() if not isinstance(v, int) or v == 0]
    if failed:
        report["aborted"] = f"could not read {', '.join(failed)}: nothing changed"
        json.dump(report, open(report_path, "w"), indent=1, ensure_ascii=False)
        print(report["aborted"])
        return 0

    def find(src: str, t: dict) -> dict | None:
        kind = "music_bingo" if t["kind"] == "music_bingo" else "trivia"
        # the name this source listed the night under when it was published, then the venue's display name
        names = [s.get("listed_as") for s in t["sources"] if s["name"] == src and s.get("listed_as")] + [venues[t["v"]]["name"]]
        hits = [o for o in obs[src] if o["day"] == t["day"] and o.get("kind", "trivia") == kind
                and any(name_sim(core(o["name"]), core(n)) >= 0.75 or name_sim(o["name"], n) >= 0.75 for n in names)]
        if len(hits) > 1:
            hood = (venues[t["v"]].get("hood") or "").lower()
            hits = [o for o in hits if hood and hood in (o.get("hood") or "").lower()] or hits[:1]
        return hits[0] if hits else None

    keep, removed = [], []
    for t in data["trivia"]:
        names = [s["name"] for s in t["sources"]]
        basis = [n for n in names if n in OPERATORS] or [n for n in names if n in CURATED]
        if not basis:  # nothing re-readable (should not happen: the policy needs one of these)
            keep.append(t)
            continue
        src = basis[0]
        o = find(src, t)
        who = f"{venues[t['v']]['name']} ({t['day']})"
        if not o:
            removed.append({"night": who, "key": t["key"], "why": f"no longer listed by {src}"})
            continue
        if o.get("status") in ("paused", "upcoming"):
            removed.append({"night": who, "key": t["key"], "why": f"{src}: {o.get('note')}"})
            continue
        if src in OPERATORS and o.get("start") and o["start"] != t["start"]:
            report["time_changed"].append({"night": who, "key": t["key"], "from": t["start"], "to": o["start"], "per": src})
            t["start"], t["startLabel"] = o["start"], label(o["start"])
        elif src in CURATED and o.get("start") and o["start"] != t["start"]:
            removed.append({"night": who, "key": t["key"], "why": f"{src} now lists {o['start']}, not {t['start']}: sources no longer agree"})
            continue
        for s in t["sources"]:
            if s["name"] == src:
                s["observed_at"] = today
                if o.get("source_updated_at"):
                    s["source_updated_at"] = o["source_updated_at"]
        report["still_listed"] += 1
        keep.append(t)

    if len(removed) > MAX_REMOVE_SHARE * len(data["trivia"]):
        report["aborted"] = f"{len(removed)} of {len(data['trivia'])} nights would come off at once (over {int(MAX_REMOVE_SHARE * 100)}%): nothing changed; check the source pages"
        report["would_remove"] = removed
        json.dump(report, open(report_path, "w"), indent=1, ensure_ascii=False)
        print(report["aborted"])
        return 0

    # new nights at the companies (reported for review; a new venue needs an address check before it is shown)
    known = {(core(n).lower(), t["day"]) for t in data["trivia"] for n in [venues[t["v"]]["name"]] + [s.get("listed_as") or "" for s in t["sources"]] if n}
    for src in OPERATORS:
        for o in obs.get(src, []):
            if o.get("status") in ("paused", "upcoming"):
                continue
            if not any(name_sim(core(o["name"]), n) >= 0.75 and d == o["day"] for n, d in known):
                report["new_at_operators"].append({"name": o["name"], "day": o["day"], "start": o.get("start"), "kind": o.get("kind"), "source": src})

    data["trivia"] = keep
    used = {t["v"] for t in keep} | {g["v"] for g in data["games"]}
    data["venues"] = {k: v for k, v in venues.items() if k in used}
    data["observed"] = today
    report["removed"] = removed
    json.dump(data, open(path, "w"), indent=1, ensure_ascii=False)
    json.dump(report, open(report_path, "w"), indent=1, ensure_ascii=False)
    print(f"read {report['read']}; still listed {report['still_listed']}, removed {len(removed)}, time changed {len(report['time_changed'])}, new at operators {len(report['new_at_operators'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else date.today().isoformat()))
