# JAYDEE — Shop Management System

A FastAPI backend for managing a shop, built with raw SQLAlchemy 2.0.

## Setup

1. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate   # macOS / Linux
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Copy the example env file and edit values:

   ```bash
   cp .env.example .env
   ```

4. Make sure PostgreSQL is running and the database exists.

5. Run migrations (once models are defined):

   ```bash
   alembic upgrade head
   ```

6. Start the dev server:

   ```bash
   uvicorn app.main:app --reload
   ```

7. Check the health endpoint: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

## Project structure

```
shop-backend/
  app/
    core/       # config, database engine, shared infrastructure
    models/     # SQLAlchemy ORM models
    schemas/    # Pydantic request/response schemas
    routers/    # API route handlers
  alembic/      # database migration scripts
```
