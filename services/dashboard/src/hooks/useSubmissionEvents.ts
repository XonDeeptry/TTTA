import { useEffect, useRef } from 'react';

export interface SubmissionStatusEvent {
  submissionId: number;
  status: string;
  at: string;
}

/**
 * Subscribes to the dashboard-wide submission status SSE stream
 * (`GET /api/events/submissions`, session-cookie auth, named event
 * `submission.status`) and invokes `onEvent` for each parsed frame.
 *
 * Additive only: does not manage any REST fetch itself, does not
 * surface connection state, and does not retry manually — native
 * `EventSource` reconnect handles that. If `EventSource` is unavailable
 * in the browser, this hook is a no-op.
 */
export function useSubmissionEvents(onEvent: (evt: SubmissionStatusEvent) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const es = new EventSource('/api/events/submissions');

    function handleMessage(e: MessageEvent<string>): void {
      try {
        const parsed = JSON.parse(e.data) as SubmissionStatusEvent;
        onEventRef.current(parsed);
      } catch {
        // Malformed frame — ignore, never crash the page.
      }
    }

    es.addEventListener('submission.status', handleMessage as EventListener);

    return () => {
      es.removeEventListener('submission.status', handleMessage as EventListener);
      es.close();
    };
  }, []);
}
