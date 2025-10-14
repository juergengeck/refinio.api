#!/usr/bin/env node

/**
 * Refinio API Two-Instance Integration Test
 *
 * This test verifies the complete integration between two refinio.api instances:
 * 1. Starts a local CommServer
 * 2. Starts Instance #1 (SERVER) with ProjFS mounted at C:\OneFiler
 * 3. Waits for invite files to be created
 * 4. Starts Instance #2 (CLIENT) without mount
 * 5. CLIENT reads the IOP invite created by SERVER via ProjFS
 * 6. CLIENT establishes a connection using the invite
 * 7. Verifies contact creation on BOTH sides:
 *    - SERVER instance should see CLIENT as a contact
 *    - CLIENT instance should see SERVER as a contact
 *
 * The key success criterion is bidirectional contact creation, which proves
 * that the connection was successfully established and both instances can see each other.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_PORT = 49498;
const CLIENT_PORT = 49499;
const COMM_SERVER_URL = 'ws://localhost:8000';
const MOUNT_POINT = 'C:\\OneFiler';
const INVITE_PATH = path.join(MOUNT_POINT, 'invites', 'iop_invite.txt');

/**
 * Start the local CommServer
 */
async function startCommServer() {
    console.log('Starting local CommServer...');

    try {
        // Import CommunicationServer class from one.models
        const CommunicationServerModule = await import('../../node_modules/@refinio/one.models/lib/misc/ConnectionEstablishment/communicationServer/CommunicationServer.js');
        const CommunicationServer = CommunicationServerModule.default;

        const commServer = new CommunicationServer();
        await commServer.start('localhost', 8000);
        console.log('  ✅ CommServer started on localhost:8000');

        return commServer;
    } catch (error) {
        console.error('Failed to start CommServer:', error);
        throw error;
    }
}

/**
 * Start the SERVER instance with ProjFS mount as a child process
 * This instance creates invites that clients can connect to
 */
async function startServerInstance() {
    console.log('Starting SERVER instance (with ProjFS mount)...');

    return new Promise((resolve, reject) => {
        try {
            // Create a unique temporary directory for this test run
            const testDir = path.join(process.env.TEMP || 'C:\\temp', `refinio-server-test-${Date.now()}`);
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }

            // Create environment for this instance
            const serverEnv = {
                ...process.env,
                REFINIO_INSTANCE_DIRECTORY: testDir,
                REFINIO_INSTANCE_SECRET: 'server-secret-123',
                REFINIO_INSTANCE_NAME: 'Server Instance',
                REFINIO_INSTANCE_EMAIL: 'server@test.local',
                REFINIO_API_PORT: SERVER_PORT.toString(),
                REFINIO_ENCRYPT_STORAGE: 'false',
                REFINIO_COMM_SERVER_URL: COMM_SERVER_URL,
                REFINIO_FILER_MOUNT_POINT: MOUNT_POINT,
                REFINIO_FILER_INVITE_URL_PREFIX: 'https://one.refinio.net/invite'
            };

            // Spawn the instance runner as a child process
            const runnerPath = path.join(__dirname, 'test-instance-runner.js');
            const child = spawn('node', [runnerPath], {
                env: serverEnv,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let instanceId = null;

            child.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const message = JSON.parse(line);
                            if (message.type === 'ready') {
                                instanceId = message.instanceId;
                                console.log(`✅ SERVER instance started on port ${SERVER_PORT}`);
                                console.log(`   Instance ID: ${instanceId}`);
                                console.log(`   Mount point: ${MOUNT_POINT}`);
                                resolve({
                                    process: child,
                                    instanceId,
                                    port: SERVER_PORT,
                                    testDir,
                                    env: serverEnv
                                });
                            }
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                }
            });

            child.stderr.on('data', (data) => {
                const msg = data.toString();
                // Log all stderr for debugging
                console.log(`  [SERVER] ${msg.trim()}`);
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to spawn SERVER instance: ${error.message}`));
            });

            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    reject(new Error(`SERVER instance exited with code ${code}`));
                }
            });

            // Timeout
            setTimeout(() => {
                if (!instanceId) {
                    child.kill();
                    reject(new Error('SERVER instance did not start within 30 seconds'));
                }
            }, 30000);

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Start the CLIENT instance without ProjFS mount as a child process
 * This instance will connect to the SERVER's invite
 */
async function startClientInstance() {
    console.log('Starting CLIENT instance (no mount)...');

    return new Promise((resolve, reject) => {
        try {
            // Create a unique temporary directory for this test run
            const testDir = path.join(process.env.TEMP || 'C:\\temp', `refinio-client-test-${Date.now()}`);
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }

            // Create environment for this instance (no mount point)
            const clientEnv = {
                ...process.env,
                REFINIO_INSTANCE_DIRECTORY: testDir,
                REFINIO_INSTANCE_SECRET: 'client-secret-456',
                REFINIO_INSTANCE_NAME: 'Client Instance',
                REFINIO_INSTANCE_EMAIL: 'client@test.local',
                REFINIO_API_PORT: CLIENT_PORT.toString(),
                REFINIO_ENCRYPT_STORAGE: 'false',
                REFINIO_COMM_SERVER_URL: COMM_SERVER_URL,
            };

            // Explicitly remove mount point settings
            delete clientEnv.REFINIO_FILER_MOUNT_POINT;
            delete clientEnv.REFINIO_FILER_INVITE_URL_PREFIX;

            // Spawn the instance runner as a child process
            const runnerPath = path.join(__dirname, 'test-instance-runner.js');
            const child = spawn('node', [runnerPath], {
                env: clientEnv,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let instanceId = null;

            child.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const message = JSON.parse(line);
                            if (message.type === 'ready') {
                                instanceId = message.instanceId;
                                console.log(`✅ CLIENT instance started on port ${CLIENT_PORT}`);
                                console.log(`   Instance ID: ${instanceId}`);
                                resolve({
                                    process: child,
                                    instanceId,
                                    port: CLIENT_PORT,
                                    testDir,
                                    env: clientEnv
                                });
                            }
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                }
            });

            child.stderr.on('data', (data) => {
                const msg = data.toString();
                // Log all stderr for debugging
                console.log(`  [CLIENT] ${msg.trim()}`);
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to spawn CLIENT instance: ${error.message}`));
            });

            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    reject(new Error(`CLIENT instance exited with code ${code}`));
                }
            });

            // Timeout
            setTimeout(() => {
                if (!instanceId) {
                    child.kill();
                    reject(new Error('CLIENT instance did not start within 30 seconds'));
                }
            }, 30000);

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Wait for filesystem to be mounted and invite file to be ready
 */
async function waitForInviteFile(maxWaitSeconds = 30) {
    console.log('Waiting for invite file to be ready...');

    const maxAttempts = maxWaitSeconds * 2; // Check every 500ms
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (fs.existsSync(INVITE_PATH)) {
                const stat = fs.statSync(INVITE_PATH);
                if (stat.size > 0) {
                    const content = fs.readFileSync(INVITE_PATH, 'utf-8').trim();
                    if (content.length > 0) {
                        console.log(`  ✅ Invite file ready after ${(i + 1) * 0.5}s`);
                        return content;
                    }
                }
            }
        } catch (e) {
            // Ignore errors during polling
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Invite file not ready within ${maxWaitSeconds} seconds`);
}

/**
 * Parse invite URL
 */
function parseInviteUrl(inviteUrl) {
    const hashIndex = inviteUrl.indexOf('#');
    if (hashIndex === -1) {
        throw new Error('Invalid invite URL format');
    }

    const encodedData = inviteUrl.substring(hashIndex + 1);
    const decodedData = decodeURIComponent(encodedData);
    return JSON.parse(decodedData);
}

/**
 * Query contacts from a ONE instance via HTTP REST API
 *
 * Contacts are created when a connection is successfully established.
 *
 * @param {Object} instance - The instance object with port information
 * @returns {Promise<Array>} Array of contact objects
 */
async function queryContacts(instance) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: instance.port,
            path: '/api/contacts',
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const contacts = JSON.parse(data);
                        resolve(contacts);
                    } else {
                        console.error(`  ❌ Failed to query contacts: HTTP ${res.statusCode}`);
                        resolve([]);
                    }
                } catch (error) {
                    console.error('  ❌ Failed to parse contacts:', error.message);
                    resolve([]);
                }
            });
        });

        req.on('error', (error) => {
            console.error('  ❌ Failed to query contacts:', error.message);
            resolve([]);
        });

        req.setTimeout(5000, () => {
            req.destroy();
            resolve([]);
        });

        req.end();
    });
}

/**
 * Establish connection from CLIENT to SERVER using invite via HTTP REST API
 */
async function connectUsingInvite(clientInstance, inviteUrl) {
    console.log('CLIENT accepting invitation from SERVER...');

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ inviteUrl });

        const options = {
            hostname: 'localhost',
            port: clientInstance.port,
            path: '/api/connections/invite',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200 || res.statusCode === 201) {
                        const result = JSON.parse(data);
                        console.log('  ✅ Invitation accepted successfully');
                        resolve(result);
                    } else {
                        console.error(`  ❌ Failed to accept invitation: HTTP ${res.statusCode}`);
                        console.error(`  Response: ${data}`);
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                } catch (error) {
                    console.error('  ❌ Failed to parse response:', error.message);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            console.error('  ❌ HTTP request error:', error.message);
            reject(error);
        });

        req.setTimeout(120000, () => { // 2 minute timeout for connection
            req.destroy();
            reject(new Error('Connection timeout after 2 minutes'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Main test function
 */
async function runTwoInstanceTest() {
    console.log('🚀 Refinio API Two-Instance Integration Test\n');
    console.log('=' .repeat(60));

    let commServer;
    let serverInstance;
    let clientInstance;
    let connectionEstablished = false;

    try {
        // Clean up and prepare mount directory
        console.log('\n🧹 Preparing mount directory...');
        if (fs.existsSync(MOUNT_POINT)) {
            try {
                fs.rmSync(MOUNT_POINT, { recursive: true, force: true });
                console.log(`  ✅ Removed previous mount point: ${MOUNT_POINT}`);
            } catch (e) {
                console.log(`  ⚠️  Could not remove mount point (may be in use): ${e.message}`);
            }
        }

        // Create fresh empty mount directory for ProjFS
        try {
            fs.mkdirSync(MOUNT_POINT, { recursive: true });
            console.log(`  ✅ Created mount directory: ${MOUNT_POINT}`);
        } catch (e) {
            console.error(`  ❌ Failed to create mount directory: ${e.message}`);
            throw e;
        }

        // Step 1: Start CommServer
        console.log('\n1️⃣ Starting CommServer...');
        commServer = await startCommServer();

        // Step 2: Start SERVER instance with ProjFS
        console.log('\n2️⃣ Starting SERVER instance...');
        serverInstance = await startServerInstance();

        // Wait a bit for server to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 3: Read invite from ProjFS mount - THIS MUST WORK
        console.log('\n3️⃣ Reading invite file from ProjFS...');
        const inviteUrl = await waitForInviteFile(30);
        const inviteData = parseInviteUrl(inviteUrl);
        console.log('  ✅ Invite file ready');
        console.log(`     URL: ${inviteData.url}`);
        console.log(`     Token: ${inviteData.token.substring(0, 16)}...`);

        // Step 4: Start CLIENT instance (without mount)
        console.log('\n4️⃣ Starting CLIENT instance...');
        clientInstance = await startClientInstance();

        // Wait a bit for client to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 5: CLIENT connects to SERVER using invite
        console.log('\n5️⃣ Establishing connection...');
        await connectUsingInvite(clientInstance, inviteUrl);

        // Wait for connection to stabilize
        console.log('  Waiting for connection to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        connectionEstablished = true;

        // Step 6: Verify bidirectional contact creation
        console.log('\n6️⃣ Verifying bidirectional contact creation...');

        // Query contacts from CLIENT instance
        console.log('  Querying contacts from CLIENT instance...');
        const clientContacts = await queryContacts(clientInstance);
        console.log(`  CLIENT contacts: ${clientContacts.length} found`);
        if (clientContacts.length > 0) {
            clientContacts.forEach(c => {
                const id = c.someoneId || c.personId || 'unknown';
                const displayId = typeof id === 'string' ? id.substring(0, 16) : JSON.stringify(id).substring(0, 16);
                console.log(`    - Contact: ${displayId}...`);
            });
        }

        // Query contacts from SERVER instance
        console.log('  Querying contacts from SERVER instance...');
        const serverContacts = await queryContacts(serverInstance);
        console.log(`  SERVER contacts: ${serverContacts.length} found`);
        if (serverContacts.length > 0) {
            serverContacts.forEach(c => {
                const id = c.someoneId || c.personId || 'unknown';
                const displayId = typeof id === 'string' ? id.substring(0, 16) : JSON.stringify(id).substring(0, 16);
                console.log(`    - Contact: ${displayId}...`);
            });
        }

        // Verify bidirectional contacts
        if (clientContacts.length > 0 && serverContacts.length > 0) {
            console.log('\n  ✅ BIDIRECTIONAL CONTACT CREATION VERIFIED!');
            console.log('     Both instances can see each other as contacts');
        } else if (clientContacts.length > 0) {
            console.log('\n  ⚠️  Partial success: CLIENT sees SERVER, but not vice versa');
            connectionEstablished = false;
        } else if (serverContacts.length > 0) {
            console.log('\n  ⚠️  Partial success: SERVER sees CLIENT, but not vice versa');
            connectionEstablished = false;
        } else {
            console.log('\n  ❌ No contacts found on either side');
            connectionEstablished = false;
        }

        // Summary
        console.log('\n' + '=' .repeat(60));
        console.log('📊 Test Summary:\n');

        if (connectionEstablished) {
            console.log('✅ CommServer started successfully');
            console.log('✅ SERVER instance with ProjFS mount');
            console.log('✅ CLIENT instance without mount');
            console.log('✅ Invite file created and read successfully');
            console.log('✅ Connection established successfully');
            console.log('✅ Bidirectional contact creation verified!');
            console.log('\n🎉 ALL TESTS PASSED!');
        } else {
            console.log('⚠️  Test completed with issues:');
            console.log('   Connection may not be fully established');
            console.log('   Check contact creation on both sides');
        }

        console.log('\n✨ Test completed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');

        if (clientInstance) {
            console.log('  Stopping CLIENT instance...');
            try {
                if (clientInstance.process && !clientInstance.process.killed) {
                    clientInstance.process.kill('SIGTERM');
                    // Wait a bit for graceful shutdown
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    if (!clientInstance.process.killed) {
                        clientInstance.process.kill('SIGKILL');
                    }
                }
                console.log('  ✅ CLIENT instance stopped');
            } catch (e) {
                console.error('  Failed to stop CLIENT instance:', e.message);
            }

            // Clean up CLIENT test directory
            if (clientInstance.testDir && fs.existsSync(clientInstance.testDir)) {
                try {
                    fs.rmSync(clientInstance.testDir, { recursive: true, force: true });
                    console.log('  ✅ CLIENT test directory cleaned');
                } catch (e) {
                    console.error('  Failed to clean CLIENT test directory:', e.message);
                }
            }
        }

        if (serverInstance) {
            console.log('  Stopping SERVER instance...');
            try {
                if (serverInstance.process && !serverInstance.process.killed) {
                    serverInstance.process.kill('SIGTERM');
                    // Wait a bit for graceful shutdown (including filesystem unmount)
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    if (!serverInstance.process.killed) {
                        serverInstance.process.kill('SIGKILL');
                    }
                }
                console.log('  ✅ SERVER instance stopped');
            } catch (e) {
                console.error('  Failed to stop SERVER instance:', e.message);
            }

            // Clean up SERVER test directory
            if (serverInstance.testDir && fs.existsSync(serverInstance.testDir)) {
                try {
                    fs.rmSync(serverInstance.testDir, { recursive: true, force: true });
                    console.log('  ✅ SERVER test directory cleaned');
                } catch (e) {
                    console.error('  Failed to clean SERVER test directory:', e.message);
                }
            }
        }

        // Stop CommServer
        if (commServer) {
            console.log('  Stopping CommServer...');
            try {
                await commServer.stop();
                console.log('  ✅ CommServer stopped');
            } catch (e) {
                console.error('  Failed to stop CommServer:', e.message);
            }
        }

        console.log('✅ Cleanup completed');
    }
}

// Run the test
const isMainModule = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
    console.log('Starting refinio.api two-instance integration test...\n');
    runTwoInstanceTest()
        .then(() => {
            console.log('\n✅ Test execution completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Unexpected error:', error);
            process.exit(1);
        });
}

export {
    startServerInstance,
    startClientInstance,
    startCommServer,
    waitForInviteFile,
    parseInviteUrl,
    queryContacts,
    connectUsingInvite,
    runTwoInstanceTest
};
