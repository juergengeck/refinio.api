# Integration Tests

## Two-Instance Connection Test

The `connection-test.js` test verifies the complete pairing and connection flow between two refinio.api instances:

### Test Architecture

1. **CommServer**: Local communication server for instance-to-instance messaging (port 8000)
2. **SERVER Instance**: Runs with ProjFS mounted at C:\OneFiler, creates invite files (port 49498)
3. **CLIENT Instance**: Connects to SERVER's invite via HTTP REST API (port 49499)
4. **Verification**: Bidirectional contact creation on both instances

### How It Works

Each instance runs in its own Node.js child process with:
- Separate ONE.core instance
- Separate storage directory
- Separate QUIC transport on different ports
- Unique instance identity

The test orchestrates:
1. Starting a local CommServer for instance communication
2. Spawning SERVER process with ProjFS mount
3. Waiting for invite file to be created at C:\OneFiler\invites\iop_invite.txt
4. Spawning CLIENT process
5. CLIENT accepting SERVER's invitation via REST API POST
6. Verifying both instances created contacts for each other

### Running the Test

```bash
npm run test:integration
```

### Files

- `connection-test.js` - Main test orchestration
- `test-instance-runner.js` - Helper script to run instances as child processes
- `README.md` - This documentation

### What Success Looks Like

```
✅ CommServer started successfully
✅ SERVER instance with ProjFS mount
✅ CLIENT instance without mount
✅ Invite file created and read successfully
✅ Connection established successfully
✅ Bidirectional contact creation verified!
```

The test confirms that:
- SERVER creates an invite that's accessible via ProjFS
- CLIENT can accept the invite programmatically
- Both instances successfully establish connection
- Contacts are created on both sides (proving bidirectional connection)

This validates the core pairing flow used in production (like one.leute reference implementation).
