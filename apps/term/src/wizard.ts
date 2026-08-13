import * as p from '@clack/prompts';
import {
  defaultOutputDir,
  defaultShell,
  saveConfig,
  type TermConfig,
} from './config.js';
import { makeClient } from './client.js';
import { banner, sym } from './theme.js';

/** Interactive first-run (or re-run) setup. Returns the saved config, or null if cancelled. */
export async function runWizard(existing?: TermConfig | null): Promise<TermConfig | null> {
  p.intro(banner());

  const serverUrl = await p.text({
    message: 'Server URL',
    placeholder: 'http://localhost:8080',
    initialValue: existing?.serverUrl,
    validate: (v) => (v ? undefined : 'Required'),
  });
  if (p.isCancel(serverUrl)) return cancelled();

  const accessKey = await p.text({
    message: 'Access key',
    initialValue: existing?.accessKey,
    validate: (v) => (v ? undefined : 'Required'),
  });
  if (p.isCancel(accessKey)) return cancelled();

  const secretKey = await p.password({
    message: 'Secret key',
    validate: (v) => (v ? undefined : 'Required'),
  });
  if (p.isCancel(secretKey)) return cancelled();

  const shell = await p.text({
    message: 'Shell to record',
    initialValue: existing?.shell ?? defaultShell(),
  });
  if (p.isCancel(shell)) return cancelled();

  const outputDir = await p.text({
    message: 'Recordings folder',
    initialValue: existing?.outputDir ?? defaultOutputDir(),
  });
  if (p.isCancel(outputDir)) return cancelled();

  const config: TermConfig = {
    serverUrl: String(serverUrl).replace(/\/+$/, ''),
    accessKey: String(accessKey),
    secretKey: String(secretKey),
    shell: String(shell),
    outputDir: String(outputDir),
  };

  const spin = p.spinner();
  spin.start('Checking connection');
  try {
    const res = await makeClient(config).checkConnection();
    spin.stop(`${sym.ok} Connected as ${res.user.email}`);
  } catch (err) {
    spin.stop(`${sym.err} Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    const proceed = await p.confirm({ message: 'Save these settings anyway?', initialValue: false });
    if (p.isCancel(proceed) || !proceed) return cancelled();
  }

  await saveConfig(config);
  p.outro(`${sym.ok} Configuration saved.`);
  return config;
}

function cancelled(): null {
  p.cancel('Setup cancelled.');
  return null;
}
