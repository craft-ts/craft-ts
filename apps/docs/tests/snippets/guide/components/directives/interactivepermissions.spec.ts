// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region interactivepermissions
import { Input, craftDirective } from '@craft-ts/component';
import { craftService, craftUse, overrideService } from '@craft-ts/core';

type User = { id?: string; name: string; permissions: readonly string[] };

const { UserPanelView, provideUserPanelView } = craftService(
  { name: 'userPanelView', providedIn: 'toProvide' },
  (inputs: { readonly user: Input<User> }) => ({ user: inputs.user }),
);

// A directive transforms the service the component takes. It may enrich what
// the template reads — here a permission façade — and it never adds a prop.
const InteractivePermissions = craftDirective(
  'InteractivePermissions',
  {},
  {
    service: overrideService(UserPanelView, (base) => ({
      ...base,
      canEdit: () => craftUse(base.user()).permissions.includes('edit'),
    })),
  },
);
// #endregion interactivepermissions

describe('guide/components/directives.md #interactivepermissions', () => {
  it('loads the documented snippet', () => {
    expect(InteractivePermissions && provideUserPanelView).toBeDefined();
  });
});
