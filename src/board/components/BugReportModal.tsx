import React, { useState } from 'react';

interface BugReportModalProps {
  isOpen: boolean;
  theme: {
    panel: string;
    panelSoft: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  };
  onClose: () => void;
}

const CATEGORIES = [
  'Gameplay Bug',
  'Visual / UI Glitch',
  'Connection Issue',
  'Crash / Freeze',
  'Other',
];

export const BugReportModal = React.memo(function BugReportModal({
  isOpen, theme, onClose,
}: BugReportModalProps) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('description', description);
      if (screenshot) formData.append('screenshot', screenshot);
      await fetch('/bug-report', { method: 'POST', body: formData });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setDescription('');
        setScreenshot(null);
        setCategory(CATEGORIES[0]);
        onClose();
      }, 1200);
    } catch {
      // Silently fail — user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="v2-modal-backdrop" onClick={onClose}>
      <div
        className="v2-modal"
        style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="v2-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 700, color: theme.text }}>🐛 Report a Bug</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="v2-modal-body" style={{ color: theme.text }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#4ecca3', fontWeight: 700 }}>
              ✅ Thank you! Report sent.
            </div>
          ) : (
            <div className="bug-report-form">
              <label className="bug-report-field">
                <span className="bug-report-label" style={{ color: theme.muted }}>Category</span>
                <select
                  className="bug-report-select"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ background: theme.panelSoft, color: theme.text, border: `1px solid ${theme.border}` }}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label className="bug-report-field">
                <span className="bug-report-label" style={{ color: theme.muted }}>Description</span>
                <textarea
                  className="bug-report-textarea"
                  rows={4}
                  placeholder="Describe what happened..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  style={{ background: theme.panelSoft, color: theme.text, border: `1px solid ${theme.border}` }}
                />
              </label>

              <label className="bug-report-field">
                <span className="bug-report-label" style={{ color: theme.muted }}>Screenshot (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
                  className="bug-report-file"
                  style={{ color: theme.text }}
                />
                {screenshot && (
                  <span className="bug-report-file-name" style={{ color: theme.muted }}>
                    {screenshot.name}
                  </span>
                )}
              </label>

              <div className="bug-report-actions">
                <button
                  className="bug-report-btn bug-report-btn--secondary"
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="bug-report-btn bug-report-btn--primary"
                  onClick={handleSubmit}
                  disabled={!description.trim() || submitting}
                  type="button"
                >
                  {submitting ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
