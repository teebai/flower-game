import React, { useRef, useState, useEffect, useCallback } from 'react';
import { SettingsPanel } from './SettingsPanel';

interface GameMenuProps {
  theme: {
    panel: string;
    panelSoft: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
  };
  onResume: () => void;
  onSettings: () => void;
  onRules: () => void;
  onBugReport: () => void;
  onChangelog: () => void;
  onQuit: () => void;
}

export const GameMenu = React.memo(function GameMenu({
  theme, onResume, onRules, onBugReport, onChangelog, onQuit,
}: GameMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isOpen]);

  const handle = useCallback((fn: () => void, closeSettings = true) => {
    if (closeSettings) setSettingsOpen(false);
    setIsOpen(false);
    fn();
  }, []);

  return (
    <div ref={containerRef} className="game-menu">
      <button
        className={`game-menu-toggle ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(o => !o)}
        aria-label="Menu"
        aria-expanded={isOpen}
        type="button"
        style={{ color: theme.text }}
      >
        <span className="game-menu-burger" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {isOpen && (
        <div className="game-menu-panel" role="menu">
          <button className="game-menu-item" onClick={() => handle(onResume)} role="menuitem" type="button">
            <span className="game-menu-icon">▶</span>
            <span className="game-menu-label">Resume</span>
          </button>

          <button
            className={`game-menu-item ${settingsOpen ? 'is-active' : ''}`}
            onClick={() => setSettingsOpen(s => !s)}
            role="menuitem"
            type="button"
          >
            <span className="game-menu-icon">⚙️</span>
            <span className="game-menu-label">Settings</span>
            <span className="game-menu-chevron" aria-hidden="true">{settingsOpen ? '▾' : '▸'}</span>
          </button>

          {settingsOpen && (
            <div className="game-menu-submenu">
              <SettingsPanel />
            </div>
          )}

          <button className="game-menu-item" onClick={() => handle(onRules)} role="menuitem" type="button">
            <span className="game-menu-icon">📜</span>
            <span className="game-menu-label">Rules</span>
          </button>

          <button className="game-menu-item" onClick={() => handle(onBugReport)} role="menuitem" type="button">
            <span className="game-menu-icon">🐛</span>
            <span className="game-menu-label">Bug Report</span>
          </button>

          <button className="game-menu-item" onClick={() => handle(onChangelog)} role="menuitem" type="button">
            <span className="game-menu-icon">ℹ️</span>
            <span className="game-menu-label">v2.0.0</span>
          </button>

          <div className="game-menu-divider" />

          <button className="game-menu-item game-menu-item--danger" onClick={() => handle(onQuit)} role="menuitem" type="button">
            <span className="game-menu-icon">🚪</span>
            <span className="game-menu-label">Quit Room</span>
          </button>
        </div>
      )}
    </div>
  );
});
