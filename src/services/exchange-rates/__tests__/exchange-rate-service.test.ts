import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
  // No L2 cache in these tests: every rate comes from the mocked provider
  checkSupabaseConfig: () => ({ isConfigured: false, missingKeys: [] }),
}));

import { ExchangeRateError, ExchangeRateService } from '../exchange-rate-service';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new ExchangeRateService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('C: same currency returns the amount with no network request', async () => {
    const result = await service.convertAmount(12345, 'INR', 'inr');
    expect(result.convertedMinor).toBe(12345);
    expect(result.source).toBe('identity');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('A: converts with the provider rate and precision', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ date: '2026-10-22', base: 'USD', quote: 'INR', rate: 85 }));
    const result = await service.convertAmount(10000, 'USD', 'INR');
    expect(result.convertedMinor).toBe(850000);
    expect(result.quote).toMatchObject({ from: 'USD', to: 'INR', rate: 85, effectiveDate: '2026-10-22', source: 'network' });
  });

  it('F: requests the historical date and records the effective date the provider returns', async () => {
    // Saturday request; provider answers with the rate it applies to that date
    fetchMock.mockResolvedValueOnce(jsonResponse({ date: '2026-10-17', base: 'USD', quote: 'INR', rate: 94.92 }));
    const q = await service.getRate('USD', 'INR', '2026-10-18');

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/rate/USD/INR?date=2026-10-18'));
    expect(q).toMatchObject({ rate: 94.92, requestedDate: '2026-10-18', effectiveDate: '2026-10-17' });
  });

  it('caches successful rates and shares concurrent requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ date: '2026-10-22', rate: 0.9 }));
    const [a, b] = await Promise.all([service.getRate('USD', 'EUR'), service.getRate('usd', 'eur')]);
    await service.getRate('USD', 'EUR');
    expect(a.rate).toBe(0.9);
    expect(b.rate).toBe(0.9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('G: a network failure throws a typed error and is not cached as a rate', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(service.getRate('USD', 'INR')).rejects.toMatchObject({ name: 'ExchangeRateError', kind: 'network' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ date: '2026-10-22', rate: 85 }));
    await expect(service.getRate('USD', 'INR')).resolves.toMatchObject({ rate: 85 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('G: an unsupported pair is reported as unsupported, never as 1:1', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 422 }));
    const err = await service.getRate('USD', 'XYZ').catch((e) => e);
    expect(err).toBeInstanceOf(ExchangeRateError);
    expect(err.kind).toBe('unsupported');
  });

  it('G: rejects malformed codes without calling the provider', async () => {
    await expect(service.getRate('US', 'INR')).rejects.toMatchObject({ kind: 'unsupported' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('G: a missing historical rate is not replaced by another date', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ date: '2026-10-22', rate: 85 }));
    await service.getRate('USD', 'INR'); // latest is cached now

    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(service.getRate('USD', 'INR', '2020-01-01')).rejects.toMatchObject({ kind: 'network', date: '2020-01-01' });
  });

  it('rejects a response without a usable rate', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ date: '2026-10-22', rate: 0 }));
    await expect(service.getRate('USD', 'INR')).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
