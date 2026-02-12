"""AACT PostgreSQL database queries for faceted trial statistics."""

from __future__ import annotations

import logging
from typing import Any

import asyncpg

from backend.config import settings

logger = logging.getLogger(__name__)

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
    """Count only active (non-completed/terminated/withdrawn) trials."""
    pool = await get_pool()
    placeholders = ", ".join(f"${i+1}" for i in range(len(ACTIVE_STATUSES)))
    row = await pool.fetchval(
        f"SELECT COUNT(*) FROM ctgov.studies WHERE LOWER(overall_status) IN ({placeholders})",
        *ACTIVE_STATUSES,
    )
    return int(row)


async def get_all_status_distribution(condition: str = "") -> dict[str, int]:
    """Get trial counts for ALL statuses (not just active). Optionally filter by condition."""
    pool = await get_pool()
    if condition:
        q = """SELECT s.overall_status, COUNT(DISTINCT s.nct_id) as cnt
               FROM ctgov.studies s
               INNER JOIN ctgov.conditions c ON c.nct_id = s.nct_id
                 AND c.downcase_name ILIKE $1
               GROUP BY s.overall_status ORDER BY cnt DESC"""
        rows = await pool.fetch(q, f"%{condition.lower()}%")
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
        joins.append(
            f"INNER JOIN ctgov.conditions c ON c.nct_id = s.nct_id AND c.downcase_name ILIKE ${idx}"
        )
        params.append(f"%{condition.lower()}%")
        idx += 1

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
        where_clauses.append(f"(e.gender = 'All' OR e.gender = ${idx})")
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

    # Geographic distribution (top states, of matched)
    geo_q = f"""
        SELECT f2.country, f2.state, COUNT(DISTINCT s.nct_id) as cnt
        FROM ctgov.studies s
        {join_sql}
        {"INNER JOIN" if not any("facilities" in j for j in joins) else "LEFT JOIN"}
            ctgov.facilities f2 ON f2.nct_id = s.nct_id
        {where_sql}
        {"AND" if where_clauses else "WHERE"} f2.country = 'United States' AND f2.state IS NOT NULL
        GROUP BY f2.country, f2.state ORDER BY cnt DESC
    """
    geo_rows = await pool.fetch(geo_q, *params)
    geo_distribution = {row["state"]: int(row["cnt"]) for row in geo_rows}

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
        "funnel": funnel,
        "all_status_distribution": all_status,
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

    # + Condition
    row = await pool.fetchval(
        "SELECT COUNT(DISTINCT c.nct_id) FROM ctgov.conditions c WHERE c.downcase_name ILIKE $1",
        f"%{condition.lower()}%",
    )
    count_condition = int(row)
    funnel.append({"stage": f"Condition: {condition}", "count": count_condition})

    statuses = filters.get("statuses")
    if statuses:
        lowered_s = [s.lower() for s in statuses]
        placeholders = ", ".join(f"${i+2}" for i in range(len(lowered_s)))
        row = await pool.fetchval(
            f"""SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s
                INNER JOIN ctgov.conditions c ON c.nct_id = s.nct_id AND c.downcase_name ILIKE $1
                WHERE LOWER(s.overall_status) IN ({placeholders})""",
            f"%{condition.lower()}%",
            *lowered_s,
        )
        count_status = int(row)
        funnel.append({"stage": "+ Recruiting", "count": count_status})
    else:
        count_status = count_condition

    age = filters.get("age")
    if age is not None:
        age_val = int(age)
        base_params: list[Any] = [f"%{condition.lower()}%"]
        base_join = "INNER JOIN ctgov.conditions c ON c.nct_id = s.nct_id AND c.downcase_name ILIKE $1"
        status_where = ""
        p_idx = 2
        if statuses:
            lowered_s = [s.lower() for s in statuses]
            placeholders = ", ".join(f"${p_idx + i}" for i in range(len(lowered_s)))
            status_where = f" AND LOWER(s.overall_status) IN ({placeholders})"
            base_params.extend(lowered_s)
            p_idx += len(statuses)
        row = await pool.fetchval(
            f"""SELECT COUNT(DISTINCT s.nct_id) FROM ctgov.studies s
                {base_join}
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
