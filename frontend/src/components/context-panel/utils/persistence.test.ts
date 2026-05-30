import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveContextPanelLayout, loadContextPanelLayout } from './persistence';
import type { PersistedContextPanelLayout } from './persistence';

describe('persistence utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const validLayout: PersistedContextPanelLayout = {
    tabOrder: ['outline', 'links', 'tags', 'properties'],
    sections: [
      {
        viewIds: ['outline'],
        activeViewId: 'outline',
        heightFraction: 1,
      },
    ],
  };

  describe('saveContextPanelLayout', () => {
    it('saves layout to localStorage with correct key', () => {
      saveContextPanelLayout('user123', validLayout);

      const stored = localStorage.getItem('slatebase_context_panel_user123');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(validLayout);
    });

    it('overwrites existing layout', () => {
      saveContextPanelLayout('user123', validLayout);

      const newLayout: PersistedContextPanelLayout = {
        tabOrder: ['tags', 'links', 'outline', 'properties'],
        sections: [
          {
            viewIds: ['tags'],
            activeViewId: 'tags',
            heightFraction: 0.5,
          },
          {
            viewIds: ['links'],
            activeViewId: 'links',
            heightFraction: 0.5,
          },
        ],
      };

      saveContextPanelLayout('user123', newLayout);

      const stored = localStorage.getItem('slatebase_context_panel_user123');
      expect(JSON.parse(stored!)).toEqual(newLayout);
    });

    it('uses user-scoped key', () => {
      saveContextPanelLayout('alice', validLayout);
      saveContextPanelLayout('bob', validLayout);

      expect(localStorage.getItem('slatebase_context_panel_alice')).not.toBeNull();
      expect(localStorage.getItem('slatebase_context_panel_bob')).not.toBeNull();
    });

    it('handles localStorage unavailability gracefully', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => saveContextPanelLayout('user123', validLayout)).not.toThrow();

      setItemSpy.mockRestore();
    });
  });

  describe('loadContextPanelLayout', () => {
    it('returns persisted layout for valid data', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify(validLayout)
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toEqual(validLayout);
    });

    it('returns null when no data exists', () => {
      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null for corrupted JSON', () => {
      localStorage.setItem('slatebase_context_panel_user123', '{invalid json');

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when tabOrder is missing', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({ sections: validLayout.sections })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when tabOrder is empty', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({ tabOrder: [], sections: validLayout.sections })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when tabOrder contains invalid view IDs', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline', 'invalid_view'],
          sections: validLayout.sections,
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when sections is missing', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({ tabOrder: validLayout.tabOrder })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when sections is empty', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({ tabOrder: validLayout.tabOrder, sections: [] })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when section has invalid viewIds', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: ['not_a_view'],
              activeViewId: 'outline',
              heightFraction: 1,
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when section has empty viewIds', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: [],
              activeViewId: 'outline',
              heightFraction: 1,
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when section has invalid activeViewId', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: ['outline'],
              activeViewId: 'bogus',
              heightFraction: 1,
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when heightFraction is not a number', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: ['outline'],
              activeViewId: 'outline',
              heightFraction: 'half',
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when heightFraction is zero', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: ['outline'],
              activeViewId: 'outline',
              heightFraction: 0,
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when heightFraction is negative', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: ['outline'],
              activeViewId: 'outline',
              heightFraction: -0.5,
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when heightFraction exceeds 1', () => {
      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify({
          tabOrder: ['outline'],
          sections: [
            {
              viewIds: ['outline'],
              activeViewId: 'outline',
              heightFraction: 1.5,
            },
          ],
        })
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when stored data is not an object', () => {
      localStorage.setItem('slatebase_context_panel_user123', '"just a string"');

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('returns null when stored data is null JSON', () => {
      localStorage.setItem('slatebase_context_panel_user123', 'null');

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();
    });

    it('handles localStorage unavailability gracefully', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const result = loadContextPanelLayout('user123');
      expect(result).toBeNull();

      getItemSpy.mockRestore();
    });

    it('loads multi-section layout correctly', () => {
      const multiSectionLayout: PersistedContextPanelLayout = {
        tabOrder: ['links', 'tags', 'outline', 'properties'],
        sections: [
          {
            viewIds: ['links', 'tags'],
            activeViewId: 'links',
            heightFraction: 0.5,
          },
          {
            viewIds: ['outline'],
            activeViewId: 'outline',
            heightFraction: 0.3,
          },
          {
            viewIds: ['properties'],
            activeViewId: 'properties',
            heightFraction: 0.2,
          },
        ],
      };

      localStorage.setItem(
        'slatebase_context_panel_user123',
        JSON.stringify(multiSectionLayout)
      );

      const result = loadContextPanelLayout('user123');
      expect(result).toEqual(multiSectionLayout);
    });
  });

  describe('round-trip', () => {
    it('save then load returns identical layout', () => {
      const layout: PersistedContextPanelLayout = {
        tabOrder: ['properties', 'tags', 'links', 'outline'],
        sections: [
          {
            viewIds: ['properties', 'tags'],
            activeViewId: 'tags',
            heightFraction: 0.6,
          },
          {
            viewIds: ['links', 'outline'],
            activeViewId: 'outline',
            heightFraction: 0.4,
          },
        ],
      };

      saveContextPanelLayout('user42', layout);
      const loaded = loadContextPanelLayout('user42');

      expect(loaded).toEqual(layout);
    });
  });
});
