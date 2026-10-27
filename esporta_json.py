#!/usr/bin/env python3
"""Importa Google Sheets CSV in una singola riga JSONB protetta di Supabase."""
import csv
import io
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_CSV_BYTES = 15_000_000
MAX_ROWS = 100_000


def require(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'Manca configurazione: {name}')
    return value


def get_sheet_rows(csv_url):
    url = urlparse(csv_url)
    if url.scheme != 'https' or url.hostname != 'docs.google.com' or not url.path.startswith('/spreadsheets/'):
        raise ValueError('GOOGLE_SHEET_CSV_URL deve essere un URL CSV HTTPS di docs.google.com/spreadsheets.')
    request = Request(csv_url, headers={'User-Agent': 'ESFO-Sheets-Sync/1.0'})
    with urlopen(request, timeout=35) as response:
        if 'text/html' in response.headers.get('Content-Type', '').lower():
            raise ValueError('Il foglio ha restituito HTML invece del CSV.')
        raw = response.read(MAX_CSV_BYTES + 1)
    if len(raw) > MAX_CSV_BYTES:
        raise ValueError('CSV superiore a 15 MB.')
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True)
    fields = reader.fieldnames
    if not fields or any(not field or not field.strip() for field in fields):
        raise ValueError('Intestazioni CSV vuote o mancanti.')
    if len(set(fields)) != len(fields):
        raise ValueError('Intestazioni CSV duplicate.')
    rows = []
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError('CSV con numero di colonne non corrispondente.')
        if any(value.strip() for value in row.values()):
            rows.append(row)
            if len(rows) > MAX_ROWS:
                raise ValueError('CSV troppo grande (oltre 100000 righe).')
    if not rows:
        raise ValueError('Nessun record: sincronizzazione annullata.')
    return rows


def sync_supabase(supabase_url, secret_key, rows):
    parsed = urlparse(supabase_url)
    if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.supabase.co') or parsed.username or parsed.password:
        raise ValueError('SUPABASE_URL deve essere un endpoint HTTPS *.supabase.co.')
    endpoint = f'{supabase_url.rstrip("/")}/rest/v1/orari?id=eq.1'
    body = json.dumps({'dati': rows}, ensure_ascii=False).encode('utf-8')
    req = Request(endpoint, data=body, method='PATCH', headers={
        'apikey': secret_key,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Accept': 'application/json',
        'User-Agent': 'ESFO-GitHub-Actions/1.0',
    })
    try:
        with urlopen(req, timeout=45) as response:
            result = json.load(response)
    except HTTPError as exc:
        # Never print secrets, URLs including credentials or response headers.
        raise RuntimeError(f'Supabase HTTP {exc.code}: verifica Secret Key, URL e permessi della tabella orari.') from None
    except URLError as exc:
        raise RuntimeError('Connessione a Supabase non riuscita.') from None
    if not isinstance(result, list) or len(result) != 1 or result[0].get('id') != 1:
        raise RuntimeError('Nessuna riga id=1 aggiornata: eseguire prima il comando SQL di inizializzazione.')
    print(f'OK: sincronizzati {len(rows)} record su Supabase (orari.id=1).')


def main():
    csv_url = require('GOOGLE_SHEET_CSV_URL')
    supabase_url = require('SUPABASE_URL')
    secret_key = require('SUPABASE_SECRET_KEY')
    if not secret_key.startswith('sb_secret_'):
        raise ValueError('Usare la nuova Supabase Secret API Key sb_secret_...')
    rows = get_sheet_rows(csv_url)
    sync_supabase(supabase_url, secret_key, rows)


if __name__ == '__main__':
    main()
