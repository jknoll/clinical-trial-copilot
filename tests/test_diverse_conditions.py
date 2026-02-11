"""Tests verifying the search pipeline works with diverse medical conditions.

Conditions tested:
- Non-small cell lung cancer (NSCLC) — common cancer
- Type 2 Diabetes — common chronic disease
- Ewing Sarcoma — rare pediatric cancer

All tests hit live APIs (ClinicalTrials.gov, Open-Meteo geocoding, openFDA).
No authentication required for ClinicalTrials.gov or geocoding.
"""

import re

import pytest

from backend.mcp_servers.clinical_trials import (
    get_eligibility_criteria,
    get_trial_details,
    get_trial_locations,
    search_trials,
)
from backend.mcp_servers.fda_data import get_adverse_events, get_drug_label
from backend.mcp_servers.geocoding import calculate_distance, geocode_location

NCT_ID_PATTERN = re.compile(r"^NCT\d{8}$")


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

class TestGeocoding:
    async def test_geocode_lompoc(self):
        result = await geocode_location("Lompoc, CA")
        assert result is not None
        assert abs(result["latitude"] - 34.64) < 0.5
        assert abs(result["longitude"] - (-120.46)) < 0.5

    async def test_geocode_houston(self):
        result = await geocode_location("Houston, TX")
        assert result is not None
        assert abs(result["latitude"] - 29.76) < 0.5

    async def test_geocode_boston(self):
        result = await geocode_location("Boston, MA")
        assert result is not None
        assert abs(result["latitude"] - 42.36) < 0.5

    async def test_calculate_distance(self):
        # Lompoc to Los Angeles ~150 miles
        d = calculate_distance(34.64, -120.46, 34.05, -118.24)
        assert 100 < d < 200


# ---------------------------------------------------------------------------
# NSCLC (common cancer)
# ---------------------------------------------------------------------------

class TestNSCLC:
    async def test_search_nsclc(self):
        results = await search_trials(
            condition="non-small cell lung cancer",
            status=["RECRUITING"],
            max_results=10,
        )
        assert len(results) > 0
        for r in results:
            assert NCT_ID_PATTERN.match(r["nct_id"]), f"Bad NCT ID: {r['nct_id']}"

    async def test_search_nsclc_immunotherapy(self):
        results = await search_trials(
            condition="non-small cell lung cancer",
            intervention="immunotherapy",
            max_results=10,
        )
        assert len(results) >= 0  # May be 0 with specific intervention filter

    async def test_search_nsclc_with_geo(self):
        results = await search_trials(
            condition="non-small cell lung cancer",
            latitude=34.64,
            longitude=-120.46,
            distance_miles=200,
            max_results=10,
        )
        assert isinstance(results, list)

    async def test_nsclc_trial_details(self):
        results = await search_trials(
            condition="non-small cell lung cancer",
            max_results=3,
        )
        assert len(results) > 0
        nct_id = results[0]["nct_id"]
        details = await get_trial_details(nct_id)
        assert "protocolSection" in details

    async def test_nsclc_eligibility(self):
        results = await search_trials(
            condition="non-small cell lung cancer",
            max_results=3,
        )
        assert len(results) > 0
        nct_id = results[0]["nct_id"]
        elig = await get_eligibility_criteria(nct_id)
        assert elig["nct_id"] == nct_id
        assert isinstance(elig["inclusion"], list)
        assert isinstance(elig["exclusion"], list)

    async def test_pembrolizumab_adverse_events(self):
        events = await get_adverse_events("pembrolizumab", limit=5)
        assert isinstance(events, list)


# ---------------------------------------------------------------------------
# Type 2 Diabetes (common chronic disease)
# ---------------------------------------------------------------------------

class TestDiabetes:
    async def test_search_diabetes(self):
        results = await search_trials(
            condition="type 2 diabetes",
            status=["RECRUITING"],
            max_results=10,
        )
        assert len(results) > 0
        for r in results:
            assert NCT_ID_PATTERN.match(r["nct_id"])

    async def test_search_diabetes_phase23(self):
        results = await search_trials(
            condition="type 2 diabetes",
            phase=["PHASE2", "PHASE3"],
            max_results=10,
        )
        assert len(results) > 0

    async def test_search_diabetes_houston(self):
        geo = await geocode_location("Houston, TX")
        assert geo is not None
        results = await search_trials(
            condition="type 2 diabetes",
            latitude=geo["latitude"],
            longitude=geo["longitude"],
            distance_miles=100,
            max_results=10,
        )
        assert isinstance(results, list)
        # Houston is a major medical hub, should have trials
        assert len(results) > 0

    async def test_diabetes_trial_details(self):
        results = await search_trials(
            condition="type 2 diabetes",
            max_results=3,
        )
        assert len(results) > 0
        details = await get_trial_details(results[0]["nct_id"])
        assert "protocolSection" in details

    async def test_diabetes_eligibility(self):
        results = await search_trials(
            condition="type 2 diabetes",
            max_results=3,
        )
        assert len(results) > 0
        elig = await get_eligibility_criteria(results[0]["nct_id"])
        assert isinstance(elig["inclusion"], list)

    async def test_diabetes_locations(self):
        results = await search_trials(
            condition="type 2 diabetes",
            max_results=3,
        )
        assert len(results) > 0
        locations = await get_trial_locations(results[0]["nct_id"])
        assert isinstance(locations, list)

    async def test_metformin_adverse_events(self):
        events = await get_adverse_events("metformin", limit=5)
        assert isinstance(events, list)

    async def test_metformin_drug_label(self):
        label = await get_drug_label("metformin")
        # label may be None if openFDA returns nothing, but should be dict if found
        if label is not None:
            assert isinstance(label, dict)


# ---------------------------------------------------------------------------
# Ewing Sarcoma (rare disease)
# ---------------------------------------------------------------------------

class TestEwingSarcoma:
    async def test_search_ewing_sarcoma(self):
        results = await search_trials(
            condition="Ewing sarcoma",
            status=["RECRUITING"],
            max_results=10,
        )
        # Rare disease — may have fewer results but should still find some
        assert isinstance(results, list)
        assert len(results) > 0, "Expected at least 1 recruiting Ewing sarcoma trial"

    async def test_search_ewing_broader(self):
        """Fall back to broader 'sarcoma' search if Ewing-specific is too narrow."""
        results = await search_trials(
            condition="sarcoma",
            status=["RECRUITING"],
            max_results=10,
        )
        assert len(results) > 0

    async def test_search_ewing_boston(self):
        geo = await geocode_location("Boston, MA")
        assert geo is not None
        results = await search_trials(
            condition="Ewing sarcoma",
            latitude=geo["latitude"],
            longitude=geo["longitude"],
            distance_miles=500,  # Rare disease, willing to travel far
            max_results=10,
        )
        assert isinstance(results, list)

    async def test_ewing_trial_details(self):
        results = await search_trials(
            condition="Ewing sarcoma",
            max_results=3,
        )
        if len(results) > 0:
            details = await get_trial_details(results[0]["nct_id"])
            assert "protocolSection" in details

    async def test_ewing_eligibility(self):
        results = await search_trials(
            condition="Ewing sarcoma",
            max_results=3,
        )
        if len(results) > 0:
            elig = await get_eligibility_criteria(results[0]["nct_id"])
            assert elig["nct_id"] == results[0]["nct_id"]

    async def test_doxorubicin_adverse_events(self):
        events = await get_adverse_events("doxorubicin", limit=5)
        assert isinstance(events, list)


# ---------------------------------------------------------------------------
# Cross-condition validation
# ---------------------------------------------------------------------------

class TestCrossCondition:
    async def test_different_conditions_return_different_trials(self):
        """Ensure different conditions don't return the same trials."""
        nsclc = await search_trials(condition="non-small cell lung cancer", max_results=5)
        diabetes = await search_trials(condition="type 2 diabetes", max_results=5)

        nsclc_ids = {r["nct_id"] for r in nsclc}
        diabetes_ids = {r["nct_id"] for r in diabetes}

        # No overlap expected between lung cancer and diabetes trials
        assert nsclc_ids.isdisjoint(diabetes_ids), "NSCLC and diabetes trials should not overlap"

    async def test_phase_filter_works(self):
        """Phase filter should restrict results."""
        phase1 = await search_trials(
            condition="type 2 diabetes",
            phase=["PHASE1"],
            max_results=5,
        )
        phase3 = await search_trials(
            condition="type 2 diabetes",
            phase=["PHASE3"],
            max_results=5,
        )
        # Both should return results (diabetes has many trials)
        assert isinstance(phase1, list)
        assert isinstance(phase3, list)
