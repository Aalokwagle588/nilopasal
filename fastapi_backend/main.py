"""Main FastAPI application entry point."""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.errors import AppError
from app.routers.auth import _limiter as limiter

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Nilopasal API",
    version="2.0.0",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url=None,
)

# ── Rate Limiter ──────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────
@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.detail["message"]}},
    )


@app.exception_handler(Exception)
async def generic_error_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL_ERROR", "message": "An internal server error occurred"}},
    )


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"success": True, "data": {"status": "ok"}, "message": ""}


# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers.auth import auth_router
from app.routers.retailer.registration import router as retailer_registration_router
from app.routers.retailer.catalog import router as catalog_router
from app.routers.retailer.pos import router as pos_router
from app.routers.retailer.khata import router as khata_router
from app.routers.retailer.purchases import router as purchases_router
from app.routers.retailer.staff import router as staff_router
from app.routers.retailer.reports import router as reports_router

app.include_router(auth_router)
app.include_router(retailer_registration_router)
app.include_router(catalog_router)
app.include_router(pos_router)
app.include_router(khata_router)
app.include_router(purchases_router)
app.include_router(staff_router)
app.include_router(reports_router)
