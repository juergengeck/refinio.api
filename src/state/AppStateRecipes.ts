import type { Recipe, Person } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

declare module '@OneObjectInterfaces' {
    export interface OneVersionedObjectInterfaces {
        AppStateJournal: AppStateJournal;
        StateEntry: StateEntry;
    }
}

export interface StateEntry {
    $type$: 'StateEntry';
    timestamp: number;
    source: 'browser' | 'nodejs';
    path: string;
    value: string;
    previousValue?: string;
    author: SHA256IdHash<Person>;
    metadata?: {
        action?: string;
        description?: string;
    };
}

export interface AppStateJournal {
    $type$: 'AppStateJournal';
    id: 'AppStateJournal';
    entries: Set<SHA256Hash<StateEntry>>;
    lastSync?: number;
    browserState?: string;
    nodejsState?: string;
}

/**
 * State entry for the journal - interface definition for reference
 * The actual type is defined in @OneObjectInterfaces
 */
interface StateEntryDefinition {
    $type$: 'StateEntry';
    timestamp: number;
    source: 'browser' | 'nodejs';
    path: string;
    value: string; // JSON stringified value
    previousValue?: string; // JSON stringified previous value
    author: SHA256IdHash<Person>;
    metadata?: {
        action?: string; // e.g., 'login', 'logout', 'message_sent'
        description?: string;
    };
}

/**
 * App State Journal - a CRDT that merges state changes from both instances
 * Uses a Set CRDT to merge entries from both browser and Node.js
 * The actual type is defined in @OneObjectInterfaces
 */
interface AppStateJournalDefinition {
    $type$: 'AppStateJournal';
    id: 'AppStateJournal';
    entries: Set<SHA256Hash<StateEntry>>;
    lastSync?: number;
    browserState?: string; // JSON stringified browser state snapshot
    nodejsState?: string; // JSON stringified Node.js state snapshot
}

export const StateEntryRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'StateEntry',
    rule: [
        {
            itemprop: 'timestamp',
            itemtype: { type: 'integer' },
            optional: false
        },
        {
            itemprop: 'source',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'path',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'value',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'previousValue',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'author',
            itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
            optional: false
        },
        {
            itemprop: 'metadata',
            itemtype: { 
                type: 'object',
                rules: [
                    {
                        itemprop: 'action',
                        itemtype: { type: 'string' },
                        optional: true
                    },
                    {
                        itemprop: 'description',
                        itemtype: { type: 'string' },
                        optional: true
                    }
                ]
            },
            optional: true
        }
    ]
};

export const AppStateJournalRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'AppStateJournal',
    rule: [
        {
            itemprop: 'id',
            itemtype: { type: 'string' },
            optional: false,
            isId: true
        },
        {
            itemprop: 'entries',
            itemtype: { 
                type: 'set',
                item: { type: 'referenceToObj', allowedTypes: new Set(['StateEntry']) }
            },
            optional: false
        },
        {
            itemprop: 'lastSync',
            itemtype: { type: 'integer' },
            optional: true
        },
        {
            itemprop: 'browserState',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'nodejsState',
            itemtype: { type: 'string' },
            optional: true
        }
    ]
};