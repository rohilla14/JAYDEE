# Shop Management API

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL.

Full monorepo setup (all apps): see the root [README.md](../README.md).

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # edit DATABASE_URL + JWT_SECRET
createdb shop_db            # if needed
alembic upgrade head
python scripts/create_owner.py --name "Owner" --phone "9000000001" --password "changeme123"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health: http://127.0.0.1:8000/health
- Swagger: http://127.0.0.1:8000/docs

## Useful scripts

| Script | Purpose |
|--------|---------|
| `scripts/create_owner.py` | Bootstrap first owner (API register is owner-only) |
| `scripts/set_default_thresholds.py` | Set reorder thresholds to ~20% of stock (min 2) |

## Project structure

```
shop-backend/
  app/
    core/       # config, DB, auth, barcodes, labels, WhatsApp stub
    models/     # SQLAlchemy ORM
    schemas/    # Pydantic
    routers/    # HTTP routes
  alembic/      # migrations
  scripts/      # one-off ops helpers
```
