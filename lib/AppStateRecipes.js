export const StateEntryRecipe = {
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
export const AppStateJournalRecipe = {
    $type$: 'Recipe',
    name: 'AppStateJournal',
    rule: [
        {
            itemprop: 'id',
            itemtype: { type: 'string' },
            optional: false
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
