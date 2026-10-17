"""
python3 -m unittest discover -s scripts/activities -v
The workbook test runs only when ACTIVITY_WORKBOOK points at the .xlsx (it is research data, not in the repo).
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from activities import (address_key, day_of, freshness_parts, kind_of, name_sim, parse_time, recurrence_of, split_address,
                        status_of, venue_key)
from geo import decide, nyc_zip


def feat(hn, street, borough, z, match="exact", lng=-73.9, lat=40.7):
    return {"properties": {"housenumber": hn, "street": street, "borough": borough, "postalcode": z, "match_type": match,
                           "label": f"{hn} {street}"}, "geometry": {"coordinates": [lng, lat]}}


class Normalize(unittest.TestCase):
    def test_address_keys(self):
        self.assertEqual(address_key("97 Nassau Ave, Brooklyn"), "97-nassau-ave")
        self.assertEqual(address_key("388 Union Ave Brooklyn, NY 11211"), address_key("388 Union Ave, Brooklyn, NY 11211"))
        self.assertEqual(address_key("Lucky 13 Saloon 644 Sackett St, Brooklyn"), "644-sackett-st")
        self.assertEqual(address_key("7 583 Vanderbilt Ave, Brooklyn"), "583-vanderbilt-ave")
        self.assertEqual(address_key("8 W. 38th Street, New York, NY 10018"), "8-w-38-st")
        self.assertEqual(address_key("23 Avenue A, New York, NY 10009"), address_key("23 Ave A, New York"))
        self.assertEqual(address_key("6 St Marks Pl, New York, NY 10003"), "6-saint-marks-pl")
        self.assertEqual(address_key("200 Liberty St Ste 106-A, New York, NY"), "200-liberty-st")
        self.assertEqual(address_key("1 7th Ave S, New York"), "1-7-ave-s")
        self.assertNotEqual(address_key("318 5th Ave, Brooklyn"), address_key("318 5th St, Brooklyn"))
        self.assertIsNone(address_key("Not found"))
        self.assertIsNone(address_key("Brooklyn, NY 11225 (no street)"))

    def test_names(self):
        self.assertEqual(name_sim("O'Briens Bar & Grill", "OBriens Bar & Grill"), 1.0)
        self.assertEqual(name_sim("Emblem", "Emblem Sports Bar"), 1.0)
        self.assertLess(name_sim("Pink Metal", "Post No Bills"), 0.5)
        self.assertNotEqual(venue_key("Keg & Lantern Brewing", "97 Nassau Ave, Brooklyn", "Brooklyn"),
                            venue_key("Keg & Lantern Brewing", "158 Beard St, Brooklyn", "Brooklyn"))
        self.assertTrue(venue_key("KCBC", None, "Brooklyn").endswith("--brooklyn--noaddr"))

    def test_times_days_kinds(self):
        self.assertEqual(parse_time("7:30pm"), "19:30")
        self.assertEqual(parse_time("8pm start"), "20:00")
        self.assertEqual(parse_time("12:00pm"), "12:00")
        self.assertIsNone(parse_time("7 or 8pm, first Tuesday"[:1]))
        self.assertIsNone(parse_time("TBA"))
        self.assertIsNone(parse_time("6:3pm"))  # a typo on the page is unknown, not 3pm
        self.assertEqual(day_of("Wednesday"), "wed")
        self.assertEqual(kind_of("Music bingo"), "music_bingo")
        self.assertEqual(kind_of("Music trivia"), "music_trivia")
        self.assertEqual(kind_of("Trivia"), "trivia")

    def test_recurrence_and_status(self):
        self.assertEqual(recurrence_of("Not established (source lists this venue under the weekday; no cadence stated)")["kind"], "not_established")
        self.assertEqual(recurrence_of("Weekly per a source note")["kind"], "weekly_stated")
        r = recurrence_of("Not weekly per source note: 3rd Tuesday")
        self.assertEqual((r["kind"], r["text"]), ("non_weekly", "3rd Tuesday"))
        self.assertEqual(status_of("Paused (hiatus / on hold per source)"), "paused")
        self.assertEqual(status_of("Not started yet (source says coming)"), "upcoming")
        self.assertEqual(status_of("Listed (no pause noted)"), "listed")
        from parse_sources import status_from_note
        self.assertEqual(status_from_note("coming Wednesday, October 28th, 2026!"), "upcoming")
        self.assertEqual(status_from_note("Coming back in November 2026"), "paused")

    def test_freshness_never_turns_a_fetch_into_a_stated_date(self):
        f = freshness_parts('NYC Trivia League: Page header "This Week in Trivia" Oct 12-18, 2026; fetched Oct 16, 2026 ; NYC Trivia List: No update date shown; fetched Oct 16, 2026')
        self.assertEqual(f[0]["observed"], "Oct 16, 2026")
        self.assertIn("Oct 12-18, 2026", f[0]["stated"])
        self.assertIsNone(f[1]["stated"])
        self.assertEqual(f[1]["observed"], "Oct 16, 2026")


class Geography(unittest.TestCase):
    def test_petes_saloon_is_not_in_queens(self):
        # what GeoSearch really returned for "8 W Main St, Queens, NY": Roosevelt Island, confidence 0.8
        features = [feat("250", "MAIN ST WEST", "Manhattan", "10044", "fallback"), feat("281", "WEST MAIN STREET", "Manhattan", "10044", "fallback")]
        self.assertNotEqual(decide("8 W Main St, Queens, NY", None, features, ["Queens"])["status"], "verified")
        self.assertEqual(decide("8 W Main St, Elmsford, NY 10523", "10523", features)["status"], "outside_nyc")

    def test_outside_towns_and_zips(self):
        for a, z in [("40 Division St, New Rochelle, NY 10801", "10801"), ("92 Main St, Yonkers, NY 10701", "10701"),
                     ("163 Newark Ave, Jersey City, NJ 07302", "07302"), ("4060 Austin Blvd Island Park, NY 11558", "11558")]:
            self.assertEqual(decide(a, z, [])["status"], "outside_nyc", a)
        self.assertFalse(nyc_zip("11558"))
        self.assertFalse(nyc_zip("10523"))
        self.assertTrue(nyc_zip("11385"))
        self.assertTrue(nyc_zip("11104"))
        self.assertIsNone(nyc_zip(None))

    def test_queens_and_brooklyn_positive(self):
        d = decide("53-22 Roosevelt Ave, Woodside, NY 11377", "11377", [feat("53-22", "ROOSEVELT AVENUE", "Queens", "11377")], ["Queens"])
        self.assertEqual((d["status"], d["borough"]), ("verified", "Queens"))
        d = decide("97 Nassau Ave, Brooklyn", None, [feat("97", "NASSAU AVENUE", "Brooklyn", "11222")], ["Brooklyn"])
        self.assertEqual((d["status"], d["borough"]), ("verified", "Brooklyn"))
        # what GeoSearch really returns for 531 E 5th St: the right record, labelled "fallback"
        d = decide("531 E 5th St, New York, NY 10009", "10009", [feat("531", "EAST 5 STREET", "Manhattan", "10009", "fallback")], ["Manhattan"])
        self.assertEqual(d["status"], "verified")

    def test_strict_street_and_borough(self):
        # same number, other street type
        self.assertEqual(decide("318 5th Ave, Brooklyn", None, [feat("318", "5 STREET", "Brooklyn", "11215")], ["Brooklyn"])["status"], "no_match")
        # a directory says Brooklyn, the only City match is in Manhattan (Broadway runs in both)
        self.assertEqual(decide("100 Broadway, Brooklyn", None, [feat("100", "BROADWAY", "Manhattan", "10005")], ["Brooklyn"])["status"], "conflict")
        # no street type: not a full address, never verified
        self.assertEqual(decide("97 Nassau, Brooklyn", None, [feat("97", "NASSAU AVENUE", "Brooklyn", "11222")], ["Brooklyn"])["status"], "no_address")
        # ZIP disagreement
        self.assertEqual(decide("220 W 31st St, New York, NY 10001", "10001", [feat("220", "WEST 31 STREET", "Manhattan", "10011")], ["Manhattan"])["status"], "conflict")
        self.assertEqual(decide(None, None, [])["status"], "no_address")


@unittest.skipUnless(os.environ.get("ACTIVITY_WORKBOOK"), "set ACTIVITY_WORKBOOK to the research .xlsx")
class Workbook(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from import_workbook import run
        cls.dir = tempfile.mkdtemp()
        cls.out = run(os.environ["ACTIVITY_WORKBOOK"], cls.dir)
        cls.raw = open(os.path.join(cls.dir, "candidates.json")).read()

    def test_idempotent(self):
        from import_workbook import run
        d = tempfile.mkdtemp()
        run(os.environ["ACTIVITY_WORKBOOK"], d)
        self.assertEqual(open(os.path.join(d, "candidates.json")).read(), self.raw)

    def test_every_row_is_accounted_for(self):
        L = self.out["listings"]
        trivia_rows = sum(len(l["observations"]) for l in L if l["kind"] != "game")
        self.assertEqual(trivia_rows, 272 + 6 + 341)  # active + paused + quarantine (music bingo sheet is empty)
        games_rows = {o["src_ref"]["wb_id"] for l in L if l["kind"] == "game" for o in l["observations"]}
        self.assertEqual(len(games_rows), 35 + 75)
        self.assertEqual(len(self.out["exclusions"]), 13)

    def test_bingo_is_never_trivia_and_paused_never_active(self):
        for l in self.out["listings"]:
            for o in l.get("observations", []):
                if o.get("sheet_class") == "paused":
                    self.assertEqual(o["status"], "paused")
        bingo = [l for l in self.out["listings"] if l["kind"] == "music_bingo"]
        self.assertEqual(sum(len(l["observations"]) for l in bingo), 27)

    def test_no_weekly_unless_a_source_says_so(self):
        for l in self.out["listings"]:
            for o in l["observations"]:
                if "recurrence" in o and o["recurrence"]["kind"] == "weekly_stated":
                    self.assertTrue(o["recurrence"]["text"].startswith("Weekly per a source note"))

    def test_brand_locations_stay_apart_and_aliases_merge(self):
        keys = [v["key"] for v in self.out["venues"]]
        self.assertGreaterEqual(sum(1 for k in keys if k.startswith("keg-lantern")), 3)
        kcbc = [v for v in self.out["venues"] if "kcbc" in v["name"].lower() or any("kcbc" in a.lower() for a in v["aliases"])]
        self.assertEqual(len(kcbc), 1, [v["key"] for v in kcbc])
        self.assertEqual(len([k for k in keys if k.startswith("barcade-") and "388-union" in k]), 1)


if __name__ == "__main__":
    unittest.main()
