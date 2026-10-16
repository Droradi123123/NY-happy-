"""
Geography decision for one candidate address, from NYC Planning's GeoSearch (geosearch.planninglabs.nyc,
the City's own address database, free, no key). Only the five boroughs are in scope.

A venue is "verified" only when GeoSearch returns a record with the same house number and the same
street words (GeoSearch v2 labels exact address hits "fallback" too, so match_type proves nothing), and nothing in the address contradicts it (a non-NYC town or ZIP). A ZIP alone is
never proof, and the borough a directory printed is never proof: GeoSearch answers "8 W Main St, Queens"
(really Elmsford, Westchester) with Roosevelt Island addresses at confidence 0.8, so a loose match would
put a Westchester bar in Manhattan.
"""
from __future__ import annotations

import re

from activities import fold, split_address

OUTSIDE_TOWNS = r"\b(elmsford|new rochelle|yonkers|white plains|mount vernon|jersey city|hoboken|weehawken|newark|union city|" \
                r"fort lee|edgewater|island park|long beach|hempstead|mineola|garden city|valley stream|great neck|westbury|" \
                r"freeport|port washington|nassau county|suffolk county|westchester|new jersey|, nj\b|\bnj \d{5})"


def nyc_zip(z: str | None) -> bool | None:
    """True / False for a five-digit ZIP, None when there is none. Proves only the negative."""
    if not z or not re.fullmatch(r"\d{5}", z):
        return None
    n = int(z)
    return (10001 <= n <= 10282 or 10301 <= n <= 10314 or 10451 <= n <= 10475 or 11201 <= n <= 11256
            or n in (11004, 11005) or 11101 <= n <= 11109 or 11351 <= n <= 11436 or 11691 <= n <= 11697)


def _street(words: list[str]) -> list[str]:
    # the street type stays: "318 5th Ave" and "318 5th St" are different places
    return words


def decide(address: str | None, zip_code: str | None, features: list[dict] | None, claimed: list[str] | None = None) -> dict:
    a = fold(address)
    if not a:
        return {"status": "no_address", "reason": "no street address in any source"}
    if re.search(OUTSIDE_TOWNS, a):
        return {"status": "outside_nyc", "reason": "the address names a town outside the five boroughs"}
    if nyc_zip(zip_code) is False:
        return {"status": "outside_nyc", "reason": f"ZIP {zip_code} is outside the five boroughs"}
    p = split_address(address)
    if not p:
        return {"status": "no_address", "reason": "no house number"}
    hn, words = p
    want = _street(words)
    other = None
    for f in features or []:
        pr = f.get("properties", f)
        fhn = fold(pr.get("housenumber"))
        fp = split_address(f"{pr.get('housenumber', '')} {pr.get('street', '')}")
        # Queens numbers are written "24-03" and "2403"
        if not fp or fhn.replace("-", "") != hn.replace("-", ""):
            continue
        got = _street(fp[1])
        if got[: len(want)] != want[: len(got)] or not got:
            continue
        borough = pr.get("borough")
        if borough not in ("Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"):
            continue
        # a directory's borough is not proof, but when it disagrees the match is not settled
        # ("97 Nassau, Brooklyn" must not become 97 Nassau St in Manhattan)
        if claimed and borough not in claimed:
            other = other or {"status": "conflict", "reason": f"GeoSearch puts it in {borough}; the sources say {', '.join(claimed)}", "label": pr.get("label")}
            continue
        z = pr.get("postalcode")
        if zip_code and z and z != zip_code:
            return {"status": "conflict", "reason": f"GeoSearch ZIP {z} differs from the source's {zip_code}", "label": pr.get("label")}
        coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
        return {"status": "verified", "borough": borough, "neighbourhood": pr.get("neighbourhood"), "postalcode": z,
                "label": pr.get("label"), "lng": coords[0], "lat": coords[1], "match_type": pr.get("match_type"),
                "bbl": ((pr.get("addendum") or {}).get("pad") or {}).get("bbl"),
                "reason": "house number and street match a City address record"}
    return other or {"status": "no_match", "reason": "no GeoSearch result with the same house number and street"}
