#!/usr/bin/env python3
"""
Reconcile candidates with fresh source observations and the City geography, apply the evidence policy,
and write the publication manifest (what may be shown, with the exact public wording) plus reports.

  python3 scripts/activities/build_manifest.py <work_dir>

<work_dir> holds candidates.json (import_workbook.py), observations.json (parse_sources.py),
geosearch.json (raw GeoSearch features by venue key), db_bars.txt (slug|status|name|address|hood|lat|lng)
and party_venues.json. Writes manifest.json, review.md and site_activities.json (the public rows only,
in the shape the site reads).

EVIDENCE POLICY (approved with the plan; every rule is checked per listing, never per venue)
Trivia and music bingo, a listing is public only when ALL hold:
  T1 identity: the venue has a street address that NYC GeoSearch matches exactly (house number, street,
     borough); a name alone never identifies a venue
  T2 not one of two different businesses at one address, unless this listing has a current operator listing
  T3 not excluded (outside NYC, one-off, closed) and not paused or "starts later" per the newest source
  T4 schedule: the trivia company itself lists it (NYC Trivia League, TriviaNYC, Uptown Pub Quiz), or two
     different sources agree on the same day AND start time, one of them a curated directory (NYC Trivia List,
     Brooklyn Trivia Finder): two aggregators (BadSlava, TriviaNearMe) agreeing is not enough
  T5 one start time: the operator's time when an operator lists it; otherwise the time the agreeing sources
     share; sources that disagree with no operator to settle it keep the listing internal
  Shown: day, time, the source(s) and the date we read them. "Weekly" only when a source says so (NYC Trivia
  League lists its games under "In-person weekly trivia"); otherwise "Listed on Tuesdays. Confirm with the
  venue." Host, cost and prizes only when a source states them, attributed. Music bingo never counts as trivia.
Games, a listing is public only when:
  G1 the same exact-address rule as T1
  G2 it comes from the curated games research (pinball-map-only leads stay internal)
  G3 the venue's own website lists the place or the game, or two editorial sources do and nothing says it closed
  Shown: the games; hours and prices only when the venue's own site states them ("per its website"), never
  from a guide; alcohol only as the sources state it ("not confirmed" for cafes).
Workbook evidence labels (High/Medium/Low) are kept for review but never decide publication by themselves.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from activities import DAYS, address_key, canonical_name, listing_key, venue_key, fold, name_key, name_sim, parse_time, slug, split_address
from geo import decide

OPERATORS = {"NYC Trivia League", "TriviaNYC", "Uptown Pub Quiz"}
# aggregators that may copy each other (BadSlava's city field was wrong for Pete's Saloon): two of them agreeing is not
# two independent sources, so without an operator one curated directory must be among the agreeing sources
AGGREGATORS = {"BadSlava", "TriviaNearMe"}
DAY_NAME = dict(zip(DAYS, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]))
# GeoSearch neighbourhood -> the site's neighborhood name (the same mapping geo_hood_map holds)
HOOD_ALIAS = {"Bedford-Stuyvesant": "Bed-Stuy", "Central Harlem": "Harlem", "Spanish Harlem": "East Harlem", "Flatiron District": "Flatiron",
              "Midtown West": "Midtown", "Midtown East": "Midtown", "South Slope": "Park Slope", "Two Bridges": "Lower East Side",
              "Alphabet City": "East Village", "Theater District": "Times Square", "Garment District": "Midtown", "Koreatown": "Koreatown",
              "NoMad": "Flatiron", "Little Italy": "Nolita", "Ditmars Steinway": "Astoria", "Hunters Point": "Long Island City",
              "East Williamsburg": "Williamsburg", "Prospect Lefferts Gardens": "Flatbush", "Ditmas Park": "Flatbush", "Columbia Street Waterfront District": "Carroll Gardens"}
GAME_LABEL = {"arcade": "Arcade games", "pinball": "Pinball", "shuffleboard": "Shuffleboard", "bowling": "Bowling", "ping_pong": "Ping pong",
              "mini_golf": "Mini golf", "board_games": "Board games", "pool": "Pool", "darts": "Darts", "bocce": "Bocce", "axe_throwing": "Axe throwing",
              "skee_ball": "Skee-Ball", "smash_throwing": "Glass-smash throwing", "foosball": "Foosball", "karaoke": "Karaoke"}


def ampm(t: str | None) -> str | None:
    if not t:
        return None
    h, m = map(int, t.split(":"))
    return f"{h % 12 or 12}{':%02d' % m if m else ''}{'am' if h < 12 else 'pm'}"


ORD = r"(?:\d(?:st|nd|rd|th)|first|second|third|fourth|last)"


def cadence_phrase(note: str) -> str:
    """the cadence words only: MONTHLY!** Call venue... -> Monthly; 3rd Tuesday of every month: Themed... -> 3rd Tuesday of every month"""
    m = re.search(rf"(?i)({ORD}(?:\s*(?:and|&)\s*{ORD})?\s+\w+days?(?:\s+of\s+(?:the\s+|each\s+|every\s+)?month)?|every other \w+|semi-?monthly|bi-?weekly|monthly)", note or "")
    t = (m.group(1) if m else "Not weekly").strip()
    return t[0].upper() + t[1:].lower() if t.isupper() or t.islower() else t[0].upper() + t[1:]


def same_place(a: str | None, b: str | None) -> bool:
    """same house number (Queens hyphen ignored) and first street word: 37-19 Broadway at 38th St = 37-19 Broadway"""
    pa, pb = split_address(a), split_address(b)
    return bool(pa and pb and pa[0].replace("-", "") == pb[0].replace("-", "") and pa[1][:1] == pb[1][:1])


def times_from_disagreement(text: str) -> dict[str, set[str]]:
    """'7:30pm: Brooklyn Trivia Finder, NYC Trivia League; 7:00pm: NYC Trivia List' -> {'19:30': {...}, '19:00': {...}}"""
    out = defaultdict(set)
    for part in (text or "").split(";"):
        m = re.match(r"\s*([0-9:]+\s*[ap]m):\s*(.+)$", part.strip(), re.I)
        if m:
            out[parse_time(m.group(1))] |= {s.strip() for s in m.group(2).split(",") if s.strip()}
    return out


def main(work: str) -> None:
    load = lambda f: json.load(open(os.path.join(work, f)))
    cand, obs, geo = load("candidates.json"), load("observations.json"), load("geosearch.json")
    observed_at = obs["observed_at"]
    venues = {v["key"]: v for v in cand["venues"]}
    listings = {l["key"]: l for l in cand["listings"]}
    for l in listings.values():
        l["fresh"] = []

    merges_applied = []
    registry = load("nyctl_registry.json") if os.path.exists(os.path.join(work, "nyctl_registry.json")) else []
    core = lambda t: re.sub(r"\s+[\u2014\u2013-]\s+.*$", "", t or "")
    for o in obs["observations"]:
        if o["source"] != "NYC Trivia League" or o.get("address"):
            continue
        rs = [r for r in registry if name_sim(core(r["title"]), core(o["name"])) >= 0.75 and address_key(r["loc"])]
        if len(rs) > 1 and o.get("hood"):
            rs = [r for r in rs if fold(o["hood"]) in fold(r["title"] + " " + r["tag"])] or rs
        if len(rs) == 1:
            o["address"], o["address_from"] = rs[0]["loc"], "NYC Trivia League venue record"

    # ---------- attach fresh observations ----------
    unmatched, ambiguous_obs = [], []
    by_day = defaultdict(list)
    for l in listings.values():
        if l["kind"] != "game":
            by_day[(l["day"], "trivia" if l["kind"] in ("trivia", "music_trivia") else l["kind"])].append(l)
    for o in obs["observations"]:
        kind = "trivia" if o["kind"] in ("trivia", "music_trivia") else o["kind"]
        pool = by_day.get((o["day"], kind), [])
        ak = address_key(o.get("address"))
        # "Thief — Williamsburg": the neighborhood after the dash is not part of the name
        oname = canonical_name(re.sub(r"\s+[—–-]\s+.*$", "", o["name"]) if re.search(r"\s[—–-]\s", o["name"]) else o["name"])
        sim = lambda l: max(name_sim(oname, n) for n in [venues[l["venue_key"]]["name"]] + venues[l["venue_key"]]["aliases"])
        near = lambda l: bool(o.get("hood")) and any(fold(o["hood"]) in fold(h) or fold(h) in fold(o["hood"]) for h in venues[l["venue_key"]]["hood_labels"])
        hits = [l for l in pool if ak and venues[l["venue_key"]]["address_key"] == ak and sim(l) >= 0.5]
        if not hits:
            # a close name, or a looser one in the same neighborhood ("Keg & Lantern Red Hook" = Keg & Lantern Brewing, Red Hook)
            hits = [l for l in pool if sim(l) >= 0.75 or (sim(l) >= 0.5 and near(l))]
            if len(hits) > 1 and o.get("hood"):
                hits = [l for l in hits if near(l)] or hits
            if len(hits) > 1:
                exact = [l for l in hits if name_key(venues[l["venue_key"]]["name"]) == name_key(o["name"])]
                hits = exact if len(exact) == 1 else hits
        if len(hits) == 1:
            hits[0]["fresh"].append(o)
        elif hits:
            ambiguous_obs.append({"obs": o, "candidates": [l["key"] for l in hits]})
        else:
            unmatched.append(o)

    # ---------- NYC Trivia League's own venue records: address and website, by name ----------
    # (the weekly page says who plays when; these records say where. They are not used for the schedule:
    # some were last edited in 2022. A "Monthly ..." line does override the weekly wording.)
    league_venues = {l["venue_key"] for l in listings.values() if any(o["source"] == "NYC Trivia League" for o in l["fresh"])}
    reg_used, reg_conflicts, rekey = set(), [], []
    for v in venues.values():
        names = [v["name"]] + v["aliases"]
        cands = [r for r in registry if address_key(r["loc"]) and v["address_key"] and address_key(r["loc"]).replace("-", "") == v["address_key"].replace("-", "")
                 and max(name_sim(core(r["title"]), n) for n in names) >= 0.5]
        if not cands and v["key"] in league_venues:
            cands = [r for r in registry if max(name_sim(core(r["title"]), core(n)) for n in names) >= 0.75 or max(name_sim(r["title"], n) for n in names) >= 0.9]
            if len(cands) > 1:
                hood = [r for r in cands if any(fold(h) in fold(r["title"] + " " + r["tag"]) for h in v["hood_labels"])]
                cands = hood if len(hood) == 1 else cands
        if len(cands) != 1:
            continue
        r = cands[0]
        reg_used.add(r["slug"])
        v["registry"] = {"title": r["title"], "url": r["link"], "address": r["loc"], "website": r["site"] or None, "line": r["tag"], "modified": r["modified"][:10]}
        rk = address_key(r["loc"])
        if not v["address"]:
            v.update({"address": r["loc"], "address_key": rk, "zip": (re.search(r"\b(1[01]\d{3})\b", r["loc"]) or [None, None])[1], "identity": "operator_record",
                      "geo_key": f"reg:{r['slug']}"})
            rekey.append(v["key"])
        elif rk and not same_place(r["loc"], v["address"]):
            reg_conflicts.append({"venue": v["key"], "workbook_address": v["address"], "league_address": r["loc"], "league_record_modified": r["modified"][:10]})
            if v["key"] in league_venues:
                v["address_alternate"] = v["address"]
                v.update({"address": r["loc"], "address_key": rk, "zip": (re.search(r"\b(1[01]\d{3})\b", r["loc"]) or [None, None])[1], "identity": "operator_record",
                          "geo_key": f"reg:{r['slug']}"})

    # a venue that just got its street address from the league is either a venue we already have at that
    # address (merge: one venue, one listing per day) or a new identity (new key from name + address)
    for k in rekey:
        v = venues.pop(k)
        same = [u for u in venues.values() if u["address"] and same_place(u["address"], v["address"])
                and max(name_sim(core(a), core(b)) for a in [u["name"]] + u["aliases"] for b in [v["name"]] + v["aliases"]) >= 0.5]
        if same:
            u = same[0]
            merges_applied.append({"from": k, "into": u["key"], "basis": "league record gives the same address"})
            for a in [v["name"]] + v["aliases"]:
                if a != u["name"] and a not in u["aliases"]:
                    u["aliases"].append(a)
            u["src_refs"] += v["src_refs"]
            u.setdefault("registry", v.get("registry"))
            target = u
        else:
            v["key"] = venue_key(v["name"], v["address"], None)
            venues[v["key"]] = v
            target = v
        for L in [L for L in list(listings.values()) if L["venue_key"] == k]:
            del listings[L["key"]]
            nk = listing_key(target["key"], L["kind"], L["day"] if L["kind"] != "game" else L["category"])
            if nk in listings:
                listings[nk]["observations"] += L["observations"]
                listings[nk]["fresh"] += L["fresh"]
                listings[nk]["conflicts"] += L["conflicts"]
            else:
                L["key"], L["venue_key"] = nk, target["key"]
                listings[nk] = L

    # ---------- geography and links to existing pages ----------
    db = [dict(zip("slug status name address hood lat lng".split(), l.split("|"))) for l in open(os.path.join(work, "db_bars.txt")).read().split("\n") if l]
    db_by_addr = defaultdict(list)
    for b in db:
        if b["status"] == "live" and address_key(b["address"]):
            db_by_addr[address_key(b["address"])].append(b)
    party = load("party_venues.json")
    for v in venues.values():
        claims = v["borough_claims"] or None
        if v.get("geo_key"):
            claims = None  # the league's own street address, checked against the City record without a directory's borough label
        v["geo"] = decide(v["address"], v["zip"], geo.get(v.get("geo_key") or v["key"]), claims) if v["address"] else {"status": "no_address", "reason": "no street address in any source"}
        bars = [b for b in db_by_addr.get(v["address_key"], []) if max(name_sim(n, b["name"]) for n in [v["name"]] + v["aliases"]) >= 0.5]
        v["bar_slug"] = bars[0]["slug"] if len(bars) == 1 else None
        pv = [p for p in party if address_key(p["address"]) == v["address_key"] and name_sim(p["name"], v["name"]) >= 0.5]
        v["party_venue_id"] = pv[0]["id"] if len(pv) == 1 else None
        g = v["geo"]
        nb = g.get("neighbourhood")
        v["hood"] = HOOD_ALIAS.get(nb, nb) if g["status"] == "verified" else None
        v["borough"] = g.get("borough") if g["status"] == "verified" else None

    # reviewed decisions (scripts/activities/decisions.json): each with its reason, evidence and date
    dpath = os.path.join(os.path.dirname(__file__), "decisions.json")
    decisions = {d["venue"]: d for d in (json.load(open(dpath)) if os.path.exists(dpath) else [])}
    held_pairs = defaultdict(list)
    for a in cand["ambiguities"]:
        if a["type"] == "same address, different names":
            for k in a["venues"]:
                held_pairs[k] = [x for x in a["venues"] if x != k]

    # ---------- policy ----------
    manifest, counts = [], Counter()
    for l in sorted(listings.values(), key=lambda l: l["key"]):
        v = venues[l["venue_key"]]
        why_not, d = [], {"key": l["key"], "venue_key": v["key"], "kind": l["kind"], "category": l["category"], "day": l["day"]}
        if v["geo"]["status"] != "verified":
            why_not.append(f"T1/G1 identity: {v['geo']['status']} ({v['geo'].get('reason')})")
        if l["excluded"]:
            why_not.append("T3 excluded")
        if l["kind"] == "game":
            o = l["observations"][0]
            srcs = o["sources"]
            official = [s for s in srcs if s["type"] == "official"]
            editorial = [s for s in srcs if s["type"] == "editorial"]
            if o["sheet_class"] == "pinball_only":
                why_not.append("G2 pinball-map-only lead")
            elif not official and len(editorial) < 2:
                why_not.append("G3 neither the venue's own site nor two editorial sources")
            if re.search(r"closed|not confirmed|coming", fold(o.get("status_evidence"))):
                why_not.append("G3 status not confirmed")
            hours = o["hours"] if o["hours"] and fold(o["hours"]).startswith("official") else None
            cost = o["cost"] if o["cost"] and fold(o["cost"]).startswith("official") else None
            alc = fold(o.get("alcohol"))
            d.update({"games_text": o["games_text"], "category_label": o["category_label"], "game": GAME_LABEL.get(l["category"], l["category"]),
                      "hours": re.sub(r"^Official:\s*", "", hours) if hours else None, "cost": re.sub(r"^Official:\s*", "", cost) if cost else None,
                      "alcohol": "yes" if alc.startswith("yes") else "beer_wine" if alc.startswith("beer") else "not_confirmed",
                      "alcohol_text": o.get("alcohol"),
                      "sources": [{"name": s["name"], "url": s["url"], "type": s["type"]} for s in srcs if s["type"] != "crowdsourced"],
                      "wb_evidence": o["wb_evidence"], "status": "listed"})
        else:
            # newest status: a fresh source note beats the workbook (both were read Oct 16, the fresh one is ours)
            fresh_status = [o["status"] for o in l["fresh"] if o["status"] in ("paused", "upcoming")]
            wb_status = {o["status"] for o in l["observations"]}
            status = fresh_status[0] if fresh_status else ("paused" if wb_status == {"paused"} else "upcoming" if wb_status == {"upcoming"} else "listed")
            if status != "listed":
                why_not.append(f"T3 {status} per {'the operator' if fresh_status else 'the workbook'}")
            dec = decisions.get(v["key"]) or {}
            if dec.get("action") == "exclude":
                why_not.append(f"D excluded {dec['decided']}: {dec['reason']}")
            if held_pairs.get(v["key"]) and not any(o["source"] in OPERATORS for o in l["fresh"]) and dec.get("action") != "waive_T2":
                why_not.append(f"T2 another business is listed at the same address ({', '.join(held_pairs[v['key']])})")
            # who says which time
            says = defaultdict(set)
            # an operator named in the workbook counts only if our own read of that operator's page found this
            # venue on this day (the workbook credited NYC Trivia League to the wrong Captain's)
            # and any source we re-read ourselves speaks for itself: its fresh line replaces what the workbook says it said
            # (the workbook credited Brooklyn Trivia Finder with 9pm at Post No Bills; the page says 8:30pm)
            fresh_ops = {o["source"] for o in l["fresh"] if o["source"] in OPERATORS}
            fresh_src = {o["source"] for o in l["fresh"]}
            keep = lambda names: {n for n in names if (n not in OPERATORS or n in fresh_ops) and n not in fresh_src}
            for o in l["observations"]:
                if o.get("time_disagreement"):
                    for t, names in times_from_disagreement(o["time_disagreement"]).items():
                        says[t] |= keep(names)
                elif o["start"]:
                    says[o["start"]] |= keep({s["name"] for s in o["sources"]})
            for o in l["fresh"]:
                if o["start"]:
                    says[o["start"]].add(o["source"])
            op_times = {t for t, names in says.items() if names & OPERATORS}
            if len(op_times) == 1:
                start = op_times.pop()
            elif len(op_times) > 1:
                start = None
                why_not.append(f"T5 operators disagree on the time: {sorted(op_times)}")
            else:
                agreed = [t for t, names in says.items() if len(names) >= 2 and names - AGGREGATORS]
                start = agreed[0] if len(agreed) == 1 else None
                if not agreed:
                    if any(len(n) >= 2 for n in says.values()):
                        why_not.append("T4 only aggregators agree (BadSlava/TriviaNearMe); needs an operator or a curated directory")
                    elif len(says) <= 1:
                        why_not.append("T4 one source only (no operator, no second source with the same day and time)")
                    else:
                        why_not.append(f"T5 sources disagree on the time: {dict((t, sorted(n)) for t, n in says.items())}")
                elif len(agreed) > 1:
                    why_not.append(f"T5 two times each backed by two sources: {agreed}")
            backers = sorted(says.get(start, set())) if start else []
            # cadence, only as stated
            ops_fresh = [o for o in l["fresh"] if o["source"] == "NYC Trivia League" and o["start"] == start]
            nonweekly = [o["recurrence"] for o in l["observations"] if o["recurrence"]["kind"] == "non_weekly"]
            bi = [o for o in l["fresh"] if re.search(r"bi-?weekly|every other", fold(o.get("note")))]
            monthly = [o for o in l["fresh"] if re.search(r"(^|\b)(1st|2nd|3rd|4th|first|second|third|last)\b|of (the |each |every )?month|monthly", fold(o.get("note")))]
            if bi:
                rec = {"kind": "non_weekly", "label": f"Every other week, per {bi[0]['source']}. Confirm with the venue."}
            elif monthly:
                rec = {"kind": "non_weekly", "label": f"{cadence_phrase(monthly[0]['note'])}, per {monthly[0]['source']}. Confirm the date with the venue."}
            elif nonweekly:
                rec = {"kind": "non_weekly", "label": f"{cadence_phrase(nonweekly[0]['text'])}, per the listing. Confirm with the venue."}
            elif ops_fresh and re.match(r"(?i)monthly", (v.get("registry") or {}).get("line") or ""):
                rec = {"kind": "non_weekly", "label": "Monthly, per NYC Trivia League. Confirm the date with the venue."}
            elif ops_fresh:
                rec = {"kind": "weekly_stated", "label": "Weekly, per NYC Trivia League"}
            elif any(o["recurrence"]["kind"] == "weekly_stated" for o in l["observations"]):
                rec = {"kind": "weekly_stated", "label": "Weekly, per one listing. Confirm with the venue."}
            else:
                rec = {"kind": "not_established", "label": f"Listed on {DAY_NAME[l['day']]}s. Confirm with the venue."}
            host = next((o["host"] for o in l["fresh"] if o.get("host") and o["source"] in OPERATORS), None) or \
                   next((o["host"] for o in l["observations"] if o.get("host") and "per directory" not in o["host"]), None)
            cost = next((o["cost"] for o in l["observations"] if o.get("cost")), None)
            seen = sorted({(o["source"], o["url"], o.get("source_updated_at"), o["name"]) for o in l["fresh"] if o["start"] == start}, key=str)
            wb_sources = sorted({(s["name"], s["url"]) for o in l["observations"] for s in o["sources"] if s["name"] in backers}, key=str)
            d.update({"status": status, "start": start, "start_label": ampm(start), "recurrence": rec, "host": host,
                      "cost_note": re.sub(r"^Per (\w+) note:\s*", r"", cost) if cost else None,
                      "cost_source": (re.match(r"^Per (\w+)", cost).group(1) if cost and re.match(r"^Per (\w+)", cost) else None),
                      "operator_listed": bool(set(backers) & OPERATORS), "backers": backers,
                      "sources": [{"name": n, "url": u, "observed_at": observed_at, "source_updated_at": su, "listed_as": nm} for n, u, su, nm in seen] +
                                 [{"name": n, "url": u, "observed_at": "2026-10-16", "source_updated_at": None, "via": "research workbook", "listed_as": v["name"]}
                                  for n, u in wb_sources if n not in {s[0] for s in seen}],
                      "notes": [o["note"] for o in l["fresh"] if o.get("note")],
                      "conflicts": l["conflicts"], "wb_evidence": sorted({o["wb_evidence"] for o in l["observations"]}),
                      "wb_rows": [o["src_ref"]["wb_id"] for o in l["observations"]]})
        if (decisions.get(v["key"]) or {}).get("action") in ("note", "waive_T2", "exclude"):
            d["decision"] = decisions[v["key"]]
        d["publish"] = not why_not
        d["held_because"] = why_not
        d["venue"] = {"name": v["name"], "aliases": v["aliases"], "address": v["geo"].get("label") or v["address"], "address_as_found": v["address"],
                      "zip": v["geo"].get("postalcode"),
                      "borough": v["borough"], "hood": v["hood"], "lat": v["geo"].get("lat"), "lng": v["geo"].get("lng"), "bbl": v["geo"].get("bbl"),
                      "geo_status": v["geo"]["status"], "bar_slug": v["bar_slug"], "party_venue_id": v["party_venue_id"],
                      "identity_basis": v["identity"], "registry": v.get("registry"), "address_alternate": v.get("address_alternate"),
                      "website": ((v.get("registry") or {}).get("website") if "instagram.com" not in ((v.get("registry") or {}).get("website") or "") else None),
                      "src_rows": [r["wb_id"] for r in v["src_refs"]]}
        counts[(l["kind"] if l["kind"] != "music_trivia" else "trivia", "public" if d["publish"] else "internal")] += 1
        manifest.append(d)

    # one public name per venue: the operator's spelling when there is one
    out = {"generated_from": {"workbook_sha256": cand["workbook"]["sha256"], "observed_at": observed_at}, "counts": {f"{k[0]}:{k[1]}": n for k, n in sorted(counts.items())},
           "manifest": manifest, "unmatched_observations": unmatched, "ambiguous_observations": ambiguous_obs,
           "league_record_conflicts": reg_conflicts, "league_merges": merges_applied, "league_records_unused": sorted({r["slug"] for r in registry} - reg_used)}
    json.dump(out, open(os.path.join(work, "manifest.json"), "w"), indent=1, ensure_ascii=False, sort_keys=True)
    pub = [m for m in manifest if m["publish"]]
    json.dump(pub, open(os.path.join(work, "site_activities.json"), "w"), indent=1, ensure_ascii=False, sort_keys=True)
    reasons = Counter(r.split(" ")[0] + " " + r.split(":")[0].split(" ", 1)[-1] for m in manifest if not m["publish"] for r in m["held_because"][:1])
    print(json.dumps(out["counts"], indent=1))
    print("public trivia venues:", len({m["venue_key"] for m in pub if m["kind"] in ("trivia", "music_trivia")}),
          "| public games venues:", len({m["venue_key"] for m in pub if m["kind"] == "game"}))
    print("first hold reason:", reasons.most_common())
    print("fresh observations matched:", sum(len(l["fresh"]) for l in listings.values()), "unmatched:", len(unmatched), "ambiguous:", len(ambiguous_obs))


if __name__ == "__main__":
    main(sys.argv[1])
