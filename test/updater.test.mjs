import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changelogItems, isNewer, parseVersion, repoSlug } from '../lib/updater.mjs';

test('versions compare numerically, not as text', () => {
  assert.equal(isNewer('0.10.0', '0.9.3'), true);
  assert.equal(isNewer('v1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.2.0', '0.2.0'), false);
  assert.equal(isNewer('0.1.9', '0.2.0'), false);
  assert.equal(isNewer('nonsense', '0.2.0'), false);
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
});

test('GitHub remotes resolve to owner/repo', () => {
  assert.equal(repoSlug('https://github.com/vladjdk/focus.git\n'), 'vladjdk/focus');
  assert.equal(repoSlug('git@github.com:vladjdk/focus.git'), 'vladjdk/focus');
  assert.equal(repoSlug('https://github.com/vladjdk/focus'), 'vladjdk/focus');
  assert.equal(repoSlug('https://example.com/a/b.git'), null);
});

test('release notes become plain bullets', () => {
  const body = '## What changed\n- **Update** button\n* See [the docs](https://x.y)\n\nnot a bullet\n- `code` bits';
  assert.deepEqual(changelogItems(body), ['Update button', 'See the docs', 'code bits']);
  assert.deepEqual(changelogItems(null), []);
  assert.equal(changelogItems(Array.from({ length: 20 }, (_, i) => `- item ${i}`).join('\n')).length, 8);
});
