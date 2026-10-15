/**
 * DEMO CORPUS — clearly fake pages for the fixture search provider.
 * Every URL is under https://demo.invalid/ (a reserved, unresolvable TLD) and every title is
 * prefixed [DEMO] when served. None of this is real web evidence.
 *
 * `signalKey` links a page to the canned signal the fixture agent will extract from it
 * (null = page is returned by search but is not useful evidence — intentional noise).
 */
export interface DemoPage {
  id: string;
  url: string;
  title: string;
  snippet: string;
  keywords: string[];
  theme: DemoThemeId | null;
  signalKey: string | null;
}

export type DemoThemeId =
  | 'agent-context'
  | 'local-first-sync'
  | 'usage-billing'
  | 'llm-cost'
  | 'compliance-smb'
  | 'webhook-reliability';

export const DEMO_PAGES: DemoPage[] = [
  // ---------- agent-context ----------
  {
    id: 'p01',
    url: 'https://demo.invalid/forum/coding-agents-lose-context',
    title: 'Every time I switch coding agents I have to re-explain my whole project',
    snippet:
      'Thread with 140 replies. Developers describe re-pasting architecture notes, conventions and decisions into each new agent session, and keeping a hand-maintained CONTEXT.md to paste in.',
    keywords: [
      'coding agent',
      'context',
      'session',
      'handoff',
      'developers',
      'complaint',
      'manual',
      'workaround',
    ],
    theme: 'agent-context',
    signalKey: 'agent-context.repaste',
  },
  {
    id: 'p02',
    url: 'https://demo.invalid/blog/memory-files-for-ai-agents',
    title: 'We maintain three different memory files for three different AI coding tools',
    snippet:
      'A team blog describing how they keep CLAUDE.md, AGENTS.md and .cursorrules in sync by hand, and a shell script that diffs them weekly because they drift.',
    keywords: [
      'memory file',
      'AGENTS.md',
      'coding agent',
      'multiple tools',
      'workaround',
      'manual',
      'sync',
      'drift',
    ],
    theme: 'agent-context',
    signalKey: 'agent-context.multi-tool',
  },
  {
    id: 'p03',
    url: 'https://demo.invalid/issues/agent-tool/4512',
    title: 'Feature request: export session context so another agent can continue',
    snippet:
      'Issue opened 7 months ago, 312 upvotes. Maintainer response: "not on the roadmap; session state is internal". Several commenters link their own export scripts.',
    keywords: [
      'feature request',
      'session',
      'export',
      'portability',
      'coding agent',
      'issue',
      'missing feature',
      'upvotes',
    ],
    theme: 'agent-context',
    signalKey: 'agent-context.portability',
  },
  {
    id: 'p04',
    url: 'https://demo.invalid/news/agent-interop-standard-draft',
    title: 'Draft spec for sharing project context between AI coding tools published',
    snippet:
      'A working group published a draft interchange format for project memory. Two tool vendors said they would evaluate it; none has committed to shipping support.',
    keywords: [
      'standard',
      'protocol',
      'interop',
      'coding agent',
      'context',
      'spec',
      'new',
      'technical change',
    ],
    theme: 'agent-context',
    signalKey: 'agent-context.standard',
  },
  {
    id: 'p05',
    url: 'https://demo.invalid/survey/developer-ai-tools-2026',
    title: 'Survey: 61% of respondents use two or more AI coding assistants weekly',
    snippet:
      'Annual developer survey (n=4,800, self-selected). Multi-tool usage rose from 38% to 61% year over year; "keeping tools in sync about my project" ranked as the #2 frustration.',
    keywords: [
      'survey',
      'adoption',
      'multiple',
      'coding assistants',
      'developers',
      'growth',
      'frustration',
      'ecosystem',
    ],
    theme: 'agent-context',
    signalKey: 'agent-context.adoption',
  },

  // ---------- local-first-sync ----------
  {
    id: 'p11',
    url: 'https://demo.invalid/forum/crdt-too-hard-for-small-team',
    title: 'We spent 4 months on sync and still have conflict bugs',
    snippet:
      'Founder of a 3-person note-taking app describes abandoning a hand-rolled CRDT layer after months of edge cases, and asks what small teams actually use for offline sync.',
    keywords: ['sync', 'offline', 'local-first', 'CRDT', 'conflict', 'small team', 'pain', 'complaint'],
    theme: 'local-first-sync',
    signalKey: 'local-first.complexity',
  },
  {
    id: 'p12',
    url: 'https://demo.invalid/pricing/sync-backend-enterprise',
    title: 'Realtime sync platform pricing: Team plan starts at $499/month',
    snippet:
      'Pricing page for an incumbent managed sync service. Free tier limited to 1 project and 100 MAU; the next tier is $499/month billed annually.',
    keywords: ['pricing', 'sync', 'backend', 'expensive', 'incumbent', 'realtime', 'plan', 'month'],
    theme: 'local-first-sync',
    signalKey: 'local-first.incumbent-pricing',
  },
  {
    id: 'p13',
    url: 'https://demo.invalid/news/sync-service-shutdown',
    title: 'Hosted sync service announces shutdown, gives customers 90 days to migrate',
    snippet:
      'A mid-sized hosted sync provider is winding down. The announcement thread is full of customers asking for migration paths and self-hostable alternatives.',
    keywords: [
      'shutdown',
      'deprecation',
      'sync',
      'migrate',
      'customers',
      'alternative',
      'self-host',
      'hosted',
    ],
    theme: 'local-first-sync',
    signalKey: 'local-first.shutdown',
  },
  {
    id: 'p14',
    url: 'https://demo.invalid/blog/sqlite-wasm-browser-db',
    title: 'SQLite in the browser is now fast enough to be the primary store',
    snippet:
      'Benchmark post: a WASM SQLite build with OPFS persistence handles 50k-row tables with sub-10ms queries, making local-first architectures practical without a custom engine.',
    keywords: [
      'SQLite',
      'WASM',
      'browser',
      'local-first',
      'capability',
      'new',
      'technical',
      'infrastructure',
      'cheaper',
    ],
    theme: 'local-first-sync',
    signalKey: 'local-first.capability',
  },

  // ---------- usage-billing ----------
  {
    id: 'p21',
    url: 'https://demo.invalid/forum/usage-billing-indie-saas',
    title: 'How are solo devs doing metered billing without a billing team?',
    snippet:
      'Thread: indie SaaS founders describe cron jobs that aggregate usage into spreadsheets, then manually create invoice line items. Several mention double-charging incidents.',
    keywords: [
      'billing',
      'usage-based',
      'metered',
      'indie',
      'solo',
      'SaaS',
      'manual',
      'invoice',
      'workaround',
      'pain',
    ],
    theme: 'usage-billing',
    signalKey: 'billing.manual-metering',
  },
  {
    id: 'p22',
    url: 'https://demo.invalid/pricing/billing-platform-fees',
    title: 'Billing platform pricing: 0.8% of revenue plus $2,000/month minimum',
    snippet:
      'Pricing page for a usage-billing incumbent. Entry contract has a $2,000/month minimum which commenters on a linked thread call "a non-starter under $300k ARR".',
    keywords: ['billing', 'pricing', 'expensive', 'minimum', 'incumbent', 'revenue', 'fees', 'platform'],
    theme: 'usage-billing',
    signalKey: 'billing.incumbent-pricing',
  },
  {
    id: 'p23',
    url: 'https://demo.invalid/changelog/payments-api-meters',
    title: 'Payments API changelog: new usage meter objects and rate-limit changes',
    snippet:
      'A major payments API introduced first-class meter objects, deprecating the previous usage-record endpoint with a 12-month sunset. Migration guide is 40 pages.',
    keywords: ['API', 'change', 'payments', 'meter', 'deprecation', 'migration', 'billing', 'platform'],
    theme: 'usage-billing',
    signalKey: 'billing.api-change',
  },
  {
    id: 'p24',
    url: 'https://demo.invalid/marketplace/billing-plugins',
    title: 'Marketplace category: billing & metering plugins (214 listings)',
    snippet:
      'Framework marketplace listing page. Billing/metering is one of the fastest-growing categories; top plugins show 5-figure weekly installs and several are paid add-ons.',
    keywords: [
      'marketplace',
      'plugins',
      'billing',
      'metering',
      'distribution',
      'installs',
      'paid',
      'category',
    ],
    theme: 'usage-billing',
    signalKey: 'billing.distribution',
  },

  // ---------- llm-cost ----------
  {
    id: 'p31',
    url: 'https://demo.invalid/forum/llm-bill-surprise',
    title: 'Our LLM bill tripled in a week and nobody could tell which feature caused it',
    snippet:
      'Post-mortem from a 6-person startup: no per-feature attribution of token spend; they now tag every call by hand and export logs to a spreadsheet weekly.',
    keywords: [
      'LLM',
      'cost',
      'bill',
      'tokens',
      'attribution',
      'observability',
      'startup',
      'spreadsheet',
      'manual',
      'pain',
    ],
    theme: 'llm-cost',
    signalKey: 'llm-cost.attribution',
  },
  {
    id: 'p32',
    url: 'https://demo.invalid/pricing/llm-observability-enterprise',
    title: 'LLM observability vendor pricing: contact sales; reported deals start at $30k/year',
    snippet:
      'Review-site page aggregating reported contract sizes for an LLM observability vendor. Small-team reviewers say the free tier drops traces after 7 days.',
    keywords: [
      'LLM',
      'observability',
      'pricing',
      'expensive',
      'enterprise',
      'vendor',
      'contract',
      'incumbent',
    ],
    theme: 'llm-cost',
    signalKey: 'llm-cost.incumbent-pricing',
  },
  {
    id: 'p33',
    url: 'https://demo.invalid/news/model-pricing-cuts-2026',
    title: 'Three model providers cut prices again; per-token pricing now changes monthly',
    snippet:
      'Roundup of pricing changes across providers over six months. Teams report that hard-coded cost tables in their dashboards are chronically stale.',
    keywords: ['model', 'pricing', 'change', 'providers', 'tokens', 'LLM', 'cost', 'monthly', 'market'],
    theme: 'llm-cost',
    signalKey: 'llm-cost.pricing-churn',
  },

  // ---------- compliance-smb ----------
  {
    id: 'p41',
    url: 'https://demo.invalid/forum/soc2-for-10-person-startup',
    title: 'SOC 2 quotes for a 10-person startup: $25k–$60k before the audit',
    snippet:
      'Founders compare quotes from compliance-automation vendors. Several describe doing evidence collection manually in a shared folder to avoid the platform fee.',
    keywords: [
      'SOC 2',
      'compliance',
      'startup',
      'expensive',
      'quotes',
      'evidence',
      'manual',
      'audit',
      'vendor',
    ],
    theme: 'compliance-smb',
    signalKey: 'compliance.cost',
  },
  {
    id: 'p42',
    url: 'https://demo.invalid/policy/procurement-security-requirements',
    title: 'More enterprise buyers now require a security attestation from vendors under 50 employees',
    snippet:
      'Procurement survey: 72% of enterprise buyers now ask small vendors for SOC 2 or equivalent before a pilot, up from 44% two years earlier.',
    keywords: [
      'procurement',
      'security',
      'requirements',
      'compliance',
      'enterprise',
      'vendors',
      'policy',
      'regulatory',
      'change',
    ],
    theme: 'compliance-smb',
    signalKey: 'compliance.buyer-pressure',
  },
  {
    id: 'p43',
    url: 'https://demo.invalid/issues/compliance-tool/88',
    title: 'Feature request: integrate evidence collection with our CI instead of screenshots',
    snippet:
      'Issue on an open-source compliance toolkit. Users want automated evidence from CI/CD and cloud APIs rather than monthly screenshot rituals.',
    keywords: [
      'compliance',
      'evidence',
      'CI',
      'automation',
      'screenshots',
      'feature request',
      'missing',
      'integration',
    ],
    theme: 'compliance-smb',
    signalKey: 'compliance.automation-gap',
  },

  // ---------- webhook-reliability ----------
  {
    id: 'p51',
    url: 'https://demo.invalid/forum/webhooks-silently-dropped',
    title: 'Webhooks silently dropped for 3 hours; customers found out before we did',
    snippet:
      'Incident write-up from a small API company. They lacked replay, dead-letter queues and per-endpoint health; they now hand-roll retries in every service.',
    keywords: [
      'webhooks',
      'dropped',
      'retry',
      'replay',
      'dead-letter',
      'reliability',
      'incident',
      'API',
      'pain',
    ],
    theme: 'webhook-reliability',
    signalKey: 'webhook.reliability-pain',
  },
  {
    id: 'p52',
    url: 'https://demo.invalid/pricing/webhook-service-tiers',
    title: 'Webhook delivery service pricing: usage tiers from $0 to $1,500/month',
    snippet:
      'Pricing page for a managed webhook delivery service. Free tier is generous; commenters note the product is well-regarded and widely adopted.',
    keywords: ['webhooks', 'pricing', 'service', 'delivery', 'tiers', 'managed', 'adopted'],
    theme: 'webhook-reliability',
    signalKey: 'webhook.incumbent-strong',
  },

  // ---------- noise: returned by search but not useful evidence ----------
  {
    id: 'p91',
    url: 'https://demo.invalid/listicle/top-50-saas-ideas',
    title: 'Top 50 SaaS ideas to build this year',
    snippet: 'A listicle of generic startup ideas with no sources, data or user quotes.',
    keywords: ['ideas', 'SaaS', 'build', 'startup', 'developers', 'opportunity', 'trend', 'market'],
    theme: null,
    signalKey: null,
  },
  {
    id: 'p92',
    url: 'https://demo.invalid/ad/developer-productivity-course',
    title: 'Become a 10x developer with this course',
    snippet: 'Promotional landing page for a video course. No market or user evidence.',
    keywords: ['developers', 'productivity', 'course', 'tools', 'workflow', 'coding'],
    theme: null,
    signalKey: null,
  },
];

export function findDemoPageByUrl(url: string): DemoPage | undefined {
  return DEMO_PAGES.find((p) => p.url === url);
}
