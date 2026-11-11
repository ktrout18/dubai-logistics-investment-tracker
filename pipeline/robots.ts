/**
 * Minimal robots.txt support (RFC 9309): groups by user-agent, Allow/Disallow
 * with `*` and `$` wildcards, longest match wins, Allow wins ties.
 */

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface RobotsRules {
  /** True when every path is disallowed regardless of rules (e.g. robots.txt answered 5xx). */
  disallowAll: boolean;
  /** Why everything is disallowed (e.g. robots.txt unreachable). */
  note?: string;
  groups: { agents: string[]; rules: Rule[] }[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsRules['groups'] = [];
  let current: { agents: string[]; rules: Rule[] } | undefined;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (!current) continue;
      if (key === 'disallow' && value === '') continue; // empty disallow = allow all
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return { disallowAll: false, groups };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Product token of our user agent, e.g. "dubailogisticstracker". */
export function productToken(userAgent: string): string {
  return (userAgent.split(/[\s/]/)[0] ?? '').toLowerCase();
}

export function isAllowed(rules: RobotsRules, userAgent: string, pathAndQuery: string): boolean {
  if (rules.disallowAll) return false;
  const token = productToken(userAgent);
  const specific = rules.groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : rules.groups.filter((g) => g.agents.includes('*'));
  const all = chosen.flatMap((g) => g.rules);
  let best: Rule | undefined;
  for (const r of all) {
    if (!patternToRegex(r.pattern).test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
