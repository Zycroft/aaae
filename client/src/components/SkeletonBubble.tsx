/**
 * Animated skeleton placeholder shown while the bot is responding.
 * Appears as a bot-side avatar + shimmer rectangle with typing dots.
 *
 * UI-04
 */
export function SkeletonBubble() {
  return (
    <div className="skeletonBubble" aria-hidden="true" role="presentation">
      <div className="skeletonAvatar" aria-hidden="true" />
      <div className="skeleton" aria-hidden="true" />
    </div>
  );
}
