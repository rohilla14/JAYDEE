from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    auth,
    billing,
    campaigns,
    categories,
    customers,
    products,
    reports,
    users,
)

app = FastAPI(title="Shop Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5175",
        "http://localhost:5175",
        "http://192.168.1.6:5173",
        "http://192.168.1.6:5174",
        "http://192.168.1.6:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(billing.router)
app.include_router(customers.router)
app.include_router(reports.router)
app.include_router(campaigns.router)
app.include_router(categories.router)
app.include_router(users.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
