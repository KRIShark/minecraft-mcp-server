import { parseHttpConfig } from './http-config.js';
import { startHttpServer } from './http-server.js';
import { log } from './logger.js';

try {
  const config = parseHttpConfig();
  const runtime = await startHttpServer(config);
  log('info', `[HTTP] MCP Streamable HTTP listening on ${config.http.host}:${config.http.port}${config.http.path}; authentication ${config.http.authToken ? 'enabled' : 'disabled'}`);
  log('info', `[MINECRAFT] Target configured on port ${config.minecraft.port}`);
  const stop = () => { void runtime.close().then(() => { process.exitCode = 0; }, error => { log('error', `Shutdown failed: ${error}`); process.exitCode = 1; }); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  log('error', `Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
