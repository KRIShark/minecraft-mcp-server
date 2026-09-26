import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export interface ServerConfig {
  host: string;
  port: number;
  username: string;
}

export function parseConfig(): ServerConfig {
  return yargs(hideBin(process.argv))
    .option('host', {
      type: 'string',
      description: 'Minecraft server host',
      default: process.env.MINECRAFT_HOST || 'localhost'
    })
    .option('port', {
      type: 'number',
      description: 'Minecraft server port',
      default: process.env.MINECRAFT_PORT ? Number(process.env.MINECRAFT_PORT) : 25565
    })
    .option('username', {
      type: 'string',
      description: 'Bot username',
      default: process.env.MINECRAFT_USERNAME || 'LLMBot'
    })
    .help()
    .alias('help', 'h')
    .parseSync();
}
