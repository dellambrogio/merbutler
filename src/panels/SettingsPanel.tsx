import type { JSX } from 'react';
import { WindowPanel, PanelSection } from './Panel';
import { DEFAULT_SETTINGS, resetSettings, saveSettings, SETTING_INFO, useSettings, type Settings, type SettingInfo } from '../core/settings';

const KEYS = Object.keys(SETTING_INFO) as Array<keyof Settings>;
const GROUPS = [...new Set(KEYS.map((k) => SETTING_INFO[k].group))];

/** The Settings panel: the app settings. Each change applies and is stored at once. */
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const settings = useSettings();
  const allDefault = KEYS.every((k) => settings[k] === DEFAULT_SETTINGS[k]);

  return (
    <WindowPanel
      open={open}
      onClose={onClose}
      className="settings"
      title="Settings"
      hint="Changes apply at once and are kept in this browser."
      foot={
        <>
          <button onClick={() => resetSettings()} disabled={allDefault} title="Put every setting back to its default">
            Reset to defaults
          </button>
          <span className="spacer" />
          <button onClick={onClose}>Done</button>
        </>
      }
    >
      {GROUPS.map((group) => (
        <PanelSection key={group} title={group}>
          {KEYS.filter((k) => SETTING_INFO[k].group === group).map((key) => (
            <SettingRow key={key} id={key} info={SETTING_INFO[key]} value={settings[key]} />
          ))}
        </PanelSection>
      ))}
    </WindowPanel>
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
