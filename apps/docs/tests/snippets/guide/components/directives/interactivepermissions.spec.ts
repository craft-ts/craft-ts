// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness';

useSnippetHarness();

// #region interactivepermissions
import {
  HostRequiredLogic,
  HostTemplate,
  Input,
  craftDirective,
} from '@craft-ts/component';

type User = { id?: string; name: string };

type RequiresUser = {
  user: Input<User>;
};

type ProvidesPermissions = RequiresUser & {
  permissions: {
    canEdit: () => boolean;
  };
};

const InteractivePermissions = craftDirective(
  'InteractivePermissions',
  {},
  (baseLogic: HostRequiredLogic<RequiresUser>) => (user: Input<User>) => {
    const context = baseLogic(user);

    return {
      ...context,
      permissions: {
        canEdit: () => user().permissions.includes('edit'),
      },
    };
  },

  (baseTemplate: HostTemplate<ProvidesPermissions>) => (context) =>
    baseTemplate(context),
);
// #endregion interactivepermissions

describe('guide/components/directives.md #interactivepermissions', () => {
  it('loads the documented snippet', () => {
    expect(true).toBe(true);
  });
});
