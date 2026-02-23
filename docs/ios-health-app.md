# Apple Health Integration — Implementation Plan

## Overview

Two-milestone plan for importing Apple Health data into the Clinical Trial Copilot to improve eligibility matching. The milestones are ordered by dependency and platform requirements:

- **Milestone 1** runs on any platform (Linux, macOS, Windows) — it is the backend XML import pipeline, synthetic data generator, and frontend upload flow.
- **Milestone 2** requires macOS with Xcode — it is a minimal SwiftUI HealthKit app running in the iOS Simulator that POSTs extracted health data to the backend.

---

## Milestone 1: Apple Health XML Import (Linux / Any Platform)

### Goal

Accept an Apple Health `export.xml` file (or use a server-hosted dummy file), parse it, and merge the extracted data into the `PatientProfile` to improve eligibility scoring.

### 1.1 Extend the Patient Profile Model

**File:** `backend/models/patient.py`

Add new fields to `PatientProfile`:

```python
class LabResult(BaseModel):
    """A single lab test result from Apple Health / Health Records."""
    test_name: str              # e.g. "Creatinine", "Hemoglobin"
    value: float
    unit: str                   # e.g. "mg/dL", "g/dL"
    date: str                   # ISO 8601
    source: str = ""            # e.g. "Apple Health", "Manual"

class Vital(BaseModel):
    """A vital sign measurement."""
    type: str                   # e.g. "heart_rate", "blood_pressure_systolic", "bmi", "weight", "height"
    value: float
    unit: str
    date: str

class Medication(BaseModel):
    """A medication record from Apple Health."""
    name: str
    dose: str = ""
    frequency: str = ""
    start_date: str = ""
    end_date: str = ""
    is_active: bool = True

class HealthKitImport(BaseModel):
    """Container for all Apple Health imported data."""
    lab_results: list[LabResult] = Field(default_factory=list)
    vitals: list[Vital] = Field(default_factory=list)
    medications: list[Medication] = Field(default_factory=list)
    activity_steps_per_day: float | None = None       # 30-day average
    activity_active_minutes_per_day: float | None = None
    import_date: str = ""
    source_file: str = ""       # "upload" or "dummy"
```

Add to `PatientProfile`:

```python
class PatientProfile(BaseModel):
    condition: Condition = Field(default_factory=Condition)
    treatment_history: list[Treatment] = Field(default_factory=list)
    demographics: Demographics = Field(default_factory=Demographics)
    location: Location = Field(default_factory=Location)
    preferences: Preferences = Field(default_factory=Preferences)
    health_kit: HealthKitImport = Field(default_factory=HealthKitImport)  # NEW
```

### 1.2 Apple Health XML Parser

**New file:** `backend/mcp_servers/apple_health.py`

Apple Health exports a ZIP containing `apple_health_export/export.xml`. The XML structure:

```xml
<HealthData locale="en_US">
  <Record type="HKQuantityTypeIdentifierStepCount"
          value="8432"
          unit="count"
          startDate="2026-02-10 08:00:00 -0800"
          endDate="2026-02-10 08:15:00 -0800"
          sourceName="iPhone"/>
  <Record type="HKQuantityTypeIdentifierBodyMass"
          value="175"
          unit="lb"
          startDate="2026-02-01 07:00:00 -0800"
          .../>
  <!-- Clinical records from Health Records (FHIR-backed) -->
  <ClinicalRecord type="HKClinicalTypeIdentifierLabResultRecord"
                  resourceFilePath="clinical-records/1234.json"/>
  ...
</HealthData>
```

The parser must handle:

#### HealthKit Record Types to Extract

| HK Type Identifier | Maps To | Profile Field |
|---|---|---|
| `HKQuantityTypeIdentifierStepCount` | Daily step average (aggregate last 30 days) | `health_kit.activity_steps_per_day` |
| `HKQuantityTypeIdentifierAppleExerciseTime` | Active minutes/day (aggregate last 30 days) | `health_kit.activity_active_minutes_per_day` |
| `HKQuantityTypeIdentifierBodyMass` | Weight (most recent) | `health_kit.vitals` |
| `HKQuantityTypeIdentifierHeight` | Height (most recent) | `health_kit.vitals` |
| `HKQuantityTypeIdentifierBodyMassIndex` | BMI (most recent, or calculated) | `health_kit.vitals` |
| `HKQuantityTypeIdentifierHeartRate` | Resting HR (most recent) | `health_kit.vitals` |
| `HKQuantityTypeIdentifierBloodPressureSystolic` | Systolic BP | `health_kit.vitals` |
| `HKQuantityTypeIdentifierBloodPressureDiastolic` | Diastolic BP | `health_kit.vitals` |
| `HKClinicalTypeIdentifierLabResultRecord` | Lab results (FHIR Observation) | `health_kit.lab_results` |
| `HKClinicalTypeIdentifierMedicationRecord` | Medications (FHIR MedicationRequest) | `health_kit.medications` |
| `HKClinicalTypeIdentifierConditionRecord` | Diagnoses (FHIR Condition) | Cross-reference with `condition` |

#### Parser Implementation Notes

- Use `xml.etree.ElementTree` with iterparse for memory efficiency (export.xml can be 1GB+).
- Only parse the last 90 days of records (configurable).
- Aggregate step counts into daily totals, then compute 30-day rolling average.
- For clinical records, read the referenced FHIR JSON files from the ZIP.
- Handle both ZIP upload (real export) and raw XML (for testing).
- Return a populated `HealthKitImport` model.

#### ECOG Estimation from Step Data

```python
def estimate_ecog_from_steps(avg_steps_per_day: float) -> int:
    """
    Map average daily steps to estimated ECOG performance status.
    Based on published correlations (Gresham et al., Cancer 2018).
    """
    if avg_steps_per_day >= 7500:
        return 0   # Fully active
    elif avg_steps_per_day >= 4000:
        return 1   # Restricted in strenuous activity
    elif avg_steps_per_day >= 1000:
        return 2   # Ambulatory, capable of self-care
    elif avg_steps_per_day >= 250:
        return 3   # Limited self-care
    else:
        return 4   # Completely disabled
```

This replaces the subjective "activity level" intake question with objective data.

### 1.3 Generate Synthetic Apple Health Export

**New file:** `backend/scripts/generate_dummy_healthkit.py`

Generate a realistic `export.xml` for demo purposes. The script should create a synthetic patient profile with:

- **Step counts**: 60-90 days of records, 3-8 entries per day (various sources: iPhone, Apple Watch), averaging ~5,500 steps/day (ECOG 1 patient — restricted activity, interesting for trial matching)
- **Heart rate**: Resting HR samples, average ~78 bpm
- **Weight**: 2-3 entries over 90 days, ~165 lbs
- **Height**: 1 entry, 5'9"
- **Blood pressure**: Weekly entries, ~128/82 (mildly elevated — relevant for some trial exclusions)
- **Lab results** (as FHIR Observation JSON files bundled in the ZIP):
  - Hemoglobin: 11.2 g/dL (slightly low — relevant for hematologic trials)
  - Creatinine: 1.1 mg/dL (normal — meets most renal function requirements)
  - Platelets: 145,000/uL (borderline low)
  - ANC: 1,800/uL (normal)
  - AST: 28 U/L (normal)
  - ALT: 32 U/L (normal)
  - Bilirubin: 0.8 mg/dL (normal)
- **Medications** (as FHIR MedicationRequest JSON):
  - Metformin 500mg (active — diabetes management)
  - Lisinopril 10mg (active — blood pressure)
  - Pembrolizumab (ended 2025-11-15 — prior immunotherapy, relevant for washout periods)

The dummy file should be placed at `backend/static/dummy_healthkit_export.zip` and served by the backend.

Usage:
```bash
python -m backend.scripts.generate_dummy_healthkit
```

### 1.4 Backend API Endpoint for Upload

**File:** `backend/main.py` (add new route)

```
POST /api/sessions/{session_id}/health-import
```

- Accepts `multipart/form-data` with a file field (`file`) OR a query parameter `?use_dummy=true`.
- If `use_dummy=true`, reads from `backend/static/dummy_healthkit_export.zip`.
- Parses the XML/ZIP using the parser from 1.2.
- Merges the `HealthKitImport` into the session's `PatientProfile`.
- Auto-populates `demographics.age` (from date of birth record if present), `demographics.sex`, and `demographics.estimated_ecog` (from step data).
- Returns the updated profile summary showing what was imported.

### 1.5 Frontend Upload Flow

**New component:** `frontend/components/HealthImport.tsx`

Shown during the INTAKE phase (or as an option before intake begins). UI:

```
┌──────────────────────────────────────────────┐
│  Import Apple Health Data (Optional)         │
│                                              │
│  Importing your health data can improve      │
│  trial matching by providing lab results,    │
│  activity levels, and medication history.     │
│                                              │
│  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Browse & Upload  │  │  Use Sample Data │  │
│  │  (.zip file)      │  │  (for demo)      │  │
│  └──────────────────┘  └──────────────────┘  │
│                                              │
│  How to export: Settings > Health > Export    │
│  All Health Data                             │
└──────────────────────────────────────────────┘
```

- **Browse & Upload**: Standard file input, accepts `.zip`. Calls `POST /api/sessions/{sid}/health-import` with the file.
- **Use Sample Data**: Calls `POST /api/sessions/{sid}/health-import?use_dummy=true`. No file needed.
- After import, show a summary card:
  ```
  Imported: 62 days of activity data, 7 lab results,
  3 medications, vitals (weight, height, BP, HR)
  Estimated activity level: ECOG 1 (moderately active)
  ```
- The import should be optional — user can skip and proceed to conversational intake as before.

### 1.6 Update Eligibility Scoring to Use Imported Data

**File:** `backend/agents/skills/eligibility_analysis.md`

Add rules for when `health_kit` data is available:

- **ECOG**: If `activity_steps_per_day` is present, use step-based ECOG estimate instead of self-reported. Score as ✅/❌ with explanation noting "Based on your Apple Health activity data (avg X steps/day)".
- **Lab-based criteria** (creatinine clearance, ANC, hemoglobin, platelets, liver function): If matching lab result exists in `health_kit.lab_results`, score as ✅ or ❌ with the actual value. Note the date of the lab ("as of [date]") and flag as ❓ NEEDS_DISCUSSION if the lab is >90 days old.
- **Washout periods**: If `health_kit.medications` includes a relevant drug with an `end_date`, calculate days since last dose and compare against the trial's required washout. Score as ✅ if washout met, ❌ if not, ❓ if close to borderline.
- **BMI criteria**: If weight and height vitals exist, calculate BMI and score against trial requirements.
- **Medication contraindications**: Cross-reference active medications against trial exclusion criteria (e.g., "no concurrent use of ACE inhibitors" vs. active Lisinopril).

### 1.7 Update Orchestrator Tool Definitions

**File:** `backend/agents/orchestrator.py`

Add a new tool available to Claude:

```python
{
    "name": "get_health_import_summary",
    "description": "Get a summary of the patient's imported Apple Health data, including lab results, vitals, medications, and activity levels. Returns None if no health data has been imported.",
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": []
    }
}
```

This lets Claude reference imported health data during the conversation and eligibility analysis.

---

## Milestone 2: iOS Simulator HealthKit App (macOS Only)

> **Prerequisite**: Only attempt this milestone if running on macOS with Xcode installed.
> Do NOT attempt on Linux — HealthKit and the iOS Simulator are macOS-only.

### Goal

Build a minimal SwiftUI app that reads HealthKit data on an iPhone Simulator, displays a summary, and POSTs the extracted data to the Clinical Trial Copilot backend.

### 2.1 Environment Detection and Setup

Before starting, verify the macOS environment:

```bash
# Check if on macOS
uname -s  # Must return "Darwin"

# Check Xcode installation
xcode-select -p
# Expected: /Applications/Xcode.app/Contents/Developer

# Check available simulators
xcrun simctl list devices available

# If Xcode CLI tools not installed:
xcode-select --install

# Check iOS SDK version
xcrun --sdk iphonesimulator --show-sdk-version
```

If any of these checks fail, abort Milestone 2 and note that it requires:
- macOS 14+ (Sonoma or later)
- Xcode 16+ (for iOS 18 SDK with latest HealthKit APIs)
- At minimum, Xcode Command Line Tools

### 2.2 Project Structure

```
ios/
├── ClinicalTrialHealth/
│   ├── ClinicalTrialHealthApp.swift       # App entry point
│   ├── HealthKitManager.swift             # HealthKit authorization & queries
│   ├── APIClient.swift                    # POST to backend
│   ├── ContentView.swift                  # Main UI
│   ├── HealthSummaryView.swift            # Display extracted data
│   ├── Info.plist                         # HealthKit usage descriptions
│   └── ClinicalTrialHealth.entitlements   # HealthKit entitlement
├── ClinicalTrialHealth.xcodeproj/
└── README.md
```

### 2.3 HealthKit Manager

**File:** `ios/ClinicalTrialHealth/HealthKitManager.swift`

Request authorization for these HealthKit data types:

```swift
let readTypes: Set<HKObjectType> = [
    HKQuantityType(.stepCount),
    HKQuantityType(.appleExerciseTime),
    HKQuantityType(.bodyMass),
    HKQuantityType(.height),
    HKQuantityType(.bodyMassIndex),
    HKQuantityType(.heartRate),
    HKQuantityType(.bloodPressureSystolic),
    HKQuantityType(.bloodPressureDiastolic),
    HKClinicalType(.labResultRecord),
    HKClinicalType(.medicationRecord),
    HKClinicalType(.conditionRecord),
]
```

Query strategy:
- Step count: `HKStatisticsCollectionQuery` for last 30 days, daily sum, then average.
- Vitals: `HKSampleQuery` with `sortDescriptors` by date, limit 1 (most recent).
- Clinical records: `HKSampleQuery` for all available records, parse FHIR JSON from `fhirResource`.

### 2.4 API Client

**File:** `ios/ClinicalTrialHealth/APIClient.swift`

```swift
struct HealthPayload: Codable {
    let labResults: [LabResult]
    let vitals: [Vital]
    let medications: [Medication]
    let activityStepsPerDay: Double?
    let activityActiveMinutesPerDay: Double?
}

func sendHealthData(sessionId: String, payload: HealthPayload) async throws {
    // POST to http://<backend_host>:8100/api/sessions/{sessionId}/health-import
    // Content-Type: application/json
    // Body: JSON-encoded HealthPayload
}
```

The backend needs an additional JSON-based import endpoint (alongside the multipart file upload):

```
POST /api/sessions/{session_id}/health-import-json
Content-Type: application/json
```

This accepts the same data structure as the XML parser produces, so the iOS app can skip the XML step entirely and send structured data directly.

### 2.5 Simulator Data Seeding

The iOS Simulator does not have real HealthKit data. Seed it programmatically:

```swift
#if DEBUG
func seedSampleData() async throws {
    let store = HKHealthStore()

    // Steps: 5,500/day average for last 30 days
    for dayOffset in 0..<30 {
        let date = Calendar.current.date(byAdding: .day, value: -dayOffset, to: Date())!
        let steps = Double.random(in: 4000...7000)
        let sample = HKQuantitySample(
            type: HKQuantityType(.stepCount),
            quantity: HKQuantity(unit: .count(), doubleValue: steps),
            start: date, end: date
        )
        try await store.save(sample)
    }

    // Weight, height, HR, BP...
    // (similar pattern for each data type)
}
#endif
```

Call this from the app's `onAppear` in debug builds.

### 2.6 Building and Running in Simulator

#### Using `xcodebuild` (CLI — allows Claude to build without Xcode GUI)

```bash
# Build the project
cd ios/
xcodebuild -project ClinicalTrialHealth.xcodeproj \
    -scheme ClinicalTrialHealth \
    -sdk iphonesimulator \
    -destination 'platform=iOS Simulator,name=iPhone 16,OS=latest' \
    -configuration Debug \
    build

# Boot a simulator
xcrun simctl boot "iPhone 16"

# Install the app
xcrun simctl install "iPhone 16" \
    ~/Library/Developer/Xcode/DerivedData/ClinicalTrialHealth-*/Build/Products/Debug-iphonesimulator/ClinicalTrialHealth.app

# Launch the app
xcrun simctl launch "iPhone 16" com.clinicaltrial.health
```

#### Opening the Simulator Window

```bash
# Open Simulator.app (renders the device screen)
open -a Simulator
```

### 2.7 Screenshotting the iOS Simulator (for Claude to Verify UI)

These commands allow Claude to capture and view the simulator screen without GUI interaction:

```bash
# Screenshot the booted simulator to a file
xcrun simctl io booted screenshot /tmp/simulator_screenshot.png

# Then read the screenshot (Claude can view PNG files via the Read tool)
# Read tool: file_path="/tmp/simulator_screenshot.png"

# Alternative: screenshot a specific device by UDID
xcrun simctl io <DEVICE_UDID> screenshot /tmp/screenshot.png

# List booted devices to find UDID
xcrun simctl list devices booted

# Record video (useful for demo recording)
xcrun simctl io booted recordVideo /tmp/simulator_recording.mp4
# (Ctrl+C to stop recording)
```

#### Additional Simulator CLI Commands Useful for Claude

```bash
# Get the simulator's screen size and scale
xcrun simctl io booted enumerate

# Simulate tapping at coordinates (x, y)
# Useful if Claude needs to interact with the UI
xcrun simctl io booted tap <x> <y>

# Simulate text input
xcrun simctl io booted input text "Hello"

# Open a URL in the simulator (e.g., to set the backend URL)
xcrun simctl openurl booted "clinicaltrial://configure?host=localhost&port=8100"

# Get app container path (to inspect files, logs)
xcrun simctl get_app_container booted com.clinicaltrial.health data

# View device logs
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.clinicaltrial.health"'

# Reset simulator to clean state
xcrun simctl erase "iPhone 16"

# Check simulator status
xcrun simctl list devices booted
```

### 2.8 Connecting Simulator to Local Backend

The iOS Simulator shares the host Mac's network. The backend at `localhost:8100` is accessible from the simulator as `localhost:8100` directly (unlike a physical device, which would need the Mac's LAN IP).

Set the backend URL in the app:

```swift
#if targetEnvironment(simulator)
let backendURL = "http://localhost:8100"
#else
let backendURL = "http://YOUR_MAC_IP:8100"  // For physical device testing
#endif
```

---

## Implementation Order

```
Milestone 1 (Linux / Any Platform)
├── 1.1  Extend PatientProfile model
├── 1.2  Build Apple Health XML parser
├── 1.3  Generate synthetic export.xml / ZIP
├── 1.4  Add backend upload + dummy-file endpoints
├── 1.5  Build frontend HealthImport component
├── 1.6  Update eligibility scoring rules
└── 1.7  Add orchestrator tool for health data access

Milestone 2 (macOS Only — skip on Linux)
├── 2.1  Verify macOS + Xcode environment
├── 2.2  Create SwiftUI project structure
├── 2.3  Implement HealthKit data extraction
├── 2.4  Implement API client to POST to backend
├── 2.5  Seed simulator with sample data
├── 2.6  Build and run in simulator via CLI
├── 2.7  Screenshot to verify UI
└── 2.8  End-to-end test: simulator → backend → profile
```

Milestone 1 is the foundation. Milestone 2 is optional polish that reuses the same backend endpoints. Both milestones produce the same result in the `PatientProfile` — the difference is only in how the data arrives.
