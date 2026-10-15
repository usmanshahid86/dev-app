/**
 * Minimal Markdown renderer (headings, paragraphs, lists, bold, code) with [F:<id>] finding markers
 * rendered as inspectable chips. No external dependency; the export files carry the full Markdown.
 */
import type { ReactNode } from 'react';
import { FindingChip } from './Inspector';
import type { Finding } from '@domain/types';

function inline(text: string, findings: Map<string, Finding>, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[F:([a-z0-9_]+)\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1])
      out.push(
        <FindingChip
          key={`${keyPrefix}-${i++}`}
          id={m[1]}
          inference={findings.get(m[1])?.kind === 'inference'}
        />,
      );
    else if (m[2]) out.push(<strong key={`${keyPrefix}-${i++}`}>{m[2]}</strong>);
    else if (m[3]) out.push(<code key={`${keyPrefix}-${i++}`}>{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, findings = [] }: { text: string; findings?: Finding[] }) {
  const map = new Map(findings.map((f) => [f.id, f]));
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(' '), map, `p${blocks.length}`)}</p>);
      para = [];
    }
    if (list.length) {
      blocks.push(
        <ul key={blocks.length}>
          {list.map((l, i) => (
            <li key={i}>{inline(l, map, `l${blocks.length}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      const lvl = h[1]!.length;
      const content = inline(h[2]!, map, `h${blocks.length}`);
      blocks.push(lvl <= 2 ? <h3 key={blocks.length}>{content}</h3> : <h4 key={blocks.length}>{content}</h4>);
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (para.length) flush();
      list.push(li[1]!);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return <div className="md">{blocks}</div>;
}
