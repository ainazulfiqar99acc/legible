import '../ui/base';
import './receipt.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, fmtDuration } from '../ui/api';
import { Logo } from '../ui/icons';
import { CHECK_LABEL } from '../../shared/strings';
import type { Receipt } from '../../shared/types';

const KIND: Record<Receipt['kind'], string> = { call: 'Call', practice: 'Practice', replay: 'Replay' };

function ReceiptView() {
  const [r, setR] = useState<Receipt | null>(null);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void api().invoke('currentReceipt').then((v) => v && setR(v));
    void api().invoke('listReceipts').then(setHistory);
    return api().onReceipt((v) => {
      setR(v);
      setStatus('');
      void api().invoke('listReceipts').then(setHistory);
    });
  }, []);

  if (!r) return <div class="receipt"><p>No receipt yet.</p></div>;

  const keep = async () => {
    const k = await api().invoke('keepReceipt', r.id);
    if (k) {
      setR(k);
      setStatus('Kept. Find it again under Privacy.');
    }
  };
  const discard = async () => {
    await api().invoke('discardReceipt', r.id);
    window.close();
  };

  // F9: before/after — compare with the previous kept practice receipt
  const previousPractice = r.kind === 'practice' ? history.find((h) => h.kind === 'practice' && h.id !== r.id) : undefined;
  const trend = history.filter((h) => h.kind === 'call' && h.readablePct !== null).slice(0, 10);
  const when = new Date(r.startedAt);

  return (
    <div class="receipt">
      <header>
        <Logo size={36} onYellow />
        <div>
          <div class="label">Legible</div>
          <h1>Readability receipt</h1>
        </div>
      </header>
      <div class="meta mono">
        <span>{KIND[r.kind].toUpperCase()}</span>
        <span>
          {when.toISOString().slice(0, 10)} {when.toTimeString().slice(0, 5)}
        </span>
      </div>
      {r.kind === 'replay' && <p class="small">Synthetic demo data, not a real session.</p>}
      <hr class="dash" />
      <dl class="lines mono">
        <Row k="Session" v={fmtDuration(r.durationS)} />
        <Row k="Talk time" v={fmtDuration(r.talkS)} />
        <Row k="Tracked talk" v={fmtDuration(r.trackedTalkS)} />
        <Row k="Readable talk" v={fmtDuration(r.readableS)} />
      </dl>
      <hr class="dash" />
      <div class="big">
        <span class="label">Readable</span>
        <span class="mono pct">{r.readablePct === null ? '—' : `${r.readablePct}%`}</span>
      </div>
      <p class="small">Share of the time you talked, while Legible could see you, with no active issue.</p>
      <hr class="dash" />
      <dl class="lines mono">
        <Row k="Top issue" v={r.topIssue ? CHECK_LABEL[r.topIssue].toUpperCase() : 'NONE'} />
        {r.issues.map((l) => (
          <Row key={l.check} k={`  ${CHECK_LABEL[l.check]}`} v={`${fmtDuration(l.seconds)}  ×${l.nudges}`} />
        ))}
        <Row k="Nudges" v={String(r.nudgeCount)} />
      </dl>
      <hr class="dash" />
      <div class="tip">
        <div class="label">One tip</div>
        <p>{r.tip}</p>
      </div>

      {previousPractice && (
        <>
          <hr class="dash" />
          <div class="label">Before / after</div>
          <table class="cmp mono">
            <thead>
              <tr>
                <th />
                <th>Before</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Readable</td>
                <td>{previousPractice.readablePct ?? '—'}%</td>
                <td>{r.readablePct ?? '—'}%</td>
              </tr>
              <tr>
                <td>Nudges</td>
                <td>{previousPractice.nudgeCount}</td>
                <td>{r.nudgeCount}</td>
              </tr>
              <tr>
                <td>Top issue</td>
                <td>{previousPractice.topIssue ? CHECK_LABEL[previousPractice.topIssue] : '—'}</td>
                <td>{r.topIssue ? CHECK_LABEL[r.topIssue] : '—'}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {trend.length > 1 && (
        <>
          <hr class="dash" />
          <div class="label">Last {trend.length} kept calls</div>
          <p class="mono small">{trend.map((t) => `${t.readablePct}%`).join('  ')}</p>
        </>
      )}

      <hr class="dash" />
      <p class="mono small center">Numbers only. No video, no audio.</p>
      <div class="actions no-print">
        <button class="btn" type="button" onClick={() => void api().invoke('printReceipt')}>
          Print
        </button>
        <button class="btn primary" type="button" onClick={keep} disabled={r.kept}>
          {r.kept ? 'Kept' : 'Keep'}
        </button>
        <button class="btn" type="button" onClick={discard}>
          Discard
        </button>
      </div>
      {status && (
        <p class="small no-print" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div class="row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

render(<ReceiptView />, document.getElementById('app')!);
