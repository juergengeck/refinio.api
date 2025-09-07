import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { createAccess } from '@refinio/one.core/lib/access.js';
import { SET_ACCESS_MODE } from '@refinio/one.core/lib/storage-base-common.js';
import { getObjectWithType } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { storeVersionedObject, getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import type { StateEntry, AppStateJournal } from './AppStateRecipes.js';

/**
 * Model for managing application state journal
 * Provides CRDT-based state synchronization between browser and Node.js instances
 */
export class AppStateModel {
    private one: any; // ONE instance passed from app
    private journalId: SHA256IdHash<AppStateJournal> | null = null;
    private currentPerson: SHA256IdHash<Person> | null = null;
    private journalChannelId: string | null = null;
    private stateChangeListeners: Set<(entry: StateEntry) => void> = new Set();
    private source: 'browser' | 'nodejs';

    constructor(one: any, source: 'browser' | 'nodejs' = 'browser') {
        this.one = one;
        this.source = source;
    }

    /**
     * Initialize the app state model
     */
    async init(person: SHA256IdHash<Person>): Promise<void> {
        this.currentPerson = person;
        
        // Try to get existing journal or create new one
        try {
            const existingJournalResult = await getObjectByIdHash(
                'AppStateJournal' as SHA256IdHash<AppStateJournal>
            );
            
            if (existingJournalResult) {
                this.journalId = existingJournalResult.idHash;
                console.log('[AppStateModel] Using existing journal:', this.journalId);
            }
        } catch (err) {
            // Journal doesn't exist yet
        }
        
        if (!this.journalId) {
            // Create new journal
            const journal = {
                $type$: 'AppStateJournal' as const,
                id: 'AppStateJournal' as const,
                entries: new Set<SHA256Hash<StateEntry>>(),
                lastSync: Date.now()
            };
            
            const result = await storeVersionedObject(journal);
            this.journalId = result.idHash;
            console.log('[AppStateModel] Created new journal:', this.journalId);
        }
        
        // Create channel for journal synchronization
        this.journalChannelId = `app-state-journal`;
        await this.setupChannel();
    }

    /**
     * Setup CHUM channel for journal synchronization
     */
    private async setupChannel(): Promise<void> {
        if (!this.journalChannelId || !this.journalId) return;
        
        // Grant access to everyone for the journal
        const everyoneGroup = await this.one.getEveryoneGroup();
        if (everyoneGroup) {
            await createAccess([{
                id: this.journalId,
                person: [],
                group: [everyoneGroup],
                mode: SET_ACCESS_MODE.REPLACE
            }]);
        }
        
        // Setup CHUM subscription for the journal
        await this.one.chum.channelSubscribe({
            channel: this.journalChannelId,
            onReceive: async (message: any) => {
                // Handle incoming state changes
                if (message.type === 'state-change') {
                    await this.handleRemoteStateChange(message.entry);
                }
            }
        });
        
        console.log('[AppStateModel] Channel setup complete:', this.journalChannelId);
    }

    /**
     * Record a state change to the journal
     */
    async recordStateChange(
        path: string,
        value: any,
        previousValue?: any,
        metadata?: { action?: string; description?: string }
    ): Promise<void> {
        if (!this.currentPerson || !this.journalId) {
            console.warn('[AppStateModel] Cannot record state change - not initialized');
            return;
        }
        
        // Create state entry
        const entry = {
            $type$: 'StateEntry' as const,
            timestamp: Date.now(),
            source: this.source,
            path,
            value: JSON.stringify(value),
            previousValue: previousValue ? JSON.stringify(previousValue) : undefined,
            author: this.currentPerson,
            metadata
        };
        
        // Store the entry as versioned object
        const { hash: entryHash } = await storeVersionedObject(entry);
        
        // Get current journal
        const journalResult = await getObjectByIdHash(this.journalId);
        const journal = journalResult.obj;
        if (!journal) {
            console.error('[AppStateModel] Journal not found');
            return;
        }
        
        // Add entry to journal (Set CRDT will handle merging)
        const updatedJournal = {
            ...journal,
            entries: new Set([...journal.entries, entryHash]),
            lastSync: Date.now()
        };
        
        // Store updated journal
        const result = await storeVersionedObject(updatedJournal);
        
        this.journalId = result.idHash;
        
        // Broadcast to CHUM channel
        if (this.journalChannelId) {
            await this.one.chum.channelSend({
                channel: this.journalChannelId,
                message: {
                    type: 'state-change',
                    entry,
                    journalId: this.journalId
                }
            });
        }
        
        // Notify local listeners
        this.notifyListeners(entry);
        
        console.log(`[AppStateModel] Recorded state change from ${this.source}:`, path, '=', value);
    }

    /**
     * Handle incoming state changes from remote instance
     */
    private async handleRemoteStateChange(entry: StateEntry): Promise<void> {
        // Skip if this is our own change
        if (entry.source === this.source) return;
        
        console.log(`[AppStateModel] Received remote state change from ${entry.source}:`, 
            entry.path, '=', JSON.parse(entry.value));
        
        // Notify listeners
        this.notifyListeners(entry);
    }

    /**
     * Get all journal entries
     */
    async getJournalEntries(): Promise<StateEntry[]> {
        if (!this.journalId) return [];
        
        const journalResult = await getObjectByIdHash(this.journalId);
        const journal = journalResult.obj;
        if (!journal) return [];
        
        const entries: StateEntry[] = [];
        for (const entryHash of journal.entries) {
            try {
                const entry = await this.one.getObject(entryHash);
                if (entry && entry.$type$ === 'StateEntry') {
                    entries.push(entry as StateEntry);
                }
            } catch (err) {
                console.error('[AppStateModel] Error loading entry:', err);
            }
        }
        
        // Sort by timestamp
        entries.sort((a, b) => a.timestamp - b.timestamp);
        
        return entries;
    }

    /**
     * Get journal entries for a specific path
     */
    async getJournalEntriesForPath(path: string): Promise<StateEntry[]> {
        const allEntries = await this.getJournalEntries();
        return allEntries.filter(entry => entry.path === path);
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(listener: (entry: StateEntry) => void): () => void {
        this.stateChangeListeners.add(listener);
        return () => {
            this.stateChangeListeners.delete(listener);
        };
    }

    /**
     * Notify all listeners of a state change
     */
    private notifyListeners(entry: StateEntry): void {
        for (const listener of this.stateChangeListeners) {
            listener(entry);
        }
    }

    /**
     * Save a state snapshot
     */
    async saveStateSnapshot(state: any): Promise<void> {
        if (!this.journalId) return;
        
        const journalResult = await getObjectByIdHash(this.journalId);
        const journal = journalResult.obj;
        if (!journal) return;
        
        const updatedJournal = {
            ...journal,
            [this.source === 'browser' ? 'browserState' : 'nodejsState']: JSON.stringify(state),
            lastSync: Date.now()
        };
        
        const result = await storeVersionedObject(updatedJournal);
        
        this.journalId = result.idHash;
        
        console.log(`[AppStateModel] Saved ${this.source} state snapshot`);
    }

    /**
     * Get the latest state snapshots
     */
    async getStateSnapshots(): Promise<{ browser?: any; nodejs?: any }> {
        if (!this.journalId) return {};
        
        const journalResult = await getObjectByIdHash(this.journalId);
        const journal = journalResult.obj;
        if (!journal) return {};
        
        return {
            browser: journal.browserState ? JSON.parse(journal.browserState) : undefined,
            nodejs: journal.nodejsState ? JSON.parse(journal.nodejsState) : undefined
        };
    }
}