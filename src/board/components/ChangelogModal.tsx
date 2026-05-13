import React from 'react';

interface ChangelogModalProps {
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

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v2.0.0',
    date: '2026-05-13',
    changes: [
      'Redesigned game menu with hamburger dropdown',
      'Added Settings panel with Luck / Magic / Def sliders',
      'Added Bug Report modal',
      'Added Changelog modal',
      'Wind now resolves immediately (no counter window)',
      'Global cards (Season, Eclipse, Great Reset, Let Go) auto-cast on drag release',
      'Autumn Bug supports multi-select (pick exactly 2 flowers)',
      'New ActionZone floating panel for move confirmation',
      'Discard pile firework animation with season-colored glow',
      'Turn info bar with timer, moves, and God\'s Favourite crown',
      'Counter window redesign with auto-allow timer',
      'Physics-based garden layout with spring animations',
    ],
  },
  {
    version: 'v1.5.0',
    date: '2026-04-20',
    changes: [
      'Added card drag-and-drop with hover feedback',
      'Garden flowers scale on hover, neighbors push away',
      'Wind ×2 multi-select mode for targeting up to 4 flowers',
      'Dynamic arena auto-zoom based on player count',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-03-01',
    changes: [
      'Initial release of Flower Game v2',
      'Boardgame.io multiplayer backend',
      '6-player support with turn timer',
      'Season system with special effects',
      'Power cards: Wind, Bug, Bee, Double Happiness, Trade Present, Trade Fate',
      'Divine Protection and counter mechanics',
      'God\'s Favourite win condition',
    ],
  },
];

export const ChangelogModal = React.memo(function ChangelogModal({
  isOpen, theme, onClose,
}: ChangelogModalProps) {
  if (!isOpen) return null;

  return (
    <div className="v2-modal-backdrop" onClick={onClose}>
      <div
        className="v2-modal"
        style={{ background: theme.panel, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="v2-modal-header" style={{ borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontWeight: 700, color: theme.text }}>ℹ️ Changelog</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="v2-modal-body changelog-body" style={{ color: theme.text }}>
          {CHANGELOG.map(entry => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-version-row">
                <span className="changelog-version">{entry.version}</span>
                <span className="changelog-date" style={{ color: theme.muted }}>{entry.date}</span>
              </div>
              <ul className="changelog-list">
                {entry.changes.map((change, i) => (
                  <li key={i} className="changelog-item" style={{ color: theme.muted }}>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
