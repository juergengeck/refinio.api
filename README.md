# Refinio API Server

Instance-based API server for managing ONE objects using one.core's QUICVC transport.

## Features

- **Instance-Based**: Each server is a ONE Instance with its owner as admin
- **QUICVC Transport**: Uses one.core's native QUIC with verifiable credentials
- **Person Authentication**: Users authenticate with their Person keys
- **Profile Support**: Profiles as ONE objects for multi-context access
- **CRUD Operations**: Full create, read, update, delete for ONE objects
- **Recipe Management**: Register and manage data structure definitions
- **Real-time Streaming**: Subscribe to events and object changes
- **Ownership Model**: Instance owner has full control, can grant permissions
- **Hierarchical Recipes**: Self-describing recipe system

## Installation

```bash
npm install @juergengeck/refinio-api
```

Or clone and build:
```bash
git clone https://github.com/juergengeck/refinio.api.git
cd refinio.api
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

3. **Connect with CLI**:
```bash
# Install CLI
npm install -g @juergengeck/refinio-cli

# Connect to instance
refinio connect quic://localhost:49498 --email admin@example.com

# Create a profile
refinio profile create admin --name "Admin Profile"
```

## Core Concepts

### Instance Ownership Model

The API server follows ONE platform's Instance ownership model:
- **Instance Sovereignty**: Each Instance is owned by a Person
- **Owner as Admin**: Instance owner has full permissions
- **Person Authentication**: Users authenticate with their Person keys
- **Cryptographic Identity**: Ed25519 signatures verify Person identity
- **Permission Grants**: Owner can grant permissions to other Persons

### Profiles as Official ONE Objects

Profiles use the official one.models Profile recipe:
- `nickname` - User-friendly identifier for CLI shortcuts
- `profileId` - Unique profile identifier  
- `personId` and `owner` - Person references for ownership
- `communicationEndpoint` - Communication endpoints array
- `personDescription` - Person description objects array
- Stored as proper ONE objects in the instance
- Enable multi-context access with semantic structure

### Hierarchical Recipe System

Recipes define data structures in a self-describing hierarchy:
- Base `Recipe` defines what a recipe is
- Recipes themselves are ONE objects
- Specialized recipes can define other recipes
- Every recipe has `$type$` and `$recipe$` fields

Example:
```javascript
{
  "$type$": "TextMessage",        // Recipe name
  "$recipe$": "MessageRecipe",    // What Recipe defines this
  "description": "A text message",
  "properties": {
    "content": { "type": "string", "required": true }
  }
}
```

## API Handlers

### Profile Handler
Manages official one.models Profile objects:
- Create, read, update, delete Profiles using official structure
- List Profiles with personId/owner filtering
- Search by nickname or profileId
- Full compliance with one.models Profile recipe

### Recipe Handler
Manages recipe definitions:
- Register new recipes (data structures)
- Get recipe by name
- List recipes with type filtering
- Supports hierarchical recipe system

### CRUD Handler
Standard object operations:
- Create objects with recipe validation
- Read objects by ID
- Update existing objects
- Delete objects
- List objects by type

## Documentation

- [cli.md](./cli.md) - Detailed API documentation and protocol specification
- [INTEGRATION.md](./INTEGRATION.md) - Architecture for future integration modes

## Protocol

### QUIC Message Format

All messages use JSON over QUIC streams:

```typescript
interface Message {
  id: string;           // Request/response correlation
  type: MessageType;    // Operation type
  timestamp: number;    // Unix timestamp
  payload: any;         // Operation-specific data
}
```

### Authentication Flow

1. Client sends auth request with Person ID
2. Server responds with challenge nonce
3. Client signs challenge with Person's private key
4. Server verifies signature and grants session

## Configuration

### Server Configuration

```javascript
{
  "server": {
    "host": "0.0.0.0",
    "port": 49498,
    "maxConnections": 100,
    "timeout": 30000
  },
  "instance": {
    "name": "Production API",
    "email": "owner@example.com",
    "secret": "secure-passphrase",
    "directory": "./instance-data"
  },
  "logging": {
    "level": "info",
    "file": "./logs/api.log"
  }
}
```

### Environment Variables

- `REFINIO_API_HOST`: Server bind address
- `REFINIO_API_PORT`: Server port
- `REFINIO_INSTANCE_EMAIL`: Instance owner's email
- `REFINIO_INSTANCE_SECRET`: Instance owner's secret
- `REFINIO_INSTANCE_DIRECTORY`: Instance storage directory
- `REFINIO_LOG_LEVEL`: Logging level (debug|info|warn|error)

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint
```

## Usage Examples

### Standalone Server
```typescript
import { startApiServer } from '@juergengeck/refinio-api';

const { server, instance } = await startApiServer({
  server: { port: 49498 },
  instance: {
    email: 'admin@example.com',
    secret: 'passphrase'
  }
});

console.log(`Server running with Instance owner: ${instance.owner.email}`);
```

### With Express Integration
```typescript
import express from 'express';
import { QuicVCServer } from '@juergengeck/refinio-api';

const app = express();
const quicServer = new QuicVCServer();

// Add HTTP endpoints alongside QUIC
app.get('/health', (req, res) => {
  res.json({ status: 'ok', quic: quicServer.isRunning() });
});

await quicServer.start({ port: 49498 });
app.listen(3000);
```

## Security

- **No Server-Issued Credentials**: Users control their own Person keys
- **Cryptographic Authentication**: Ed25519 signatures verify identity
- **Instance Isolation**: Each Instance has its own data and permissions
- **QUIC Encryption**: Built-in transport security
- **Permission System**: Fine-grained access control

## License

MIT

## Contributing

Issues and pull requests welcome at [github.com/juergengeck/refinio.api](https://github.com/juergengeck/refinio.api)