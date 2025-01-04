function createMockRedisClient() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockImplementation((channel, callback) => {
      // Store callback for simulating message receipt
      (mockRedisClient as any).__subscribeCallback = callback;
      return Promise.resolve();
    }),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    hSet: jest.fn().mockResolvedValue(1),
    hGet: jest.fn().mockResolvedValue(null),
    hGetAll: jest.fn().mockResolvedValue({}),
    hDel: jest.fn().mockResolvedValue(1),
    multi: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
      set: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      hdel: jest.fn().mockReturnThis()
    }),
    duplicate: jest.fn().mockImplementation(() => createMockRedisClient())
  };
}

const mockRedisClient = createMockRedisClient();

export const createClient = jest.fn().mockImplementation(() => createMockRedisClient());

export default {
  createClient
};
