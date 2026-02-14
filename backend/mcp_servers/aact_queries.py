"""AACT PostgreSQL database queries for faceted trial statistics."""

from __future__ import annotations

import logging
from typing import Any

import asyncpg

from backend.config import settings

logger = logging.getLogger(__name__)


def _build_condition_clauses(
    condition: str, alias: str, start_idx: int
) -> tuple[str, list[str], int]:
    """Build per-word ILIKE clauses for condition matching.

    AACT stores conditions like "sarcoma, ewing" so a single ILIKE '%ewing sarcoma%'
    misses them.  Splitting into per-word clauses (AND) matches regardless of word order.
    """
    words = [w for w in condition.lower().split() if len(w) >= 3]
    if not words:
        return "", [], start_idx
    clauses: list[str] = []
    params: list[str] = []
    for w in words:
        clauses.append(f"{alias}.downcase_name ILIKE ${start_idx}")
        params.append(f"%{w}%")
        start_idx += 1
    join_cond = " AND ".join(clauses)
    sql = f"INNER JOIN ctgov.conditions {alias} ON {alias}.nct_id = s.nct_id AND {join_cond}"
    return sql, params, start_idx


ACTIVE_STATUSES = [
    "recruiting",
    "not yet recruiting",
    "active, not recruiting",
    "enrolling by invitation",
    "available",
]

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Lazy-init asyncpg connection pool. Max 5 connections to stay under AACT's 10-per-account limit."""
    global _pool
    if _pool is None:
        if not settings.aact_database_url:
            raise RuntimeError("AACT_DATABASE_URL not configured")
        _pool = await asyncpg.create_pool(
            settings.aact_database_url,
            min_size=2,
            max_size=5,
            command_timeout=15,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_total_count() -> int:
    """Count all trials in the database."""
    pool = await get_pool()
    row = await pool.fetchval("SELECT COUNT(*) FROM ctgov.studies")
    return int(row)


async def get_all_status_distribution(condition: str = "") -> dict[str, int]:
    """Get trial counts for ALL statuses (not just active). Optionally filter by condition."""
    pool = await get_pool()
    if condition:
        cond_join, cond_params, _ = _build_condition_clauses(condition, "c", 1)
        if cond_join:
            q = f"""SELECT s.overall_status, COUNT(DISTINCT s.nct_id) as cnt
                    FROM ctgov.studies s
                    {cond_join}
                    GROUP BY s.overall_status ORDER BY cnt DESC"""
            rows = await pool.fetch(q, *cond_params)
        else:
            rows = await pool.fetch(
                "SELECT overall_status, COUNT(*) as cnt FROM ctgov.studies GROUP BY overall_status ORDER BY cnt DESC"
            )
    else:
        q = "SELECT overall_status, COUNT(*) as cnt FROM ctgov.studies GROUP BY overall_status ORDER BY cnt DESC"
        rows = await pool.fetch(q)
    return {row["overall_status"]: int(row["cnt"]) for row in rows}


async def get_top_conditions(limit: int = 15) -> list[dict[str, Any]]:
    """Return top conditions by active trial count."""
    pool = await get_pool()
    placeholders = ", ".join(f"${i+1}" for i in range(len(ACTIVE_STATUSES)))
    q = f"""SELECT c.downcase_name AS condition, COUNT(DISTINCT s.nct_id) AS cnt
            FROM ctgov.studies s
            INNER JOIN ctgov.conditions c ON c.nct_id = s.nct_id
            WHERE LOWER(s.overall_status) IN ({placeholders})
              AND c.downcase_name IS NOT NULL AND c.downcase_name != ''
            GROUP BY c.downcase_name ORDER BY cnt DESC LIMIT ${len(ACTIVE_STATUSES)+1}"""
    rows = await pool.fetch(q, *ACTIVE_STATUSES, limit)
    return [{"condition": row["condition"], "count": int(row["cnt"])} for row in rows]


async def query_faceted_stats(filters: dict[str, Any]) -> dict[str, Any]:
    pool = await get_pool()

    # Build WHERE clauses and params
    where_clauses: list[str] = []
    params: list[Any] = []
    joins: list[str] = []
    idx = 1

    condition = filters.get("condition", "").strip()
    if condition:
        cond_join, cond_params, idx = _build_condition_clauses(condition, "c", idx)
        if cond_join:
            joins.append(cond_join)
            params.extend(cond_params)

    # Default to active statuses if none specified
    statuses = filters.get("statuses") or ACTIVE_STATUSES
    if statuses:
        lowered = [s.lower() for s in statuses]
        placeholders = ", ".join(f"${idx + i}" for i in range(len(lowered)))
        where_clauses.append(f"LOWER(s.overall_status) IN ({placeholders})")
        params.extend(lowered)
        idx += len(lowered)

    sex = filters.get("sex", "").strip()
    if sex and sex.lower() not in ("all", ""):
        joins.append(f"INNER JOIN ctgov.eligibilities e ON e.nct_id = s.nct_id")
        where_clauses.append(f"(UPPER(e.gender) = 'ALL' OR UPPER(e.gender) = UPPER(${idx}))")
        params.append(sex)
        idx += 1

    age = filters.get("age")
    if age is not None:
        # Only add eligibilities join if not already added
        if not any("eligibilities" in j for j in joins):
            joins.append(f"INNER JOIN ctgov.eligibilities e ON e.nct_id = s.nct_id")
        age_val = int(age)
        where_clauses.append(
            f"(e.minimum_age IS NULL OR e.minimum_age = '' OR "
            f"NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') IS NULL OR "
            f"CAST(NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') AS INTEGER) <= ${idx})"
        )
        params.append(age_val)
        idx += 1
        where_clauses.append(
            f"(e.maximum_age IS NULL OR e.maximum_age = '' OR "
            f"NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') IS NULL OR "
            f"CAST(NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') AS INTEGER) >= ${idx})"
        )
        params.append(age_val)
        idx += 1

    states = filters.get("states")
    if states:
        joins.append(f"INNER JOIN ctgov.facilities f ON f.nct_id = s.nct_id")
        placeholders = ", ".join(f"${idx + i}" for i in range(len(states)))
        where_clauses.append(f"f.state IN ({placeholders})")
        params.extend(states)
        idx += len(states)

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    join_sql = " ".join(joins)

    # Get matched count
    count_q = f"SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s {join_sql}{where_sql}"
    matched = int(await pool.fetchval(count_q, *params))

    # Get total (active trials only)
    total = await get_total_count()

    # Phase distribution (of matched)
    phase_q = f"""
        SELECT s.phase, COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s {join_sql}{where_sql}
        GROUP BY s.phase ORDER BY cnt DESC
    """
    phase_rows = await pool.fetch(phase_q, *params)
    phase_distribution = {(row["phase"] or "N/A"): int(row["cnt"]) for row in phase_rows}

    # Status distribution (of matched)
    status_q = f"""
        SELECT s.overall_status, COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s {join_sql}{where_sql}
        GROUP BY s.overall_status ORDER BY cnt DESC
    """
    status_rows = await pool.fetch(status_q, *params)
    status_distribution = {row["overall_status"]: int(row["cnt"]) for row in status_rows}

    # Geographic distribution (by country, global)
    geo_q = f"""
        SELECT f2.country, COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s
        {join_sql}
        {"INNER JOIN" if not any("facilities" in j for j in joins) else "LEFT JOIN"}
            ctgov.facilities f2 ON f2.nct_id = s.nct_id
        {where_sql}
        {"AND" if where_clauses else "WHERE"} f2.country IS NOT NULL
        GROUP BY f2.country ORDER BY cnt DESC
    """
    geo_rows = await pool.fetch(geo_q, *params)
    geo_distribution = {row["country"]: int(row["cnt"]) for row in geo_rows}

    # US state-level distribution (for map drill-down)
    state_geo_q = f"""
        SELECT f2.state, COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s
        {join_sql}
        {"INNER JOIN" if not any("facilities" in j for j in joins) else "LEFT JOIN"}
            ctgov.facilities f2 ON f2.nct_id = s.nct_id
        {where_sql}
        {"AND" if where_clauses else "WHERE"} f2.country = 'United States' AND f2.state IS NOT NULL
        GROUP BY f2.state ORDER BY cnt DESC
    """
    state_geo_rows = await pool.fetch(state_geo_q, *params)
    geo_distribution_states = {row["state"]: int(row["cnt"]) for row in state_geo_rows}

    # Build funnel
    funnel = await _build_funnel(pool, filters)

    # All-status distribution (includes completed, terminated, etc.)
    all_status = await get_all_status_distribution(condition)

    return {
        "total": total,
        "matched": matched,
        "phase_distribution": phase_distribution,
        "status_distribution": status_distribution,
        "geo_distribution": geo_distribution,
        "geo_distribution_states": geo_distribution_states,
        "funnel": funnel,
        "all_status_distribution": all_status,
        "sql_query": count_q,
        "sql_params": [str(p) for p in params],
    }


async def _build_funnel(pool: asyncpg.Pool, filters: dict[str, Any]) -> list[dict[str, Any]]:
    """Progressive narrowing funnel: All Active → Condition → +Recruiting → +Age → +Sex → +Location."""
    placeholders = ", ".join(f"${i+1}" for i in range(len(ACTIVE_STATUSES)))
    total = int(await pool.fetchval(
        f"SELECT COUNT(*) FROM ctgov.studies WHERE LOWER(overall_status) IN ({placeholders})",
        *ACTIVE_STATUSES,
    ))
    funnel = [{"stage": "All Active Trials", "count": total}]

    condition = filters.get("condition", "").strip()
    if not condition:
        return funnel

    # + Condition (per-word match)
    cond_join_f, cond_params_f, next_idx = _build_condition_clauses(condition, "c", 1)
    if cond_join_f:
        row = await pool.fetchval(
            f"SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s {cond_join_f}",
            *cond_params_f,
        )
    else:
        row = 0
    count_condition = int(row)
    funnel.append({"stage": f"Condition: {condition}", "count": count_condition})

    statuses = filters.get("statuses")
    if statuses:
        lowered_s = [s.lower() for s in statuses]
        cond_join_s, cond_params_s, s_idx = _build_condition_clauses(condition, "c", 1)
        placeholders = ", ".join(f"${s_idx + i}" for i in range(len(lowered_s)))
        row = await pool.fetchval(
            f"""SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s
                {cond_join_s}
                WHERE LOWER(s.overall_status) IN ({placeholders})""",
            *cond_params_s,
            *lowered_s,
        )
        count_status = int(row)
        funnel.append({"stage": "+ Recruiting", "count": count_status})
    else:
        count_status = count_condition

    age = filters.get("age")
    if age is not None:
        age_val = int(age)
        base_join_a, base_params_a, p_idx = _build_condition_clauses(condition, "c", 1)
        base_params: list[Any] = list(base_params_a)
        status_where = ""
        if statuses:
            lowered_s = [s.lower() for s in statuses]
            placeholders = ", ".join(f"${p_idx + i}" for i in range(len(lowered_s)))
            status_where = f" AND LOWER(s.overall_status) IN ({placeholders})"
            base_params.extend(lowered_s)
            p_idx += len(statuses)
        row = await pool.fetchval(
            f"""SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s
                {base_join_a}
                INNER JOIN ctgov.eligibilities e ON e.nct_id = s.nct_id
                WHERE (e.minimum_age IS NULL OR e.minimum_age = '' OR
                    NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') IS NULL OR
                    CAST(NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') AS INTEGER) <= ${p_idx})
                AND (e.maximum_age IS NULL OR e.maximum_age = '' OR
                    NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') IS NULL OR
                    CAST(NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') AS INTEGER) >= ${p_idx+1})
                {status_where}""",
            *base_params,
            age_val,
            age_val,
        )
        count_age = int(row)
        funnel.append({"stage": f"+ Age: {age_val}", "count": count_age})

    sex = filters.get("sex", "").strip()
    if sex and sex.lower() not in ("all", ""):
        # This is the most complex query — just use the full matched count
        funnel.append({"stage": f"+ Sex: {sex}", "count": -1})  # placeholder, filled by caller

    states = filters.get("states")
    if states:
        funnel.append({"stage": f"+ Location ({len(states)} states)", "count": -1})

    return funnel


async def query_sponsor_distribution(filters: dict[str, Any]) -> list[dict[str, Any]]:
    """Return top 10 sponsors by trial count, respecting current filters."""
    pool = await get_pool()

    where_clauses: list[str] = []
    params: list[Any] = []
    joins: list[str] = []
    idx = 1

    condition = filters.get("condition", "").strip()
    if condition:
        cond_join, cond_params, idx = _build_condition_clauses(condition, "c", idx)
        if cond_join:
            joins.append(cond_join)
            params.extend(cond_params)

    statuses = filters.get("statuses") or ACTIVE_STATUSES
    if statuses:
        lowered = [s.lower() for s in statuses]
        placeholders = ", ".join(f"${idx + i}" for i in range(len(lowered)))
        where_clauses.append(f"LOWER(s.overall_status) IN ({placeholders})")
        params.extend(lowered)
        idx += len(lowered)

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    join_sql = " ".join(joins)

    q = f"""
        SELECT sp.name AS sponsor, COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s
        {join_sql}
        INNER JOIN ctgov.sponsors sp ON sp.nct_id = s.nct_id AND sp.lead_or_collaborator = 'lead'
        {where_sql}
        {"AND" if where_clauses else "WHERE"} sp.name IS NOT NULL AND sp.name != ''
        GROUP BY sp.name
        ORDER BY cnt DESC
        LIMIT 10
    """
    rows = await pool.fetch(q, *params)
    return [{"sponsor": row["sponsor"], "count": int(row["cnt"])} for row in rows]


async def query_enrollment_distribution(filters: dict[str, Any]) -> list[dict[str, Any]]:
    """Return enrollment size distribution in buckets."""
    pool = await get_pool()

    where_clauses: list[str] = []
    params: list[Any] = []
    joins: list[str] = []
    idx = 1

    condition = filters.get("condition", "").strip()
    if condition:
        cond_join, cond_params, idx = _build_condition_clauses(condition, "c", idx)
        if cond_join:
            joins.append(cond_join)
            params.extend(cond_params)

    statuses = filters.get("statuses") or ACTIVE_STATUSES
    if statuses:
        lowered = [s.lower() for s in statuses]
        placeholders = ", ".join(f"${idx + i}" for i in range(len(lowered)))
        where_clauses.append(f"LOWER(s.overall_status) IN ({placeholders})")
        params.extend(lowered)
        idx += len(lowered)

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    join_sql = " ".join(joins)

    q = f"""
        SELECT
            CASE
                WHEN s.enrollment < 50 THEN '<50'
                WHEN s.enrollment < 200 THEN '50-200'
                WHEN s.enrollment < 500 THEN '200-500'
                WHEN s.enrollment < 1000 THEN '500-1K'
                ELSE '1K+'
            END AS bucket,
            COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s
        {join_sql}
        {where_sql}
        {"AND" if where_clauses else "WHERE"} s.enrollment IS NOT NULL AND s.enrollment > 0
        GROUP BY bucket
        ORDER BY MIN(s.enrollment)
    """
    rows = await pool.fetch(q, *params)
    # Ensure consistent ordering
    bucket_order = ["<50", "50-200", "200-500", "500-1K", "1K+"]
    result_map = {row["bucket"]: int(row["cnt"]) for row in rows}
    return [{"bucket": b, "count": result_map.get(b, 0)} for b in bucket_order if result_map.get(b, 0) > 0]


async def query_matched_trials(filters: dict[str, Any], page: int = 1, per_page: int = 10) -> dict[str, Any]:
    """Return paginated list of trials matching current filters."""
    pool = await get_pool()

    where_clauses: list[str] = []
    params: list[Any] = []
    joins: list[str] = []
    idx = 1

    condition = filters.get("condition", "").strip()
    if condition:
        cond_join, cond_params, idx = _build_condition_clauses(condition, "c", idx)
        if cond_join:
            joins.append(cond_join)
            params.extend(cond_params)

    statuses = filters.get("statuses") or ACTIVE_STATUSES
    if statuses:
        lowered = [s.lower() for s in statuses]
        placeholders = ", ".join(f"${idx + i}" for i in range(len(lowered)))
        where_clauses.append(f"LOWER(s.overall_status) IN ({placeholders})")
        params.extend(lowered)
        idx += len(lowered)

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    join_sql = " ".join(joins)

    # Get total count
    count_q = f"SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s {join_sql}{where_sql}"
    total = int(await pool.fetchval(count_q, *params))

    # Get page of results
    offset = (page - 1) * per_page
    q = f"""
        SELECT DISTINCT s.nct_id, s.brief_title,
               (SELECT string_agg(DISTINCT con.name, '; ')
                FROM ctgov.conditions con WHERE con.nct_id = s.nct_id) AS condition_name
        FROM ctgov.studies s
        {join_sql}
        {where_sql}
        ORDER BY s.nct_id
        LIMIT ${idx} OFFSET ${idx + 1}
    """
    params.extend([per_page, offset])
    rows = await pool.fetch(q, *params)

    trials = [
        {
            "nct_id": row["nct_id"],
            "brief_title": row["brief_title"],
            "condition": row["condition_name"] or "",
        }
        for row in rows
    ]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
        "trials": trials,
    }


# ---------------------------------------------------------------------------
# Per-session stats queries (accept nct_ids list)
# ---------------------------------------------------------------------------

def _nct_placeholders(nct_ids: list[str], start_idx: int = 1) -> tuple[str, int]:
    """Return ($1, $2, ...) placeholder string and next available param index."""
    placeholders = ", ".join(f"${start_idx + i}" for i in range(len(nct_ids)))
    return placeholders, start_idx + len(nct_ids)


async def query_study_type_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Count trials by study type (Interventional, Observational, etc.)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT s.study_type AS name, COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
          AND s.study_type IS NOT NULL AND s.study_type != ''
        GROUP BY s.study_type
        ORDER BY value DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_gender_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Count trials by eligible gender (All, Female, Male)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT COALESCE(e.gender, 'Not specified') AS name, COUNT(DISTINCT s.nct_id) AS value
        FROM ctgov.studies s
        LEFT JOIN ctgov.eligibilities e ON e.nct_id = s.nct_id
        WHERE s.nct_id IN ({ph})
        GROUP BY e.gender
        ORDER BY value DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_age_group_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Bucket trials by age eligibility into Pediatric (0-17), Adult (18-64), Older Adult (65+).

    A trial can appear in multiple buckets if its age range spans groups.
    """
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') IS NULL
                     OR CAST(NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') AS INTEGER) < 18
                THEN true ELSE false
            END AS includes_pediatric,
            CASE
                WHEN (NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') IS NULL
                      OR CAST(NULLIF(REGEXP_REPLACE(e.minimum_age, '[^0-9]', '', 'g'), '') AS INTEGER) <= 64)
                 AND (NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') IS NULL
                      OR CAST(NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') AS INTEGER) >= 18)
                THEN true ELSE false
            END AS includes_adult,
            CASE
                WHEN NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') IS NULL
                     OR CAST(NULLIF(REGEXP_REPLACE(e.maximum_age, '[^0-9]', '', 'g'), '') AS INTEGER) >= 65
                THEN true ELSE false
            END AS includes_older_adult
        FROM ctgov.studies s
        INNER JOIN ctgov.eligibilities e ON e.nct_id = s.nct_id
        WHERE s.nct_id IN ({ph})
          AND e.minimum_age IS NOT NULL AND e.minimum_age != ''
    """
    rows = await pool.fetch(q, *nct_ids)
    counts = {"Pediatric (0-17)": 0, "Adult (18-64)": 0, "Older Adult (65+)": 0}
    for row in rows:
        if row["includes_pediatric"]:
            counts["Pediatric (0-17)"] += 1
        if row["includes_adult"]:
            counts["Adult (18-64)"] += 1
        if row["includes_older_adult"]:
            counts["Older Adult (65+)"] += 1
    return [{"name": k, "value": v} for k, v in counts.items() if v > 0]


async def query_intervention_type_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Count trials by intervention type (Drug, Biological, Device, Procedure, etc.)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT COALESCE(i.intervention_type, 'Other') AS name,
               COUNT(DISTINCT s.nct_id) AS value
        FROM ctgov.studies s
        INNER JOIN ctgov.interventions i ON i.nct_id = s.nct_id
        WHERE s.nct_id IN ({ph})
          AND i.intervention_type IS NOT NULL AND i.intervention_type != ''
        GROUP BY i.intervention_type
        ORDER BY value DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_duration_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Bucket trials by study duration (< 1 year, 1-2 years, 2-5 years, 5+ years)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN (s.completion_date - s.start_date) < 365 THEN '< 1 year'
                WHEN (s.completion_date - s.start_date) < 730 THEN '1-2 years'
                WHEN (s.completion_date - s.start_date) < 1825 THEN '2-5 years'
                ELSE '5+ years'
            END AS name,
            COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
          AND s.start_date IS NOT NULL
          AND s.completion_date IS NOT NULL
          AND s.completion_date > s.start_date
        GROUP BY name
        ORDER BY MIN(s.completion_date - s.start_date)
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_start_year_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Count trials by start date year."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT EXTRACT(YEAR FROM s.start_date)::INTEGER AS year, COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
          AND s.start_date IS NOT NULL
        GROUP BY year
        ORDER BY year
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": str(row["year"]), "value": int(row["value"])} for row in rows]


async def query_facility_count_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Bucket trials by number of facilities (1, 2-5, 6-10, 11-50, 50+)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        WITH facility_counts AS (
            SELECT s.nct_id, COUNT(f.id) AS fcount
            FROM ctgov.studies s
            LEFT JOIN ctgov.facilities f ON f.nct_id = s.nct_id
            WHERE s.nct_id IN ({ph})
            GROUP BY s.nct_id
        )
        SELECT
            CASE
                WHEN fcount <= 1 THEN '1'
                WHEN fcount <= 5 THEN '2-5'
                WHEN fcount <= 10 THEN '6-10'
                WHEN fcount <= 50 THEN '11-50'
                ELSE '50+'
            END AS name,
            COUNT(*) AS value
        FROM facility_counts
        GROUP BY name
        ORDER BY MIN(fcount)
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_country_distribution(nct_ids: list[str], limit: int = 15) -> list[dict[str, Any]]:
    """Count trials by country (top results)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, next_idx = _nct_placeholders(nct_ids)
    q = f"""
        SELECT f.country AS name, COUNT(DISTINCT s.nct_id) AS value
        FROM ctgov.studies s
        INNER JOIN ctgov.facilities f ON f.nct_id = s.nct_id
        WHERE s.nct_id IN ({ph})
          AND f.country IS NOT NULL AND f.country != ''
        GROUP BY f.country
        ORDER BY value DESC
        LIMIT ${next_idx}
    """
    rows = await pool.fetch(q, *nct_ids, limit)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_completion_rate(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Percentage of trials that completed vs terminated/withdrawn/suspended."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN LOWER(s.overall_status) = 'completed' THEN 'Completed'
                WHEN LOWER(s.overall_status) IN ('terminated', 'withdrawn', 'suspended') THEN 'Terminated/Withdrawn/Suspended'
                ELSE 'Other/Ongoing'
            END AS name,
            COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
        GROUP BY name
        ORDER BY value DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_funder_type_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Count trials by funder type (Industry, NIH, Other, Network)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT COALESCE(sp.agency_class, 'Unknown') AS name,
               COUNT(DISTINCT s.nct_id) AS value
        FROM ctgov.studies s
        INNER JOIN ctgov.sponsors sp ON sp.nct_id = s.nct_id
            AND sp.lead_or_collaborator = 'lead'
        WHERE s.nct_id IN ({ph})
          AND sp.agency_class IS NOT NULL AND sp.agency_class != ''
        GROUP BY sp.agency_class
        ORDER BY value DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


# ---------------------------------------------------------------------------
# Group F: Additional per-session stats queries
# ---------------------------------------------------------------------------


async def query_trial_site_cities(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Top 15 US trial site cities by number of trials."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT f.city || ', ' || f.state AS name,
               COUNT(DISTINCT f.nct_id) AS value
        FROM ctgov.facilities f
        WHERE f.nct_id IN ({ph})
          AND f.country = 'United States'
          AND f.city IS NOT NULL
        GROUP BY f.city, f.state
        ORDER BY value DESC
        LIMIT 15
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_trial_freshness(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Bucket trials by how recently they started."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN s.start_date > NOW() - INTERVAL '6 months' THEN 'Last 6 months'
                WHEN s.start_date > NOW() - INTERVAL '12 months' THEN '6-12 months'
                WHEN s.start_date > NOW() - INTERVAL '2 years' THEN '1-2 years'
                WHEN s.start_date > NOW() - INTERVAL '5 years' THEN '2-5 years'
                ELSE '5+ years'
            END AS name,
            COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
          AND s.start_date IS NOT NULL
        GROUP BY name
        ORDER BY MIN(s.start_date) DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    # Ensure consistent ordering from newest to oldest
    bucket_order = ["Last 6 months", "6-12 months", "1-2 years", "2-5 years", "5+ years"]
    result_map = {row["name"]: int(row["value"]) for row in rows}
    return [{"name": b, "value": result_map[b]} for b in bucket_order if result_map.get(b, 0) > 0]


async def query_related_conditions(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Top 15 conditions associated with the matched trials."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT c.name AS name,
               COUNT(DISTINCT c.nct_id) AS value
        FROM ctgov.conditions c
        WHERE c.nct_id IN ({ph})
          AND c.name IS NOT NULL
        GROUP BY c.name
        ORDER BY value DESC
        LIMIT 15
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_top_drugs(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Top 15 drugs/interventions by trial count."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT i.name AS name,
               COUNT(DISTINCT i.nct_id) AS value
        FROM ctgov.interventions i
        WHERE i.nct_id IN ({ph})
          AND i.name IS NOT NULL
        GROUP BY i.name
        ORDER BY value DESC
        LIMIT 15
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_state_distribution(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Top 15 US states by trial count."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT f.state AS name,
               COUNT(DISTINCT f.nct_id) AS value
        FROM ctgov.facilities f
        WHERE f.nct_id IN ({ph})
          AND f.country = 'United States'
          AND f.state IS NOT NULL
        GROUP BY f.state
        ORDER BY value DESC
        LIMIT 15
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_enrollment_targets(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Bucket trials by enrollment target size."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN s.enrollment < 20 THEN '<20'
                WHEN s.enrollment < 50 THEN '20-50'
                WHEN s.enrollment < 100 THEN '50-100'
                WHEN s.enrollment < 300 THEN '100-300'
                WHEN s.enrollment < 1000 THEN '300-1K'
                ELSE '1K+'
            END AS name,
            COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
          AND s.enrollment IS NOT NULL AND s.enrollment > 0
        GROUP BY name
        ORDER BY MIN(s.enrollment)
    """
    rows = await pool.fetch(q, *nct_ids)
    bucket_order = ["<20", "20-50", "50-100", "100-300", "300-1K", "1K+"]
    result_map = {row["name"]: int(row["value"]) for row in rows}
    return [{"name": b, "value": result_map[b]} for b in bucket_order if result_map.get(b, 0) > 0]


async def query_phase_pipeline(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Count trials by phase, ordered by clinical progression."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN s.phase = 'Early Phase 1' THEN 'Early Phase 1'
                WHEN s.phase = 'Phase 1' THEN 'Phase 1'
                WHEN s.phase = 'Phase 1/Phase 2' THEN 'Phase 1/2'
                WHEN s.phase = 'Phase 2' THEN 'Phase 2'
                WHEN s.phase = 'Phase 2/Phase 3' THEN 'Phase 2/3'
                WHEN s.phase = 'Phase 3' THEN 'Phase 3'
                WHEN s.phase = 'Phase 4' THEN 'Phase 4'
                WHEN s.phase IS NULL OR s.phase = 'N/A' OR s.phase = '' THEN 'Not Applicable'
                ELSE s.phase
            END AS name,
            COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
        GROUP BY name
        ORDER BY
            CASE name
                WHEN 'Early Phase 1' THEN 1
                WHEN 'Phase 1' THEN 2
                WHEN 'Phase 1/2' THEN 3
                WHEN 'Phase 2' THEN 4
                WHEN 'Phase 2/3' THEN 5
                WHEN 'Phase 3' THEN 6
                WHEN 'Phase 4' THEN 7
                ELSE 8
            END
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_lead_sponsors(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Top 10 lead sponsors by trial count."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT sp.name AS name,
               COUNT(DISTINCT sp.nct_id) AS value
        FROM ctgov.sponsors sp
        WHERE sp.nct_id IN ({ph})
          AND sp.lead_or_collaborator = 'lead'
          AND sp.name IS NOT NULL
        GROUP BY sp.name
        ORDER BY value DESC
        LIMIT 10
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]


async def query_sponsor_collaboration(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Bucket trials by number of sponsors (Solo, 2, 3-5, 6+)."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        WITH sponsor_counts AS (
            SELECT sp.nct_id, COUNT(*) AS scount
            FROM ctgov.sponsors sp
            WHERE sp.nct_id IN ({ph})
            GROUP BY sp.nct_id
        )
        SELECT
            CASE
                WHEN scount = 1 THEN 'Solo'
                WHEN scount = 2 THEN '2 sponsors'
                WHEN scount <= 5 THEN '3-5 sponsors'
                ELSE '6+ sponsors'
            END AS name,
            COUNT(*) AS value
        FROM sponsor_counts
        GROUP BY name
        ORDER BY MIN(scount)
    """
    rows = await pool.fetch(q, *nct_ids)
    bucket_order = ["Solo", "2 sponsors", "3-5 sponsors", "6+ sponsors"]
    result_map = {row["name"]: int(row["value"]) for row in rows}
    return [{"name": b, "value": result_map[b]} for b in bucket_order if result_map.get(b, 0) > 0]


async def query_recruitment_summary(nct_ids: list[str]) -> list[dict[str, Any]]:
    """Summarise trials into broad recruitment status groups."""
    if not nct_ids:
        return []
    pool = await get_pool()
    ph, _ = _nct_placeholders(nct_ids)
    q = f"""
        SELECT
            CASE
                WHEN UPPER(REPLACE(s.overall_status, ' ', '_'))
                     IN ('RECRUITING', 'NOT_YET_RECRUITING', 'ENROLLING_BY_INVITATION')
                    THEN 'Open for enrollment'
                WHEN UPPER(REPLACE(s.overall_status, ' ', '_')) = 'ACTIVE_NOT_RECRUITING'
                    THEN 'Active, not enrolling'
                WHEN UPPER(REPLACE(s.overall_status, ' ', '_')) = 'COMPLETED'
                    THEN 'Completed'
                WHEN UPPER(REPLACE(s.overall_status, ' ', '_'))
                     IN ('TERMINATED', 'WITHDRAWN', 'SUSPENDED')
                    THEN 'Stopped early'
                ELSE 'Other'
            END AS name,
            COUNT(*) AS value
        FROM ctgov.studies s
        WHERE s.nct_id IN ({ph})
        GROUP BY name
        ORDER BY value DESC
    """
    rows = await pool.fetch(q, *nct_ids)
    return [{"name": row["name"], "value": int(row["value"])} for row in rows]
