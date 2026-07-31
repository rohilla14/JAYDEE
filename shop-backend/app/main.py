from fastapi import FastAPI

from app.routers import auth, products

app = FastAPI(title="Shop Management API")
app.include_router(auth.router)
app.include_router(products.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
