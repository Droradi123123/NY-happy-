#!/usr/bin/env python3
"""
Write the public trivia, music bingo and games records for the site: site/src/data/activities.json.

  python3 scripts/activities/export_site.py <work_dir>/manifest.json site/src/data/activities.json

Only manifest rows with publish == true leave here, and only the fields a page shows. Nothing held
(quarantine, pinball-map leads, paused nights, one-source listings) is written, so it cannot reach a page,
the sitemap or a JSON file. The site's build gate checks this file again.
"""
from __future__ import annotations

import json
import re
import sys

KEEP_SOURCE = ("name", "url", "observed_at", "source_updated_at")


def street_case(label: str) -> str:
    """'99 ROGERS AVENUE, Brooklyn, NY, USA' -> '99 Rogers Avenue, Brooklyn'"""
    parts = [p.strip() for p in (label or "").split(",") if p.strip() and p.strip() not in ("USA", "NY")]
    if not parts:
        return label
    street = re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), parts[0].lower())
    street = re.sub(r"\b(\d+)(St|Nd|Rd|Th)\b", lambda m: m.group(1) + m.group(2).lower(), street)
    return ", ".join([street] + parts[1:2])


def ordinal_streets(s: str) -> str:
    """'West 31 Street' -> 'West 31st Street' (the City writes numbered streets bare)"""
    suf = lambda n: "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return re.sub(r"(?<=\s)(\d+)(?= (Street|Avenue|Road|Drive|Place|Lane|Terrace))", lambda m: m.group(1) + suf(int(m.group(1))), s)


def display_name(v: dict) -> str:
    """the trivia company's own spelling when it has a record, else the fullest name a source gives
    (Dave & Buster's Staten Island over Dave & Buster's), without research tags like (original)"""
    import html
    reg = (v.get("registry") or {}).get("title")
    if reg:
        # a league record title can carry the schedule ("Mom's Astoria Monthly Themed Wednesdays")
        return re.sub(r"\s+(Monthly|Weekly|Themed)\b.*$", "", html.unescape(reg)).strip()
    names = [v["name"]] + (v.get("aliases") or [])
    best = max(names, key=lambda n: (len(re.findall(r"[A-Za-z0-9']+", n)), -len(n)))
    return re.sub(r"\s*\((original|per map)\)", "", best).strip()


def clean_note(t: str | None) -> str | None:
    """drop notes the research export cut off mid-word"""
    if not t:
        return None
    t = t.strip()
    return None if len(t) >= 55 and not re.search(r"[.!?)]$", t) else t


def main(src: str, out: str) -> None:
    m = json.load(open(src))
    pub = [x for x in m["manifest"] if x["publish"]]
    venues, trivia, games = {}, [], []
    for x in pub:
        v = x["venue"]
        if x["venue_key"] not in venues:
            venues[x["venue_key"]] = {
                "name": display_name(v), "address": ordinal_streets(street_case(v["address"])) + (f", NY {v['zip']}" if v.get("zip") else ", NY"),
                "borough": v["borough"], "hood": v["hood"], "lat": v["lat"], "lng": v["lng"], "bar": v["bar_slug"],
                "partyVenue": v["party_venue_id"], "website": v.get("website")}
        if x["kind"] == "game":
            games.append({"key": x["key"], "v": x["venue_key"], "cat": x["category"], "game": x["game"], "games": x["games_text"],
                          "label": x["category_label"], "hours": x["hours"], "cost": x["cost"], "alcohol": x["alcohol"],
                          "sources": [{"name": s["name"], "url": s["url"], "type": s["type"]} for s in x["sources"]]})
        else:
            trivia.append({"key": x["key"], "v": x["venue_key"], "kind": "music_bingo" if x["kind"] == "music_bingo" else "trivia",
                           "musicTrivia": x["kind"] == "music_trivia", "day": x["day"], "start": x["start"], "startLabel": x["start_label"],
                           "rec": x["recurrence"]["label"], "recKind": x["recurrence"]["kind"], "host": x["host"],
                           "prize": clean_note(x["cost_note"]), "prizeSource": x["cost_source"] if clean_note(x["cost_note"]) else None,
                           "operator": x["operator_listed"],
                           "sources": [{k: s.get(k) for k in KEEP_SOURCE} for s in x["sources"]]})
    data = {"observed": m["generated_from"]["observed_at"], "workbook": m["generated_from"]["workbook_sha256"][:12],
            "venues": dict(sorted(venues.items())), "trivia": sorted(trivia, key=lambda t: (t["day"], t["start"] or "", t["key"])),
            "games": sorted(games, key=lambda g: (g["cat"], g["key"]))}
    json.dump(data, open(out, "w"), indent=1, ensure_ascii=False)
    print(f"{len(venues)} venues, {sum(t['kind'] == 'trivia' for t in trivia)} trivia, {sum(t['kind'] == 'music_bingo' for t in trivia)} music bingo, {len(games)} games -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
