#!/usr/bin/env python3
"""Importa il Google Sheet dei tutor nella riga JSONB di Supabase."""
import csv
import io
import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_CSV_BYTES = 15_000_000
MAX_ROWS = 100_000
TARGET_FIELDS = ('sede', 'data', 'classe', 'tutor', 'orario')
ALIASES = {
    'sede': ('sede', 'sede corso', 'sede_corso'),
    'data': ('data', 'giorno', 'dataor', 'data or'),
    'classe': ('classe/sezione', 'classe sezione', 'classe_sezione', 'classe'),
    'tutor': ('tutor', 'nome tutor'),
    'orario': ('orario', 'ora', 'fascia oraria', 'fascia_oraria'),
}


def require(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'Manca configurazione: {name}')
    return value


def normalized(value):
    return ' '.join(str(value or '').strip().lower().replace('_', ' ').split())


def normalize_date(value):
    value = str(value or '').strip()
    for pattern in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(value, pattern).strftime('%Y-%m-%d')
        except ValueError:
            pass
    raise ValueError(f'Data tutor non riconosciuta: {value!r}. Usare GG-MM-AAAA o AAAA-MM-GG.')


def get_sheet_rows(csv_url):
    parsed = urlparse(csv_url)
    if parsed.scheme != 'https' or parsed.hostname != 'docs.google.com' or not parsed.path.startswith('/spreadsheets/'):
        raise ValueError('GOOGLE_TUTOR_SHEET_CSV_URL deve essere un URL CSV HTTPS di docs.google.com/spreadsheets.')
    request = Request(csv_url, headers={'User-Agent': 'KodeK-Tutor-Sheets-Sync/1.0'})
    with urlopen(request, timeout=35) as response:
        if 'text/html' in response.headers.get('Content-Type', '').lower():
            raise ValueError('Il foglio tutor ha restituito HTML invece del CSV.')
        raw = response.read(MAX_CSV_BYTES + 1)
    if len(raw) > MAX_CSV_BYTES:
        raise ValueError('CSV tutor superiore a 15 MB.')
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True)
    headers = reader.fieldnames or []
    if not headers or any(not h or not h.strip() for h in headers):
        raise ValueError('Intestazioni CSV tutor vuote o mancanti.')
    by_name = {normalized(h): h for h in headers}
    selected = {}
    missing = []
    for field in TARGET_FIELDS:
        source = next((by_name[normalized(alias)] for alias in ALIASES[field] if normalized(alias) in by_name), None)
        if source is None:
            missing.append(field)
        else:
            selected[field] = source
    if missing:
        raise ValueError('Colonne tutor mancanti: ' + ', '.join(missing) + '.')
    rows = []
    for row in reader:
        if None in row:
            raise ValueError('CSV tutor con numero di colonne non corrispondente.')
        clean = {field: str(row[source] or '').strip() for field, source in selected.items()}
        if clean['data']:
            clean['data'] = normalize_date(clean['data'])
        if any(clean.values()):
            rows.append(clean)
            if len(rows) > MAX_ROWS:
                raise ValueError('CSV tutor troppo grande (oltre 100000 righe).')
    if not rows:
        raise ValueError('Nessun record tutor: sincronizzazione annullata.')
    return rows


def validate_supabase_url(value):
    parsed = urlparse(value)
    host = parsed.hostname or ''
    if (parsed.scheme != 'https' or not host.endswith('.supabase.co') or host == '.supabase.co'
            or parsed.username or parsed.password or parsed.port or parsed.path not in ('', '/')
            or parsed.query or parsed.fragment):
        raise ValueError('SUPABASE_URL non valido.')
    return value.rstrip('/')


def sync_supabase(supabase_url, secret_key, rows):
    endpoint = f'{validate_supabase_url(supabase_url)}/rest/v1/orari_tutor?id=eq.1'
    body = json.dumps({'dati': rows, 'aggiornato_il': datetime.now(timezone.utc).isoformat()}, ensure_ascii=False).encode('utf-8')
    request = Request(endpoint, data=body, method='PATCH', headers={
        'apikey': secret_key, 'Content-Type': 'application/json',
        'Prefer': 'return=representation', 'Accept': 'application/json',
        'User-Agent': 'KodeK-GitHub-Actions/1.0',
    })
    try:
        with urlopen(request, timeout=45) as response:
            result = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'Supabase HTTP {exc.code}: verifica Secret Key, URL e tabella orari_tutor.') from None
    except URLError:
        raise RuntimeError('Connessione a Supabase non riuscita.') from None
    if not isinstance(result, list) or len(result) != 1 or result[0].get('id') != 1:
        raise RuntimeError('Nessuna riga id=1 aggiornata: eseguire il comando SQL di inizializzazione.')
    print(f'OK: sincronizzati {len(rows)} record tutor su Supabase (orari_tutor.id=1).')


def main():
    secret = require('SUPABASE_SECRET_KEY')
    if not secret.startswith('sb_secret_'):
        raise ValueError('Usare la nuova Supabase Secret API Key sb_secret_...')
    rows = get_sheet_rows(require('GOOGLE_TUTOR_SHEET_CSV_URL'))
    sync_supabase(require('SUPABASE_URL'), secret, rows)


if __name__ == '__main__':
    main()
