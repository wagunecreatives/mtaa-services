#!/usr/bin/env python3
"""Validate migration naming/order and PostgreSQL statement syntax."""

from pathlib import Path
import re
import sys

from pglast import parse_sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
MIGRATION_NAME = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        print("No Supabase SQL migrations found.", file=sys.stderr)
        return 1

    timestamps: set[str] = set()
    errors: list[str] = []
    for path in files:
        match = MIGRATION_NAME.fullmatch(path.name)
        if not match:
            errors.append(f"{path.name}: expected YYYYMMDDHHMMSS_description.sql")
            continue
        if match.group(1) in timestamps:
            errors.append(f"{path.name}: duplicate migration timestamp {match.group(1)}")
        timestamps.add(match.group(1))

        try:
            parse_sql(path.read_text(encoding="utf-8"))
        except Exception as error:
            errors.append(f"{path.name}: {error}")

    if errors:
        print("Migration validation failed:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print(f"Validated {len(files)} ordered migration files.")
    print("Note: PostgreSQL parses PL/pgSQL function bodies at execution time.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
