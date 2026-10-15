/** Id generation shared by server and client (uses the Web Crypto API available in Node 20+ and browsers). */
const PREFIX: Record<string, string> = {
  project: 'prj',
  run: 'run',
  query: 'qry',
  raw: 'raw',
  evidence: 'ev',
  discovery: 'disc',
  signal: 'sig',
  cluster: 'cl',
  opportunity: 'opp',
  investigation: 'inv',
  finding: 'fnd',
  brief: 'brf',
  decision: 'dec',
  assumption: 'asm',
  buildPackage: 'bp',
  requirement: 'req',
  validation: 'val',
  event: 'evt',
};

export type IdKind = keyof typeof PREFIX;

export function newId(kind: IdKind): string {
  return `${PREFIX[kind]}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
