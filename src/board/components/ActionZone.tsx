import React from 'react';

interface ActionZoneProps {
  visible: boolean;
  canDouble: boolean;
  doubleLabel?: string;
  onCancel: () => void;
  onDouble: () => void;
  onConfirm: () => void;
}

export const ActionZone = React.memo(function ActionZone({
  visible,
  canDouble,
  doubleLabel = '×2',
  onCancel,
  onDouble,
  onConfirm,
}: ActionZoneProps) {
  if (!visible) return null;

  return (
    <div className="action-zone">
      <button
        className="action-zone-btn action-zone-btn--cancel"
        onClick={onCancel}
        aria-label="Cancel"
        type="button"
      >
        ✗
      </button>
      {canDouble && (
        <button
          className="action-zone-btn action-zone-btn--double"
          onClick={onDouble}
          aria-label={doubleLabel}
          type="button"
        >
          {doubleLabel}
        </button>
      )}
      <button
        className="action-zone-btn action-zone-btn--confirm"
        onClick={onConfirm}
        aria-label="Confirm"
        type="button"
      >
        ✓
      </button>
    </div>
  );
});
