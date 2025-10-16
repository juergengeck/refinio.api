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
    ownerName?: string;
    directory?: string;
    encryptStorage?: boolean;
    commServerUrl?: string;
    wipeStorage?: boolean;
  };
  filer?: {
    mountPoint?: string;
    inviteUrlPrefix?: string;
    debug?: boolean;
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
    encryptStorage: false // Encryption not supported on all platforms yet
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
  // Start with defaults
  let config = { ...defaultConfig };

  // Load from config files (in order of precedence)
  const configPaths = [
    path.join(process.cwd(), 'refinio-api.config.json'),
    path.join(os.homedir(), '.refinio', 'api.config.json'),
    '/etc/refinio/api.config.json'
  ];

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const fileConfig = JSON.parse(content);
      config = { ...config, ...fileConfig };
      break; // Use first found config file
    } catch (error) {
      // Config file not found, try next
    }
  }

  // Environment variables OVERRIDE config file settings
  if (process.env.REFINIO_API_HOST) {
    config.server.host = process.env.REFINIO_API_HOST;
  }

  if (process.env.REFINIO_API_PORT) {
    config.server.port = parseInt(process.env.REFINIO_API_PORT, 10);
  }

  if (process.env.REFINIO_INSTANCE_NAME) {
    config.instance.name = process.env.REFINIO_INSTANCE_NAME;
  }

  if (process.env.REFINIO_INSTANCE_EMAIL) {
    config.instance.email = process.env.REFINIO_INSTANCE_EMAIL;
  }

  if (process.env.REFINIO_INSTANCE_SECRET) {
    config.instance.secret = process.env.REFINIO_INSTANCE_SECRET;
  }

  if (process.env.REFINIO_INSTANCE_DIRECTORY) {
    config.instance.directory = process.env.REFINIO_INSTANCE_DIRECTORY;
  }

  if (process.env.REFINIO_ENCRYPT_STORAGE !== undefined) {
    config.instance.encryptStorage = process.env.REFINIO_ENCRYPT_STORAGE === 'true';
  }

  if (process.env.REFINIO_COMM_SERVER_URL) {
    config.instance.commServerUrl = process.env.REFINIO_COMM_SERVER_URL;
  }

  if (process.env.REFINIO_LOG_LEVEL) {
    config.logging.level = process.env.REFINIO_LOG_LEVEL as any;
  }

  if (process.env.REFINIO_WIPE_STORAGE !== undefined) {
    config.instance.wipeStorage = process.env.REFINIO_WIPE_STORAGE === 'true';
  }

  // Filer configuration from env vars
  if (process.env.REFINIO_FILER_MOUNT_POINT) {
    config.filer = {
      ...config.filer,
      mountPoint: process.env.REFINIO_FILER_MOUNT_POINT,
      inviteUrlPrefix: process.env.REFINIO_FILER_INVITE_URL_PREFIX,
      debug: process.env.REFINIO_FILER_DEBUG === 'true'
    };
  }

  return config;
}

export async function saveConfig(config: ServerConfig, configPath?: string) {
  const targetPath = configPath || path.join(os.homedir(), '.refinio', 'api.config.json');
  
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(config, null, 2));
}