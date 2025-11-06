/**
 * Client Usage Examples
 *
 * Shows how to use ONE Plan clients from browser/cube UIs
 */

import {
  createOnePlanClient,
  createPlanProxy,
  type IOneStoragePlan,
  type IOneLeutePlan,
  type ILamaMemoryPlan
} from './index.js';

// ============================================================================
// Example 1: REST Client
// ============================================================================

async function exampleRestClient() {
  // Create REST client
  const client = createOnePlanClient({
    baseUrl: 'http://localhost:3000',
    transport: 'rest',
    timeout: 10000
  });

  // Execute Plans directly
  const story = await client.execute('one.storage', 'storeVersionedObject', {
    $type$: 'Document',
    title: 'My Document',
    content: 'Document content...'
  });

  console.log('Story:', story);
  // {
  //   success: true,
  //   plan: { plan: 'one.storage', method: 'storeVersionedObject', params: {...} },
  //   data: { hash: '...', idHash: '...', versionHash: '...' },
  //   timestamp: 1234567890,
  //   executionTime: 42
  // }
}

// ============================================================================
// Example 2: Type-Safe REST Client
// ============================================================================

async function exampleTypeSafeClient() {
  const client = createOnePlanClient({
    baseUrl: 'http://localhost:3000',
    transport: 'rest'
  });

  // Create type-safe proxies
  const storage = createPlanProxy<IOneStoragePlan>(client, 'one.storage');
  const leute = createPlanProxy<IOneLeutePlan>(client, 'one.leute');

  // Now you get full TypeScript types!
  const result = await storage.storeVersionedObject({
    $type$: 'Document',
    title: 'My Document',
    content: '...'
  });
  // TypeScript knows: result = { hash: string, idHash: string, versionHash: string }

  const contacts = await leute.getContacts();
  // TypeScript knows: contacts = any[]

  const identity = await leute.getOwnIdentity();
  // Full autocomplete and type checking!
}

// ============================================================================
// Example 3: QUIC/WebSocket Client
// ============================================================================

async function exampleQuicClient() {
  // Create QUIC client (uses WebSocket transport)
  const client = createOnePlanClient({
    baseUrl: 'ws://localhost:8080',
    transport: 'quic',
    timeout: 10000
  });

  // Type-safe proxy
  const storage = createPlanProxy<IOneStoragePlan>(client, 'one.storage');

  // Execute operations
  const result = await storage.storeVersionedObject({
    $type$: 'Message',
    content: 'Hello World'
  });

  console.log('Stored:', result.idHash);

  // Close connection when done
  await client.close();
}

// ============================================================================
// Example 4: React Integration
// ============================================================================

// React hook for ONE client
import { useEffect, useState } from 'react';

function useOnePlanClient() {
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    const c = createOnePlanClient({
      baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:3000',
      transport: 'rest'
    });
    setClient(c);

    return () => {
      c.close();
    };
  }, []);

  return client;
}

// React component using ONE client
function MyComponent() {
  const client = useOnePlanClient();
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    if (!client) return;

    const loadContacts = async () => {
      const leute = createPlanProxy<IOneLeutePlan>(client, 'one.leute');
      const contactList = await leute.getContacts();
      setContacts(contactList);
    };

    loadContacts();
  }, [client]);

  return (
    <div>
      <h1>Contacts</h1>
      <ul>
        {contacts.map((contact: any) => (
          <li key={contact.idHash}>{contact.name}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Example 5: LAMA Browser Integration
// ============================================================================

// Service layer for LAMA browser
class LamaApiService {
  private client: any;
  private storage: IOneStoragePlan;
  private leute: IOneLeutePlan;
  private memory: ILamaMemoryPlan;

  constructor(apiUrl: string) {
    this.client = createOnePlanClient({
      baseUrl: apiUrl,
      transport: 'rest',
      timeout: 30000
    });

    // Create type-safe proxies
    this.storage = createPlanProxy<IOneStoragePlan>(this.client, 'one.storage');
    this.leute = createPlanProxy<IOneLeutePlan>(this.client, 'one.leute');
    this.memory = createPlanProxy<ILamaMemoryPlan>(this.client, 'lama.memory');
  }

  // Storage operations
  async storeDocument(doc: any) {
    return await this.storage.storeVersionedObject(doc);
  }

  async getDocument(idHash: string) {
    return await this.storage.getObjectByIdHash(idHash as any);
  }

  // Contact operations
  async getContacts() {
    return await this.leute.getContacts();
  }

  async createContact(name: string, email?: string) {
    return await this.leute.createContact({ name, email });
  }

  // Memory operations
  async createSubject(params: any) {
    return await this.memory.createSubject(params);
  }

  async getSubject(idHash: string) {
    return await this.memory.getSubject(idHash as any);
  }

  // Cleanup
  async close() {
    await this.client.close();
  }
}

// Usage in LAMA browser
const lamaApi = new LamaApiService('http://localhost:3000');

// Store document
const doc = await lamaApi.storeDocument({
  $type$: 'Document',
  title: 'My Doc'
});

// Get contacts
const contacts = await lamaApi.getContacts();

// Create subject
const subject = await lamaApi.createSubject({
  id: 'subject-1',
  name: 'My Subject',
  description: 'Test'
});

export {
  exampleRestClient,
  exampleTypeSafeClient,
  exampleQuicClient,
  useOnePlanClient,
  MyComponent,
  LamaApiService
};
