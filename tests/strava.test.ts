import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';

const BASE_URL = 'https://www.strava.com';
const API_URL = '/api/v3';

const mockTokens = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 7200,
  athlete_id: 42,
};

const mockActivity = {
  id: 1,
  name: 'stravadb:testkey',
  description: JSON.stringify({
    filename: 'test.txt',
    mime: 'text/plain',
    encoding_ver: 1,
    chunk_total: 1,
    size: 11,
    chunk_index: 0,
  }),
  private: true,
  type: 'Run',
  map: {
    id: 'map123',
    summary_polyline: 'encoded_polyline',
    polyline: 'encoded_polyline',
    resource_state: 3,
  },
};

const mockUpload = {
  id: 77,
  id_str: '77',
  external_id: 'data.gpx',
  error: null,
  status: 'Your activity is ready.',
  activity_id: 1,
};

import { vi } from 'vitest';

vi.mock('../src/lib/auth.js', async () => {
  return {
    loadTokens: vi.fn(),
    saveTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
});

describe('strava client (activity API)', () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  async function setupMocks() {
    const auth = await import('../src/lib/auth.js');
    (auth.loadTokens as ReturnType<typeof vi.fn>).mockReturnValue(mockTokens);
    (auth.saveTokens as ReturnType<typeof vi.fn>).mockImplementation(() => {});
    (auth.refreshAccessToken as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('no refresh'),
    );
  }

  it('uploadActivity sends multipart upload and polls for result', async () => {
    await setupMocks();

    nock(BASE_URL)
      .post(`${API_URL}/uploads`)
      .reply(201, { ...mockUpload, activity_id: null, status: 'processing' });

    nock(BASE_URL)
      .get(`${API_URL}/uploads/77`)
      .reply(200, mockUpload);

    nock(BASE_URL)
      .get(`${API_URL}/activities/1`)
      .reply(200, mockActivity);

    const { uploadActivity } = await import('../src/lib/strava.js');
    const result = await uploadActivity({
      name: 'stravadb:testkey',
      description: '{}',
      private: true,
      dataType: 'gpx',
      file: Buffer.from('<gpx/>', 'utf-8'),
    });

    expect(result.id).toBe(1);
    expect(result.name).toBe('stravadb:testkey');
  });

  it('uploadActivity fails on upload error', async () => {
    await setupMocks();

    nock(BASE_URL)
      .post(`${API_URL}/uploads`)
      .reply(201, { ...mockUpload, error: 'Invalid file', activity_id: null });

    const { uploadActivity } = await import('../src/lib/strava.js');
    await expect(
      uploadActivity({
        name: 'test',
        description: '',
        private: true,
        dataType: 'gpx',
        file: Buffer.from('bad', 'utf-8'),
      }),
    ).rejects.toThrow('Upload error');
  });

  it('listAllActivities paginates', async () => {
    await setupMocks();

    const page1 = new Array(50).fill(null).map((_, i) => ({
      ...mockActivity,
      id: i + 1,
      name: `stravadb:key${i}`,
    }));

    nock(BASE_URL)
      .get(`${API_URL}/athlete/activities?page=1&per_page=50`)
      .reply(200, page1);

    nock(BASE_URL)
      .get(`${API_URL}/athlete/activities?page=2&per_page=50`)
      .reply(200, [{ ...mockActivity, id: 51, name: 'stravadb:key50' }]);

    const { listAllActivities } = await import('../src/lib/strava.js');
    const activities = await listAllActivities();

    expect(activities.length).toBe(51);
    expect(activities[0]!.id).toBe(1);
    expect(activities[50]!.id).toBe(51);
  });

  it('getActivity fetches a single activity', async () => {
    await setupMocks();

    nock(BASE_URL)
      .get(`${API_URL}/activities/1`)
      .reply(200, mockActivity);

    const { getActivity } = await import('../src/lib/strava.js');
    const activity = await getActivity(1);

    expect(activity.id).toBe(1);
    expect(activity.name).toBe('stravadb:testkey');
  });

  it('deleteActivity sends DELETE', async () => {
    await setupMocks();

    const scope = nock(BASE_URL)
      .delete(`${API_URL}/activities/1`)
      .reply(204);

    const { deleteActivity } = await import('../src/lib/strava.js');
    await deleteActivity(1);

    scope.done();
  });

  it('throws when not authenticated', async () => {
    const auth = await import('../src/lib/auth.js');
    (auth.loadTokens as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const { getActivity } = await import('../src/lib/strava.js');
    await expect(getActivity(1)).rejects.toThrow('Not authenticated');
  });

  it('throws on API error', async () => {
    await setupMocks();

    nock(BASE_URL)
      .get(`${API_URL}/activities/999`)
      .reply(404, { message: 'Not Found' });

    const { getActivity } = await import('../src/lib/strava.js');
    await expect(getActivity(999)).rejects.toThrow('Strava API error');
  });
});
