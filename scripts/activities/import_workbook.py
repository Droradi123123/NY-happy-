#!/usr/bin/env python3
"""
Import NYC_Trivia_and_Games_Research_Dataset.xlsx into internal candidates (never public by itself).

  python3 scripts/activities/import_workbook.py <workbook.xlsx> <out_dir>

Writes <out_dir>/candidates.json (venues, listings, exclusions, merges, ambiguities) and report.md.
Idempotent: the same workbook gives byte-identical output (keys come from names and addresses, rows are
sorted), and the database load upserts on those keys. Requires openpyxl (local tool, not a site dependency).

Treatment (as approved):
  * Active trivia and curated games -> candidates, not publishable by themselves
  * Paused / not started -> kept with that status, never active
  * Music bingo -> its own kind, never counted as trivia
  * Quarantine, pinball-only and excluded rows -> internal; exclusions keep their reason so a later
    import cannot bring them back
  * Unknown cost, cadence, host, registration, team size or hours stay unknown
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict

import openpyxl

sys.path.insert(0, os.path.dirname(__file__))
from activities import (ALIASES, address_key, borough_of, day_of, fold, freshness_parts, kind_of, listing_key, name_key,
                        name_sim, parse_time, recurrence_of, sha256_file, slug, status_of, venue_key, zip_of)

TRIVIA_SHEETS = {"Trivia - Active listed": "active", "Trivia - Paused or not started": "paused",
                 "Music Bingo": "bingo", "Quarantine - geography": "quarantine"}
# games named in the workbook's category and activity text -> one listing per game
GAME_WORDS = [
    ("arcade", r"arcade"), ("pinball", r"pinball"), ("shuffleboard", r"shuffleboard"), ("bowling", r"bowl"),
    ("ping_pong", r"ping[ -]?pong|table tennis"), ("mini_golf", r"mini[ -]?golf|putt"), ("board_games", r"board game|tabletop|board-game"),
    ("pool", r"\bpool\b|billiard"), ("darts", r"\bdarts?\b"), ("bocce", r"bocce"), ("axe_throwing", r"axe"),
    ("skee_ball", r"skee"), ("smash_throwing", r"glass-smash|smash"), ("foosball", r"foosball"), ("karaoke", r"karaoke"),
]


def rows(ws):
    it = list(ws.iter_rows(values_only=True))
    head = [str(h).strip() if h is not None else "" for h in it[0]]
    for i, r in enumerate(it[1:], start=2):
        if any(v not in (None, "") for v in r):
            yield i, {h: (v.strip() if isinstance(v, str) else v) for h, v in zip(head, r)}


def clean_address(a):
    if not a or str(a).strip().lower() == "not found":
        return None
    a = str(a)
    # extraction noise seen in the workbook: "30 Hosts: Felipe and David 253 Bushwick Ave., Brooklyn"
    m = re.search(r"hosts?:.*?(\d+\s+[A-Za-z].*)$", a, re.I)
    return (m.group(1) if m else a).strip()


def sources_of(r):
    names = [s.strip() for s in re.split(r",\s*(?![^()]*\))", r.get("Sources") or "") if s.strip()]
    urls = [u.strip() for u in (r.get("Source URLs") or r.get("Source URL") or "").split("\n") if u.strip()]
    fresh = {f["source"]: f for f in freshness_parts(r.get("Source freshness"))}
    out = []
    for i, n in enumerate(names):
        base = re.sub(r"\s*\(.*\)$", "", n).strip()
        f = fresh.get(n) or fresh.get(base) or {}
        out.append({"name": base, "type": "operator" if "(operator)" in n else "directory" if r.get("Sources") else "unknown",
                    "url": urls[i] if i < len(urls) else None, "observed": f.get("observed"),
                    "stated_update": f.get("stated"), "stated_raw": f.get("stated_raw")})
    return out


def run(path: str, out_dir: str) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    file_sha = sha256_file(path)
    ref = lambda sheet, row, wb_id, vid=None: {"file_sha256": file_sha, "sheet": sheet, "row": row, "wb_id": wb_id, "wb_venue_id": vid}

    # ---------- trivia rows ----------
    trows = []
    for sheet, cls in TRIVIA_SHEETS.items():
        if sheet not in wb.sheetnames:
            continue
        for rn, r in rows(wb[sheet]):
            name = r.get("Venue") or ""
            name = ALIASES.get(fold(name), name)
            trows.append({"sheet": sheet, "cls": cls, "row": rn, "r": r, "name": name, "addr": clean_address(r.get("Address (as found)")),
                          "boro": borough_of(r.get("Borough (best evidence)")) or None})

    # one address per workbook venue id, but only for rows whose names agree (V-0312 holds two different names)
    by_vid = defaultdict(list)
    for t in trows:
        by_vid[t["r"].get("Venue ID")].append(t)
    ambiguities = []
    for vid, ts in by_vid.items():
        for t in ts:
            if t["addr"]:
                continue
            donors = {d["addr"] for d in ts if d["addr"] and name_sim(d["name"], t["name"]) >= 0.5}
            if len(donors) == 1:
                t["addr"], t["addr_from"] = donors.pop(), "same workbook venue id"
        names = {t["name"] for t in ts}
        if len(names) > 1 and min(name_sim(a, b) for a in names for b in names) < 0.5:
            ambiguities.append({"type": "one workbook venue id, different names", "wb_venue_id": vid, "names": sorted(names),
                                "addresses": sorted({t["addr"] for t in ts if t["addr"]}), "treatment": "kept as separate venues"})

    venues, listings, merges = {}, {}, []
    def venue(name, addr, boro, src):
        k = venue_key(name, addr, boro)
        # the same address under a variant of the same name ("Emblem" / "Emblem Sports Bar") is one venue
        ak = address_key(addr)
        if ak and k not in venues:
            same = [v for v in venues.values() if v["address_key"] == ak and name_sim(v["name"], name) >= 0.5]
            if same:
                k = same[0]["key"]
        v = venues.setdefault(k, {"key": k, "name": name, "aliases": [], "address": addr, "address_key": address_key(addr), "zip": zip_of(addr),
                                  "borough_claims": [], "hood_labels": [], "identity": "address" if addr else "name_only", "src_refs": []})
        if name != v["name"] and name not in v["aliases"]:
            v["aliases"].append(name)
        if boro and boro not in v["borough_claims"]:
            v["borough_claims"].append(boro)
        v["src_refs"].append(src)
        return v

    for t in sorted(trows, key=lambda t: (t["sheet"], t["row"])):
        r = t["r"]
        src = ref(t["sheet"], t["row"], r.get("ID"), r.get("Venue ID"))
        v = venue(t["name"], t["addr"], t["boro"], src)
        hood = r.get("Neighborhood (source label)")
        if hood and hood not in v["hood_labels"]:
            v["hood_labels"].append(hood)
        kind = kind_of(r.get("Activity"))
        day = day_of(r.get("Day"))
        k = listing_key(v["key"], kind, day)
        start = parse_time(r.get("Start time"))
        host = r.get("Host / company")
        if host and (host == "Not stated" or borough_of(host) or host in {"Manhattan", "Brooklyn", "Queens"}):
            host = None  # "Manhattan" in the host column is extraction noise, not a host
        cost = r.get("Cost to play")
        L = listings.get(k)
        rec = {"start": start, "start_raw": r.get("Start time"), "status": status_of(r.get("Listing status")), "sheet_class": t["cls"],
               "recurrence": recurrence_of(r.get("Recurrence stated by sources")), "host": host,
               "cost": None if not cost or cost == "Not stated" else cost, "wb_evidence": r.get("Evidence level"),
               "wb_geo_check": r.get("Geography check"), "operator_listed": r.get("Operator-listed?") == "Yes",
               "sources": sources_of(r), "time_disagreement": r.get("Time disagreement"), "notes": r.get("Source notes / unknowns"), "src_ref": src}
        if L is None:
            listings[k] = {"key": k, "venue_key": v["key"], "kind": kind, "day": day, "category": None, "observations": [rec]}
        else:
            L["observations"].append(rec)

    # a venue with no street address whose name matches exactly one addressed venue in the same borough is that venue
    addressed = defaultdict(list)
    for v in venues.values():
        if v["address"]:
            addressed[(name_key(v["name"]), v["borough_claims"][0] if v["borough_claims"] else None)].append(v)
    for v in list(venues.values()):
        if v["address"]:
            continue
        cands = addressed.get((name_key(v["name"]), v["borough_claims"][0] if v["borough_claims"] else None), [])
        if len(cands) == 1:
            target = cands[0]
            merges.append({"from": v["key"], "into": target["key"], "basis": "same name, the only addressed venue of that name in the borough",
                           "names": [v["name"], target["name"]]})
            target["src_refs"] += v["src_refs"]
            for a in [v["name"]] + v["aliases"]:
                if a != target["name"] and a not in target["aliases"]:
                    target["aliases"].append(a)
            for L in [L for L in listings.values() if L["venue_key"] == v["key"]]:
                nk = listing_key(target["key"], L["kind"], L["day"])
                del listings[L["key"]]
                if nk in listings:
                    listings[nk]["observations"] += L["observations"]
                else:
                    L["key"], L["venue_key"] = nk, target["key"]
                    listings[nk] = L
            del venues[v["key"]]
        elif len(cands) > 1:
            ambiguities.append({"type": "no address, several addressed venues share the name", "venue": v["key"],
                                "candidates": [c["key"] for c in cands], "treatment": "kept apart, identity unresolved"})

    # same address, different names: a shared building, a renamed bar or a successor business
    by_addr = defaultdict(list)
    for v in venues.values():
        if v["address_key"]:
            by_addr[v["address_key"]].append(v)
    for ak, vs in by_addr.items():
        if len(vs) > 1:
            ambiguities.append({"type": "same address, different names", "address_key": ak, "venues": [v["key"] for v in vs],
                                "names": [v["name"] for v in vs], "treatment": "kept apart; check which is current"})
    # one brand at several addresses: real locations, kept apart (never merged by name)
    by_name = defaultdict(list)
    for v in venues.values():
        by_name[name_key(v["name"])].append(v)
    for nk, vs in by_name.items():
        if len(vs) > 1:
            ambiguities.append({"type": "same name, several locations", "name": vs[0]["name"], "venues": [v["key"] for v in vs],
                                "treatment": "separate locations unless an address proves otherwise"})

    # the same venue, day and kind seen twice with different start times
    for L in listings.values():
        times = sorted({o["start"] for o in L["observations"] if o["start"]})
        L["conflicts"] = [f"start time differs between workbook rows: {', '.join(times)}"] if len(times) > 1 else []
        for o in L["observations"]:
            if o["time_disagreement"]:
                L["conflicts"].append(f"{o['src_ref']['wb_id']}: {o['time_disagreement']}")

    # ---------- games ----------
    def game_cats(text):
        return [c for c, rx in GAME_WORDS if re.search(rx, fold(text))]
    for sheet, cls in [("Games Bars (curated)", "games_curated"), ("Games - Pinball only", "pinball_only")]:
        if sheet not in wb.sheetnames:
            continue
        for rn, r in rows(wb[sheet]):
            src = ref(sheet, rn, r.get("ID"))
            addr = clean_address(r.get("Address"))
            v = venue(r.get("Venue") or "", addr, borough_of(r.get("Borough")), src)
            if r.get("Neighborhood") and r["Neighborhood"] not in v["hood_labels"]:
                v["hood_labels"].append(r["Neighborhood"])
            text = f"{r.get('Category') or ''} {r.get('Games / activities') or r.get('Pinball listed') or ''}"
            cats = game_cats(text) or ["other"]
            if cls == "pinball_only":
                cats = ["pinball"]
            for c in cats:
                k = listing_key(v["key"], "game", c)
                rec = {"status": "listed", "sheet_class": cls, "category_label": r.get("Category"), "games_text": r.get("Games / activities") or r.get("Pinball listed"),
                       "hours": None if fold(r.get("Hours") or r.get("Hours (as reported, with source)")) in ("", "not checked", "not captured", "not verified") else (r.get("Hours (as reported, with source)") or r.get("Hours")),
                       "cost": None if fold(r.get("Cost (as reported)") or r.get("Cost")) in ("", "not stated", "not checked", "not captured", "not verified") else (r.get("Cost (as reported)") or r.get("Cost")),
                       "alcohol": r.get("Alcohol"), "status_evidence": r.get("Status evidence (not a live check)"), "wb_evidence": r.get("Evidence level"),
                       "sources": [{"name": n.strip(), "url": u, "type": "official" if "official" in fold(n) else "crowdsourced" if "crowdsourced" in fold(n) else "editorial"}
                                   for n, u in zip(re.split(r";\s*", r.get("Sources") or r.get("Source") or ""), (r.get("Source URLs") or r.get("Source URL") or "").split("\n"))],
                       "notes": r.get("Notes / unknowns") or r.get("Notes"), "src_ref": src}
                L = listings.setdefault(k, {"key": k, "venue_key": v["key"], "kind": "game", "day": None, "category": c, "observations": [], "conflicts": []})
                L["observations"].append(rec)

    # ---------- exclusions (kept so a later import cannot reintroduce them) ----------
    exclusions = []
    if "Not Listed (excluded)" in wb.sheetnames:
        for rn, r in rows(wb["Not Listed (excluded)"]):
            item = re.sub(r"\s*\((mon|tues|wednes|thurs|fri|satur|sun)day\)$", "", r.get("Item") or "", flags=re.I)
            exclusions.append({"key": f"{slug(name_key(item) or item)}--{address_key(clean_address(r.get('Address (as found)'))) or 'noaddr'}",
                               "name": item, "type": r.get("Type"), "address": r.get("Address (as found)"), "reason": r.get("Why excluded"),
                               "source_url": r.get("Source URL"), "src_ref": ref("Not Listed (excluded)", rn, None)})
    ex_names = {e["key"].split("--")[0] for e in exclusions}
    for L in listings.values():
        v = venues[L["venue_key"]]
        L["excluded"] = slug(name_key(v["name"])) in ex_names and any(e["key"].split("--")[0] == slug(name_key(v["name"])) and
                         (e["key"].endswith("noaddr") or e["key"].split("--")[1] == (v["address_key"] or "")) for e in exclusions)

    out = {"workbook": {"file": os.path.basename(path), "sha256": file_sha, "sheets": wb.sheetnames},
           "venues": sorted(venues.values(), key=lambda v: v["key"]),
           "listings": sorted(listings.values(), key=lambda L: L["key"]),
           "exclusions": sorted(exclusions, key=lambda e: e["key"]), "merges": merges,
           "ambiguities": sorted(ambiguities, key=lambda a: json.dumps(a, sort_keys=True))}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "candidates.json"), "w") as f:
        json.dump(out, f, indent=1, sort_keys=True, ensure_ascii=False)
    return out


def summary(out: dict) -> str:
    from collections import Counter
    L = out["listings"]
    cls = lambda l: l["observations"][0]["sheet_class"]
    c = Counter((l["kind"], cls(l)) for l in L)
    trivia_active = [l for l in L if l["kind"] in ("trivia", "music_trivia") and any(o["sheet_class"] == "active" for o in l["observations"])]
    lines = ["# Import dry run", "", f"Workbook {out['workbook']['file']} sha256 {out['workbook']['sha256'][:16]}", "",
             f"- venues: {len(out['venues'])} (with a street address: {sum(1 for v in out['venues'] if v['address'])})",
             f"- listings: {len(L)}", *[f"  - {k[0]} / {k[1]}: {n}" for k, n in sorted(c.items())],
             f"- active trivia listings: {len(trivia_active)} at {len({l['venue_key'] for l in trivia_active})} venues",
             f"- listings with a time conflict: {sum(1 for l in L if l['conflicts'])}",
             f"- exclusions kept: {len(out['exclusions'])}; listings matching an exclusion: {sum(1 for l in L if l['excluded'])}",
             f"- merges applied: {len(out['merges'])}", f"- ambiguities reported: {len(out['ambiguities'])}"]
    return "\n".join(lines)


if __name__ == "__main__":
    o = run(sys.argv[1], sys.argv[2])
    s = summary(o)
    open(os.path.join(sys.argv[2], "dry-run.md"), "w").write(s + "\n")
    print(s)
