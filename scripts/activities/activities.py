"""
Trivia and games candidates: shared rules for the importer, the source parsers and the policy.

Nothing here publishes anything. The importer turns the research workbook into internal candidates
(venues, listings, evidence, exclusions); the policy decides later, per listing, what may be shown.

Identity
  venue key   = slug(name) + "--" + address key ("keg-and-lantern--97-nassau"); without a street
                address: slug(name) + "--" + borough + "--noaddr" (identity unresolved, never public)
  listing key = venue key + ":" + kind + ":" + day ("...:trivia:tue"). A new start time keeps the key
                (the change is kept as a conflict or in history); it never makes a second listing.
  Workbook IDs (T-001, V-0013, G-001, P-001) are generated per workbook, so they are kept as a
  mapping (src_ref), never as keys.

Dates
  observed_at        when a source was read (the workbook says: fetched Oct 16, 2026)
  source_updated_at  only a date the source itself states ("This Week in Trivia Oct 12-18, 2026")
  fact_verified_at   only when a documented check supports that one fact (not set by the import)
"""
from __future__ import annotations

import hashlib
import re
import unicodedata

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_OF = {d: k for k, d in zip(DAYS, ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])}
BOROUGHS = {"manhattan": "Manhattan", "brooklyn": "Brooklyn", "queens": "Queens", "bronx": "Bronx", "the bronx": "Bronx", "staten island": "Staten Island"}


def fold(s: str | None) -> str:
    s = (s or "").replace("’", "'").replace("‘", "'").replace("—", "-").replace("–", "-")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower().strip()


# the same venue written two ways in the sources
ALIASES = {"kcbc": "King's County Brewers Collective (KCBC)"}


def canonical_name(s: str | None) -> str:
    return ALIASES.get(fold(s), s or "")


def slug(s: str | None) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", fold(s).replace("&", " and ").replace("'", ""))).strip("-")


# words that do not tell two venues apart ("The Mayfly" = "Mayfly Bar")
NAME_STOP = {"the", "bar", "pub", "nyc", "tavern", "restaurant", "and", "lounge", "co", "company", "inc", "llc",
             "kitchen", "grill", "cafe", "of", "at", "ny", "new", "york", "s", "public", "house"}


def name_tokens(s: str | None) -> list[str]:
    t = fold(s).replace("'", "").replace("&", " and ")
    t = re.sub(r"\(.*?\)", " ", t)
    return [w for w in re.split(r"[^a-z0-9]+", t) if w and w not in NAME_STOP]


def name_key(s: str | None) -> str:
    return " ".join(name_tokens(s))


def name_sim(a: str | None, b: str | None) -> float:
    """share of the shorter name's distinctive words found in the other (1.0 = one contains the other)"""
    A, B = set(name_tokens(a)), set(name_tokens(b))
    if not A or not B:
        return 0.0
    return len(A & B) / min(len(A), len(B))


ABBR = {"street": "st", "avenue": "ave", "av": "ave", "place": "pl", "boulevard": "blvd", "road": "rd", "west": "w",
        "east": "e", "north": "n", "south": "s", "drive": "dr", "parkway": "pkwy", "lane": "ln", "first": "1",
        "second": "2", "third": "3", "fourth": "4", "fifth": "5", "sixth": "6", "seventh": "7", "eighth": "8",
        "ninth": "9", "tenth": "10", "eleventh": "11", "twelfth": "12", "square": "sq", "terrace": "ter", "court": "ct"}
SUFFIX = {"st", "ave", "pl", "blvd", "rd", "dr", "ln", "pkwy", "ter", "ct", "sq"}


_SAINTS = r"\bst\.?\s+(?=(?:marks|johns|nicholas|james|anns?|felix|edwards|pauls|lawrence|marys|georges|mark)\b)"
_WORD = r"(?:\d+(?:st|nd|rd|th)|[a-z][a-z0-9'.]*)"
_END = (r"(?:(?:ave|avenue|av)\s+[a-d]\b|(?:st|street|ave|avenue|av|pl|place|blvd|boulevard|rd|road|dr|drive|ln|lane|pkwy|parkway|"
        r"ter|terrace|ct|court|sq|square|broadway|bowery|slip|plaza|alley|row|loop|walk|way)\b\.?(?:\s+(?:w|e|n|s|west|east|north|south)\b)?)")
# a house number, then up to five words, ending in a street type: "644 sackett st" in "lucky 13 saloon 644 sackett st"
_STREET = re.compile(rf"(?<![\d-])(\d+(?:-\d+)?[a-z]?)\s+((?:{_WORD}\s+){{0,5}}{_END})")


def split_address(a: str | None) -> tuple[str, list[str]] | None:
    """('97', ['nassau', 'ave']) from '97 Nassau Ave, Brooklyn'; None when there is no house number and street"""
    a = fold(a)
    if not a or a.startswith("not found"):
        return None
    a = re.sub(_SAINTS, "saint ", a.replace(",", " , "))
    # the City writes numbered streets bare ("west 31 street", "33-01 31 avenue")
    a = re.sub(r"(?<=[\da-z] )(\d+)(?= (?:street|st|avenue|ave|av|road|rd|drive|dr|place|pl|lane|ln|terrace|ter|court|ct)\b)", r"\1th", a)
    m = _STREET.search(a)
    if not m:
        return None
    words = [ABBR.get(w, w) for w in re.split(r"[^a-z0-9]+", m.group(2)) if w]
    words = [re.sub(r"^(\d+)(st|nd|rd|th)$", r"\1", w) for w in words]
    return m.group(1), words


def address_key(a: str | None) -> str | None:
    p = split_address(a)
    return f"{p[0]}-{'-'.join(p[1])}" if p else None


def zip_of(a: str | None) -> str | None:
    m = re.search(r"\b(1[01]\d{3})\b(?!.*\b1[01]\d{3}\b)", a or "")
    return m.group(1) if m else None


def borough_of(s: str | None) -> str | None:
    s = fold(s)
    for k, v in BOROUGHS.items():
        if s == k:
            return v
    return None


def parse_time(t: str | None) -> str | None:
    """'7:30pm' -> '19:30'; '8pm start' -> '20:00'; anything else -> None (unknown stays unknown)"""
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b", fold(t))
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if not (1 <= h <= 12 and 0 <= mi < 60):
        return None
    h = h % 12 + (12 if ap == "p" else 0)
    return f"{h:02d}:{mi:02d}"


def day_of(s: str | None) -> str | None:
    s = fold(s)
    for full, k in DAY_OF.items():
        if s.startswith(full[:3]):
            return k
    return None


def venue_key(name: str, address: str | None, borough: str | None) -> str:
    ak = address_key(address)
    base = slug(" ".join(name_tokens(name)) or name)
    return f"{base}--{ak}" if ak else f"{base}--{slug(borough or 'unknown')}--noaddr"


def listing_key(vkey: str, kind: str, day: str | None) -> str:
    return f"{vkey}:{kind}:{day or 'nodate'}"


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def kind_of(activity: str | None) -> str:
    a = fold(activity)
    if "bingo" in a:
        return "music_bingo"
    if "music trivia" in a:
        return "music_trivia"
    return "trivia"


def recurrence_of(text: str | None) -> dict:
    """what a source says about cadence; 'listed under a weekday' is not weekly"""
    t = text or ""
    if t.startswith("Weekly per a source note"):
        return {"kind": "weekly_stated", "text": t}
    m = re.match(r"Not weekly per source note:\s*(.*)", t)
    if m:
        return {"kind": "non_weekly", "text": m.group(1).strip()}
    return {"kind": "not_established", "text": t or None}


def status_of(text: str | None) -> str:
    t = fold(text)
    if t.startswith("paused"):
        return "paused"
    if t.startswith("not started"):
        return "upcoming"
    return "listed"


def freshness_parts(text: str | None) -> list[dict]:
    """'NYC Trivia League: Page header "This Week in Trivia" Oct 12-18, 2026; fetched Oct 16, 2026 ; BadSlava: ...'
    -> [{source, stated, observed}] where stated is the source's own date text (or None) and observed the fetch date"""
    out = []
    for part in re.split(r"\s;\s", text or ""):
        m = re.match(r"\s*([^:]+):\s*(.*)$", part)
        if not m:
            continue
        body = m.group(2)
        fetched = re.search(r"fetched\s+([A-Z][a-z]{2} \d{1,2}, \d{4})", body)
        stated = re.sub(r";?\s*fetched\s+[A-Z][a-z]{2} \d{1,2}, \d{4}", "", body).strip(" ;")
        no_date = re.match(r"(?i)no (update )?date", stated or "")
        out.append({"source": m.group(1).strip(), "stated": None if (not stated or no_date) else stated,
                    "stated_raw": stated or None, "observed": fetched.group(1) if fetched else None})
    return out
