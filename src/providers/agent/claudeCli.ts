/**
 * ClaudeCliAgentProvider — isolates the Claude Code CLI behind the AgentProvider boundary.
 *
 * Contract verified against `claude --help` (2.1.x):
 *   claude -p --output-format json --json-schema <schema> --tools "" --no-session-persistence \
 *          --setting-sources "" --model <alias> <prompt>
 * The result object carries `structured_output` (already schema-validated by the CLI). The prompt
 * is passed via stdin to keep large payloads off the argv. No tools are enabled, so the CLI acts
 * purely as a structured reasoning call. We never read or store the model's reasoning.
 */
import { spawn } from 'node:child_process';
import type { AgentOperation, AgentProvider, AgentRunResult } from './AgentProvider';
import { AgentProviderError } from './AgentProvider';
import { jsonSchemaFor, parseOutput } from './structured';

export interface ClaudeCliConfig {
  bin: string;
  model: string;
  timeoutMs?: number;
}

export class ClaudeCliAgentProvider implements AgentProvider {
  readonly name = 'claude-cli';
  readonly isDemo = false;

  constructor(private readonly cfg: ClaudeCliConfig) {}

  async run<I, O>(op: AgentOperation<I, O>, input: I): Promise<AgentRunResult<O>> {
    const { system, user } = op.buildPrompt(input);
    const schema = jsonSchemaFor(op.output);
    const args = [
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--tools',
      '',
      '--no-session-persistence',
      '--setting-sources',
      '',
      '--model',
      this.cfg.model,
      '--system-prompt',
      system,
    ];
    const { stdout, stderr, exitCode } = await this.exec(args, user, this.cfg.timeoutMs ?? 300_000);
    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new AgentProviderError(
        `claude CLI returned no JSON (exit ${exitCode}): ${stderr.slice(0, 300) || stdout.slice(0, 300)}`,
        this.name,
        exitCode === 0 ? 'malformed_output' : 'unavailable',
        false,
      );
    }
    const result = Array.isArray(parsed) ? parsed.find((m: any) => m?.type === 'result') : parsed;
    if (!result)
      throw new AgentProviderError('claude CLI result message missing', this.name, 'malformed_output', true);
    if (result.is_error) {
      const msg = String(result.result ?? result.error ?? 'unknown error');
      const auth = /auth|login|api key|credential/i.test(msg);
      throw new AgentProviderError(
        `claude CLI error: ${msg.slice(0, 300)}`,
        this.name,
        auth ? 'auth' : 'unknown',
        false,
      );
    }
    const raw = result.structured_output ?? result.result;
    const output = parseOutput(this.name, op.output, raw);
    return {
      output,
      provider: this.name,
      meta: {
        model: this.cfg.model,
        costUsd: result.total_cost_usd,
        durationMs: result.duration_ms,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
      },
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const { stdout, exitCode } = await this.exec(['--version'], '', 15_000);
      return exitCode === 0
        ? { ok: true, message: `claude-cli ${stdout.trim()} (model ${this.cfg.model})` }
        : { ok: false, message: `claude --version exited ${exitCode}` };
    } catch (err) {
      return { ok: false, message: `claude CLI unavailable: ${(err as Error).message}` };
    }
  }

  private exec(args: string[], stdin: string, timeoutMs: number) {
    return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
      // Running inside a Claude Code session sets CLAUDECODE; a nested CLI must not inherit it.
      const env = { ...process.env };
      delete env.CLAUDECODE;
      delete env.CLAUDE_CODE_CHILD_SESSION;
      const child = spawn(this.cfg.bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new AgentProviderError(`claude CLI timed out after ${timeoutMs}ms`, this.name, 'timeout', true),
        );
      }, timeoutMs);
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(
          new AgentProviderError(`cannot start claude CLI: ${err.message}`, this.name, 'unavailable', false),
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      });
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    });
  }
}
