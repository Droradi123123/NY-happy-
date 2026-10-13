#!/usr/bin/env python3
"""
Turn the parties research workbook (nyc-parties-*.xlsx) into SQL batches for the
party_venues / party_events / party_leads tables.

  python3 scripts/parties/xlsx_to_sql.py <workbook.xlsx> <out_dir>

Writes out_dir/01_venues.sql, 02_events_NN.sql, 03_leads_NN.sql. Each file is one
statement that upserts on the primary key, so it is safe to re-run. The SQL is run
through the Supabase MCP (execute_sql) on project zqfscuwkxcoktpjhaebv.

Every value lands in `facts` with where it came from and how sure we are
(see supabase/migrations/*parties_schema.sql). Nothing is invented: an empty cell
stays missing, a zero price stays "unknown" unless the source itself says "Free".
"""
import json, os, re, sys, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import openpyxl

NY = ZoneInfo('America/New_York')
# the workbook's own note: "Checked Oct 13 2026 ~14:35 IDT"
CHECKED = '2026-10-13T11:35:00Z'
MAIN, REVIEW, LEADS = 'NYC listed events (DICE)', 'Review - possibly not party', 'Listing leads (other sources)'


def slugify(s: str, n: int = 60) -> str:
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'&', ' and ', s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    if len(s) > n:
        s = s[:n].rsplit('-', 1)[0]
    return s or 'event'


def clean(s):
    return re.sub(r'\s+', ' ', str(s)).strip() if s not in (None, '') else None


# ---------- venues ----------

ROOM_PATTERNS = [
    (re.compile(r'^(?P<base>.+?)\s*\((?P<room>main room|the roof \+ room)\)$', re.I), None),
    (re.compile(r'^(?P<base>.+?)\s+-\s+(?P<room>main room|rooftop)$', re.I), None),
    (re.compile(r'^(?P<room>the roof|rooftop|ruins)\s+at\s+(?P<base>.+)$', re.I), None),
    (re.compile(r"^(?P<room>harriet's lounge)\s+-\s+(?P<base>.+)$", re.I), None),
    (re.compile(r'^(?P<base>the sultan room)\s+(?P<room>rooftop)$', re.I), None),
]
NAME_FIX = {
    'elsewhere, brooklyn': 'Elsewhere',
    'silo brooklyn': 'SILO Brooklyn',
    '1 hotel': '1 Hotel Brooklyn Bridge',
    'arlo williamsburg (formerly the williamsburg hotel)': 'Arlo Williamsburg',
    'arlo williamsburg': 'Arlo Williamsburg',
    'margaritaville - time square': 'Margaritaville Times Square',
}


def split_room(name: str):
    """'The Roof at Superior Ingredients' -> ('Superior Ingredients', 'The Roof')"""
    for rx, _ in ROOM_PATTERNS:
        m = rx.match(name)
        if m:
            return m.group('base').strip(), m.group('room').strip().title().replace("'S", "'s")
    return name, None


def first_venue(raw: str) -> str:
    """'A (The Roof + Room) + B' -> 'A (The Roof + Room)': split on ' + ' outside brackets"""
    return re.split(r'\s\+\s(?![^()]*\))', raw)[0]


def canon(name: str) -> str:
    return NAME_FIX.get(name.lower(), name)


def addr_key(a: str):
    a = (a or '').lower()
    z = re.findall(r'\b(1\d{4})\b', a)
    n = re.match(r'\s*([\d-]+)\s+(\w+)', a)
    return ((n.group(1) + ' ' + n.group(2)) if n else a[:24], z[-1] if z else '')


def zip_of(a):
    z = re.findall(r'\b(\d{5})\b', a or '')
    return z[-1] if z else None


# ---------- events ----------

GENRES = [
    ('techno', r'\btechno\b'), ('house', r'\b(deep |tech |afro |latin )?house\b(?! of yes)'), ('disco', r'\bdisco\b|nu-disco'),
    ('trance', r'\btrance\b'), ('drum-and-bass', r'drum ?(&|and|n)? ?bass|\bdnb\b|jungle'), ('breaks', r'\bbreaks\b|breakbeat'),
    ('afrobeats', r'afrobeat|afro ?beats'), ('amapiano', r'amapiano'), ('afro-house', r'afro ?house'),
    ('latin', r'\blatin\b|salsa|bachata|merengue|cumbia'), ('reggaeton', r'reggaet[oó]n|perreo|dembow'),
    ('hip-hop', r'hip[ -]?hop|\brap\b'), ('r-and-b', r'r&b|r ?n ?b\b'), ('dancehall', r'dancehall|soca'),
    ('edm', r'\bedm\b|dubstep|bass music'), ('pop', r'\bpop\b|top ?40'), ('emo', r'\bemo\b|pop[- ]punk'),
    ('80s', r"\b80'?s\b|eighties"), ('90s', r"\b90'?s\b|nineties"), ('2000s', r"\b2000'?s\b|\by2k\b"),
    ('k-pop', r'k-?pop'), ('jazz', r'\bjazz\b'), ('funk-soul', r'\bfunk\b|\bsoul\b|motown'),
    ('experimental', r'experimental|ambient|\bnoise\b'), ('electro', r'\belectro\b'), ('garage', r'\bgarage\b|\bukg\b'),
]
TAGS = [
    ('lgbtq', r'\bqueer\b|lgbt|\bgay\b|lesbian|\btrans\b|\bdrag\b|pride'), ('drag', r'\bdrag\b'),
    ('rooftop', r'rooftop|\broof\b|skydeck'), ('day-party', r'day ?party|daytime|brunch'),
    ('open-decks', r'open ?decks?'), ('boat', r'\byacht\b|\bboat\b|cruise'), ('open-bar', r'open bar'),
    ('free', None), ('costume', r'costume'), ('sober', r'\bsober\b|alcohol[- ]free'),
]


def night_of(dt: datetime):
    return (dt - timedelta(days=1)).date() if dt.hour < 6 else dt.date()


def parse_local(s):
    if not s:
        return None
    return datetime.strptime(s, '%Y-%m-%d %H:%M').replace(tzinfo=NY)


def num(s):
    try:
        return round(float(s), 2)
    except (TypeError, ValueError):
        return None


def fact(value, url, status='source_listed', src='dice'):
    if value in (None, '', []):
        return {'value': None, 'status': 'missing', 'src': src, 'url': url, 'checked_at': CHECKED}
    return {'value': value, 'status': status, 'src': src, 'url': url, 'checked_at': CHECKED}


def main(path, out):
    os.makedirs(out, exist_ok=True)
    wb = openpyxl.load_workbook(path, data_only=True)

    def sheet(name):
        ws = wb[name]
        h = [c.value for c in ws[1]]
        return [dict(zip(h, r)) for r in ws.iter_rows(min_row=2, values_only=True) if any(r)]

    events = [(r, 'main') for r in sheet(MAIN)] + [(r, 'review') for r in sheet(REVIEW)]

    # --- venues: one per building+business; a room of a venue is folded into it
    groups = defaultdict(list)
    for r, _ in events:
        groups[addr_key(r['Address'])].append(r)
    venue_of_row, venues = {}, {}
    for key, rows in groups.items():
        names = Counter()
        for r in rows:
            first = first_venue(clean(r['Venue']))
            base, _ = split_room(first)
            names[canon(base)] += 1
        bases = [n for n, _ in names.most_common()]
        for r in rows:
            raw = clean(r['Venue'])
            first = first_venue(raw)
            base, room = split_room(first)
            base = canon(base)
            # a name that contains another base at the same address is a room of it
            parent = next((b for b in bases if b != base and b.lower() in base.lower()), None)
            if parent:
                room = room or base.replace(parent, '').strip(' -') or None
                base = parent
            vid = slugify(base, 50)
            v = venues.setdefault(vid, {
                'id': vid, 'name': base, 'aliases': set(), 'rooms': set(), 'address': clean(r['Address']),
                'zip': zip_of(r['Address']), 'borough': clean(r['Borough (from zip)']),
                'lat': r['Lat'], 'lng': r['Lon'], 'urls': set(), 'n': 0,
            })
            v['n'] += 1
            if raw != base:
                v['aliases'].add(raw)
            if room:
                v['rooms'].add(room)
            v['urls'].add(r['DICE URL'])
            venue_of_row[id(r)] = (vid, room, first != raw)

    vrows = []
    for v in venues.values():
        url = sorted(v['urls'])[0]
        vrows.append({
            'id': v['id'], 'name': v['name'], 'aliases': sorted(v['aliases']), 'rooms': sorted(v['rooms']),
            'address': v['address'], 'zip': v['zip'], 'borough': v['borough'], 'neighborhood': None,
            'lat': v['lat'], 'lng': v['lng'], 'kind': None,
            'facts': {
                'address': fact(v['address'], url), 'geo': fact([v['lat'], v['lng']] if v['lat'] else None, url),
                'borough': fact(v['borough'], url, 'derived', 'zip'),
            },
            'copy': {}, 'sources': [{'name': 'DICE', 'url': u, 'checked_at': CHECKED} for u in sorted(v['urls'])[:5]],
            'status': 'active', 'google_checked_at': None,
        })

    # --- events
    erows, seen_slugs = [], Counter()
    for r, origin in events:
        url = r['DICE URL']
        start, end = parse_local(r['Start (NY)']), parse_local(r['End (NY)'])
        doors = datetime.fromisoformat(r['Doors']) if r['Doors'] else None
        vid, room, multi = venue_of_row[id(r)]
        title = clean(r['Title'])
        text = f"{title} {r['Description (DICE source text, NOT publication copy)'] or ''}".lower()
        genres = [g for g, rx in GENRES if re.search(rx, text)]
        status_l = (r['Price status'] or '').lower()
        price_status = 'free' if status_l.startswith('free') else 'priced' if status_l == 'priced' else 'unknown'
        tags = [t for t, rx in TAGS if rx and re.search(rx, text)] + (['free'] if price_status == 'free' else [])
        themes = [slugify(r['Theme tag'])] if r['Theme tag'] else []
        if 'Halloween' in (r['Theme tag'] or '') or re.search(r'hallow', text):
            themes = sorted(set(themes) | {'halloween'})
        age = re.match(r'(\d+)\+', r['Age'] or '')
        performers = [p.strip() for p in re.split(r',|\n', r['Listed performers'] or '') if p.strip()]
        dstatus = (r['Status'] or 'Scheduled').lower().replace(' ', '_')
        base = slugify(title.split(' — ')[0].split(' | ')[0], 60)
        slug = f"{base}-{night_of(start).isoformat()}" if start else base
        seen_slugs[slug] += 1
        if seen_slugs[slug] > 1:
            slug = f"{slug}-{seen_slugs[slug]}"
        flags = clean(r['Flags'])
        conflicts = []
        if flags and 'different date' in flags:
            conflicts.append({'field': 'date', 'note': 'description mentions a different date', 'src': 'dice', 'url': url})
        review = clean(r.get('Why review')) if origin == 'review' else None
        erows.append({
            'id': 'dice:' + url.rstrip('/').rsplit('/', 1)[-1],
            'slug': slug, 'title': title,
            'starts_at': start.isoformat() if start else None, 'ends_at': end.isoformat() if end else None,
            'doors_at': doors.isoformat() if doors else None,
            'night_date': night_of(start).isoformat() if start else None,
            'event_status': dstatus if dstatus in ('scheduled', 'postponed', 'rescheduled', 'cancelled', 'sold_out') else 'scheduled',
            'venue_id': vid, 'room': room, 'borough': clean(r['Borough (from zip)']), 'neighborhood': None,
            'age_min': int(age.group(1)) if age else None,
            'price_from': num(r['Price from USD (only if priced)']), 'price_to': num(r['Price to USD']),
            'price_status': price_status, 'category': (r['DICE category'] or '').lower() or None,
            'genres': genres, 'themes': themes,
            'performers': performers, 'organizer': clean(r['Organizer']),
            'ticket_url': url, 'ticket_vendor': 'DICE', 'refund_terms': clean(r['Refund terms (DICE)']),
            'facts': {
                'title': fact(title, url), 'start': fact(start.isoformat() if start else None, url),
                'end': fact(end.isoformat() if end else None, url), 'doors': fact(doors.isoformat() if doors else None, url),
                'venue': fact(clean(r['Venue']), url), 'address': fact(clean(r['Address']), url),
                'age': fact(clean(r['Age']), url),
                'price': fact({'from': num(r['Price from USD (only if priced)']), 'to': num(r['Price to USD']), 'status': price_status,
                               'note': 'DICE list price incl. fees at time of check'} if price_status != 'unknown' else None, url),
                'performers': fact(performers or None, url), 'organizer': fact(clean(r['Organizer']), url),
                'refund_terms': fact(clean(r['Refund terms (DICE)']), url),
                'genres': fact(genres or None, url, 'derived', 'keywords'),
                'tags': fact(tags or None, url, 'derived', 'keywords'),
                'multi_venue': fact(True, url, 'derived', 'title') if multi else fact(None, url),
            },
            'sources': [{'name': 'DICE', 'url': url, 'role': 'tickets', 'checked_at': CHECKED}],
            'conflicts': conflicts,
            'raw': {'description': r['Description (DICE source text, NOT publication copy)'], 'price_raw': r['Source raw price low/high'],
                    'price_text': r['DICE list-page price text'], 'city_label': r['City label (DICE)'],
                    'enrichment_level': r['Enrichment level'], 'flags': flags, 'tags': tags,
                    'note': 'source text, never publication copy'},
            'copy': {},
            'publish_status': 'review' if origin == 'review' else 'draft',
            'review_reason': review,
            'first_seen': CHECKED, 'last_checked': CHECKED, 'created_at': CHECKED, 'updated_at': CHECKED,
        })

    leads = []
    for r in sheet(LEADS):
        m = re.match(r'(\d{4})-([A-Za-z]{3}) (\d{1,2})', str(r['Date (2026)'] or ''))
        nd = datetime.strptime(f'{m.group(1)} {m.group(2)} {m.group(3)}', '%Y %b %d').date().isoformat() if m else None
        mu = r['Matched DICE URL']
        leads.append({
            'source': r['Source'], 'date_text': clean(r['Date (2026)']), 'night_date': nd, 'time_text': clean(r['Time (listed)']),
            'title': clean(r['Title (source)']) or '(untitled)', 'venue_text': clean(r['Venue / lineup text (raw)']),
            'match_status': clean(r['Match status vs DICE']),
            'matched_event_id': ('dice:' + mu.rstrip('/').rsplit('/', 1)[-1]) if mu else None,
            'checked_at': CHECKED,
        })

    def dump(name, sql):
        with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
            f.write(sql)

    j = lambda x: json.dumps(x, ensure_ascii=False, default=str).replace('$j$', '')
    dump('01_venues.sql', f"""insert into public.party_venues (id,name,aliases,rooms,address,zip,borough,neighborhood,lat,lng,kind,facts,copy,sources,status)
select id,name,aliases,rooms,address,zip,borough,neighborhood,lat,lng,kind,facts,copy,sources,status
from jsonb_populate_recordset(null::public.party_venues, $j${j(vrows)}$j$)
on conflict (id) do nothing;""")
    for i in range(0, len(erows), 60):
        dump(f'02_events_{i // 60:02d}.sql', f"""insert into public.party_events
select * from jsonb_populate_recordset(null::public.party_events, $j${j(erows[i:i + 60])}$j$)
on conflict (id) do nothing;""")
    dump('03_leads.sql', f"""insert into public.party_leads (source,date_text,night_date,time_text,title,venue_text,match_status,matched_event_id,checked_at)
select source,date_text,night_date,time_text,title,venue_text,match_status,matched_event_id,checked_at
from jsonb_populate_recordset(null::public.party_leads, $j${j(leads)}$j$);""")
    print(f'{len(vrows)} venues, {len(erows)} events, {len(leads)} leads -> {out}')
    multi_rooms = [(v['name'], v['rooms'], v['aliases']) for v in vrows if v['rooms'] or v['aliases']]
    for x in multi_rooms:
        print('  ', x)


if __name__ == '__main__' and len(sys.argv) == 3:
    main(sys.argv[1], sys.argv[2])



# ---------- compact manifest (what is sent through execute_sql) ----------
# The full SQL above carries DICE's description text and per-field facts (~3MB). The
# compact form sends only what DICE cannot tell us again (our venue clustering, the
# workbook's review notes) plus a fallback title and start. Everything else is re-read
# from the DICE page by public.party_dice_request() / party_dice_ingest().

def compact(path, out):
    import tempfile
    tmp = tempfile.mkdtemp()
    main(path, tmp)
    load = lambda f: json.loads((s := open(os.path.join(tmp, f), encoding='utf-8').read())[s.index('$j$') + 3:s.rindex('$j$')])
    venues = load('01_venues.sql')
    events = [e for f in sorted(os.listdir(tmp)) if f.startswith('02_') for e in load(f)]
    leads = load('03_leads.sql')
    V = [[v['id'], v['name'], v['aliases'], v['rooms'], v['address'], v['zip'], v['borough'], v['lat'], v['lng']] for v in venues]
    E = [[e['id'][5:], e['title'], (e['facts']['start']['value'] or '')[5:16].replace('T', ' '), e['venue_id'], e['room'],
          1 if e['publish_status'] == 'review' else 0, e['review_reason'], e['raw']['flags'], e['themes'][0] if e['themes'] else None,
          e['price_status'][0], e['age_min']] for e in events]
    L = [[l['source'], l['night_date'], l['time_text'], l['title'], l['venue_text'], l['match_status'], (l['matched_event_id'] or '')[5:] or None] for l in leads]
    os.makedirs(out, exist_ok=True)
    for name, rows in (('venues', V), ('events', E), ('leads', L)):
        with open(os.path.join(out, name + '.json'), 'w', encoding='utf-8') as f:
            f.write(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).replace('$', '\\u0024'))
    print({k: len(v) for k, v in (('venues', V), ('events', E), ('leads', L))})


if __name__ == '__main__' and len(sys.argv) > 3 and sys.argv[3] == '--compact':
    compact(sys.argv[1], sys.argv[2])
