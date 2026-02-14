"""REST endpoints for faceted trial statistics — bypasses Claude for instant responses."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.mcp_servers.aact_queries import (
    get_pool,
    get_total_count,
    get_top_conditions,
    query_faceted_stats,
    query_sponsor_distribution,
    query_enrollment_distribution,
    query_matched_trials,
    query_study_type_distribution,
    query_gender_distribution,
    query_age_group_distribution,
    query_intervention_type_distribution,
    query_duration_distribution,
    query_start_year_distribution,
    query_facility_count_distribution,
    query_country_distribution,
    query_completion_rate,
    query_funder_type_distribution,
    query_trial_site_cities,
    query_trial_freshness,
    query_related_conditions,
    query_top_drugs,
    query_state_distribution,
    query_enrollment_targets,
    query_phase_pipeline,
    query_lead_sponsors,
    query_sponsor_collaboration,
    query_recruitment_summary,
)
from backend.mcp_servers.geocoding import reverse_geocode, geocode_location
from backend.session import SessionManager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stats", tags=["stats"])


class StatsQuery(BaseModel):
    condition: str = ""
    age: int | None = None
    sex: str = ""
    statuses: list[str] | None = None
    states: list[str] | None = None


class GeoReverseQuery(BaseModel):
    latitude: float
    longitude: float


class GeoForwardQuery(BaseModel):
    location: str


class FunnelStep(BaseModel):
    stage: str
    count: int


class StatsResponse(BaseModel):
    total: int
    matched: int
    phase_distribution: dict[str, int]
    status_distribution: dict[str, int]
    geo_distribution: dict[str, int]
    geo_distribution_states: dict[str, int]
    funnel: list[FunnelStep]
    all_status_distribution: dict[str, int]
    sql_query: str | None = None
    sql_params: list[str] | None = None


class RawQueryRequest(BaseModel):
    sql: str


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


@router.post("/geo/reverse")
async def reverse_geocode_endpoint(body: GeoReverseQuery) -> dict:
    """Reverse geocode coordinates to a place name."""
    result = await reverse_geocode(body.latitude, body.longitude)
    if result is None:
        return {"city": "", "state": "", "display": "Unknown location"}
    return result


@router.post("/geo/forward")
async def forward_geocode_endpoint(body: GeoForwardQuery) -> dict:
    """Geocode a location string to coordinates."""
    result = await geocode_location(body.location)
    if result is None:
        return {"latitude": 0, "longitude": 0, "display": ""}
    display = ", ".join(p for p in [result.get("name", ""), result.get("admin1", "")] if p)
    return {"latitude": result["latitude"], "longitude": result["longitude"], "display": display}


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


@router.get("/top-conditions")
async def top_conditions(limit: int = 15) -> list[dict]:
    try:
        return await get_top_conditions(limit)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT top conditions error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.post("/sponsors")
async def sponsor_distribution(q: StatsQuery) -> list[dict]:
    """Top 10 sponsors by trial count for current filters."""
    try:
        filters = q.model_dump(exclude_none=True)
        return await query_sponsor_distribution(filters)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT sponsor distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.post("/enrollment")
async def enrollment_distribution(q: StatsQuery) -> list[dict]:
    """Enrollment size distribution for current filters."""
    try:
        filters = q.model_dump(exclude_none=True)
        return await query_enrollment_distribution(filters)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT enrollment distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.post("/matched-trials")
async def matched_trials(q: StatsQuery, page: int = 1, per_page: int = 10) -> dict:
    """Paginated list of trials matching current filters."""
    try:
        filters = q.model_dump(exclude_none=True)
        return await query_matched_trials(filters, page, per_page)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT matched trials error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.post("/raw-query")
async def raw_query(body: RawQueryRequest) -> dict:
    """Execute a read-only SQL query against the AACT database. SELECT only, max 500 rows."""
    sql = body.sql.strip()
    if not sql.upper().startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
    # Safety: block dangerous keywords
    upper = sql.upper()
    for kw in ("DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"):
        if kw in upper:
            raise HTTPException(status_code=400, detail=f"Forbidden keyword: {kw}")
    try:
        pool = await get_pool()
        rows = await pool.fetch(f"{sql} LIMIT 500")
        if not rows:
            return {"columns": [], "rows": []}
        columns = list(rows[0].keys())
        data = [dict(row) for row in rows]
        return {"columns": columns, "rows": data}
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"Raw query error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# Per-session stats endpoints (accept session_id, derive nct_ids)
# ---------------------------------------------------------------------------

_session_mgr = SessionManager()


def _get_nct_ids(session_id: str) -> list[str]:
    """Extract nct_ids from a session's search results."""
    try:
        trials = _session_mgr.get_search_results(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if not trials:
        raise HTTPException(status_code=404, detail="No search results in session")
    return [t.nct_id for t in trials]


@router.get("/study-types")
async def study_types(session_id: str) -> list[dict]:
    """Study type distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_study_type_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT study type distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/gender")
async def gender_distribution(session_id: str) -> list[dict]:
    """Gender eligibility distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_gender_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT gender distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/age-groups")
async def age_groups(session_id: str) -> list[dict]:
    """Age group distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_age_group_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT age group distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/intervention-types")
async def intervention_types(session_id: str) -> list[dict]:
    """Intervention type distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_intervention_type_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT intervention type distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/duration")
async def duration_distribution(session_id: str) -> list[dict]:
    """Study duration distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_duration_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT duration distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/start-years")
async def start_years(session_id: str) -> list[dict]:
    """Start year distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_start_year_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT start year distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/facility-counts")
async def facility_counts(session_id: str) -> list[dict]:
    """Facility count distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_facility_count_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT facility count distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/countries")
async def countries(session_id: str) -> list[dict]:
    """Country distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_country_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT country distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/completion-rate")
async def completion_rate(session_id: str) -> list[dict]:
    """Completion rate (completed vs terminated/withdrawn/suspended) for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_completion_rate(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT completion rate error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/funder-types")
async def funder_types(session_id: str) -> list[dict]:
    """Funder type distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_funder_type_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT funder type distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


# ---------------------------------------------------------------------------
# Group F: Additional per-session stats endpoints
# ---------------------------------------------------------------------------


@router.get("/trial-site-cities")
async def trial_site_cities(session_id: str) -> list[dict]:
    """Top US trial site cities for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_trial_site_cities(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT trial site cities error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/trial-freshness")
async def trial_freshness(session_id: str) -> list[dict]:
    """Trial freshness (start date recency) for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_trial_freshness(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT trial freshness error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/related-conditions")
async def related_conditions(session_id: str) -> list[dict]:
    """Top related conditions for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_related_conditions(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT related conditions error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/top-drugs")
async def top_drugs(session_id: str) -> list[dict]:
    """Top drugs/interventions for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_top_drugs(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT top drugs error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/state-distribution")
async def state_distribution(session_id: str) -> list[dict]:
    """US state distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_state_distribution(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT state distribution error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/enrollment-targets")
async def enrollment_targets(session_id: str) -> list[dict]:
    """Enrollment target size distribution for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_enrollment_targets(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT enrollment targets error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/phase-pipeline")
async def phase_pipeline(session_id: str) -> list[dict]:
    """Phase pipeline (trials by clinical phase) for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_phase_pipeline(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT phase pipeline error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/lead-sponsors")
async def lead_sponsors(session_id: str) -> list[dict]:
    """Top lead sponsors for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_lead_sponsors(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT lead sponsors error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/sponsor-collaboration")
async def sponsor_collaboration(session_id: str) -> list[dict]:
    """Sponsor collaboration level (solo vs multi-sponsor) for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_sponsor_collaboration(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT sponsor collaboration error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")


@router.get("/recruitment-summary")
async def recruitment_summary(session_id: str) -> list[dict]:
    """Recruitment status summary for a session's trials."""
    nct_ids = _get_nct_ids(session_id)
    try:
        return await query_recruitment_summary(nct_ids)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="AACT database not configured")
    except Exception as e:
        logger.error(f"AACT recruitment summary error: {e}")
        raise HTTPException(status_code=503, detail="AACT database unavailable")
