from __future__ import annotations

from pydantic import BaseModel, Field


class TrialLocation(BaseModel):
    facility: str = ""
    city: str = ""
    state: str = ""
    country: str = ""
    zip_code: str = ""
    latitude: float | None = None
    longitude: float | None = None
    status: str = ""
    contact_name: str = ""
    contact_phone: str = ""
    contact_email: str = ""
    distance_miles: float | None = None


class TrialSummary(BaseModel):
    nct_id: str
    brief_title: str = ""
    official_title: str = ""
    phase: str = ""
    overall_status: str = ""
    study_type: str = ""
    brief_summary: str = ""
    conditions: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    enrollment_count: int | None = None
    start_date: str = ""
    completion_date: str = ""
    sponsor: str = ""
    locations: list[TrialLocation] = Field(default_factory=list)
    nearest_distance_miles: float | None = None
    search_strategy: str = ""


class EligibilityCriteria(BaseModel):
    nct_id: str
    raw_text: str = ""
    inclusion: list[str] = Field(default_factory=list)
    exclusion: list[str] = Field(default_factory=list)
    min_age: str = ""
    max_age: str = ""
    sex: str = ""
    accepts_healthy: bool = False


class CriterionScore(BaseModel):
    criterion: str
    status: str  # "met", "not_met", "needs_discussion", "not_enough_info"
    icon: str  # ✅, ❌, ❓, ➖
    explanation: str = ""
    plain_language: str = ""


class MatchedTrial(BaseModel):
    nct_id: str
    brief_title: str = ""
    phase: str = ""
    overall_status: str = ""
    fit_score: float = 0.0
    fit_summary: str = ""
    plain_language_summary: str = ""
    what_to_expect: str = ""
    inclusion_scores: list[CriterionScore] = Field(default_factory=list)
    exclusion_scores: list[CriterionScore] = Field(default_factory=list)
    nearest_location: TrialLocation | None = None
    all_locations: list[TrialLocation] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    enrollment_count: int | None = None
    start_date: str = ""
    completion_date: str = ""
    sponsor: str = ""
    adverse_events: list[str] = Field(default_factory=list)
