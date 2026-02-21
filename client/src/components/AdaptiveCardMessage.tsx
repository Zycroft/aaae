import { useRef, useEffect, useState } from 'react';
import * as AdaptiveCards from 'adaptivecards';
import type { TranscriptMessage } from '../hooks/useChatApi.js';

interface AdaptiveCardMessageProps {
  message: TranscriptMessage; // kind === 'adaptiveCard'
  onCardAction: (
    cardId: string,
    userSummary: string,
    submitData: Record<string, unknown>
  ) => void;
}

/**
 * Renders an Adaptive Card from the SDK using useRef/useEffect.
 * NOT using adaptivecards-react (banned — React 18 incompatible).
 *
 * Features:
 * - Renders cardJson via AdaptiveCards v3 SDK into a DOM container
 * - onExecuteAction handler extracts submitData and fires onCardAction
 * - Single-submit guard (submittedRef) prevents double-fire
 * - submitted state disables card and shows pending overlay (UI-08)
 * - Card overflow: max-width 100% with overflow-x: auto (360px support)
 * - Error boundary: render failures show inline error message
 *
 * UI-06, UI-07, UI-08
 */
export function AdaptiveCardMessage({ message, onCardAction }: AdaptiveCardMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Use ref for submitted guard to prevent stale closure on first click
  const submittedRef = useRef(false);
  // Use state for visual feedback
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !message.cardJson) return;

    const ac = new AdaptiveCards.AdaptiveCard();

    ac.hostConfig = new AdaptiveCards.HostConfig({
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    });

    ac.onExecuteAction = (action) => {
      // Single-submit guard — ref avoids stale closure
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitted(true);

      const submitData: Record<string, unknown> = {
        action: action.getJsonTypeName(),
      };

      if (action.getJsonTypeName() === 'Action.Submit') {
        const submitAction = action as AdaptiveCards.SubmitAction;
        const data = submitAction.data;
        if (data && typeof data === 'object') {
          Object.assign(submitData, data);
        }
      } else if (action.getJsonTypeName() === 'Action.OpenUrl') {
        const openUrlAction = action as AdaptiveCards.OpenUrlAction;
        submitData.url = openUrlAction.url;
      }

      // Derive userSummary from card title or first TextBlock, fallback to cardId
      const cardJson = message.cardJson as {
        title?: string;
        body?: Array<{ type: string; text?: string }>;
      };
      const cardTitle =
        cardJson?.title ??
        cardJson?.body?.find((el) => el.type === 'TextBlock')?.text ??
        `Card ${message.cardId ?? 'unknown'}`;

      onCardAction(message.cardId ?? '', `Submitted: ${cardTitle}`, submitData);
    };

    try {
      ac.parse(message.cardJson);
      const rendered = ac.render();
      if (rendered && containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(rendered);
      }
    } catch (err) {
      console.error('[AdaptiveCardMessage] Failed to render card:', err);
      if (containerRef.current) {
        containerRef.current.innerHTML =
          '<p class="cardRenderError">Card failed to render.</p>';
      }
    }

    return () => {
      if (containerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        containerRef.current.innerHTML = '';
      }
    };
  }, [message.cardJson, message.cardId]);
  // Note: onCardAction deliberately omitted from deps — it's a callback that
  // should not trigger card re-render; onExecuteAction captures it via closure.

  return (
    <div className={`adaptiveCardWrapper${submitted ? ' submitted' : ''}`}>
      {submitted && (
        <div className="cardPendingOverlay" aria-live="polite" aria-atomic="true">
          Submitting…
        </div>
      )}
      <div
        ref={containerRef}
        className="adaptiveCardContainer"
        aria-label="Interactive card"
      />
    </div>
  );
}
