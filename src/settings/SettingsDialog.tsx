import { useEffect, useRef, type JSX } from 'react';
import { DEFAULT_SETTINGS, resetSettings, saveSettings, SETTING_INFO, useSettings, type Settings, type SettingInfo } from '../core/settings';

const KEYS = Object.keys(SETTING_INFO) as Array<keyof Settings>;
const GROUPS = [...new Set(KEYS.map((k) => SETTING_INFO[k].group))];

/** The app settings, in a modal dialog. Each change applies and is stored at once. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const settings = useSettings();
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  const allDefault = KEYS.every((k) => settings[k] === DEFAULT_SETTINGS[k]);

  return (
    <dialog
      ref={dialog}
      className="about settings"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="about-body">
        <div className="about-head">
          <h2 id="settings-title">Settings</h2>
          <span className="spacer" />
          <button onClick={onClose} aria-label="Close" title="Close (Esc)">
            ✕
          </button>
        </div>
        <p className="muted settings-note">Changes apply at once and are kept in this browser.</p>
        {GROUPS.map((group) => (
          <fieldset key={group} className="settings-group">
            <legend>{group}</legend>
            {KEYS.filter((k) => SETTING_INFO[k].group === group).map((key) => (
              <SettingRow key={key} id={key} info={SETTING_INFO[key]} value={settings[key]} />
            ))}
          </fieldset>
        ))}
        <div className="settings-foot">
          <button onClick={() => resetSettings()} disabled={allDefault} title="Put every setting back to its default">
            Reset to defaults
          </button>
          <span className="spacer" />
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </dialog>
  );
}

function SettingRow({ id, info, value }: { id: keyof Settings; info: SettingInfo; value: Settings[keyof Settings] }): JSX.Element {
  const inputId = `setting-${id}`;
  const set = (v: unknown): void => void saveSettings({ [id]: v } as Partial<Settings>);
  return (
    <div className="settings-row">
      <label htmlFor={inputId} className="settings-label">
        {info.label}
      </label>
      <div className="settings-control">
        {info.kind === 'boolean' && <input id={inputId} type="checkbox" checked={value as boolean} onChange={(e) => set(e.target.checked)} />}
        {info.kind === 'choice' && (
          <span className="settings-choices" role="radiogroup" aria-label={info.label} id={inputId}>
            {info.choices.map((c) => (
              <button key={c.value} role="radio" aria-checked={value === c.value} className={value === c.value ? 'selected' : ''} onClick={() => set(c.value)}>
                {c.label}
              </button>
            ))}
          </span>
        )}
        {info.kind === 'number' && (
          <>
            <input id={inputId} type="range" min={info.min} max={info.max} step={info.step} value={value as number} onChange={(e) => set(Number(e.target.value))} />
            <span className="settings-value">
              {value as number}
              {info.unit === '×' ? '×' : info.unit ? ` ${info.unit}` : ''}
            </span>
          </>
        )}
      </div>
      <p className="settings-description muted">{info.description}</p>
    </div>
  );
}
