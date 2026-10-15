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
  /** Full readable page text served by the FixturePageFetcher. Undefined = simulated fetch failure. */
  text?: string;
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
    text: 'Every time I switch coding agents I have to re-explain my whole project. Posted in the developer tools forum. I keep a CONTEXT.md with the architecture notes, our naming conventions and the decisions we made, and I paste it into every new session of every agent. Reply from maintainer_jo: same here, we have a hand-maintained CONTEXT.md and it goes stale every week. Reply from dev_sam: I ended up writing a shell script that concatenates our docs and copies them to the clipboard before I open a new session. 140 replies in this thread. The recurring theme is that session context does not survive switching tools and nobody wants to re-type architecture decisions.',
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
    text: 'We maintain three different memory files for three different AI coding tools. Our team uses several agents depending on the task, which means CLAUDE.md, AGENTS.md and .cursorrules all describe the same project. They drift. Last month two of them disagreed about which test runner to use. We now run a weekly diff script that compares the three memory files and posts the differences to our chat channel so someone can reconcile them by hand. This is obviously a workaround and not a solution.',
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
    text: 'Feature request: export session context so another agent can continue. Opened 7 months ago. 312 upvotes. Body: when I hit a limitation in one tool I want to hand the current task, decisions and working notes to a different agent without re-explaining everything. Maintainer response: this is not on the roadmap; session state is internal and we do not plan to expose it. Several commenters link their own export scripts that scrape the session log into a markdown summary.',
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
    text: 'Draft spec for sharing project context between AI coding tools published. A working group released a draft interchange format for project memory, covering architecture notes, conventions and a decision log. Two tool vendors said they would evaluate it. None has committed to shipping support. The draft is explicitly experimental and may change.',
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
    text: 'Annual developer survey 2026, n=4,800 self-selected respondents. 61% of respondents report using two or more AI coding assistants in a typical week, up from 38% last year. When asked about frustrations, keeping tools in sync about my project ranked second, behind cost. Methodology note: respondents were recruited through newsletters and social media, so the sample skews toward early adopters.',
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
    text: 'We spent 4 months on sync and still have conflict bugs. We are a 3-person team building a note-taking app with offline support. We hand-rolled a CRDT layer and keep finding edge cases around deletes and concurrent moves. What do small teams actually use for offline sync without a dedicated infra person?',
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
    text: 'Realtime sync platform pricing. Free: 1 project, 100 monthly active users. Team plan: starts at $499 per month billed annually, includes 10 projects and 10,000 monthly active users. Enterprise: contact sales.',
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
    text: 'Hosted sync service announces shutdown. We are winding down the service. Customers have 90 days to migrate their data. Comment thread: is there a self-hostable alternative? Another customer: we need a migration path by the end of the quarter, any recommendations?',
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
    text: 'SQLite in the browser is now fast enough to be the primary store. Benchmark: a WASM SQLite build with OPFS persistence handles a 50,000-row table with sub-10ms queries on a mid-range laptop. This makes local-first architectures practical without writing a custom storage engine.',
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
    text: 'How are solo devs doing metered billing without a billing team? I run a cron job that aggregates usage into a spreadsheet and then I manually create invoice line items at the end of the month. I have double-charged customers twice because of a copy-paste mistake. Reply: same setup here, plus a second spreadsheet to track credits. It is error-prone and I dread the first of the month.',
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
    text: 'Billing platform pricing: 0.8% of revenue processed plus a $2,000 per month minimum commitment. Linked thread comment: a $2,000 per month minimum is a non-starter for anyone under $300k ARR.',
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
    text: 'Payments API changelog. New: first-class meter objects for usage-based billing. Deprecated: the usage-record endpoint, with a 12-month sunset. A migration guide (40 pages) explains how to move existing usage records to meter events.',
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
    text: 'Marketplace category: billing and metering plugins. 214 listings. Billing/metering is one of the fastest-growing categories this year. The top plugins show five-figure weekly installs and several are paid add-ons with monthly subscriptions.',
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
    text: 'Our LLM bill tripled in a week and nobody could tell which feature caused it. Post-mortem from a 6-person startup. We had no per-feature attribution of token spend. We now tag every call by hand with a feature name and export the logs to a spreadsheet every week to find regressions.',
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
    text: 'LLM observability vendor pricing: contact sales. Reported deals on this review site start at about $30,000 per year. Small-team reviewers say the free tier drops traces after 7 days which makes it useless for monthly cost reviews.',
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
    text: 'Three model providers cut prices again this quarter; per-token pricing now changes roughly monthly. Teams quoted in this roundup say the hard-coded cost tables in their internal dashboards are chronically stale.',
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
    text: 'SOC 2 quotes for a 10-person startup. We got quotes between $25,000 and $60,000 from compliance automation vendors before even paying the auditor. Reply: we do evidence collection manually in a shared folder to avoid the platform fee. Reply: same, screenshots once a month.',
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
    text: 'Procurement survey: 72% of enterprise buyers now require a SOC 2 report or equivalent security attestation from vendors with fewer than 50 employees before starting a pilot, up from 44% two years earlier.',
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
    text: 'Feature request: integrate evidence collection with our CI instead of screenshots. We want automated evidence from CI/CD pipelines and cloud provider APIs rather than the monthly screenshot ritual. 48 thumbs up.',
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
    text: 'Webhooks silently dropped for 3 hours; customers found out before we did. Incident write-up. We had no replay, no dead-letter queue and no per-endpoint health view. Every service now hand-rolls its own retry logic.',
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
    text: 'Webhook delivery service pricing: Free tier up to 50,000 messages per month. Growth: $250 per month. Scale: $1,500 per month. Comments: this product is well-regarded and widely adopted; the free tier covers most small companies.',
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
