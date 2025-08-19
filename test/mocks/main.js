import { jest } from '@jest/globals';

export const screenShield = {
    connect: jest.fn(() => 'unlock-screen-handler-id'),
    disconnect: jest.fn()
};
