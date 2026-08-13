import { join } from 'node:path';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { CONFIG_PATH, loadConfig, type TermConfig } from './config.js';
import { runWizard } from './wizard.js';
import { recordSession } from './record.js';
import { handleRecording, promptAndUpload } from './postSession.js';
import { banner, c, sym } from './theme.js';

/** Load config, or launch first-run setup if none exists. */
async function ensureConfig(): Promise<TermConfig | null> {
  const cfg = await loadConfig();
  if (cfg) return cfg;
  console.log(`${sym.warn} No configuration found — let's set up reporter-term.\n`);
  return runWizard();
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

const program = new Command();
program
  .name('reporter-term')
  .description('Record terminal sessions and upload them to reporter as evidence')
  .version('0.1.0');

program
  .command('record', { isDefault: true })
  .description('Record a terminal session (default)')
  .action(async () => {
    const config = await ensureConfig();
    if (!config) return;
    console.log(`\n${banner()}`);
    console.log(c.muted('Recording — type "exit" or press Ctrl-D to stop.\n'));
    const outputPath = join(config.outputDir, `${timestamp()}.cast`);
    const { castPath } = await recordSession({ shell: config.shell, outputPath });
    console.log();
    await handleRecording(config, castPath);
  });

program
  .command('setup')
  .description('Configure the server URL, API keys, and shell')
  .action(async () => {
    await runWizard(await loadConfig());
  });

program
  .command('config')
  .description('Show the config file path and current values')
  .action(async () => {
    const cfg = await loadConfig();
    console.log(`Config file: ${c.accent(CONFIG_PATH)}`);
    if (!cfg) {
      console.log(c.muted('(not configured — run `reporter-term setup`)'));
      return;
    }
    console.log(`  Server URL:  ${cfg.serverUrl}`);
    console.log(`  Access key:  ${cfg.accessKey}`);
    console.log(`  Secret key:  ${'*'.repeat(8)} ${c.muted('(hidden)')}`);
    console.log(`  Shell:       ${cfg.shell ?? '(default)'}`);
    console.log(`  Output dir:  ${cfg.outputDir}`);
  });

program
  .command('upload <file>')
  .description('Upload a saved .cast recording')
  .action(async (file: string) => {
    const config = await ensureConfig();
    if (!config) return;
    p.intro(banner());
    await promptAndUpload(config, file);
    p.outro('Done.');
  });

program.parseAsync(process.argv);
