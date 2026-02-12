"""Open-Meteo geocoding API wrapper.

Provides async geocoding (location string to coordinates) and
a synchronous Haversine distance calculator.

API docs: https://open-meteo.com/en/docs/geocoding-api
No authentication required. Free and open-source.
"""

import logging
import math

import httpx

logger = logging.getLogger(__name__)

_GEOCODING_BASE = "https://geocoding-api.open-meteo.com/v1"

_EARTH_RADIUS_MILES = 3958.8


async def geocode_location(location_string: str) -> dict | None:
    """Convert a location string (city, address, etc.) to coordinates.

    Args:
        location_string: Free-text location query, e.g. "Boston, MA"
            or "Johns Hopkins Hospital".

    Returns:
        Dict with latitude, longitude, name, country, and admin1 (state/province),
        or None if the location could not be resolved.
    """
    try:
        # Open-Meteo works best with just city names. Try the full query first,
        # then fall back to just the city name (before the comma).
        queries = [location_string]
        city_part = location_string.split(",")[0].strip()
        if city_part != location_string.strip():
            queries.append(city_part)

        results = None
        async with httpx.AsyncClient(
            base_url=_GEOCODING_BASE,
            timeout=30.0,
            headers={"Accept": "application/json"},
        ) as client:
            for query in queries:
                response = await client.get(
                    "/search",
                    params={
                        "name": query,
                        "count": 5,
                        "language": "en",
                        "format": "json",
                    },
                )
                response.raise_for_status()
                data = response.json()
                results = data.get("results")
                if results:
                    break

        if not results:
            logger.info("No geocoding results for query: %r", location_string)
            return None

        result = results[0]
        return {
            "latitude": result.get("latitude"),
            "longitude": result.get("longitude"),
            "name": result.get("name"),
            "country": result.get("country"),
            "admin1": result.get("admin1"),
        }

    except httpx.HTTPStatusError as exc:
        logger.error(
            "Geocoding API HTTP error %s for query=%r: %s",
            exc.response.status_code,
            location_string,
            exc,
        )
        return None
    except httpx.HTTPError as exc:
        logger.error(
            "Geocoding API request failed for query=%r: %s",
            location_string,
            exc,
        )
        return None
    except Exception as exc:
        logger.error(
            "Unexpected error geocoding query=%r: %s",
            location_string,
            exc,
        )
        return None


async def reverse_geocode(latitude: float, longitude: float) -> dict | None:
    """Convert coordinates to a place name using Nominatim (OpenStreetMap) reverse geocoding.

    Returns:
        Dict with city, state, country, display, or None on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "format": "json",
                    "zoom": 10,
                },
                headers={
                    "User-Agent": "ClinicalTrialNavigator/1.0 (hackathon project)",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

            address = data.get("address", {})
            city = (
                address.get("city")
                or address.get("town")
                or address.get("village")
                or address.get("county", "")
            )
            state = address.get("state", "")
            country = address.get("country", "")

            parts = [p for p in [city, state] if p]
            display = ", ".join(parts) if parts else country

            return {
                "city": city,
                "state": state,
                "country": country,
                "display": display,
            }

    except Exception as exc:
        logger.error("Reverse geocoding failed for (%s, %s): %s", latitude, longitude, exc)
        return None


def calculate_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate the great-circle distance between two points using the Haversine formula.

    Args:
        lat1: Latitude of point 1 in decimal degrees.
        lon1: Longitude of point 1 in decimal degrees.
        lat2: Latitude of point 2 in decimal degrees.
        lon2: Longitude of point 2 in decimal degrees.

    Returns:
        Distance in miles.
    """
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return _EARTH_RADIUS_MILES * c
