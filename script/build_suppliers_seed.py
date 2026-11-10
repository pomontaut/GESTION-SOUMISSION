#!/usr/bin/env python3
"""Régénère src/data/suppliersSeed.json, categories.json et suppliersLegacyKeys.json
depuis le classeur « base fournisseur soumission Induni ».
Usage : python3 script/build_suppliers_seed.py <classeur.xlsx> [ancien_seed.json]
Colonnes : A contrôle HA, B catégorie, C fournisseur, D nature, E fréquence,
F contact soumission (e-mails), G/H/I VD/GE/VS (x), J mots clefs de recherche, K CAN (ignoré).
Les statuts « Ne pas consulter » / « Inactif » de l'ancien seed sont conservés."""
import json, re, sys, unicodedata
import openpyxl

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()

def emails(v):
    parts = [p.strip() for p in re.split(r'[;,\s]+', str(v or '')) if '@' in p]
    return ', '.join(dict.fromkeys(parts))

def keywords(v):
    out = []
    for p in re.split(r'[;,\n\t]+', str(v or '')):
        p = p.strip()
        if len(p) >= 3 and p.lower() not in (x.lower() for x in out):
            out.append(p)
    return out

xlsx = sys.argv[1]
old_path = sys.argv[2] if len(sys.argv) > 2 else 'src/data/suppliersSeed.json'
old = {}
try:
    for o in json.load(open(old_path)):
        old[(norm(o['category']), norm(o['name']))] = o
except Exception:
    pass

ws = openpyxl.load_workbook(xlsx, data_only=True, read_only=True).active
rows = {}
cats = []
for r in list(ws.iter_rows(values_only=True))[1:]:
    cat = re.sub(r'\s+', ' ', str(r[1] or '')).strip()
    name = re.sub(r'\s+', ' ', str(r[2] or '')).strip()
    if not cat or not name:
        continue
    if cat not in cats:
        cats.append(cat)
    key = (norm(cat), norm(name))
    zones = [z for z, c in (('VD', r[6]), ('GE', r[7]), ('VS', r[8])) if str(c or '').strip().lower() == 'x']
    prev = old.get(key, {})
    rec = rows.setdefault(key, {
        'category': cat, 'name': name, 'nature': str(r[3] or '').strip(),
        'frequency': str(r[4] or '').strip(), 'email': '', 'keywords': [],
        'zone': '', 'status': prev.get('status') if prev.get('status') in ('Ne pas consulter', 'Inactif / à exclure') else 'Actif',
        'referentAchat': prev.get('referentAchat', ''), 'backupAchat': prev.get('backupAchat', ''),
        'contactContrat': prev.get('contactContrat', ''), 'contactCommande': prev.get('contactCommande', ''),
        'comments': prev.get('comments', ''),
    })
    rec['email'] = emails(', '.join(filter(None, [rec['email'], emails(r[5])])))
    rec['keywords'] = list(dict.fromkeys(rec['keywords'] + keywords(r[9])))
    rec['zone'] = ', '.join(dict.fromkeys([z for z in rec['zone'].split(', ') if z] + zones))

seed = sorted(rows.values(), key=lambda x: (norm(x['category']), norm(x['name'])))
json.dump(seed, open('src/data/suppliersSeed.json', 'w'), ensure_ascii=False, indent=0)
json.dump(sorted(cats, key=norm), open('src/data/categories.json', 'w'), ensure_ascii=False, indent=0)
legacy = sorted({f"{k[0]}|{k[1]}" for k in old})
if len(sys.argv) > 2 or not __import__('os').path.exists('src/data/suppliersLegacyKeys.json'):
    json.dump(legacy, open('src/data/suppliersLegacyKeys.json', 'w'), ensure_ascii=False)
print(len(seed), 'fournisseurs,', len(cats), 'catégories,', sum(1 for s in seed if s['keywords']), 'avec mots clefs')
