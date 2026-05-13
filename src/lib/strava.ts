import { StravaTokens, StravaActivity, StravaUpload, StravadbError } from '../types.js';
import { loadTokens, saveTokens, refreshAccessToken } from './auth.js';

const BASE_URL = 'https://www.strava.com/api/v3';

async function stravaFetch(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<Response> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new StravadbError('Not authenticated. Run `stravadb auth` first.', 'NOT_AUTHENTICATED');
  }

  if (tokens.expires_at < Date.now() / 1000 + 60) {
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token, tokens.athlete_id);
      saveTokens(refreshed);
      tokens.access_token = refreshed.access_token;
    } catch (err) {
      if (err instanceof StravadbError) throw err;
      throw new StravadbError('Token refresh failed. Run `stravadb auth` again.', 'TOKEN_EXPIRED');
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${tokens.access_token}`,
    },
  });

  if (res.status === 401 && !retried) {
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token, tokens.athlete_id);
      saveTokens(refreshed);
      return stravaFetch(path, options, true);
    } catch {
      throw new StravadbError(
        'Authentication failed. Run `stravadb auth` to re-authenticate.',
        'AUTH_FAILED',
        401,
      );
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new StravadbError(
      `Strava API error: ${res.status} ${body}`,
      'API_ERROR',
      res.status,
    );
  }

  return res;
}

export async function uploadActivity(params: {
  name: string;
  description: string;
  private: boolean;
  dataType: string;
  file: Buffer;
}): Promise<StravaActivity> {
  const formData = new FormData();
  const blob = new Blob([params.file as BlobPart], { type: 'application/gpx+xml' });
  formData.append('file', blob, 'data.gpx');
  formData.append('name', params.name);
  formData.append('description', params.description);
  formData.append('data_type', params.dataType);
  formData.append('private', params.private ? '1' : '0');
  formData.append('trainer', '0');
  formData.append('commute', '0');

  const res = await stravaFetch('/uploads', {
    method: 'POST',
    body: formData,
    headers: {},
  });

  const upload = (await res.json()) as StravaUpload;
  if (upload.error) {
    throw new StravadbError(
      `Upload error: ${upload.error}`,
      'UPLOAD_ERROR',
    );
  }

  const activity = await pollUpload(upload.id);
  return activity;
}

async function pollUpload(uploadId: number, maxAttempts = 60): Promise<StravaActivity> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await stravaFetch(`/uploads/${uploadId}`);
    const upload = (await res.json()) as StravaUpload;

    if (upload.error) {
      throw new StravadbError(
        `Upload processing error: ${upload.error}`,
        'UPLOAD_ERROR',
      );
    }

    if (upload.activity_id) {
      const actRes = await stravaFetch(`/activities/${upload.activity_id}`);
      return actRes.json() as Promise<StravaActivity>;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new StravadbError('Upload timed out waiting for activity', 'UPLOAD_TIMEOUT');
}

export async function listAllActivities(): Promise<StravaActivity[]> {
  const activities: StravaActivity[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await stravaFetch(
      `/athlete/activities?page=${page}&per_page=50`,
    );
    const pageActivities = (await res.json()) as StravaActivity[];
    activities.push(...pageActivities);
    hasMore = pageActivities.length === 50;
    page++;
  }

  return activities;
}

export async function getActivity(activityId: number): Promise<StravaActivity> {
  const res = await stravaFetch(`/activities/${activityId}`);
  return res.json() as Promise<StravaActivity>;
}

export async function deleteActivity(activityId: number): Promise<void> {
  await stravaFetch(`/activities/${activityId}`, { method: 'DELETE' });
}

export async function getActivityStream(activityId: number): Promise<[number, number][]> {
  const res = await stravaFetch(
    `/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
  );
  const data = (await res.json()) as {
    latlng?: { data: [number, number][] };
  };
  return data.latlng?.data ?? [];
}
