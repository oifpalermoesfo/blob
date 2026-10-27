#!/usr/bin/env python3
"""Scarica un CSV pubblico di Google Sheets e produce dati.json."""
import csv
import io
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

URL = os.environ.get('GOOGLE_SHEET_CSV_URL', '').strip()
OUTPUT = Path('dati.json')


def main():
    if not URL.startswith('https://docs.google.com/spreadsheets/'):
        raise ValueError('Configura GOOGLE_SHEET_CSV_URL con un link CSV pubblicato di Google Sheets.')

    request = Request(URL, headers={'User-Agent': 'GoogleSheetsJsonExporter/1.0'})
    try:
        with urlopen(request, timeout=35) as response:
            if response.status != 200:
                raise RuntimeError(f'HTTP {response.status}')
            content_type = response.headers.get('Content-Type', '').lower()
            if 'html' in content_type:
                raise ValueError('Google ha restituito HTML (verifica la pubblicazione CSV).')
            raw = response.read(15_000_001)
    except (HTTPError, URLError) as err:
        raise RuntimeError(f'Impossibile scaricare il CSV: {err}') from err

    if len(raw) > 15_000_000:
        raise ValueError('CSV superiore al limite di sicurezza di 15 MB.')
    data = raw.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(data, newline=''), strict=True)
    fields = reader.fieldnames
    if not fields or any(not h or not h.strip() for h in fields):
        raise ValueError('CSV vuoto o nomi di colonne mancanti.')
    if len(set(fields)) != len(fields):
        raise ValueError('Intestazioni duplicate: devono essere uniche.')
    records = []
    for row in reader:
        if None in row or any(v is None for v in row.values()):
            raise ValueError('Numero colonne errato: verifica le righe del foglio.')
        if any(value.strip() for value in row.values()):
            records.append(row)
    if not records:
        raise ValueError('Nessuna riga utile: non sovrascrivo il file JSON precedente.')

    payload = json.dumps(records, ensure_ascii=False, indent=2) + '\n'
    temp_file = OUTPUT.with_name('.dati.json.tmp')
    temp_file.write_text(payload, encoding='utf-8')
    temp_file.replace(OUTPUT)
    print(f'OK: esportati {len(records)} record in {OUTPUT}')


if __name__ == '__main__':
    main()

