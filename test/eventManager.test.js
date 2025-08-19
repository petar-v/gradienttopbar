import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import './setup.js';
import EventManager from '../src/events/eventManager.js';

describe('EventManager', () => {
    let eventManager;
    let mockTarget;

    beforeEach(() => {
        eventManager = new EventManager();
        mockTarget = global.createMockTarget('display');
        jest.clearAllMocks();
    });

    test('should be instantiated correctly', () => {
        expect(eventManager).toBeDefined();
        expect(eventManager.evenIds).toEqual({});
        expect(eventManager.monitoredWindows).toEqual({});
        expect(eventManager.unlockHandlerId).toBe(null);
    });

    test('should attach global event only once', () => {
        const callback = jest.fn();

        eventManager.attachGlobalEventOnce('window-created', mockTarget, callback);
        eventManager.attachGlobalEventOnce('window-created', mockTarget, callback);

        expect(mockTarget.connect).toHaveBeenCalledTimes(1);
        expect(mockTarget.connect).toHaveBeenCalledWith('window-created', callback);
    });

    test('should disconnect all events', () => {
        const callback = jest.fn();

        eventManager.attachGlobalEventOnce('window-created', mockTarget, callback);
        eventManager.disconnectAllEvents();

        expect(mockTarget.disconnect).toHaveBeenCalledTimes(1);
        expect(eventManager.evenIds).toEqual({});
    });

    test('should attach window events', () => {
        const mockWindow = global.createMockWindow(123);
        const callback = jest.fn();

        eventManager.attachWindowEventOnce('size-changed', mockWindow, callback);

        expect(mockWindow.connect).toHaveBeenCalledWith('size-changed', callback);
        expect(eventManager.monitoredWindows[123]).toBeDefined();
    });
});
