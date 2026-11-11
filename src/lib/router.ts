/**
 * Minimal hash router: `#/path?query`. The site is served from a GitHub Pages
 * sub-path, so all routing lives in the hash.
 */
import { useCallback, useEffect, useState } from 'react';

export interface HashLocation {
  path: string;
  params: URLSearchParams;
}

export function parseHash(hash: string): HashLocation {
  // Anything after a second '#' is an in-page anchor (e.g. '#/method#review').
  const raw = hash.replace(/^#/, '').split('#')[0] || '/';
  const qi = raw.indexOf('?');
  const pathPart = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = qi >= 0 ? raw.slice(qi + 1) : '';
  let path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return { path, params: new URLSearchParams(query) };
}

/** Build an href for a route: hrefFor('/delivered', params) → '#/delivered?zone=Jafza'. */
export function hrefFor(path: string, params?: URLSearchParams | Record<string, string | undefined>): string {
  let qs = '';
  if (params instanceof URLSearchParams) qs = params.toString();
  else if (params) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, v);
    qs = p.toString();
  }
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function useHashLocation(): HashLocation & { navigate: (href: string, opts?: { replace?: boolean }) => void } {
  const [loc, setLoc] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setLoc(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((href: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${href}`);
      setLoc(parseHash(href));
    } else {
      window.location.hash = href.replace(/^#/, '');
    }
  }, []);
  return { ...loc, navigate };
}
