// TEMPORARILY DISABLED — returning null to test if overlay causes blank screen
export const ActionAnimationOverlay = memo(function ActionAnimationOverlay({ active, onComplete }: ActionAnimationOverlayProps) {
  useEffect(() => {
    if (active) {
      // Just dismiss immediately without rendering anything
      const timer = setTimeout(onComplete, 100);
      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);
  return null;
});
