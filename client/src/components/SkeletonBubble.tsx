/**
 * Animated skeleton placeholder shown while the bot is responding.
 * Appears as a bot-side avatar + shimmer rectangle with typing dots.
 *
 * UI-04
 */
export function SkeletonBubble() {
  return (
    <div className="skeletonBubble" aria-label="Bot is typing..." role="status">
      <div className="skeletonAvatar" aria-hidden="true" />
      <div className="skeleton" aria-hidden="true" />
    </div>
  );
}
