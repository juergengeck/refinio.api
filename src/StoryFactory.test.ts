/**
 * StoryFactory.test.ts - Test onStoryCreated hook functionality
 *
 * Tests the listener/hook system that fires whenever a Story is created.
 */

import { StoryFactory, type Story, type ExecutionMetadata } from './StoryFactory.js';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

describe('StoryFactory', () => {
    describe('onStoryCreated hook', () => {
        let storyFactory: StoryFactory;
        let mockStore: jest.Mock;
        let storyCounter: number;

        beforeEach(() => {
            storyCounter = 0;
            // Mock storeVersionedObject function
            mockStore = jest.fn().mockImplementation(async (obj: any) => {
                storyCounter++;
                return {
                    idHash: `mock-id-hash-${storyCounter}` as SHA256IdHash<typeof obj>,
                    hash: `mock-hash-${storyCounter}` as SHA256Hash<typeof obj>
                };
            });
            storyFactory = new StoryFactory(mockStore);
        });

        test('adding a listener via onStoryCreated registers it', () => {
            const listener = jest.fn();
            const unsubscribe = storyFactory.onStoryCreated(listener);

            expect(typeof unsubscribe).toBe('function');
            expect(listener).not.toHaveBeenCalled();
        });

        test('creating a Story via createStory calls registered listeners with the Story', async () => {
            const listener = jest.fn();
            storyFactory.onStoryCreated(listener);

            await storyFactory.createStory(
                'mock-plan-id',
                'Test Story',
                'Test Description',
                'v1.0.0',
                true,
                'success'
            );

            expect(listener).toHaveBeenCalledTimes(1);
            const calledStory = listener.mock.calls[0][0] as Story;
            expect(calledStory.$type$).toBe('Story');
            expect(calledStory.title).toBe('Test Story');
            expect(calledStory.description).toBe('Test Description');
            expect(calledStory.success).toBe(true);
        });

        test('creating a Story via recordExecution (success) calls registered listeners', async () => {
            const listener = jest.fn();
            storyFactory.onStoryCreated(listener);

            const metadata: ExecutionMetadata = {
                title: 'Test Execution',
                description: 'Test Description',
                planId: 'mock-plan-id',
                owner: 'test-owner',
                domain: 'test-domain',
                instanceVersion: 'v1.0.0',
                supply: {
                    domain: 'test-domain',
                    subjects: ['test'],
                    keywords: ['test']
                },
                demand: {
                    domain: 'test-domain',
                    keywords: ['test']
                },
                matchScore: 1.0
            };

            await storyFactory.recordExecution(metadata, async () => {
                return 'test-result';
            });

            // Should be called once for the success Story
            expect(listener).toHaveBeenCalledTimes(1);
            const calledStory = listener.mock.calls[0][0] as Story;
            expect(calledStory.$type$).toBe('Story');
            expect(calledStory.title).toBe('Test Execution');
            expect(calledStory.success).toBe(true);
        });

        test('creating a Story via recordExecution (failure) calls registered listeners', async () => {
            const listener = jest.fn();
            storyFactory.onStoryCreated(listener);

            const metadata: ExecutionMetadata = {
                title: 'Test Execution',
                description: 'Test Description',
                planId: 'mock-plan-id',
                owner: 'test-owner',
                domain: 'test-domain',
                instanceVersion: 'v1.0.0',
                supply: {
                    domain: 'test-domain',
                    subjects: ['test'],
                    keywords: ['test']
                },
                demand: {
                    domain: 'test-domain',
                    keywords: ['test']
                }
            };

            await expect(
                storyFactory.recordExecution(metadata, async () => {
                    throw new Error('Test error');
                })
            ).rejects.toThrow('Test error');

            // Should be called once for the failure Story
            expect(listener).toHaveBeenCalledTimes(1);
            const calledStory = listener.mock.calls[0][0] as Story;
            expect(calledStory.$type$).toBe('Story');
            expect(calledStory.title).toBe('Test Execution');
            expect(calledStory.success).toBe(false);
        });

        test('unsubscribe function removes the listener', async () => {
            const listener = jest.fn();
            const unsubscribe = storyFactory.onStoryCreated(listener);

            // Unsubscribe before creating Story
            unsubscribe();

            await storyFactory.createStory(
                'mock-plan-id',
                'Test Story',
                'Test Description',
                'v1.0.0'
            );

            // Listener should not have been called
            expect(listener).not.toHaveBeenCalled();
        });

        test('multiple listeners all get called', async () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const listener3 = jest.fn();

            storyFactory.onStoryCreated(listener1);
            storyFactory.onStoryCreated(listener2);
            storyFactory.onStoryCreated(listener3);

            await storyFactory.createStory(
                'mock-plan-id',
                'Test Story',
                'Test Description',
                'v1.0.0'
            );

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
            expect(listener3).toHaveBeenCalledTimes(1);

            // All should receive the same Story object
            const story1 = listener1.mock.calls[0][0] as Story;
            const story2 = listener2.mock.calls[0][0] as Story;
            const story3 = listener3.mock.calls[0][0] as Story;

            expect(story1).toBe(story2);
            expect(story2).toBe(story3);
        });

        test('unsubscribed listener is not called while others still are', async () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const listener3 = jest.fn();

            storyFactory.onStoryCreated(listener1);
            const unsubscribe2 = storyFactory.onStoryCreated(listener2);
            storyFactory.onStoryCreated(listener3);

            // Unsubscribe listener2
            unsubscribe2();

            await storyFactory.createStory(
                'mock-plan-id',
                'Test Story',
                'Test Description',
                'v1.0.0'
            );

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).not.toHaveBeenCalled(); // Should NOT be called
            expect(listener3).toHaveBeenCalledTimes(1);
        });

        test('listener can be called multiple times for multiple Story creations', async () => {
            const listener = jest.fn();
            storyFactory.onStoryCreated(listener);

            await storyFactory.createStory(
                'mock-plan-id',
                'Story 1',
                'Description 1',
                'v1.0.0'
            );

            await storyFactory.createStory(
                'mock-plan-id',
                'Story 2',
                'Description 2',
                'v1.0.0'
            );

            expect(listener).toHaveBeenCalledTimes(2);
            expect((listener.mock.calls[0][0] as Story).title).toBe('Story 1');
            expect((listener.mock.calls[1][0] as Story).title).toBe('Story 2');
        });

        test('listener receives Story object before it is stored', async () => {
            const listener = jest.fn((story: Story) => {
                // At this point, the Story should be fully formed
                expect(story.$type$).toBe('Story');
                expect(story.id).toBeTruthy();
                expect(story.title).toBeTruthy();
            });

            storyFactory.onStoryCreated(listener);

            await storyFactory.createStory(
                'mock-plan-id',
                'Test Story',
                'Test Description',
                'v1.0.0'
            );

            expect(listener).toHaveBeenCalled();
        });
    });
});
