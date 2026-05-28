export interface Lead {
  id?: string;
  session_id?: string;
  business_name: string;
  address: string;
  phone: string;
  website: string;
  google_maps_url: string;
  rating: string;
  review_count: string;
  category: string;
  hours: string;
  social_media: string[];
  extra_data: Record<string, string>;
  created_at?: string;
}

export interface ScrapeSession {
  id?: string;
  keyword: string;
  location: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  total_results: number;
  created_at?: string;
  completed_at?: string;
}

export type ScrapeStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export interface ScrapeState {
  status: ScrapeStatus;
  keyword: string;
  leadsFound: number;
  currentPage: number;
  sessionId: string | null;
  errorMessage: string | null;
}

export interface ContentMessage {
  type:
    | 'START_SCRAPE'
    | 'STOP_SCRAPE'
    | 'PAUSE_SCRAPE'
    | 'RESUME_SCRAPE'
    | 'GET_STATUS'
    | 'LEAD_FOUND'
    | 'SCRAPE_STATUS'
    | 'SCRAPE_COMPLETE'
    | 'SCRAPE_ERROR';
  payload?: unknown;
}
