export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType: 'text' | 'widget' | 'trial_cards' | 'status' | 'map_data' | 'report_ready';
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface WidgetOption {
  label: string;
  value: string;
  description?: string;
}

export interface WidgetMessage {
  questionId: string;
  question: string;
  widgetType: 'single_select' | 'multi_select';
  options: WidgetOption[];
}

export interface TrialCardData {
  nctId: string;
  briefTitle: string;
  phase: string;
  overallStatus: string;
  fitScore: number;
  fitSummary: string;
  nearestDistanceMiles: number | null;
  interventions: string[];
  sponsor: string;
}

export interface MapData {
  trials: Array<{
    nctId: string;
    title: string;
    latitude: number;
    longitude: number;
    fitScore: number;
  }>;
  patient?: {
    latitude: number;
    longitude: number;
  };
}

export interface SessionState {
  sessionId: string;
  phase: 'intake' | 'search' | 'matching' | 'selection' | 'report' | 'followup';
  profileComplete: boolean;
  searchComplete: boolean;
  matchingComplete: boolean;
  reportGenerated: boolean;
}

// --- Faceted Stats Types ---

export interface FacetedFilters {
  condition: string;
  age: number | null;
  sex: string;
  statuses: string[] | null;
  states: string[] | null;
  latitude: number | null;
  longitude: number | null;
  distance_miles: number | null;
}

export interface FunnelStep {
  stage: string;
  count: number;
}

export interface StatsData {
  total: number;
  matched: number;
  phase_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
  all_status_distribution: Record<string, number>;
  geo_distribution: Record<string, number>;
  funnel: FunnelStep[];
}

export interface ActiveFilter {
  key: string;
  label: string;
  value: string;
}
