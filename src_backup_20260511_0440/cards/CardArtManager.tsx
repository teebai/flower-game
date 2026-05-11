// ============================================================
// FLOWER GAME — CARD DESIGN MANAGER
// Modal UI for uploading / clearing / exporting card artwork.
// ============================================================

import { useRef, useState } from 'react';
import {
  FLOWER_KEYS, POWER_KEYS,
  cardArtKey, humanName, processImageFile, useCardArt,
  type CardArtKey,
} from './cardArt';
import { hasCustomArt } from './defaultCardArt';
import { FLOWER_EMOJI, POWER_EMOJI } from './cardUtils';
import type { Card, FlowerColor, PowerCardName } from '../types/gameTypes';

interface Props { onClose: () => void; }

function fakeFlower(color: FlowerColor): Card {
  return { id: `preview-${color}`, kind: 'flower', color, isWildcard: false };
}
function fakePower(name: PowerCardName): Card {
  return { id: `preview-${name}`, kind: 'power', name, isBlockable: false };
}

function placeholderEmoji(key: CardArtKey): string {
  if (key === 'back') return '🂠';
  const [kind, rest] = key.split(':');
  if (kind === 'flower') return FLOWER_EMOJI[rest] ?? '🌺';
  return POWER_EMOJI[rest] ?? '🃏';
}

const ALL_KEYS: { label: string; keys: CardArtKey[] }[] = [
  {
    label: 'Flowers',
    keys: FLOWER_KEYS.map(c => cardArtKey(fakeFlower(c))),
  },
  {
    label: 'Power cards',
    keys: POWER_KEYS.map(n => cardArtKey(fakePower(n))),
  },
  {
    label: 'Card back',
    keys: ['back'],
  },
];

export function CardArtManager({ onClose }: Props) {
  const { store, getArt, setArt, clearAll, exportJSON, importJSON } = useCardArt();
  const [busyKey, setBusyKey] = useState<CardArtKey | null>(null);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(key: CardArtKey, file: File | undefined) {
    if (!file) return;
    setError('');
    setBusyKey(key);
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Please choose an image file.');
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Image is too large (max 10 MB).');
      }
      const dataUrl = await processImageFile(file);
      setArt(key, dataUrl);
      setStatusMessage(`Saved ${humanName(key)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  function handleExport() {
    try {
      const blob = new Blob([exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flower-card-designs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage('Exported design pack.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const { imported } = importJSON(text);
      setStatusMessage(`Imported ${imported} card design${imported === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  function handleClearAll() {
    if (!window.confirm('Remove every uploaded card design?')) return;
    clearAll();
    setStatusMessage('All uploaded designs cleared.');
  }

  const filledCount = Object.keys(store).length;

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Card designs" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, margin: 0, color: 'var(--text)' }}>🎨 Card Designs</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Upload an image for each card. Designs are saved on this device. {filledCount} design{filledCount === 1 ? '' : 's'} set.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>✕ Close</button>
        </div>

        <div className="modal-body">
          {statusMessage && (
            <div style={{
              background: 'var(--panel-alt)', color: 'var(--accent)', padding: '8px 12px',
              borderRadius: 8, marginBottom: 10, fontSize: 13,
            }}>{statusMessage}</div>
          )}
          {error && (
            <div style={{
              background: '#4a1530', color: '#ff6b8a', padding: '8px 12px',
              borderRadius: 8, marginBottom: 10, fontSize: 13,
            }}>⚠️ {error}</div>
          )}

          <p style={{ color: 'var(--text-hint)', fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>
            Tip: Use portrait images (3:4 is ideal). Uploads are automatically resized to ~320 px to
            keep storage small. Use <b>Export</b> below to save a pack and share with other players —
            they can <b>Import</b> it to get the same designs.
          </p>

          {ALL_KEYS.map(section => (
            <section key={section.label}>
              <h3 className="card-tile-section-heading">{section.label}</h3>
              <div className="card-tile-grid">
                {section.keys.map(key => (
                  <CardTile
                    key={key}
                    cardKey={key}
                    art={getArt(key)}
                    hasCustom={hasCustomArt(store, key)}
                    busy={busyKey === key}
                    onUpload={file => handleUpload(key, file)}
                    onClear={() => setArt(key, null)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="modal-footer">
          <button className="icon-btn" onClick={handleExport} disabled={filledCount === 0}>
            ⬇️ Export Pack
          </button>
          <label className="icon-btn" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            ⬆️ Import Pack
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="file-hidden"
              onChange={e => void handleImport(e.target.files?.[0])}
            />
          </label>
          <button
            className="icon-btn"
            style={{ background: 'transparent', color: 'var(--danger)', marginLeft: 'auto' }}
            onClick={handleClearAll}
            disabled={filledCount === 0}
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}

interface CardTileProps {
  cardKey: CardArtKey;
  art: string | undefined;
  hasCustom: boolean;
  busy: boolean;
  onUpload: (file: File | undefined) => void;
  onClear: () => void;
}

function CardTile({ cardKey, art, hasCustom, busy, onUpload, onClear }: CardTileProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const name = humanName(cardKey);

  return (
    <div className="card-tile">
      <div className="preview" aria-label={name}>
        {art
          ? <img src={art} alt={name} />
          : <span className="placeholder" aria-hidden="true">{placeholderEmoji(cardKey)}</span>
        }
      </div>
      <div className="tile-name">{name}</div>
      <div className="tile-actions">
        <button
          type="button"
          className="primary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? '…' : art ? 'Replace' : 'Upload'}
        </button>
        {hasCustom && (
          <button type="button" className="danger" onClick={onClear} disabled={busy}>
            Reset
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="file-hidden"
        onChange={e => {
          onUpload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
