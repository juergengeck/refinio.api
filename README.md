# Refinio API Server

Instance-based API server for managing ONE objects using one.core's QUICVC transport.

## Features

- **Instance-Based**: Each server is a ONE Instance with its owner as admin
- **QUICVC Transport**: Uses one.core's native QUIC with verifiable credentials
- **Person Authentication**: Users authenticate with their Person keys
- **CRUD Operations**: Full create, read, update, delete for ONE objects
- **Recipe Execution**: Execute predefined recipes for complex operations
- **Real-time Streaming**: Subscribe to events and object changes
- **Ownership Model**: Instance owner has full control, can grant permissions
- **Multiple Integration Modes**: Standalone, browser, or Node.js integrated

## Installation

```bash
cd packages/refinio.api
npm install
npm run build
```

## Quick Start

1. **Configure Instance**:
Create `refinio-api.config.json`:
```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 49498
  },
  "instance": {
    "name": "My API Server",
    "email": "admin@example.com",
    "secret": "your-secret-passphrase",
    "directory": "~/.refinio/instance"
  }
}
```

2. **Start the server**:
```bash
npm start
# Server will create/load Instance with specified owner
```

3. **Connect as Instance owner** (admin):
```bash
# Generate Person keys for the owner email
refinio auth generate admin@example.com

# Login with owner's keys
refinio auth login --keys ~/.refinio/keys.json
```

## Architecture

The API server follows ONE platform's Instance ownership model:

- **Instance Sovereignty**: Each Instance is owned by a Person
- **Owner as Admin**: Instance owner has full permissions
- **Person Authentication**: Users authenticate with their Person keys
- **Cryptographic Identity**: Ed25519 signatures verify Person identity
- **Permission Grants**: Owner can grant permissions to other Persons

## Documentation

- [cli.md](./cli.md) - Detailed API documentation and protocol specification
- [INTEGRATION.md](./INTEGRATION.md) - Architecture for future integration modes

## Deployment Modes

### Currently Implemented

1. **Standalone Mode** - Independent server with its own Instance
   - ✅ Fully functional
   - Own Instance with filesystem storage
   - Configurable network binding
   - Production ready

### Future Modes (Require one.core Integration)

2. **Browser Integration** - Would embed in browser apps, share Instance via IndexedDB
3. **Node.js Integration** - Would embed in Node.js/Electron apps, share Instance

See [INTEGRATION.md](./INTEGRATION.md) for architectural details and roadmap.

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Usage

### Standalone Server (Currently Available)
```typescript
import { startApiServer } from '@lama/refinio-api';

const { server, instance } = await startApiServer();
console.log(`Server running with Instance owner: ${instance.owner.email}`);
```

### Configuration
```javascript
// refinio-api.config.json
{
  "server": {
    "host": "0.0.0.0",
    "port": 49498
  },
  "instance": {
    "name": "My API Server",
    "email": "owner@example.com",
    "secret": "secure-passphrase",
    "directory": "./instance-data"
  }
}
```

## Environment Variables

- `REFINIO_API_HOST`: Server bind address
- `REFINIO_API_PORT`: Server port
- `REFINIO_INSTANCE_EMAIL`: Instance owner's email
- `REFINIO_INSTANCE_SECRET`: Instance owner's secret
- `REFINIO_INSTANCE_DIRECTORY`: Instance storage directory
- `REFINIO_LOG_LEVEL`: Logging level (debug|info|warn|error)