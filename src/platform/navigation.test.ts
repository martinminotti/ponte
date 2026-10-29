import { describe, expect, it } from 'vitest';
import { depthOf, direction } from './navigation';

describe('transizioni fra le schermate', () => {
  it('profondità dello stack', () => {
    expect(depthOf('/')).toBe(0);
    expect(depthOf('/schede')).toBe(0);
    expect(depthOf('/job/abc')).toBe(1);
    expect(depthOf('/nuova?voce=1')).toBe(1);
    expect(depthOf('/job/abc/conto')).toBe(2);
  });
  it('verso del movimento', () => {
    expect(direction('/schede', '/job/a', 1, 2)).toBe('push');
    expect(direction('/job/a', '/schede', 2, 1)).toBe('pop');
    expect(direction('/job/a', '/job/a/conto', 2, 3)).toBe('push');
    expect(direction('/', '/schede', 1, 2)).toBe('none');
    expect(direction('/nuova', '/schede', 3, 3)).toBe('pop');
    expect(direction('/job/a', '/job/b', 2, 3)).toBe('push');
    expect(direction('/job/b', '/job/a', 3, 2)).toBe('pop');
  });
});
