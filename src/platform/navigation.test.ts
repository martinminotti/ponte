import { describe, expect, it } from 'vitest';
import { depthOf, direction, isModal } from './navigation';

describe('transizioni fra le schermate', () => {
  it('profondità dello stack', () => {
    expect(depthOf('/')).toBe(0);
    expect(depthOf('/schede')).toBe(0);
    expect(depthOf('/job/abc')).toBe(1);
    expect(depthOf('/nuova?voce=1')).toBe(1);
    expect(depthOf('/job/abc/conto')).toBe(2);
  });
  it('schermate a foglio', () => {
    expect(isModal('/nuova')).toBe(true);
    expect(isModal('/nuova?voce=1')).toBe(true);
    expect(isModal('/job/a/modifica')).toBe(true);
    expect(isModal('/job/a/conto')).toBe(false);
    expect(isModal('/job/a')).toBe(false);
  });
  it('verso del movimento', () => {
    expect(direction('/schede', '/job/a', 1, 2)).toBe('push');
    expect(direction('/job/a', '/schede', 2, 1)).toBe('pop');
    expect(direction('/job/a', '/job/a/conto', 2, 3)).toBe('push');
    expect(direction('/', '/schede', 1, 2)).toBe('none');
    expect(direction('/nuova', '/schede', 3, 3)).toBe('uncover');
    expect(direction('/schede', '/nuova', 2, 3)).toBe('cover');
    expect(direction('/job/a', '/job/a/modifica', 2, 3)).toBe('cover');
    expect(direction('/job/a/modifica', '/job/a', 3, 3)).toBe('uncover');
    expect(direction('/nuova', '/nuova', 3, 3)).toBe('none');
    expect(direction('/job/a', '/job/b', 2, 3)).toBe('push');
    expect(direction('/job/b', '/job/a', 3, 2)).toBe('pop');
  });
});
