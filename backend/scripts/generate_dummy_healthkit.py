"""Generate a synthetic Apple Health export ZIP for testing.

Creates a realistic ``export.xml`` plus FHIR clinical-record JSON files
inside ``backend/static/dummy_healthkit_export.zip``.

Run with::

    python -m backend.scripts.generate_dummy_healthkit

Synthetic patient profile
-------------------------
* Steps: ~5,500 avg/day for 60-90 days (ECOG 1)
* Heart rate: resting ~78 bpm
* Weight: ~165 lbs (2-3 entries)
* Height: 5'9" (1 entry)
* Blood pressure: weekly, ~128/82
* Labs: Hgb 11.2, Creatinine 1.1, Platelets 145k, ANC 1800, AST 28, ALT 32, Bilirubin 0.8
* Medications: Metformin 500mg, Lisinopril 10mg, Pembrolizumab (ended)
"""

from __future__ import annotations

import json
import random
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, ElementTree
from io import BytesIO

# Output path
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
_OUTPUT_PATH = _STATIC_DIR / "dummy_healthkit_export.zip"

# Apple Health date format
_HK_DATE_FMT = "%Y-%m-%d %H:%M:%S %z"

# Timezone — US Eastern (UTC-5)
_TZ = timezone(timedelta(hours=-5))

_SOURCE = "Apple Watch"
_CLINICAL_SOURCE = "Sample Hospital EHR"

# Seed for reproducibility
random.seed(42)


def _fmt_date(dt: datetime) -> str:
    """Format a datetime in Apple Health export format."""
    return dt.strftime(_HK_DATE_FMT)


def _make_record(
    parent: Element,
    hk_type: str,
    value: str,
    unit: str,
    start: datetime,
    end: datetime | None = None,
    source: str = _SOURCE,
) -> Element:
    """Add a <Record> element to the parent."""
    if end is None:
        end = start + timedelta(minutes=1)
    creation = start + timedelta(seconds=30)
    return SubElement(
        parent,
        "Record",
        type=hk_type,
        sourceName=source,
        unit=unit,
        creationDate=_fmt_date(creation),
        startDate=_fmt_date(start),
        endDate=_fmt_date(end),
        value=value,
    )


def _make_clinical_record(
    parent: Element,
    rec_type: str,
    resource_path: str,
    identifier: str | None = None,
    source: str = _CLINICAL_SOURCE,
) -> Element:
    """Add a <ClinicalRecord> element to the parent."""
    if identifier is None:
        identifier = str(uuid.uuid4())
    return SubElement(
        parent,
        "ClinicalRecord",
        type=rec_type,
        identifier=identifier,
        sourceName=source,
        resourceFilePath=resource_path,
    )


def _generate_step_records(root: Element, now: datetime) -> None:
    """Generate 60-90 days of step-count records, 3-8 entries per day."""
    hk_type = "HKQuantityTypeIdentifierStepCount"
    num_days = random.randint(60, 90)
    for day_offset in range(num_days, 0, -1):
        day_start = now.replace(hour=6, minute=0, second=0, microsecond=0) - timedelta(days=day_offset)
        # Target ~5,500 steps/day total across segments
        num_segments = random.randint(3, 8)
        daily_target = random.gauss(5500, 800)
        daily_target = max(1000, daily_target)
        segment_steps = _split_into_segments(daily_target, num_segments)

        hour = 7
        for steps in segment_steps:
            start = day_start.replace(hour=hour, minute=random.randint(0, 59))
            duration_min = random.randint(5, 45)
            end = start + timedelta(minutes=duration_min)
            _make_record(root, hk_type, str(int(steps)), "count", start, end)
            hour = min(hour + random.randint(1, 3), 22)


def _generate_exercise_time_records(root: Element, now: datetime) -> None:
    """Generate exercise-time records for the last 60 days."""
    hk_type = "HKQuantityTypeIdentifierAppleExerciseTime"
    for day_offset in range(60, 0, -1):
        day_start = now.replace(hour=8, minute=0, second=0, microsecond=0) - timedelta(days=day_offset)
        # Some days have exercise, some don't
        if random.random() < 0.7:  # 70% of days
            minutes = random.randint(15, 60)
            start = day_start.replace(hour=random.randint(7, 18), minute=random.randint(0, 59))
            end = start + timedelta(minutes=minutes)
            _make_record(root, hk_type, str(minutes), "min", start, end)


def _generate_heart_rate_records(root: Element, now: datetime) -> None:
    """Generate heart-rate records — resting ~78 bpm."""
    hk_type = "HKQuantityTypeIdentifierHeartRate"
    # A few readings per day for the last 30 days
    for day_offset in range(30, 0, -1):
        day_start = now - timedelta(days=day_offset)
        for _ in range(random.randint(2, 5)):
            hr = random.gauss(78, 6)
            hr = max(55, min(110, hr))
            start = day_start.replace(
                hour=random.randint(6, 22),
                minute=random.randint(0, 59),
                second=0,
                microsecond=0,
            )
            _make_record(root, hk_type, f"{hr:.0f}", "count/min", start)


def _generate_weight_records(root: Element, now: datetime) -> None:
    """Generate 2-3 weight entries, ~165 lbs."""
    hk_type = "HKQuantityTypeIdentifierBodyMass"
    for day_offset in [45, 20, 3]:
        weight = random.gauss(165, 1.5)
        start = (now - timedelta(days=day_offset)).replace(
            hour=7, minute=30, second=0, microsecond=0,
        )
        _make_record(root, hk_type, f"{weight:.1f}", "lb", start, source="Withings Body+")


def _generate_height_record(root: Element, now: datetime) -> None:
    """Generate 1 height entry — 5'9" = 69 inches = 175.26 cm."""
    hk_type = "HKQuantityTypeIdentifierHeight"
    start = (now - timedelta(days=60)).replace(hour=10, minute=0, second=0, microsecond=0)
    _make_record(root, hk_type, "69", "in", start, source="Health")


def _generate_bmi_records(root: Element, now: datetime) -> None:
    """Generate BMI records — ~24.4 for 165 lbs / 5'9"."""
    hk_type = "HKQuantityTypeIdentifierBodyMassIndex"
    for day_offset in [45, 20, 3]:
        bmi = random.gauss(24.4, 0.3)
        start = (now - timedelta(days=day_offset)).replace(
            hour=7, minute=35, second=0, microsecond=0,
        )
        _make_record(root, hk_type, f"{bmi:.1f}", "count", start, source="Withings Body+")


def _generate_blood_pressure_records(root: Element, now: datetime) -> None:
    """Generate weekly blood-pressure readings — ~128/82."""
    systolic_type = "HKQuantityTypeIdentifierBloodPressureSystolic"
    diastolic_type = "HKQuantityTypeIdentifierBloodPressureDiastolic"
    for week in range(12, 0, -1):
        day_offset = week * 7
        start = (now - timedelta(days=day_offset)).replace(
            hour=8, minute=0, second=0, microsecond=0,
        )
        systolic = random.gauss(128, 5)
        diastolic = random.gauss(82, 4)
        _make_record(root, systolic_type, f"{systolic:.0f}", "mmHg", start, source="Omron BP Monitor")
        _make_record(root, diastolic_type, f"{diastolic:.0f}", "mmHg", start, source="Omron BP Monitor")


def _split_into_segments(total: float, n: int) -> list[float]:
    """Split a total into n random positive segments that sum to total."""
    cuts = sorted(random.random() for _ in range(n - 1))
    cuts = [0.0] + cuts + [1.0]
    return [total * (cuts[i + 1] - cuts[i]) for i in range(n)]


# ── FHIR Lab Results ─────────────────────────────────────────────────


def _fhir_observation(
    test_name: str,
    value: float,
    unit: str,
    loinc_code: str,
    effective_date: str,
    performer: str = "Sample Hospital Lab",
) -> dict:
    """Build a FHIR R4 Observation resource for a lab result."""
    return {
        "resourceType": "Observation",
        "id": str(uuid.uuid4()),
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "laboratory",
                        "display": "Laboratory",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": loinc_code,
                    "display": test_name,
                }
            ],
            "text": test_name,
        },
        "effectiveDateTime": effective_date,
        "valueQuantity": {
            "value": value,
            "unit": unit,
            "system": "http://unitsofmeasure.org",
            "code": unit,
        },
        "performer": [{"display": performer}],
    }


def _fhir_medication_request(
    med_name: str,
    dose_value: float,
    dose_unit: str,
    frequency: int,
    period: int,
    period_unit: str,
    start_date: str,
    end_date: str = "",
    status: str = "active",
    rxnorm_code: str = "",
) -> dict:
    """Build a FHIR R4 MedicationRequest resource."""
    resource: dict = {
        "resourceType": "MedicationRequest",
        "id": str(uuid.uuid4()),
        "status": status,
        "intent": "order",
        "medicationCodeableConcept": {
            "coding": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": rxnorm_code,
                    "display": med_name,
                }
            ],
            "text": med_name,
        },
        "authoredOn": start_date,
        "dosageInstruction": [
            {
                "text": f"{dose_value} {dose_unit} {frequency}x per {period} {period_unit}",
                "timing": {
                    "repeat": {
                        "frequency": frequency,
                        "period": period,
                        "periodUnit": period_unit,
                    }
                },
                "doseAndRate": [
                    {
                        "doseQuantity": {
                            "value": dose_value,
                            "unit": dose_unit,
                            "system": "http://unitsofmeasure.org",
                            "code": dose_unit,
                        }
                    }
                ],
            }
        ],
    }

    if end_date:
        resource["dispenseRequest"] = {
            "validityPeriod": {
                "start": start_date,
                "end": end_date,
            }
        }

    return resource


def _generate_lab_results(now: datetime) -> list[tuple[str, dict]]:
    """Return (filename, fhir_json) pairs for all lab results."""
    lab_date = (now - timedelta(days=14)).strftime("%Y-%m-%d")

    labs = [
        ("Hemoglobin", 11.2, "g/dL", "718-7"),
        ("Creatinine", 1.1, "mg/dL", "2160-0"),
        ("Platelets", 145000, "/uL", "777-3"),
        ("Absolute Neutrophil Count", 1800, "/uL", "751-8"),
        ("Aspartate Aminotransferase (AST)", 28, "U/L", "1920-8"),
        ("Alanine Aminotransferase (ALT)", 32, "U/L", "1742-6"),
        ("Total Bilirubin", 0.8, "mg/dL", "1975-2"),
    ]

    results = []
    for test_name, value, unit, loinc in labs:
        fhir = _fhir_observation(test_name, value, unit, loinc, lab_date)
        filename = f"clinical-records/lab_{loinc}_{uuid.uuid4().hex[:8]}.json"
        results.append((filename, fhir))

    return results


def _generate_medications(now: datetime) -> list[tuple[str, dict]]:
    """Return (filename, fhir_json) pairs for all medications."""
    meds = [
        {
            "name": "Metformin 500 MG Oral Tablet",
            "dose_value": 500,
            "dose_unit": "mg",
            "frequency": 2,
            "period": 1,
            "period_unit": "d",
            "start_date": "2024-06-01",
            "end_date": "",
            "status": "active",
            "rxnorm_code": "861007",
        },
        {
            "name": "Lisinopril 10 MG Oral Tablet",
            "dose_value": 10,
            "dose_unit": "mg",
            "frequency": 1,
            "period": 1,
            "period_unit": "d",
            "start_date": "2024-03-15",
            "end_date": "",
            "status": "active",
            "rxnorm_code": "314076",
        },
        {
            "name": "Pembrolizumab 100 MG/4ML Injectable Solution",
            "dose_value": 200,
            "dose_unit": "mg",
            "frequency": 1,
            "period": 3,
            "period_unit": "wk",
            "start_date": "2025-05-01",
            "end_date": "2025-11-15",
            "status": "stopped",
            "rxnorm_code": "1657749",
        },
    ]

    results = []
    for med_kwargs in meds:
        raw_name = med_kwargs.pop("name")
        med_kwargs["med_name"] = raw_name
        fhir = _fhir_medication_request(**med_kwargs)
        safe_name = raw_name.split()[0].lower()
        filename = f"clinical-records/med_{safe_name}_{uuid.uuid4().hex[:8]}.json"
        results.append((filename, fhir))

    return results


def generate() -> Path:
    """Generate the dummy HealthKit export ZIP and return its path."""
    _STATIC_DIR.mkdir(parents=True, exist_ok=True)

    now = datetime.now(_TZ)

    # Build the XML tree
    root = Element("HealthData", locale="en_US")

    # Export date metadata
    SubElement(root, "ExportDate", value=_fmt_date(now))
    SubElement(root, "Me", HKCharacteristicTypeIdentifierDateOfBirth="1978-05-12",
               HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale",
               HKCharacteristicTypeIdentifierBloodType="HKBloodTypeOPositive",
               HKCharacteristicTypeIdentifierFitzpatrickSkinType="HKFitzpatrickSkinTypeIII")

    # Generate quantity-type records
    _generate_step_records(root, now)
    _generate_exercise_time_records(root, now)
    _generate_heart_rate_records(root, now)
    _generate_weight_records(root, now)
    _generate_height_record(root, now)
    _generate_bmi_records(root, now)
    _generate_blood_pressure_records(root, now)

    # Generate FHIR clinical records
    lab_files = _generate_lab_results(now)
    med_files = _generate_medications(now)

    for filename, _fhir in lab_files:
        _make_clinical_record(
            root,
            "HKClinicalTypeIdentifierLabResultRecord",
            filename,
        )

    for filename, _fhir in med_files:
        _make_clinical_record(
            root,
            "HKClinicalTypeIdentifierMedicationRecord",
            filename,
        )

    # Write everything into a ZIP
    with zipfile.ZipFile(_OUTPUT_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        # Write export.xml
        xml_buffer = BytesIO()
        tree = ElementTree(root)
        tree.write(xml_buffer, encoding="unicode" if False else "utf-8", xml_declaration=True)
        zf.writestr("apple_health_export/export.xml", xml_buffer.getvalue())

        # Write FHIR JSON files
        for filename, fhir_json in lab_files + med_files:
            zf.writestr(
                f"apple_health_export/{filename}",
                json.dumps(fhir_json, indent=2),
            )

    size_kb = _OUTPUT_PATH.stat().st_size / 1024
    print(f"Generated: {_OUTPUT_PATH}")
    print(f"Size: {size_kb:.1f} KB")

    # Print summary
    num_records = len(root.findall("Record"))
    num_clinical = len(root.findall("ClinicalRecord"))
    print(f"Records: {num_records} quantity records, {num_clinical} clinical records")
    print(f"Lab files: {len(lab_files)}, Medication files: {len(med_files)}")

    return _OUTPUT_PATH


if __name__ == "__main__":
    generate()
