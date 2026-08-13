import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { bootstrapAdmin } from './services/bootstrap.js';

async function main() {
  const config = loadConfig();
  const app = await buildApp(config);

  // Create the first admin from env if the users table is empty (headless deploy).
  await bootstrapAdmin(app);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.log.info(`received ${signal}, shutting down`);
      app.close().then(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
