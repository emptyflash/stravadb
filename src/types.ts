export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete_id: number;
}

export interface StravaActivity {
  id: number;
  name: string;
  description: string;
  private: boolean;
  type: string;
  map: {
    id: string;
    summary_polyline: string;
    polyline: string;
    resource_state: number;
  };
}

export interface StravaUpload {
  id: number;
  id_str: string;
  external_id: string;
  error: string | null;
  status: string;
  activity_id: number | null;
}

export interface RouteMetadata {
  filename: string;
  mime: string;
  encoding_ver: number;
  chunk_total: number;
  size: number;
  chunk_index: number;
}

export interface ResumeState {
  key: string;
  rawData: string;
  filename: string;
  mime: string;
  totalChunks: number;
  nextChunk: number;
}

export class StravadbError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'StravadbError';
  }
}
