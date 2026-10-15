/**
 * Local, internal workflow telemetry. Events are persisted to the `events` table and never leave
 * the machine. No model reasoning, secrets or transcripts are captured — only structured workflow facts.
 * See docs/TELEMETRY.md for the event model.
 */
import type { Repositories } from '@db/repositories';
import type { EventType } from '@domain/types';
import { newId, nowIso } from '@domain/ids';

export class Telemetry {
  constructor(private readonly repos: Repositories) {}

  emit(type: EventType, projectId: string | null, payload: Record<string, unknown> = {}): void {
    try {
      this.repos.createEvent({ id: newId('event'), projectId, type, payload, createdAt: nowIso() });
    } catch (err) {
      // Telemetry must never break a workflow.
      console.warn('[telemetry] failed to record event', type, err);
    }
  }
}
