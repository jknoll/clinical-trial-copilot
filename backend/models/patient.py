from __future__ import annotations

from pydantic import BaseModel, Field


class Condition(BaseModel):
    primary_diagnosis: str = ""
    stage: str = ""
    subtype: str = ""
    biomarkers: list[str] = Field(default_factory=list)
    date_of_diagnosis: str = ""


class Treatment(BaseModel):
    treatment: str
    type: str = ""
    cycles_completed: int | None = None
    response: str = ""
    end_date: str = ""


class Demographics(BaseModel):
    age: int | None = None
    sex: str = ""
    estimated_ecog: int | None = None


class Location(BaseModel):
    description: str = ""
    latitude: float | None = None
    longitude: float | None = None
    max_travel_miles: int = 100
    open_to_virtual: bool = True


class Preferences(BaseModel):
    trial_types: list[str] = Field(default_factory=list)
    phases: list[str] = Field(default_factory=list)
    placebo_acceptable: bool | None = None
    intervention_interests: list[str] = Field(default_factory=list)


class PatientProfile(BaseModel):
    condition: Condition = Field(default_factory=Condition)
    treatment_history: list[Treatment] = Field(default_factory=list)
    demographics: Demographics = Field(default_factory=Demographics)
    location: Location = Field(default_factory=Location)
    preferences: Preferences = Field(default_factory=Preferences)
