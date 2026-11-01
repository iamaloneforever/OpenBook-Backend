import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';

export const RSS_NETWORK = Symbol('RSS_NETWORK');
export const MAX_FEED_BYTES = 1_048_576;
export interface FeedNetwork {
  lookup: (host: string) => Promise<LookupAddress[]>;
  request: (
    url: URL,
    options: https.RequestOptions,
    listener: (response: http.IncomingMessage) => void,
  ) => http.ClientRequest;
}
const defaultNetwork: FeedNetwork = {
  lookup: (host) => lookup(host, { all: true, verbatim: true }),
  request: (url, options, listener) =>
    (url.protocol === 'https:' ? https : http).request(url, options, listener),
};
const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  denied.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  denied.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address, 'ipv4');
  return (
    family === 6 &&
    globalV6.check(address, 'ipv6') &&
    !denied.check(address, 'ipv6')
  );
}

export function normalizeFeedUrl(raw: string): URL {
  try {
    if (raw.length > 2048) throw new Error();
    const url = new URL(raw);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && !['80', '443'].includes(url.port))
    )
      throw new Error();
    const host = url.hostname
      .replace(/^\[|\]$/g, '')
      .toLowerCase()
      .replace(/\.$/, '');
    if (!host.includes('.') && !isIP(host)) throw new Error();
    if (
      /(?:^|\.)(?:localhost|local|internal|home|test|invalid|onion)$/.test(host)
    )
      throw new Error();
    if (isIP(host) && !isPublicAddress(host)) throw new Error();
    return url;
  } catch {
    throw new BadRequestException(
      'Feed URL must be a public HTTP(S) URL on a standard port without credentials or a fragment',
    );
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new BadGatewayException('Feed request timed out'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
      .catch(reject);
  });
}

@Injectable()
export class SafeFeedFetcher {
  constructor(
    @Optional()
    @Inject(RSS_NETWORK)
    private readonly network: FeedNetwork = defaultNetwork,
  ) {}

  async fetch(raw: string): Promise<{ xml: string; finalUrl: string }> {
    const signal = AbortSignal.timeout(10_000);
    let url = normalizeFeedUrl(raw);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const addresses = isIP(host)
        ? [{ address: host, family: isIP(host) }]
        : await abortable(
            this.network.lookup(host).catch(() => {
              throw new BadGatewayException('Feed host could not be resolved');
            }),
            signal,
          );
      // Reject mixed public/private DNS answers as well as private literals.
      if (
        !addresses.length ||
        addresses.some(({ address }) => !isPublicAddress(address))
      ) {
        throw new BadRequestException(
          'Feed host must resolve exclusively to public addresses',
        );
      }
      const response = await this.read(url, addresses[0], signal);
      if (response.location) {
        if (redirects === 3)
          throw new BadGatewayException('Too many feed redirects');
        let destination: URL;
        try {
          destination = new URL(response.location, url);
        } catch {
          throw new BadGatewayException('Feed redirect URL is invalid');
        }
        const next = normalizeFeedUrl(destination.href);
        if (url.protocol === 'https:' && next.protocol !== 'https:')
          throw new BadRequestException(
            'HTTPS feed redirects must remain HTTPS',
          );
        url = next;
      } else {
        return { xml: response.body, finalUrl: url.href };
      }
    }
    throw new BadGatewayException('Feed request failed');
  }

  private read(
    url: URL,
    target: LookupAddress,
    signal: AbortSignal,
  ): Promise<{ body: string; location?: string }> {
    return new Promise((resolve, reject) => {
      const request = this.network.request(
        url,
        {
          // A literal address pins the socket to the checked DNS answer. TLS still verifies the original hostname.
          hostname: target.address,
          family: target.family,
          servername: url.hostname.replace(/^\[|\]$/g, ''),
          agent: false,
          signal,
          headers: {
            Host: url.host,
            Accept:
              'application/rss+xml, application/atom+xml, application/xml, text/xml',
            'Accept-Encoding': 'identity',
            'User-Agent': 'OpenBook-RSS/1.0',
          },
        },
        (response) => {
          response.on('error', () =>
            reject(new BadGatewayException('Feed response failed')),
          );
          if (
            [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
            response.headers.location
          ) {
            resolve({ body: '', location: response.headers.location });
            response.destroy();
            return;
          }
          if (
            response.statusCode !== 200 ||
            !/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/i.test(
              response.headers['content-type'] ?? '',
            ) ||
            !['', 'identity'].includes(
              response.headers['content-encoding'] ?? '',
            ) ||
            Number(response.headers['content-length'] ?? 0) > MAX_FEED_BYTES
          ) {
            reject(
              new BadGatewayException(
                'Feed must be an uncompressed XML response under 1 MiB',
              ),
            );
            response.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_FEED_BYTES) {
              reject(new BadGatewayException('Feed exceeds 1 MiB'));
              response.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            try {
              resolve({
                body: new TextDecoder('utf-8', { fatal: true }).decode(
                  Buffer.concat(chunks),
                ),
              });
            } catch {
              reject(new BadGatewayException('Feed must use UTF-8'));
            }
          });
        },
      );
      request.on('error', () =>
        reject(new BadGatewayException('Feed connection failed or timed out')),
      );
      request.end();
    });
  }
}
