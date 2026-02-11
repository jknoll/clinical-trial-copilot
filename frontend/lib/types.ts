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
