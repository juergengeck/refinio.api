# Refinio API Tests

## Integration Tests

### Connection Test (`integration/connection-test.js`)

This test verifies the complete integration between the Electron app and refinio.api:

**What it tests:**
1. Starting a local CommServer
2. Starting the Electron app with ONE Filer
3. Starting the refinio.api server
4. Reading IOP invite from the ProjFS mount at `C:\OneFiler\invites\iop_invite.txt`
5. Establishing bidirectional connection using the invite
6. Verifying contact creation on BOTH sides:
   - refinio.api instance sees the Electron app as a contact
   - Electron app sees the refinio.api instance as a contact
7. Testing data synchronization between the two instances

**Prerequisites:**
- Electron app must be available at `../../electron-app`
- one.models package with CommServer support
- Windows platform with ProjFS support

**Running the test:**
```bash
# Install dependencies first
npm install

# Build refinio.api
npm run build

# Run the integration test
npm run test:integration
```

**Success Criteria:**
- ✅ Both instances establish a connection
- ✅ Bidirectional contact creation (both see each other)
- ✅ Connection verified via `LeuteModel.others()`
- ✅ Data can be synchronized between instances

**What the test verifies:**

This integration test specifically validates the **EncryptionPlugin protocol message handling** fix:
- The test ensures that protocol messages (`sync`, `connection_handover`) can pass through WITHOUT encryption
- This is critical because after encryption is established, these control messages still need to flow unencrypted
- The test exercises the full connection flow including CommServer handover, which triggers these protocol messages

**Technical Details:**

The test uses:
- `ConnectionsModel.pairing.connectUsingInvitation()` to accept invites
- `LeuteModel.others()` to query contacts
- WebSocket connections to test API endpoints
- ProjFS filesystem to read invite files

**Configuration:**
- API Port: 49498
- CommServer: ws://localhost:8000
- Invite Path: C:\OneFiler\invites\iop_invite.txt

**Cleanup:**
The test automatically cleans up:
- Test directories
- Running processes (Electron app, API server)
- CommServer instance
