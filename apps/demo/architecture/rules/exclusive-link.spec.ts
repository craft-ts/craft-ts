import { beforeAll, describe, expect, it } from 'vitest';
import { noExclusiveLink } from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('noExclusiveLink', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('keeps exclusive feature branches from linking', () => {
    const [userList] = graph.providedOn('UserList');
    const [userMutation] = graph.providedOn('UserMutation');
    expect(userList).toBeDefined();
    expect(userMutation).toBeDefined();
    noExclusiveLink(userList, userMutation);
  });
});
