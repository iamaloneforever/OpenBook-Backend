import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPublicAddress,
  MAX_FEED_BYTES,
  normalizeFeedUrl,
  SafeFeedFetcher,
} from './safe-feed-fetcher';
import type { FeedNetwork } from './safe-feed-fetcher';

interface FakeReply {
  body?: string;
  status?: number;
  headers?: Record<string, string | undefined>;
}
const network = {
  lookup: vi.fn<FeedNetwork['lookup']>(),
  request: vi.fn<FeedNetwork['request']>(),
};
function reply(replies: FakeReply[]) {
  network.request.mockImplementation((_url, options, listener) => {
    const item = replies.shift() ?? {};
    const stream = Object.assign(new PassThrough(), {
      statusCode: item.status ?? 200,
      headers: { 'content-type': 'application/rss+xml', ...item.headers },
    });
    const req = Object.assign(new EventEmitter(), {
      end: () =>
        queueMicrotask(() => {
          listener(stream as unknown as IncomingMessage);
          stream.end(item.body ?? '<rss/>');
        }),
    });
    options.signal?.addEventListener(
      'abort',
      () => req.emit('error', new Error('aborted')),
      { once: true },
    );
    return req as unknown as ClientRequest;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  network.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  reply([{}]);
});
afterEach(() => vi.restoreAllMocks());

describe('RSS public network policy', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '192.0.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '::ffff:8.8.8.8',
    '64:ff9b::a00:1',
    '2001:db8::1',
    '2002:7f00:1::',
    'not-an-ip',
  ])('rejects private, reserved, and transitional address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each([
    '8.8.8.8',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2001:4860:4860::8888',
  ])('allows globally routed address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
  it.each([
    'file:///etc/passwd',
    'gopher://example.com',
    'http://localhost/rss',
    'http://127.1/rss',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]/rss',
    'http://169.254.169.254/latest',
    'https://feed.internal/rss',
    'https://user:secret@example.com/rss',
    'https://example.com:8443/rss',
    'https://example.com/rss#fragment',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => normalizeFeedUrl(url)).toThrow('public HTTP(S)');
  });
  it('normalizes standard ports and permits paths independently of host suffixes', () => {
    expect(normalizeFeedUrl('HTTPS://EXAMPLE.COM:443/rss').href).toBe(
      'https://example.com/rss',
    );
    expect(
      normalizeFeedUrl('https://example.com/feed.localhost').hostname,
    ).toBe('example.com');
  });
});

describe('RSS HTTP fetching', () => {
  it('pins the connection to validated DNS while preserving TLS hostname and Host', async () => {
    const fetcher = new SafeFeedFetcher(network);
    expect(await fetcher.fetch('https://example.com/rss')).toEqual({
      xml: '<rss/>',
      finalUrl: 'https://example.com/rss',
    });
    const options = network.request.mock.calls[0][1];
    expect(options).toMatchObject({
      hostname: '93.184.216.34',
      servername: 'example.com',
      agent: false,
      headers: { Host: 'example.com', 'Accept-Encoding': 'identity' },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(network.lookup).toHaveBeenCalledOnce();
  });
  it('rejects mixed DNS answers before opening a connection', async () => {
    network.lookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('exclusively to public');
    expect(network.request).not.toHaveBeenCalled();
  });
  it('revalidates DNS for every redirect', async () => {
    reply([
      { status: 302, headers: { location: 'https://redirect.example/rss' } },
    ]);
    network.lookup
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('exclusively to public');
    expect(network.request).toHaveBeenCalledTimes(1);
  });
  it('rejects redirects to private literals and HTTPS downgrades', async () => {
    reply([{ status: 302, headers: { location: 'http://127.0.0.1/rss' } }]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow();
    reply([{ status: 302, headers: { location: 'http://example.com/rss' } }]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('remain HTTPS');
  });
  it('limits redirect loops', async () => {
    reply(
      Array.from({ length: 4 }, () => ({
        status: 302,
        headers: { location: '/rss' },
      })),
    );
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('Too many');
    expect(network.request).toHaveBeenCalledTimes(4);
  });
  it.each([
    { status: 500 },
    { headers: { 'content-type': 'text/html' } },
    { headers: { 'content-encoding': 'gzip' } },
    { headers: { 'content-length': String(MAX_FEED_BYTES + 1) } },
  ])('rejects unsupported responses %j', async (response) => {
    reply([response]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('uncompressed XML');
  });
  it('limits streamed bytes even without Content-Length', async () => {
    reply([{ body: 'a'.repeat(MAX_FEED_BYTES + 1) }]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('exceeds 1 MiB');
  });
  it('fails promptly when DNS lookup fails', async () => {
    network.lookup.mockRejectedValue(new Error('internal DNS details'));
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('could not be resolved');
    expect(network.request).not.toHaveBeenCalled();
  });
  it('includes DNS resolution in the overall deadline', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    network.lookup.mockReturnValue(new Promise(() => {}));
    const pending = expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('timed out');
    controller.abort();
    await pending;
    expect(network.request).not.toHaveBeenCalled();
  });
  it('rejects a malformed redirect with a controlled error', async () => {
    reply([{ status: 302, headers: { location: 'http://[invalid' } }]);
    await expect(
      new SafeFeedFetcher(network).fetch('https://example.com/rss'),
    ).rejects.toThrow('redirect URL is invalid');
  });
});
