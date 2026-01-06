import { createNestedStateUpdate } from './update-state.util';

describe('createNestedStateUpdate', () => {
  it('1 - should update the nested primitive string', () => {
    const state = {
      user: {
        id: '1',
        name: 'John',
        address: {
          city: 'New York',
          zip: '10001',
        },
      },
    };

    const result = createNestedStateUpdate({
      state,
      keysPath: ['user', 'address', 'city'],
      value: 'Los Angeles',
    });

    expect(result).toEqual({
      user: {
        id: '1',
        name: 'John',
        address: {
          city: 'Los Angeles',
          zip: '10001',
        },
      },
    });
  });
  it('2 - should update the nested object', () => {
    const state = {
      user: {
        id: '1',
        name: 'John',
        address: {
          city: 'New York',
          zip: '10001',
        },
      },
    };
    const updatedAddress = {
      city: 'Updated',
      zip: 'updated',
    };

    const result = createNestedStateUpdate({
      state,
      keysPath: ['user', 'address'],
      value: updatedAddress,
    });

    expect(result).toEqual({
      user: {
        id: '1',
        name: 'John',
        address: updatedAddress,
      },
    });
  });

  it('3 - should update nested primitive number', () => {
    const state = {
      user: {
        id: '1',
        age: 25,
        profile: {
          score: 100,
        },
      },
    };

    const result = createNestedStateUpdate({
      state,
      keysPath: ['user', 'profile', 'score'],
      value: 200,
    });

    expect(result).toEqual({
      user: {
        id: '1',
        age: 25,
        profile: {
          score: 200,
        },
      },
    });
  });

  it('4 - should update nested primitive boolean', () => {
    const state = {
      settings: {
        notifications: {
          enabled: true,
        },
      },
    };

    const result = createNestedStateUpdate({
      state,
      keysPath: ['settings', 'notifications', 'enabled'],
      value: false,
    });

    expect(result).toEqual({
      settings: {
        notifications: {
          enabled: false,
        },
      },
    });
  });

  it('5 - should update nested primitive null', () => {
    const state = {
      user: {
        avatar: 'avatar.jpg',
      },
    };

    const result = createNestedStateUpdate({
      state,
      keysPath: ['user', 'avatar'],
      value: null,
    });

    expect(result).toEqual({
      user: {
        avatar: null,
      },
    });
  });

  it('6 - should update nested array property', () => {
    const state = {
      user: {
        id: '1',
        name: 'John',
        hobbies: ['reading', 'gaming'],
        profile: {
          tags: ['developer', 'javascript'],
        },
      },
    };

    const newTags = ['developer', 'typescript', 'angular'];

    const result = createNestedStateUpdate({
      state,
      keysPath: ['user', 'profile', 'tags'],
      value: newTags,
    });

    expect(result).toEqual({
      user: {
        id: '1',
        name: 'John',
        hobbies: ['reading', 'gaming'],
        profile: {
          tags: ['developer', 'typescript', 'angular'],
        },
      },
    });
  });

  it('7 - should update top-level array property', () => {
    const state = {
      items: ['item1', 'item2'],
      settings: {
        enabled: true,
      },
    };

    const newItems = ['item1', 'item2', 'item3'];

    const result = createNestedStateUpdate({
      state,
      keysPath: ['items'],
      value: newItems,
    });

    expect(result).toEqual({
      items: ['item1', 'item2', 'item3'],
      settings: {
        enabled: true,
      },
    });
  });
});
