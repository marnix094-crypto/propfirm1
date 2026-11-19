import { resolveCname, resolveTxt } from 'node:dns/promises';

/** DNS lookups for own-domain verification (D95). Missing records resolve to []. */
export interface DnsResolver {
  txt(name: string): Promise<string[]>;
  cname(name: string): Promise<string[]>;
}

export const DNS_RESOLVER = Symbol('DNS_RESOLVER');

export class SystemDnsResolver implements DnsResolver {
  async txt(name: string): Promise<string[]> {
    try {
      return (await resolveTxt(name)).map((chunks) => chunks.join(''));
    } catch {
      return [];
    }
  }
  async cname(name: string): Promise<string[]> {
    try {
      return (await resolveCname(name)).map((c) => c.toLowerCase().replace(/\.$/, ''));
    } catch {
      return [];
    }
  }
}

/** In-memory DNS for tests and local development. */
export class FakeDnsResolver implements DnsResolver {
  private readonly records = new Map<string, string[]>();
  set(type: 'TXT' | 'CNAME', name: string, values: string[]) {
    this.records.set(`${type}:${name.toLowerCase()}`, values);
  }
  async txt(name: string) {
    return this.records.get(`TXT:${name.toLowerCase()}`) ?? [];
  }
  async cname(name: string) {
    return this.records.get(`CNAME:${name.toLowerCase()}`) ?? [];
  }
}
