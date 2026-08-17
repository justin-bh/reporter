import { useEffect, useState } from 'react';
import { Badge, Button, Field, Input, Select, useToast } from '@reporter/ui';
import type { DesktopSettings, EngagementLite } from '../../../shared/types.js';

export function SettingsView() {
  const toast = useToast();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secret, setSecret] = useState('');
  const [captureCommand, setCaptureCommand] = useState('');
  const [engagements, setEngagements] = useState<EngagementLite[]>([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.reporter.getSettings().then((s) => {
      setSettings(s);
      setServerUrl(s.serverUrl);
      setAccessKey(s.accessKey);
      setCaptureCommand(s.captureCommand);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { serverUrl, accessKey, captureCommand };
      if (secret) patch.secret = secret;
      const next = await window.reporter.saveSettings(patch);
      setSettings(next);
      setSecret('');
      toast.success('Settings saved');
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      // Persist first so the test uses the latest values.
      const patch: Record<string, unknown> = { serverUrl, accessKey, captureCommand };
      if (secret) patch.secret = secret;
      await window.reporter.saveSettings(patch);
      setSecret('');
      const res = await window.reporter.testConnection();
      if (res.ok) {
        toast.success(`Connected as ${res.user}`);
        setEngagements(await window.reporter.listEngagements());
      } else {
        toast.error(res.error ?? 'Connection failed');
      }
    } finally {
      setTesting(false);
    }
  }

  async function pickEngagement(slug: string) {
    const next = await window.reporter.setEngagement(slug || null);
    setSettings(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text">Server</h2>
        <Field label="Server URL" htmlFor="url" hint="e.g. http://reporter.lan:8080">
          <Input
            id="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8080"
          />
        </Field>
        <Field label="Access key" htmlFor="ak">
          <Input
            id="ak"
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field
          label="Secret key"
          htmlFor="sk"
          hint={
            settings?.hasSecret
              ? 'A secret is stored. Enter a new one to replace it.'
              : 'From Account → API keys in the web UI.'
          }
        >
          <Input
            id="sk"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={settings?.hasSecret ? '•••••••• (stored)' : ''}
            className="font-mono"
          />
        </Field>
        {settings?.weakSecretStorage && (
          <p className="text-xs text-warning">
            ⚠ No system keyring detected — the secret is stored with weak encryption on this
            machine.
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={test} loading={testing}>
            Test connection
          </Button>
          <Button size="sm" onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-text">Current engagement</h2>
        {engagements.length === 0 ? (
          <p className="text-xs text-muted">Test the connection to load engagements.</p>
        ) : (
          <Select
            value={settings?.currentEngagementSlug ?? ''}
            onChange={(e) => pickEngagement(e.target.value)}
          >
            <option value="">— none —</option>
            {engagements.map((eng) => (
              <option key={eng.slug} value={eng.slug}>
                {eng.name}
              </option>
            ))}
          </Select>
        )}
        {settings?.currentEngagementSlug && (
          <div className="text-xs text-muted">
            Capturing to <Badge tone="accent">{settings.currentEngagementSlug}</Badge>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-text">Capture</h2>
        <Field
          label="Capture command"
          htmlFor="cc"
          hint="Used on Linux/Windows. Use $FILE for the output path. macOS uses the native tool."
        >
          <Input
            id="cc"
            value={captureCommand}
            onChange={(e) => setCaptureCommand(e.target.value)}
            className="font-mono"
          />
        </Field>
        {settings && !settings.globalShortcutsAvailable ? (
          <p className="text-xs text-warning">
            ⚠ Global hotkeys don't work under Wayland. Use the tray menu, or bind a system shortcut
            (Settings → Keyboard) to <code>reporter --capture-area</code> or{' '}
            <code>reporter --capture-window</code>.
          </p>
        ) : (
          <p className="text-xs text-muted">
            Global hotkeys default to ⌘/Ctrl+Shift+7 (area) and +8 (window).
          </p>
        )}
      </section>
    </div>
  );
}
