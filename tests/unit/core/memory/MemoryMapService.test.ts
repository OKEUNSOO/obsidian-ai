import { MemoryMapService } from '../../../../src/core/memory/MemoryMapService';

const mockApp = {
  vault: {
    getMarkdownFiles: () => [],
    cachedRead: jest.fn(),
    adapter: {
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn(),
      write: jest.fn(),
      mkdir: jest.fn(),
    },
  },
} as any;

describe('MemoryMapService', () => {
  it('returns null when no index exists', async () => {
    const svc = new MemoryMapService(mockApp);
    const result = await svc.load();
    expect(result).toBeNull();
  });

  it('returns empty results when no files', async () => {
    const svc = new MemoryMapService(mockApp);
    const index = await svc.build();
    expect(index.entries).toHaveLength(0);
  });
});
