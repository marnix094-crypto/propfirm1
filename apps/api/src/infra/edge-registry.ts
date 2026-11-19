import { Injectable } from '@nestjs/common';

/** What the edge proxy needs to serve a hostname (D95, D108). */
export type EdgeRoute =
  | { product: 'platform'; firm: string; instance: 'shared' | 'dedicated' }
  | {
      product: 'compete';
      operator: string;
      instance: 'shared';
      /** Origins allowed to embed this operator's widgets (CSP `frame-ancestors`). */
      frameAncestors: string[];
    };

/** A product that owns hostnames (prop-firm platform, Compete). */
export interface EdgeResolver {
  route(host: string): Promise<EdgeRoute | null>;
  allowCertificate(host: string): Promise<boolean>;
}

/**
 * Hostname registry for the edge: each product registers its own resolver, so the edge
 * endpoints need no knowledge of the products and products never import each other.
 */
@Injectable()
export class EdgeRegistry {
  private readonly resolvers: EdgeResolver[] = [];

  register(r: EdgeResolver): void {
    this.resolvers.push(r);
  }

  async route(host: string): Promise<EdgeRoute | null> {
    const h = normalizeHost(host);
    if (!h) return null;
    for (const r of this.resolvers) {
      const route = await r.route(h);
      if (route) return route;
    }
    return null;
  }

  async allowCertificate(host: string): Promise<boolean> {
    const h = normalizeHost(host);
    if (!h) return false;
    for (const r of this.resolvers) if (await r.allowCertificate(h)) return true;
    return false;
  }
}

export function normalizeHost(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  return h.length > 0 && h.length <= 253 && /^[a-z0-9.-]+$/.test(h) ? h : null;
}
