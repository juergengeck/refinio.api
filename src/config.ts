import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface ServerConfig {
  server: {
    host: string;
    port: number;
  };
  instance: {
    name: string;
    email: string;
    secret: string;
    directory?: string;
    encryptStorage?: boolean;
  };
  permissions: {
    defaultPermissions: string[];
    publicReadAccess?: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
  };
}

const defaultConfig: ServerConfig = {
  server: {
    host: '0.0.0.0',
    port: 49498
  },
  instance: {
    name: 'Refinio API Server',
    email: 'admin@refinio.local',
    secret: '', // Must be provided via config or env
    directory: path.join(os.homedir(), '.refinio', 'instance'),
    encryptStorage: true
  },
  permissions: {
    defaultPermissions: ['read'],
    publicReadAccess: false
  },
  logging: {
    level: 'info'
  }
};

export async function loadConfig(): Promise<ServerConfig> {
  const configPaths = [
    path.join(process.cwd(), 'refinio-api.config.json'),
    path.join(os.homedir(), '.refinio', 'api.config.json'),
    '/etc/refinio/api.config.json'
  ];

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      return { ...defaultConfig, ...config };
    } catch (error) {
      // Config file not found, try next
    }
  }

  // Use environment variables if available
  const envConfig = { ...defaultConfig };
  
  if (process.env.REFINIO_API_HOST) {
    envConfig.server.host = process.env.REFINIO_API_HOST;
  }
  
  if (process.env.REFINIO_API_PORT) {
    envConfig.server.port = parseInt(process.env.REFINIO_API_PORT, 10);
  }
  
  if (process.env.REFINIO_INSTANCE_EMAIL) {
    envConfig.instance.email = process.env.REFINIO_INSTANCE_EMAIL;
  }
  
  if (process.env.REFINIO_INSTANCE_SECRET) {
    envConfig.instance.secret = process.env.REFINIO_INSTANCE_SECRET;
  }
  
  if (process.env.REFINIO_INSTANCE_DIRECTORY) {
    envConfig.instance.directory = process.env.REFINIO_INSTANCE_DIRECTORY;
  }
  
  if (process.env.REFINIO_LOG_LEVEL) {
    envConfig.logging.level = process.env.REFINIO_LOG_LEVEL as any;
  }

  return envConfig;
}

export async function saveConfig(config: ServerConfig, configPath?: string) {
  const targetPath = configPath || path.join(os.homedir(), '.refinio', 'api.config.json');
  
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(config, null, 2));
}