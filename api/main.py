"""STELLA FastAPI application factory + WebSocket live stream.

Run locally:

    uvicorn api.main:app --reload
"""

from asyncio import sleep

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.config import settings
from api.routers import routers
from api.store import store

APP_TITLE = f"{settings.app_name} v{settings.app_version}"


def create_app() -> FastAPI:
    app = FastAPI(title=APP_TITLE, version=settings.app_version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.store = store
    for r in routers:
        app.include_router(r, prefix="/api")
    app.add_api_websocket_route("/ws/live", live_stream)
    return app


async def live_stream(websocket: WebSocket) -> None:
    """Push latest nowcast/forecast frame every 5s while a client is connected."""
    await websocket.accept()
    try:
        while True:
            latest = store.latest() or {
                "solar_state": "online",
                "lead_minutes": settings.alert_lead_min,
            }
            await websocket.send_json(latest)
            await sleep(5.0)
    except WebSocketDisconnect:
        return


app = create_app()


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"system": settings.app_name, "docs": "/docs"}
