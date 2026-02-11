"""openFDA API wrapper.

Provides async functions to query adverse event reports and drug label
information from the FDA's public API.

API docs: https://open.fda.gov/apis/
Authentication optional — an API key increases rate limits.
"""

import logging
from typing import Any

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_FDA_BASE = "https://api.fda.gov"


def _api_key_params() -> dict[str, str]:
    """Return API key query param dict if configured, else empty dict."""
    if settings.openfda_api_key:
        return {"api_key": settings.openfda_api_key}
    return {}


async def get_adverse_events(
    drug_name: str, limit: int = 20
) -> list[dict]:
    """Get the most commonly reported adverse events for a drug.

    Queries the openFDA drug adverse event endpoint, counting reaction
    terms. Returns a ranked list of adverse event terms and their
    report counts.

    Args:
        drug_name: Generic drug name to search for (e.g. "metformin").
        limit: Maximum number of adverse event terms to return (default 20).

    Returns:
        List of dicts, each with "term" (str) and "count" (int).
        Empty list on error or if no data is found.
    """
    try:
        params: dict[str, Any] = {
            "search": f'patient.drug.openfda.generic_name:"{drug_name}"',
            "count": "patient.reaction.reactionmeddrapt.exact",
            "limit": limit,
            **_api_key_params(),
        }

        async with httpx.AsyncClient(
            base_url=_FDA_BASE, timeout=30.0,
            headers={"Accept": "application/json"},
        ) as client:
            response = await client.get("/drug/event.json", params=params)
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])
        return [
            {"term": item.get("term"), "count": item.get("count")}
            for item in results
        ]

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            logger.info(
                "No adverse event data found for drug=%r", drug_name
            )
        else:
            logger.error(
                "openFDA adverse events API HTTP error %s for drug=%r: %s",
                exc.response.status_code,
                drug_name,
                exc,
            )
        return []
    except httpx.HTTPError as exc:
        logger.error(
            "openFDA adverse events API request failed for drug=%r: %s",
            drug_name,
            exc,
        )
        return []
    except Exception as exc:
        logger.error(
            "Unexpected error fetching adverse events for drug=%r: %s",
            drug_name,
            exc,
        )
        return []


async def get_drug_label(drug_name: str) -> dict | None:
    """Fetch drug labeling information (package insert data) for a drug.

    Queries the openFDA drug label endpoint and extracts key sections
    including indications, warnings, dosage, and adverse reactions.

    Args:
        drug_name: Generic drug name to search for (e.g. "metformin").

    Returns:
        Dict with keys: indications, warnings, dosage, adverse_reactions.
        Each value is a list of strings (label sections can have multiple
        paragraphs). Returns None if no label data is found.
    """
    try:
        params: dict[str, Any] = {
            "search": f'openfda.generic_name:"{drug_name}"',
            "limit": 1,
            **_api_key_params(),
        }

        async with httpx.AsyncClient(
            base_url=_FDA_BASE, timeout=30.0,
            headers={"Accept": "application/json"},
        ) as client:
            response = await client.get("/drug/label.json", params=params)
            response.raise_for_status()
            data = response.json()

        results = data.get("results")
        if not results:
            logger.info("No drug label data found for drug=%r", drug_name)
            return None

        label = results[0]
        return {
            "indications": label.get("indications_and_usage", []),
            "warnings": label.get("warnings", []),
            "dosage": label.get("dosage_and_administration", []),
            "adverse_reactions": label.get("adverse_reactions", []),
        }

    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            logger.info("No drug label found for drug=%r", drug_name)
        else:
            logger.error(
                "openFDA drug label API HTTP error %s for drug=%r: %s",
                exc.response.status_code,
                drug_name,
                exc,
            )
        return None
    except httpx.HTTPError as exc:
        logger.error(
            "openFDA drug label API request failed for drug=%r: %s",
            drug_name,
            exc,
        )
        return None
    except Exception as exc:
        logger.error(
            "Unexpected error fetching drug label for drug=%r: %s",
            drug_name,
            exc,
        )
        return None
