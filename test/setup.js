import { jest } from '@jest/globals';

// Basic GNOME Shell API mocks for testing
global.screenShield = {
    connect: jest.fn(() => 'unlock-screen-handler-id'),
    disconnect: jest.fn()
};

// Mock window object for testing
global.createMockWindow = (id = 1) => ({
    get_id: jest.fn(() => id),
    connect: jest.fn(() => `window-${id}-event-handler`),
    disconnect: jest.fn()
});

// Mock target object with connect/disconnect capabilities
global.createMockTarget = (name = 'target') => ({
    connect: jest.fn(() => `${name}-event-handler-123`),
    disconnect: jest.fn()
});
