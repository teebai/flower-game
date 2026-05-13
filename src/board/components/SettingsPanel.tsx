import React, { useState } from 'react';

interface StatSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function StatSlider({ label, value, onChange }: StatSliderProps) {
  return (
    <div className="stat-slider">
      <div className="stat-slider-header">
        <span className="stat-slider-label">{label}</span>
        <span className="stat-slider-value">{value}</span>
      </div>
      <div className="stat-slider-track-wrap">
        <div className="stat-slider-track">
          <div className="stat-slider-fill" style={{ width: `${(value / 5) * 100}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="stat-slider-input"
          aria-label={label}
        />
        <div className="stat-slider-dots">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <button
              key={i}
              type="button"
              className={`stat-slider-dot ${i <= value ? 'is-active' : ''}`}
              onClick={() => onChange(i)}
              aria-label={`${label} ${i}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const SettingsPanel = React.memo(function SettingsPanel() {
  const [luck, setLuck] = useState(0);
  const [magic, setMagic] = useState(0);
  const [def, setDef] = useState(0);

  return (
    <div className="settings-panel">
      <StatSlider label="Luck" value={luck} onChange={setLuck} />
      <StatSlider label="Magic" value={magic} onChange={setMagic} />
      <StatSlider label="Def" value={def} onChange={setDef} />
    </div>
  );
});
