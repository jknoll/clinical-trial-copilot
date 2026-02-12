"""Apple Health XML export parser.

Parses Apple Health ``export.xml`` files (optionally inside a ZIP) and
returns a populated :class:`HealthKitImport` model.  Uses
``xml.etree.ElementTree.iterparse`` for memory efficiency — export files
can easily exceed 1 GB.

Only records from the last 90 days are considered.  Step-count and
exercise-time records are aggregated into per-day totals and then
averaged over the most-recent 30 days.

Clinical records (lab results, medications) are expected as FHIR JSON
files referenced by ``<ClinicalRecord>`` elements, which this module
resolves relative to the ZIP archive when one is provided.
"""

from __future__ import annotations

import json
import logging
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import IO, BinaryIO
from xml.etree.ElementTree import iterparse

from backend.models.patient import (
    HealthKitImport,
    LabResult,
    Medication,
    Vital,
)

logger = logging.getLogger(__name__)

# ── Apple Health date format ──────────────────────────────────────────
_HK_DATE_FMT = "%Y-%m-%d %H:%M:%S %z"

# ── HKQuantityType identifiers we care about ─────────────────────────
_STEP_COUNT = "HKQuantityTypeIdentifierStepCount"
_EXERCISE_TIME = "HKQuantityTypeIdentifierAppleExerciseTime"
_BODY_MASS = "HKQuantityTypeIdentifierBodyMass"
_HEIGHT = "HKQuantityTypeIdentifierHeight"
_BMI = "HKQuantityTypeIdentifierBodyMassIndex"
_HEART_RATE = "HKQuantityTypeIdentifierHeartRate"
_BP_SYSTOLIC = "HKQuantityTypeIdentifierBloodPressureSystolic"
_BP_DIASTOLIC = "HKQuantityTypeIdentifierBloodPressureDiastolic"

_VITALS_TYPES = {_BODY_MASS, _HEIGHT, _BMI, _HEART_RATE, _BP_SYSTOLIC, _BP_DIASTOLIC}
_ACTIVITY_TYPES = {_STEP_COUNT, _EXERCISE_TIME}
_ALL_QUANTITY_TYPES = _VITALS_TYPES | _ACTIVITY_TYPES

# ── Clinical record type identifiers ─────────────────────────────────
_LAB_RESULT_TYPE = "HKClinicalTypeIdentifierLabResultRecord"
_MEDICATION_TYPE = "HKClinicalTypeIdentifierMedicationRecord"
_CLINICAL_TYPES = {_LAB_RESULT_TYPE, _MEDICATION_TYPE}

# ── Friendly names for vital-sign types ──────────────────────────────
_VITAL_NAMES: dict[str, str] = {
    _BODY_MASS: "Weight",
    _HEIGHT: "Height",
    _BMI: "BMI",
    _HEART_RATE: "Heart Rate",
    _BP_SYSTOLIC: "Blood Pressure Systolic",
    _BP_DIASTOLIC: "Blood Pressure Diastolic",
}


# =====================================================================
#  Public API
# =====================================================================


def estimate_ecog_from_steps(avg_steps_per_day: float) -> int:
    """Estimate ECOG performance status from average daily step count.

    The mapping is intentionally conservative:

    * >= 7 500 steps/day  -> ECOG 0 (fully active)
    * >= 4 000            -> ECOG 1 (restricted but ambulatory)
    * >= 1 000            -> ECOG 2 (ambulatory > 50% of waking hours)
    * >=   250            -> ECOG 3 (limited self-care)
    * <    250            -> ECOG 4 (completely disabled)
    """
    if avg_steps_per_day >= 7500:
        return 0
    elif avg_steps_per_day >= 4000:
        return 1
    elif avg_steps_per_day >= 1000:
        return 2
    elif avg_steps_per_day >= 250:
        return 3
    else:
        return 4


def parse_apple_health_xml(
    xml_path_or_stream: str | Path | BinaryIO,
    zip_file: zipfile.ZipFile | None = None,
) -> HealthKitImport:
    """Parse an Apple Health ``export.xml`` and return a :class:`HealthKitImport`.

    Parameters
    ----------
    xml_path_or_stream:
        Either a filesystem path to ``export.xml`` or an open binary
        stream (e.g. from :meth:`zipfile.ZipFile.open`).
    zip_file:
        If the export came as a ``.zip``, pass the open
        :class:`zipfile.ZipFile` here so that referenced FHIR JSON
        clinical-record files can be resolved.

    Returns
    -------
    HealthKitImport
        Populated model with vitals, lab results, medications, and
        activity averages extracted from the export.
    """
    now = datetime.now().astimezone()
    cutoff_90d = now - timedelta(days=90)
    cutoff_30d = now - timedelta(days=30)

    # Accumulators
    step_records: list[tuple[str, float]] = []        # (date_str, value)
    exercise_records: list[tuple[str, float]] = []     # (date_str, value)
    vitals_latest: dict[str, tuple[datetime, Vital]] = {}  # type -> (dt, Vital)
    lab_results: list[LabResult] = []
    medications: list[Medication] = []

    source_name = ""

    # Determine how to open the stream
    if isinstance(xml_path_or_stream, (str, Path)):
        source_name = str(xml_path_or_stream)
        stream: IO[bytes] = open(xml_path_or_stream, "rb")
        should_close = True
    else:
        source_name = getattr(xml_path_or_stream, "name", "stream")
        stream = xml_path_or_stream
        should_close = False

    try:
        for event, elem in iterparse(stream, events=("end",)):
            tag = elem.tag

            # ── <Record> elements ────────────────────────────────
            if tag == "Record":
                rec_type = elem.get("type", "")
                if rec_type not in _ALL_QUANTITY_TYPES:
                    elem.clear()
                    continue

                start_date_str = elem.get("startDate", "")
                try:
                    rec_dt = datetime.strptime(start_date_str, _HK_DATE_FMT)
                except (ValueError, TypeError):
                    elem.clear()
                    continue

                if rec_dt < cutoff_90d:
                    elem.clear()
                    continue

                try:
                    value = float(elem.get("value", ""))
                except (ValueError, TypeError):
                    elem.clear()
                    continue

                unit = elem.get("unit", "")
                date_iso = rec_dt.strftime("%Y-%m-%d")

                if rec_type == _STEP_COUNT:
                    step_records.append((date_iso, value))
                elif rec_type == _EXERCISE_TIME:
                    exercise_records.append((date_iso, value))
                elif rec_type in _VITALS_TYPES:
                    vital = Vital(
                        type=_VITAL_NAMES.get(rec_type, rec_type),
                        value=value,
                        unit=unit,
                        date=date_iso,
                    )
                    prev = vitals_latest.get(rec_type)
                    if prev is None or rec_dt > prev[0]:
                        vitals_latest[rec_type] = (rec_dt, vital)

                elem.clear()

            # ── <ClinicalRecord> elements ────────────────────────
            elif tag == "ClinicalRecord":
                rec_type = elem.get("type", "")
                if rec_type not in _CLINICAL_TYPES:
                    elem.clear()
                    continue

                resource_path = elem.get("resourceFilePath", "")
                if not resource_path or zip_file is None:
                    elem.clear()
                    continue

                fhir_json = _load_fhir_json(zip_file, resource_path)
                if fhir_json is None:
                    elem.clear()
                    continue

                if rec_type == _LAB_RESULT_TYPE:
                    lab = _parse_fhir_lab_result(fhir_json)
                    if lab is not None:
                        lab_results.append(lab)
                elif rec_type == _MEDICATION_TYPE:
                    med = _parse_fhir_medication(fhir_json)
                    if med is not None:
                        medications.append(med)

                elem.clear()

            else:
                # For other elements just keep going; clear large sub-trees
                # only if they are not ancestors of something we need.
                pass
    finally:
        if should_close:
            stream.close()

    # ── Aggregate activity ────────────────────────────────────────────
    steps_avg = _aggregate_daily_average(step_records, cutoff_30d, now)
    exercise_avg = _aggregate_daily_average(exercise_records, cutoff_30d, now)

    return HealthKitImport(
        lab_results=lab_results,
        vitals=[v for _, v in vitals_latest.values()],
        medications=medications,
        activity_steps_per_day=steps_avg,
        activity_active_minutes_per_day=exercise_avg,
        import_date=now.strftime("%Y-%m-%d"),
        source_file=source_name,
    )


def parse_apple_health_zip(zip_path_or_stream: str | Path | BinaryIO) -> HealthKitImport:
    """Convenience wrapper that opens a ``.zip`` Apple Health export.

    Looks for ``apple_health_export/export.xml`` inside the archive.
    """
    if isinstance(zip_path_or_stream, (str, Path)):
        zf = zipfile.ZipFile(zip_path_or_stream, "r")
    else:
        zf = zipfile.ZipFile(zip_path_or_stream, "r")

    with zf:
        # Find the export.xml inside the ZIP
        xml_name = None
        for name in zf.namelist():
            if name.endswith("export.xml"):
                xml_name = name
                break
        if xml_name is None:
            raise FileNotFoundError("No export.xml found inside the ZIP archive")

        with zf.open(xml_name) as xml_stream:
            result = parse_apple_health_xml(xml_stream, zip_file=zf)
            result.source_file = str(zip_path_or_stream) if isinstance(zip_path_or_stream, (str, Path)) else "upload.zip"
            return result


# =====================================================================
#  Internal helpers
# =====================================================================


def _load_fhir_json(zf: zipfile.ZipFile, resource_path: str) -> dict | None:
    """Load a FHIR JSON resource from inside a ZIP archive."""
    # Apple Health exports store clinical records under
    # apple_health_export/clinical-records/...
    # The resourceFilePath may or may not include the prefix.
    candidates = [resource_path]
    if not resource_path.startswith("apple_health_export/"):
        candidates.append(f"apple_health_export/{resource_path}")

    for path in candidates:
        try:
            with zf.open(path) as f:
                return json.load(f)
        except (KeyError, json.JSONDecodeError):
            continue

    logger.warning("Could not load FHIR resource: %s", resource_path)
    return None


def _parse_fhir_lab_result(fhir_json: dict) -> LabResult | None:
    """Extract a :class:`LabResult` from a FHIR Observation resource.

    Handles both top-level Observation resources and Bundle entries.
    """
    resource = _unwrap_fhir_resource(fhir_json, "Observation")
    if resource is None:
        return None

    # Test name from code.coding[0].display or code.text
    code = resource.get("code", {})
    test_name = (
        code.get("text")
        or _first_coding_display(code)
        or "Unknown"
    )

    # Value — prefer valueQuantity
    vq = resource.get("valueQuantity", {})
    try:
        value = float(vq.get("value", ""))
    except (ValueError, TypeError):
        return None

    unit = vq.get("unit", vq.get("code", ""))

    # Date — effectiveDateTime or issued
    date_str = resource.get("effectiveDateTime", resource.get("issued", ""))
    if date_str:
        date_str = date_str[:10]  # just YYYY-MM-DD

    source = ""
    if "performer" in resource:
        performers = resource["performer"]
        if performers and isinstance(performers, list):
            source = performers[0].get("display", "")

    return LabResult(
        test_name=test_name,
        value=value,
        unit=unit,
        date=date_str,
        source=source,
    )


def _parse_fhir_medication(fhir_json: dict) -> Medication | None:
    """Extract a :class:`Medication` from a FHIR MedicationRequest resource.

    Also accepts MedicationStatement resources.
    """
    resource = _unwrap_fhir_resource(fhir_json, "MedicationRequest")
    if resource is None:
        resource = _unwrap_fhir_resource(fhir_json, "MedicationStatement")
    if resource is None:
        return None

    # Medication name
    med_codeable = resource.get("medicationCodeableConcept", {})
    name = (
        med_codeable.get("text")
        or _first_coding_display(med_codeable)
        or "Unknown"
    )

    # Dosage
    dose_str = ""
    frequency_str = ""
    dosage_list = resource.get("dosageInstruction", resource.get("dosage", []))
    if dosage_list and isinstance(dosage_list, list):
        dosage = dosage_list[0]
        dose_str = dosage.get("text", "")
        # Try doseAndRate
        dar = dosage.get("doseAndRate", [])
        if dar and isinstance(dar, list):
            dq = dar[0].get("doseQuantity", {})
            if dq:
                dv = dq.get("value", "")
                du = dq.get("unit", dq.get("code", ""))
                if dv:
                    dose_str = f"{dv} {du}".strip()
        # Timing
        timing = dosage.get("timing", {})
        repeat = timing.get("repeat", {})
        if repeat:
            freq = repeat.get("frequency", "")
            period = repeat.get("period", "")
            period_unit = repeat.get("periodUnit", "")
            if freq and period:
                frequency_str = f"{freq}x per {period} {period_unit}".strip()

    # Status → is_active
    status = resource.get("status", "")
    is_active = status in ("active", "completed", "")

    # Dates
    start_date = ""
    end_date = ""
    validity_period = resource.get("dispenseRequest", {}).get("validityPeriod", {})
    if not validity_period:
        validity_period = resource.get("effectivePeriod", {})
    start_date = validity_period.get("start", "")[:10] if validity_period.get("start") else ""
    end_date = validity_period.get("end", "")[:10] if validity_period.get("end") else ""

    # authoredOn fallback for start_date
    if not start_date:
        authored = resource.get("authoredOn", "")
        start_date = authored[:10] if authored else ""

    # If there's an end date and status is stopped/completed, mark inactive
    if end_date or status in ("stopped", "cancelled", "entered-in-error"):
        is_active = False

    return Medication(
        name=name,
        dose=dose_str,
        frequency=frequency_str,
        start_date=start_date,
        end_date=end_date,
        is_active=is_active,
    )


def _unwrap_fhir_resource(fhir_json: dict, resource_type: str) -> dict | None:
    """Return the resource dict, unwrapping a FHIR Bundle if needed."""
    if fhir_json.get("resourceType") == resource_type:
        return fhir_json
    if fhir_json.get("resourceType") == "Bundle":
        for entry in fhir_json.get("entry", []):
            res = entry.get("resource", {})
            if res.get("resourceType") == resource_type:
                return res
    return None


def _first_coding_display(codeable_concept: dict) -> str:
    """Return the first ``display`` from a FHIR CodeableConcept's ``coding`` array."""
    codings = codeable_concept.get("coding", [])
    if codings and isinstance(codings, list):
        return codings[0].get("display", "")
    return ""


def _aggregate_daily_average(
    records: list[tuple[str, float]],
    cutoff: datetime,
    now: datetime,
) -> float | None:
    """Aggregate records into daily totals, then return the 30-day average.

    Parameters
    ----------
    records:
        List of ``(YYYY-MM-DD, value)`` tuples.
    cutoff:
        Only include records on or after this date.
    now:
        Current datetime (for computing how many days to average over).

    Returns ``None`` if there are no qualifying records.
    """
    if not records:
        return None

    cutoff_date = cutoff.strftime("%Y-%m-%d")
    daily: dict[str, float] = defaultdict(float)
    for date_str, val in records:
        if date_str >= cutoff_date:
            daily[date_str] += val

    if not daily:
        return None

    return sum(daily.values()) / len(daily)
