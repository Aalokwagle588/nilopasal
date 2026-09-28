from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from typing import Any


def success(data: Any = None, message: str = "", status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({"success": True, "data": data, "message": message}),
    )
