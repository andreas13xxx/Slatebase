import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventSystem } from './event-system';

describe('EventSystem', () => {
  let emitter: EventSystem;

  beforeEach(() => {
    emitter = new EventSystem();
  });

  describe('on()', () => {
    it('returns an EventRef with id, event, and callback', () => {
      const cb = vi.fn();
      const ref = emitter.on('test', cb);

      expect(ref.id).toBeDefined();
      expect(typeof ref.id).toBe('string');
      expect(ref.event).toBe('test');
      expect(ref.callback).toBe(cb);
    });

    it('generates unique IDs for each registration', () => {
      const ref1 = emitter.on('test', vi.fn());
      const ref2 = emitter.on('test', vi.fn());

      expect(ref1.id).not.toBe(ref2.id);
    });
  });

  describe('trigger()', () => {
    it('calls registered callbacks with provided args', () => {
      const cb = vi.fn();
      emitter.on('test', cb);

      emitter.trigger('test', 'arg1', 42);

      expect(cb).toHaveBeenCalledWith('arg1', 42);
    });

    it('dispatches synchronously in registration order', () => {
      const order: number[] = [];
      emitter.on('test', () => order.push(1));
      emitter.on('test', () => order.push(2));
      emitter.on('test', () => order.push(3));

      emitter.trigger('test');

      expect(order).toEqual([1, 2, 3]);
    });

    it('does nothing if no listeners are registered for the event', () => {
      expect(() => emitter.trigger('nonexistent')).not.toThrow();
    });

    it('only triggers listeners for the matching event', () => {
      const cbA = vi.fn();
      const cbB = vi.fn();
      emitter.on('eventA', cbA);
      emitter.on('eventB', cbB);

      emitter.trigger('eventA', 'data');

      expect(cbA).toHaveBeenCalledWith('data');
      expect(cbB).not.toHaveBeenCalled();
    });
  });

  describe('exception isolation', () => {
    it('continues executing remaining callbacks when one throws', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn(() => { throw new Error('boom'); });
      const cb3 = vi.fn();

      emitter.on('test', cb1);
      emitter.on('test', cb2);
      emitter.on('test', cb3);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.trigger('test');

      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      expect(cb3).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('logs the error with event name when a callback throws', () => {
      emitter.on('myEvent', () => { throw new Error('oops'); });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.trigger('myEvent');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('myEvent'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('off()', () => {
    it('removes a callback so it no longer fires on trigger', () => {
      const cb = vi.fn();
      emitter.on('test', cb);

      emitter.off('test', cb);
      emitter.trigger('test');

      expect(cb).not.toHaveBeenCalled();
    });

    it('is idempotent — calling off() multiple times does not throw', () => {
      const cb = vi.fn();
      emitter.on('test', cb);

      emitter.off('test', cb);
      expect(() => emitter.off('test', cb)).not.toThrow();
    });

    it('does not throw when called with an unregistered callback', () => {
      const cb = vi.fn();
      expect(() => emitter.off('test', cb)).not.toThrow();
    });

    it('does not throw when called for a non-existent event', () => {
      const cb = vi.fn();
      expect(() => emitter.off('nonexistent', cb)).not.toThrow();
    });

    it('only removes the specified callback, others still fire', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      emitter.on('test', cb1);
      emitter.on('test', cb2);

      emitter.off('test', cb1);
      emitter.trigger('test');

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });

    it('removed listener does not fire on subsequent triggers', () => {
      const cb = vi.fn();
      emitter.on('test', cb);

      emitter.off('test', cb);
      emitter.trigger('test');
      emitter.trigger('test');

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('offref()', () => {
    it('removes a listener by EventRef', () => {
      const cb = vi.fn();
      const ref = emitter.on('test', cb);

      emitter.offref(ref);
      emitter.trigger('test');

      expect(cb).not.toHaveBeenCalled();
    });

    it('is idempotent — calling offref() multiple times does not throw', () => {
      const cb = vi.fn();
      const ref = emitter.on('test', cb);

      emitter.offref(ref);
      expect(() => emitter.offref(ref)).not.toThrow();
    });

    it('only removes the specific listener referenced by the EventRef', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const ref1 = emitter.on('test', cb1);
      emitter.on('test', cb2);

      emitter.offref(ref1);
      emitter.trigger('test');

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    });
  });

  describe('removeAllListeners()', () => {
    it('removes all listeners for all events', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      emitter.on('eventA', cb1);
      emitter.on('eventB', cb2);

      emitter.removeAllListeners();
      emitter.trigger('eventA');
      emitter.trigger('eventB');

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });

    it('can register new listeners after removeAllListeners()', () => {
      emitter.on('test', vi.fn());
      emitter.removeAllListeners();

      const cb = vi.fn();
      emitter.on('test', cb);
      emitter.trigger('test');

      expect(cb).toHaveBeenCalled();
    });
  });

  describe('off() during trigger (snapshot behavior)', () => {
    it('a listener removed during trigger does not fire if not yet reached', () => {
      const cb2 = vi.fn();
      emitter.on('test', () => {
        emitter.off('test', cb2);
      });
      emitter.on('test', cb2);

      emitter.trigger('test');

      // cb2 should NOT fire because it was removed before its turn in the snapshot check
      expect(cb2).not.toHaveBeenCalled();
    });

    it('adding a listener during trigger does not affect current dispatch', () => {
      const lateCb = vi.fn();
      emitter.on('test', () => {
        emitter.on('test', lateCb);
      });

      emitter.trigger('test');

      // lateCb was added during trigger — it's not in the snapshot
      expect(lateCb).not.toHaveBeenCalled();

      // But it fires on the next trigger
      emitter.trigger('test');
      expect(lateCb).toHaveBeenCalled();
    });
  });
});
