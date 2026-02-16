"""ClinicalTrials.gov API v2 wrapper.

Provides async functions to search clinical trials, fetch details,
extract eligibility criteria, and retrieve trial locations.

API docs: https://clinicaltrials.gov/data-api/api
No authentication required. Rate limit ~10 req/sec.

Uses aiohttp instead of httpx because ClinicalTrials.gov blocks httpx's
TLS fingerprint.
"""

import logging
import re
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

_BASE_URL = "https://clinicaltrials.gov/api/v2"
_MILES_TO_KM = 1.60934
_MAX_PAGE_SIZE = 100


async def _get(path: str, params: dict[str, Any]) -> dict:
    """Make a GET request to the ClinicalTrials.gov API."""
    async with aiohttp.ClientSession() as session:
        async with session.get(
            f"{_BASE_URL}{path}",
            params=params,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            resp.raise_for_status()
            return await resp.json()


def _parse_study_summary(study: dict) -> dict:
    """Extract a flat summary dict from a ClinicalTrials.gov study record."""
    protocol = study.get("protocolSection", {})
    ident = protocol.get("identificationModule", {})
    status_mod = protocol.get("statusModule", {})
    design = protocol.get("designModule", {})
    description = protocol.get("descriptionModule", {})
    conditions = protocol.get("conditionsModule", {})
    arms = protocol.get("armsInterventionsModule", {})
    sponsor = protocol.get("sponsorCollaboratorsModule", {})
    contacts_locations = protocol.get("contactsLocationsModule", {})

    locations_raw = contacts_locations.get("locations", [])
    flat_locations = []
    for loc in locations_raw:
        geo = loc.get("geoPoint", {})
        contacts = loc.get("contacts", [])
        first_contact = contacts[0] if contacts else {}
        flat_locations.append({
            "facility": loc.get("facility", ""),
            "city": loc.get("city", ""),
            "state": loc.get("state", ""),
            "country": loc.get("country", ""),
            "latitude": geo.get("lat"),
            "longitude": geo.get("lon"),
            "status": loc.get("status", ""),
            "contact_name": first_contact.get("name", ""),
            "contact_phone": first_contact.get("phone", ""),
            "contact_email": first_contact.get("email", ""),
        })

    interventions_raw = arms.get("interventions", [])
    intervention_names = [
        i.get("name", "") for i in interventions_raw if i.get("name")
    ]

    enrollment_info = design.get("enrollmentInfo", {})
    start_date = status_mod.get("startDateStruct", {})
    completion_date = status_mod.get("completionDateStruct", {})
    lead_sponsor = sponsor.get("leadSponsor", {})

    phases_raw = design.get("phases", [])
    phase_str = " / ".join(phases_raw) if phases_raw else ""

    return {
        "nct_id": ident.get("nctId"),
        "brief_title": ident.get("briefTitle"),
        "official_title": ident.get("officialTitle"),
        "overall_status": status_mod.get("overallStatus"),
        "phase": phase_str,
        "brief_summary": description.get("briefSummary"),
        "conditions": conditions.get("conditions", []),
        "interventions": intervention_names,
        "enrollment_count": enrollment_info.get("count"),
        "start_date": start_date.get("date"),
        "completion_date": completion_date.get("date"),
        "sponsor": lead_sponsor.get("name"),
        "locations": flat_locations,
    }


def _condition_matches(trial: dict, query_condition: str) -> bool:
    """Check if a trial's conditions list is relevant to the searched condition.

    Uses keyword overlap: each significant word (3+ chars) from the query
    must appear in at least one of the trial's condition strings.
    """
    trial_conditions = trial.get("conditions", [])
    if not trial_conditions:
        return True  # No conditions listed — don't filter out

    # Normalize: lowercase everything
    conditions_text = " ".join(c.lower() for c in trial_conditions)
    query_words = [w.lower() for w in query_condition.split() if len(w) >= 3]

    if not query_words:
        return True

    # All significant query words must appear in the conditions text
    return all(word in conditions_text for word in query_words)


async def search_trials(
    condition: str,
    intervention: str | None = None,
    phase: list[str] | str | None = None,
    status: list[str] | str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    distance_miles: float = 100,
    max_results: int = 50,
) -> list[dict]:
    """Search ClinicalTrials.gov for studies matching the given criteria.

    Args:
        condition: Disease or condition to search for (required).
        intervention: Drug or intervention name to filter by.
        phase: Trial phase filter. Can be string or list, e.g. ["PHASE2", "PHASE3"].
        status: Overall status filter. Defaults to ["RECRUITING"]. Can be string or list.
        latitude: Latitude for geographic filtering.
        longitude: Longitude for geographic filtering.
        distance_miles: Radius in miles for geo filter (default 100).
        max_results: Maximum number of results to return (default 50).

    Returns:
        List of trial summary dicts. Empty list on error.
    """
    try:
        params: dict[str, Any] = {
            "query.cond": condition,
            "format": "json",
        }

        if intervention:
            params["query.intr"] = intervention

        # Status filter — handle list or string, default to RECRUITING
        if isinstance(status, list):
            filter_status = ",".join(status)
        elif status:
            filter_status = status
        else:
            filter_status = "RECRUITING"
        params["filter.overallStatus"] = filter_status

        # Phase filter — use filter.advanced with AREA[Phase] syntax
        # ClinicalTrials.gov v2 does not support filter.phase directly
        phase_list = phase if isinstance(phase, list) else ([phase] if phase else [])
        if phase_list:
            phase_expr = " OR ".join(phase_list)
            params["filter.advanced"] = f"AREA[Phase]({phase_expr})"

        if latitude is not None and longitude is not None:
            distance_km = distance_miles * _MILES_TO_KM
            params["filter.geo"] = (
                f"distance({latitude},{longitude},{distance_km:.1f}km)"
            )

        page_size = min(max_results, _MAX_PAGE_SIZE)
        params["pageSize"] = page_size

        all_studies: list[dict] = []
        next_page_token: str | None = None

        while len(all_studies) < max_results:
            if next_page_token:
                params["pageToken"] = next_page_token

            data = await _get("/studies", params)

            studies = data.get("studies", [])
            if not studies:
                break

            for study in studies:
                if len(all_studies) >= max_results:
                    break
                parsed = _parse_study_summary(study)
                if _condition_matches(parsed, condition):
                    all_studies.append(parsed)

            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break

            remaining = max_results - len(all_studies)
            params["pageSize"] = min(remaining, _MAX_PAGE_SIZE)

        return all_studies

    except aiohttp.ClientResponseError as exc:
        logger.error(
            "ClinicalTrials.gov API HTTP error %s for condition=%r: %s",
            exc.status,
            condition,
            exc,
        )
        return []
    except Exception as exc:
        logger.error(
            "Error searching trials for condition=%r: %s",
            condition,
            exc,
        )
        return []


async def get_trial_details(nct_id: str) -> dict:
    """Fetch the full study record for a given NCT ID."""
    try:
        return await _get(f"/studies/{nct_id}", {"format": "json"})
    except aiohttp.ClientResponseError as exc:
        logger.error(
            "ClinicalTrials.gov API HTTP error %s for nct_id=%s: %s",
            exc.status, nct_id, exc,
        )
        return {}
    except Exception as exc:
        logger.error("Error fetching trial details for nct_id=%s: %s", nct_id, exc)
        return {}


async def get_eligibility_criteria(nct_id: str) -> dict:
    """Extract and parse eligibility criteria for a trial."""
    study = await get_trial_details(nct_id)
    if not study:
        return {
            "nct_id": nct_id, "raw_text": "",
            "inclusion": [], "exclusion": [],
            "min_age": None, "max_age": None,
            "sex": None, "accepts_healthy": None,
        }

    protocol = study.get("protocolSection", {})
    eligibility = protocol.get("eligibilityModule", {})
    raw_text = eligibility.get("eligibilityCriteria", "")
    inclusion, exclusion = _parse_criteria_text(raw_text)

    return {
        "nct_id": nct_id,
        "raw_text": raw_text,
        "inclusion": inclusion,
        "exclusion": exclusion,
        "min_age": eligibility.get("minimumAge"),
        "max_age": eligibility.get("maximumAge"),
        "sex": eligibility.get("sex"),
        "accepts_healthy": eligibility.get("healthyVolunteers"),
    }


def _parse_criteria_text(text: str) -> tuple[list[str], list[str]]:
    """Split eligibility criteria free-text into inclusion and exclusion lists."""
    inclusion: list[str] = []
    exclusion: list[str] = []

    if not text:
        return inclusion, exclusion

    text_lower = text.lower()
    inc_start = text_lower.find("inclusion criteria")
    exc_start = text_lower.find("exclusion criteria")

    if inc_start != -1 and exc_start != -1:
        if inc_start < exc_start:
            inc_section = text[inc_start:exc_start]
            exc_section = text[exc_start:]
        else:
            exc_section = text[exc_start:inc_start]
            inc_section = text[inc_start:]
        inclusion = _extract_bullet_items(inc_section)
        exclusion = _extract_bullet_items(exc_section)
    elif inc_start != -1:
        inclusion = _extract_bullet_items(text[inc_start:])
    elif exc_start != -1:
        exclusion = _extract_bullet_items(text[exc_start:])
    else:
        inclusion = _extract_bullet_items(text)

    return inclusion, exclusion


def _extract_bullet_items(section: str) -> list[str]:
    """Extract individual criteria items from a section of text."""
    items: list[str] = []
    lines = section.strip().split("\n")

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if lower.startswith("inclusion criteria") or lower.startswith("exclusion criteria"):
            continue

        for prefix in ("-", "*", "\u2022"):
            if stripped.startswith(prefix):
                stripped = stripped[len(prefix):].strip()
                break
        else:
            numbered = re.match(r"^\d+[.)]\s*", stripped)
            if numbered:
                stripped = stripped[numbered.end():].strip()

        if stripped:
            items.append(stripped)

    return items


async def get_trial_locations(nct_id: str) -> list[dict]:
    """Retrieve the list of locations for a given trial."""
    study = await get_trial_details(nct_id)
    if not study:
        return []

    protocol = study.get("protocolSection", {})
    contacts_locations = protocol.get("contactsLocationsModule", {})
    locations_raw = contacts_locations.get("locations", [])

    locations: list[dict] = []
    for loc in locations_raw:
        geo = loc.get("geoPoint", {})
        contacts = loc.get("contacts", [])
        first_contact = contacts[0] if contacts else {}
        locations.append({
            "facility": loc.get("facility", ""),
            "city": loc.get("city", ""),
            "state": loc.get("state", ""),
            "country": loc.get("country", ""),
            "latitude": geo.get("lat"),
            "longitude": geo.get("lon"),
            "status": loc.get("status", ""),
            "contact_name": first_contact.get("name", ""),
            "contact_phone": first_contact.get("phone", ""),
            "contact_email": first_contact.get("email", ""),
        })

    return locations
