# JAYDEE — Shop Management System

Monorepo for a uniforms/clothing shop: FastAPI backend + three Vite/React apps.

| Folder | Purpose | Dev URL |
|--------|---------|---------|
| `shop-backend/` | API (auth, products, billing, reports, staff, WhatsApp stub) | http://127.0.0.1:8000 |
| `employee-app/` | Stock check PWA (scan / adjust stock) | http://127.0.0.1:5173 |
| `billing-app/` | Counter billing | http://127.0.0.1:5174 |
| `owner-dashboard/` | Owner reports, products, staff | http://127.0.0.1:5175 |

API docs: http://127.0.0.1:8000/docs

---

## Prerequisites

- **Python 3.11+**
- **Node.js 20+** (npm)
- **PostgreSQL 14+** running locally

On macOS with Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb shop_db
```

On Windows / Linux, install PostgreSQL and create a database named `shop_db` (any user/password is fine — put it in `.env`).

---

## 1. Backend setup

```bash
cd shop-backend
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
# .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/shop_db
JWT_SECRET=pick-a-long-random-secret
WHATSAPP_PROVIDER=stub
```

If your Postgres has no password (common on macOS Homebrew), use:

```env
DATABASE_URL=postgresql://YOUR_MAC_USERNAME@localhost:5432/shop_db
```

Run migrations and create the first owner (required once — register API is owner-only after that):

```bash
alembic upgrade head
python scripts/create_owner.py --name "Owner" --phone "9000000001" --password "changeme123"
```

Start the API (reachable on your LAN if you use `0.0.0.0`):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Check: http://127.0.0.1:8000/health

Optional: seed reorder thresholds after you have products with stock:

```bash
python scripts/set_default_thresholds.py
```

---

## 2. Frontend apps

Open **three more terminals**. In each app folder:

```bash
cp .env.example .env
# .env should contain:
# VITE_API_URL=http://127.0.0.1:8000

npm install
npm run dev -- --host 0.0.0.0 --port PORT
```

| App | Port command |
|-----|----------------|
| `employee-app` | `--port 5173` |
| `billing-app` | `--port 5174` |
| `owner-dashboard` | `--port 5175` |

Example:

```bash
cd owner-dashboard
cp .env.example .env
npm install
npm run dev -- --host 0.0.0.0 --port 5175
```

Log into the **owner dashboard** with the owner phone/password you created above.

From **Staff**, add `billing_staff` / `stock_staff` accounts for the other apps.

---

## 3. Phone / another computer on the same Wi‑Fi

1. Find this machine’s LAN IP (macOS: `ipconfig getifaddr en0`).
2. Run API and Vite with `--host 0.0.0.0` (as above).
3. Set each app’s `.env` to `VITE_API_URL=http://YOUR_LAN_IP:8000` and restart Vite.
4. On the phone, open `http://YOUR_LAN_IP:5175` (etc.).
5. If needed, allow Python/Node through the OS firewall.

---

## Quick smoke test

1. Owner dashboard → Products → add a category → add a product (leave barcode blank) → Print Label.
2. Employee app → log in as stock staff → look up barcode → adjust stock.
3. Billing app → log in as billing staff → add items → Complete Sale.
4. Owner dashboard → Refresh → see today’s sales / low stock.

---

## Notes

- WhatsApp sending is a **stub** (`WHATSAPP_PROVIDER=stub`) — it logs instead of calling Gupshup/Interakt.
- Never commit real `.env` files (they are gitignored).
- Repo: https://github.com/rohilla14/JAYDEE
