#!/usr/bin/env python3
"""Met a jour l'archive permanente des contrats (src/contracts-archive.json).

Memoire durable : a chaque scrape, on UPSERT les contrats (par id) dans l'archive.
On ne supprime jamais. Le statut le plus recent ecrase l'ancien (un contrat evolue
nouveau -> branche -> resilie). Garde rue + ville + commercial/login + date + statut
+ operateur, pour savoir exactement qui a signe et quand, meme apres que le contrat
soit sorti de la fenetre glissante du carnet (~2 mois).

Schema archive : { "<id>": { ...ligne brute, "_op": "free"|"bouygues" } }
  id Free     = "f-"  + id_abo
  id Bouygues = "byg-" + num_contrat
(aligne avec carnetToContracts cote dashboard)

Usage :
  python update_archive.py                       # data.json + data_bouygues.json -> archive
  python update_archive.py <free.json> <byg.json>  # sources explicites (backfill)
"""
import json
import os
import sys

ARCHIVE_PATH = os.path.join("src", "contracts-archive.json")


def load_rows(path):
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("rows", []) or []
    return []


def free_id(row):
    v = str(row.get("id_abo") or "").strip()
    return "f-" + v if v else None


def byg_id(row):
    v = str(row.get("num_contrat") or "").strip()
    return "byg-" + v if v else None


def upsert(archive, rows, op, id_fn):
    added, updated = 0, 0
    for row in rows:
        cid = id_fn(row)
        if not cid:
            continue
        entry = dict(row)
        entry["_op"] = op
        if cid in archive:
            updated += 1
        else:
            added += 1
        archive[cid] = entry  # latest scrape wins (statut a jour), jamais supprime
    return added, updated


def main():
    free_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("src", "data.json")
    byg_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join("src", "data_bouygues.json")

    archive = {}
    if os.path.exists(ARCHIVE_PATH):
        try:
            with open(ARCHIVE_PATH, "r", encoding="utf-8") as f:
                archive = json.load(f)
        except (json.JSONDecodeError, OSError):
            archive = {}

    before = len(archive)
    a1, u1 = upsert(archive, load_rows(free_path), "free", free_id)
    a2, u2 = upsert(archive, load_rows(byg_path), "bouygues", byg_id)

    os.makedirs(os.path.dirname(ARCHIVE_PATH), exist_ok=True)
    with open(ARCHIVE_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, ensure_ascii=False, indent=0, sort_keys=True)

    print(
        "archive: %d -> %d contrats (+%d nouveaux Free, +%d nouveaux Bouygues, %d maj)"
        % (before, len(archive), a1, a2, u1 + u2)
    )


if __name__ == "__main__":
    main()
