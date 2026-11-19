#!/usr/bin/env python3
"""Régénère src/data/suppliersSeed.json, categories.json et l'extrait de connaissances agent
depuis le classeur « base fournisseur soumission Induni » (feuille 1, colonnes A-K).

Usage : python3 -I script/build_suppliers_seed.py <classeur.xlsx>
Colonnes : A contrôle HA (x) · B catégorie · C fournisseur · D nature · E fréquence · F contact soumission (e-mails)
G VAUD · H GENEVE · I VS (x = intervient dans le canton) · J mots clefs · K positions CAN.
Les colonnes au-delà de K (ligne parasite répétée) sont ignorées. Le statut (« Ne pas consulter »…) et les
commentaires saisis auparavant sont repris de l'ancienne graine pour les couples (catégorie, fournisseur) conservés."""
import json, re, sys, os
import openpyxl

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SEED = os.path.join(ROOT, 'src/data/suppliersSeed.json')
CATS = os.path.join(ROOT, 'src/data/categories.json')
KNOW = os.path.join(ROOT, 'src/agent/suppliersKnowledge.md')

def clean(v): return re.sub(r'[ \t]+', ' ', str(v).replace('\xa0', ' ')).strip() if v is not None else ''
def key(cat, name): return (clean(cat).lower(), clean(name).lower())
def emails(v):
    parts = [p for p in re.split(r'[,;\s]+', clean(v)) if p]
    seen, out = set(), []
    for p in parts:
        if p.lower() not in seen: seen.add(p.lower()); out.append(p)
    return ', '.join(out)
def nature(v):
    v = clean(v)
    return v or 'Fourniture'

wb = openpyxl.load_workbook(sys.argv[1], read_only=True)
rows = [r[:11] for r in wb.worksheets[0].iter_rows(values_only=True)][1:]
old = {key(r['category'], r['name']): r for r in json.load(open(SEED, encoding='utf-8'))} if os.path.exists(SEED) else {}

out, seen = [], {}
for r in rows:
    cat, name = clean(r[1]), clean(r[2])
    if not cat and not name: continue
    if not name:  # ligne sans nom de fournisseur : inexploitable
        print('IGNORÉ (sans fournisseur):', cat); continue
    k = key(cat, name)
    cantons = [c for c, v in zip(('VD', 'GE', 'VS'), r[6:9]) if clean(v)]
    rec = {
        'category': cat, 'name': name, 'nature': nature(r[3]), 'frequency': clean(r[4]) or 'Ponctuel',
        'email': emails(r[5]), 'referentAchat': '', 'backupAchat': '', 'contactContrat': '', 'contactCommande': '',
        'zone': ', '.join(cantons), 'cantons': cantons,
        'status': 'Actif / à confirmer', 'comments': '',
        'keywords': clean(r[9]), 'can': str(r[10]).strip() if r[10] else '',
        'controleHA': clean(r[0]).lower() == 'x',
    }
    if k in old:
        rec['status'] = old[k].get('status') or rec['status']
        rec['comments'] = old[k].get('comments', '')
    if k in seen:  # doublon exact : on fusionne (e-mails, mots clefs, cantons)
        p = out[seen[k]]
        p['email'] = emails(p['email'] + ' ' + rec['email'])
        p['cantons'] = [c for c in ('VD', 'GE', 'VS') if c in p['cantons'] + rec['cantons']]
        p['zone'] = ', '.join(p['cantons']); p['controleHA'] = p['controleHA'] or rec['controleHA']
        p['keywords'] = p['keywords'] or rec['keywords']; p['can'] = p['can'] or rec['can']
        continue
    seen[k] = len(out); out.append(rec)

cats = sorted({r['category'] for r in out}, key=lambda s: s.lower())
# catégories : une seule graphie par nom insensible à la casse/espaces
canon = {}
for c in sorted({r['category'] for r in out}): canon.setdefault(c.lower(), c)
for r in out: r['category'] = canon[r['category'].lower()]
cats = sorted(canon.values(), key=str.lower)

json.dump(out, open(SEED, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
json.dump(cats, open(CATS, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

# Connaissances de l'agent : panel par catégorie, sans e-mails ni positions CAN (compact)
L = ['# PARTIE D – PANEL FOURNISSEURS INDUNI (liste officielle des acheteurs)', '',
     f'Source : « base fournisseur soumission Induni » — {len(out)} lignes fournisseur, {len(cats)} catégories. '
     'Format : **Nom** (R = récurrent, P = ponctuel ; ST = sous-traitance fourniture et pose, M = mixte ; sans suffixe = fourniture ; '
     'VD/GE/VS = cantons desservis ; ✔ = contrôlé par les achats [HA]).', '',
     'Règles d\'usage : (1) un fournisseur d\'une offre absent de cette liste est **hors panel** → le signaler dans « Points à clarifier » '
     '(non bloquant) sans le disqualifier ; (2) vérifier que le fournisseur dessert le canton du chantier (VD/GE/VS) quand l\'info existe, sinon '
     '« Non précisé » ; (3) distinguer fourniture seule / sous-traitance (fourniture et pose) : ne jamais comparer deux natures sans les isoler ; '
     '(4) fournisseur récurrent = relation cadre existante à mentionner ; ponctuel = conditions à confirmer ; (5) cette liste n\'indique aucun prix : '
     'ne rien en déduire sur les tarifs ; (6) les statuts « Ne pas consulter » / « Inactif » de la base sont à respecter : ne pas recommander ces fournisseurs.', '']
by = {}
for r in out: by.setdefault(r['category'], []).append(r)
NAT = {'Fourniture': '', 'Mixte': ' ST/M'}
for c in cats:
    items = []
    for r in by[c]:
        n = r['nature']; tag = '' if n == 'Fourniture' else (' ST' if n.startswith('Sous-traitance') else ' M')
        s = r['name'] + ' (' + ('R' if r['frequency'] == 'Récurrent' else 'P') + tag + (' ' + '/'.join(r['cantons']) if r['cantons'] else '') + ('' if not r['controleHA'] else ' ✔')
        s += ')' if r['status'] == 'Actif / à confirmer' else f' — {r["status"]})'
        items.append(s)
    L.append(f'- **{c}** : ' + ' ; '.join(items))
open(KNOW, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print(len(out), 'fournisseurs,', len(cats), 'catégories ; connaissance', os.path.getsize(KNOW), 'octets')
dropped = [k for k in old if k not in seen]
print('anciens couples absents de la nouvelle liste:', len(dropped)); print(dropped[:15])
