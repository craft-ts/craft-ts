# craftAsyncMethods

Integrate async methods into craft stores with automatic state management.

## Import

```typescript
import { craft, craftAsyncMethods, asyncMethod } from '@ngcraft/core';
```

## Basic Pattern

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    loadUser: asyncMethod({
      method: (id: number) => ({ id }),
      loader: async ({ params }) => {
        const response = await fetch(`/api/users/${params.id}`);
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Trigger async method
store.setLoadUser(1);

// Access state
console.log(store.loadUser.status()); // 'idle' | 'loading' | 'resolved' | 'error'
console.log(store.loadUser.isLoading()); // boolean
console.log(store.loadUser.value()); // User data or undefined
console.log(store.loadUser.error()); // Error or undefined
```

## With Identifier (Parallel Operations)

```typescript
const { injectCraft } = craft(
  { name: '', providedIn: 'root' },
  craftAsyncMethods(() => ({
    uploadFile: asyncMethod({
      method: (file: File) => ({ fileId: file.name, file }),
      identifier: (params) => params.fileId,
      loader: async ({ params }) => {
        const formData = new FormData();
        formData.append('file', params.file);
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        return response.json();
      },
    }),
  })),
);

const store = injectCraft();

// Upload multiple files in parallel
store.setUploadFile(file1);
store.setUploadFile(file2);

// Track individual states
const file1Upload = store.uploadFile.select(file1.name);
console.log(file1Upload?.status()); // Individual status
console.log(file1Upload?.value()); // Individual result
```

For detailed documentation, see [asyncMethod primitive](/primitives/async-method).
