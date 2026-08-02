# Contributing

This repo is developed primarily through **Cursor agent prompts** (feature-sized asks, then verify, then commit). Even as a solo project, these habits keep the shop system trustworthy.

## Workflow

1. **Describe the change clearly** — endpoints, roles, empty states, and what “done” looks like.
2. **Implement against the existing stack** — FastAPI + SQLAlchemy in `shop-backend/`, Vite/React apps under `employee-app/`, `billing-app/`, `owner-dashboard/`.
3. **Migrate when the schema changes** — Alembic revisions under `shop-backend/alembic/versions/`; run `alembic upgrade head`.
4. **Verify with real requests** — do not treat a “done” description as proof. Prefer `curl`, Swagger (`/docs`), or the running UI against a live API. For auth/role rules, bypass the UI and hit the endpoint directly (e.g. confirm 403/401 from curl).
5. **Commit in focused chunks** — see commit message convention below. Push when the work should be on GitHub for others (or yourself on another machine).

## Testing discipline

- Exercise the **happy path** and the **failure path** (401 session expired, 403 wrong role, network down, empty lists).
- For security-sensitive behavior (register locked to owner, deactivate self blocked, inactive JWT rejected), verify the **backend** enforces it — UI-only disables are not enough.
- When something looks wrong after a “successful” change, check whether the process actually reloaded (uvicorn `--reload`, Vite HMR) before rewriting code.

## Commit message convention

Match the existing history style:

- **Imperative, specific subject** — what landed, not “update” / “fixes” / “changes”.
  - Good: `Add owner products and staff management screens.`
  - Good: `Add barcodes, labels, categories, WhatsApp/campaigns, and staff controls.`
- **Optional body** — 1–2 sentences on *why* or what to notice (migrations, owner-only gates, stubs).
- **Group by concern** when possible — backend feature vs frontend screen vs docs, rather than one mixed mega-commit, unless the change is tiny.

Examples from this repo:

```
Add billing, customers, reports, and bulk reorder-threshold APIs.
Add employee stock-check PWA with barcode lookup and stock adjust.
Add root setup guide for running the full stack locally.
```

## First-time contributors / fresh clones

Follow the root [README.md](README.md): Postgres → migrations → `scripts/create_owner.py` → API → frontends. Never commit `.env` files.
