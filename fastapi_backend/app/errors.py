from fastapi import HTTPException
from fastapi.responses import JSONResponse
from typing import Any


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str):
        self.code = code
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "error": {"code": code, "message": message}},
    )
