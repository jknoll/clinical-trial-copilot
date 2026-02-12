"""REST endpoints for faceted trial statistics — bypasses Claude for instant responses."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.mcp_servers.aact_queries import get_total_count, query_faceted_stats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stats", tags=["stats"])


class StatsQuery(BaseModel):
    condition: str = ""
    age: int | None = None
    sex: str = ""
    statuses: list[str] | None = None
    states: list[str] | None = None


class FunnelStep(BaseModel):
    stage: str
    count: int


class StatsResponse(BaseModel):
    total: int
    matched: int
    phase_distribution: dict[str, int]
    status_distribution: dict[str, int]
    geo_distribution: dict[str, int]
    funnel: list[FunnelStep]


@router.get("/total")
async def total_count() -> dict[str, Any]:
    try:
        count = await get_total_count()
        return {"total": count}
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT total count error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.post("/query", response_model=StatsResponse)
async def query_stats(q: StatsQuery) -> StatsResponse:
    try:
        filters = q.model_dump(exclude_none=True)
        result = await query_faceted_stats(filters)

        # Fill in funnel placeholders with matched count
        for step in result["funnel"]:
            if step["count"] == -1:
                step["count"] = result["matched"]

        return StatsResponse(**result)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT query error: {e}")
        raise HTTPException(status_code=503, detail=f"AACT database error: {str(e)}")
