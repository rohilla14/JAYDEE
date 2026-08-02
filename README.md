# JAYDEE — Shop Management System

Monorepo for a uniforms / clothing shop: **FastAPI + PostgreSQL** backend and three **Vite + React + TypeScript** frontends.

| App | Purpose | Dev URL |
|-----|---------|---------|
| `shop-backend/` | Auth, catalog, billing, reports, staff, WhatsApp stub | http://127.0.0.1:8000 |
| `employee-app/` | Stock check PWA (scan / adjust) | http://127.0.0.1:5173 |
| `billing-app/` | Counter cart + checkout | http://127.0.0.1:5174 |
| `owner-dashboard/` | Reports, products, labels, staff | http://127.0.0.1:5175 |

- API docs: http://127.0.0.1:8000/docs  
- Repo: https://github.com/rohilla14/JAYDEE  
- How we work: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Current status (what works)

- **Auth** — JWT login; roles `owner` / `billing_staff` / `stock_staff`; `is_active` deactivates accounts (login + existing tokens); register is **owner-only** after bootstrap.
- **Catalog** — categories, products, auto barcodes (`SHOP-{prefix}-{seq}`), inventory deltas, label PDFs (Code128).
- **Billing** — transactional `POST /bills` with stock check, tier % off MRP, points + lifetime spend, tier upgrades.
- **Customers** — phone lookup, create, WhatsApp opt-in fields, points redeem endpoint (not yet applied as bill discount).
- **Reports** (owner) — daily sales, low stock, top products.
- **Campaigns** (owner) — filter opted-in customers and stub-send WhatsApp templates.
- **Frontends** — employee stock, billing counter, owner dashboard (reports / products / staff) with session + network error handling.

WhatsApp provider is still a **stub** (`WHATSAPP_PROVIDER=stub`) — logs instead of calling Gupshup/Interakt.

---

## Database schema

Source file: [`docs/schema.mmd`](docs/schema.mmd)

```mermaid
erDiagram
    users {
        int id PK
        string name
        string phone
        string password_hash
        enum role "owner | billing_staff | stock_staff"
        boolean is_active
        timestamptz created_at
    }

    categories {
        int id PK
        string name
    }

    products {
        int id PK
        string name
        int category_id FK
        string barcode UK "nullable, unique"
        numeric mrp "Numeric(10,2)"
        numeric member_price "Numeric(10,2)"
        numeric cost_price "Numeric(10,2)"
        timestamptz created_at
    }

    inventory {
        int id PK
        int product_id FK "unique — 1:1 with products"
        int quantity
        int reorder_threshold
        timestamptz updated_at
    }

    customers {
        int id PK
        string name
        string phone UK
        enum tier "bronze | silver | gold"
        int points_balance
        numeric lifetime_spend "Numeric(12,2)"
        boolean whatsapp_opt_in
        timestamptz whatsapp_opt_in_at "nullable"
        timestamptz created_at
    }

    bills {
        int id PK
        int customer_id FK "nullable — walk-in allowed"
        int staff_id FK
        numeric total_amount "Numeric(12,2)"
        numeric discount_amount "Numeric(12,2)"
        timestamptz created_at
    }

    bill_items {
        int id PK
        int bill_id FK
        int product_id FK
        int quantity
        numeric unit_price "Numeric(10,2)"
        numeric line_total "Numeric(12,2)"
    }

    categories ||--o{ products : "has"
    products ||--o| inventory : "stocked as"
    products ||--o{ bill_items : "sold in"
    customers ||--o{ bills : "optional on"
    users ||--o{ bills : "rings up"
    bills ||--|{ bill_items : "contains"
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js 20+** (npm)
- **PostgreSQL 14+**

macOS (Homebrew):

```bash
brew install postgresql@16
brew services start postgresql@16
createdb shop_db
```

---

## Backend setup

```bash
cd shop-backend
python -m venv .venv
source .venv/bin/activate          # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env               # edit DATABASE_URL + JWT_SECRET
alembic upgrade head
python scripts/create_owner.py --name "Owner" --phone "9000000001" --password "changeme123"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Example `.env`:

```env
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/shop_db
JWT_SECRET=pick-a-long-random-secret
WHATSAPP_PROVIDER=stub
```

Homebrew Postgres often has no password: `postgresql://YOUR_MAC_USERNAME@localhost:5432/shop_db`.

`scripts/create_owner.py` is required once — `POST /auth/register` is owner-only after that.

Optional after products exist: `python scripts/set_default_thresholds.py`

---

## Frontend apps

In each of `employee-app/`, `billing-app/`, `owner-dashboard/`:

```bash
cp .env.example .env   # VITE_API_URL=http://127.0.0.1:8000
npm install
npm run dev -- --host 0.0.0.0 --port PORT
```

| App | Port |
|-----|------|
| employee-app | 5173 |
| billing-app | 5174 |
| owner-dashboard | 5175 |

Log into the owner dashboard with the owner you created, then use **Staff** to add billing/stock accounts.

---

## Phone / another device on the same Wi‑Fi

1. LAN IP (macOS: `ipconfig getifaddr en0`).
2. Run API + Vite with `--host 0.0.0.0`.
3. Set each frontend `.env` to `VITE_API_URL=http://YOUR_LAN_IP:8000` and restart Vite.
4. Open `http://YOUR_LAN_IP:5175` (etc.) on the phone.
5. Allow Python/Node through the OS firewall if prompted.

---

## Quick smoke test

1. Owner → Products → category → product (blank barcode) → Print Label.
2. Employee → stock staff → barcode lookup → adjust stock.
3. Billing → billing staff → cart → Complete Sale.
4. Owner → Refresh → today’s sales / low stock.

---

## Notes

- Never commit real `.env` files (gitignored).
- Inventory is a separate table from products so stock updates do not rewrite catalog metadata.
- Cart state in billing-app is client-side until `POST /bills`.
