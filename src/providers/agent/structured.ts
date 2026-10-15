import { z, type ZodType } from 'zod';
import { AgentProviderError } from './AgentProvider';

/** Build a JSON Schema for a Zod output schema (Zod 4 built-in converter). */
export function jsonSchemaFor(schema: ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Parse provider output into the op schema, raising a typed malformed_output error on failure. */
export function parseOutput<O>(provider: string, schema: ZodType<O>, raw: unknown): O {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(stripFences(raw));
    } catch {
      throw new AgentProviderError(
        'Agent returned non-JSON output',
        provider,
        'malformed_output',
        true,
        raw.slice(0, 500),
      );
    }
  }
  const res = schema.safeParse(value);
  if (!res.success) {
    throw new AgentProviderError(
      `Agent output failed schema validation: ${res.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      provider,
      'malformed_output',
      true,
      res.error.issues,
    );
  }
  return res.data;
}

function stripFences(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m?.[1] ?? t;
}
