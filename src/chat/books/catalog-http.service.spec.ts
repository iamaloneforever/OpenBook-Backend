import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { CatalogHttpService } from './catalog-http.service';
import { CatalogProvider } from './catalog.dto';
import type { ChatRateLimitService } from '../chat-rate-limit.service';

function setup() {
  const consume = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn<typeof fetch>();
  const service = new CatalogHttpService(
    { consume } as unknown as ChatRateLimitService,
    new ConfigService({}),
    request,
  );
  return { consume, request, service };
}
const url = () => new URL('https://openlibrary.org/search.json?q=book');

describe('bounded public catalog transport', () => {
  it('requires a trusted API origin and rejects redirects', async () => {
    const { service, request } = setup();
    await expect(
      service.json(
        CatalogProvider.OPEN_LIBRARY,
        new URL('http://127.0.0.1/secret'),
      ),
    ).rejects.toThrow('Invalid catalog endpoint');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(
      new Response('{"docs":[]}', {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(await service.json(CatalogProvider.OPEN_LIBRARY, url())).toEqual({
      docs: [],
    });
    expect(request.mock.calls[0][0]).toBeInstanceOf(URL);
    expect(request.mock.calls[0][1]?.redirect).toBe('error');
    expect(request.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    new Response('<html>private</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
    new Response('{}', {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '1048577',
      },
    }),
    new Response('invalid JSON', {
      headers: { 'Content-Type': 'application/json' },
    }),
  ])('rejects invalid or oversized provider responses', async (response) => {
    const { service, request } = setup();
    request.mockResolvedValue(response);
    await expect(
      service.json(CatalogProvider.OPEN_LIBRARY, url()),
    ).rejects.toThrow('Public book catalog is unavailable');
  });
  it('bounds streaming responses even without Content-Length', async () => {
    const { service, request } = setup();
    const cancel = vi.fn();
    request.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(1048577));
          },
          cancel,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await expect(
      service.json(CatalogProvider.OPEN_LIBRARY, url()),
    ).rejects.toThrow('Public book catalog is unavailable');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('does not leak request URLs or API-key diagnostics in errors', async () => {
    const { service, request } = setup();
    request.mockRejectedValue(new Error('PRIVATE_KEY_URL'));
    await expect(
      service.json(CatalogProvider.OPEN_LIBRARY, url()),
    ).rejects.toThrow(/^Public book catalog is unavailable$/);
  });
});
