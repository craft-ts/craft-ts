```ts
async function getUser(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  if (response.status === 404) {
    return craftException({ code: 'USER_NOT_FOUND' }, { userId });
  }
  if (!response.ok) {
    return craftException(
      { code: 'COMMON_HTTP_ERROR' },
      { status: response.status },
    );
  }
  return response.json();
}

const userId = signal<string | undefined>(undefined);

export const userQuery = query({
  params: () => userId() ?? craftException({ code: 'MISSING_USER_ID' }),
  loader: ({ params: userId }) => getUser(userId),
});

// CraftExceptionResult<{ code: "MISSING_USER_ID"; scope: "params";}>
userQuery.exceptions().params;

// | CraftExceptionResult<{  code: "USER_NOT_FOUND";  scope: "loader";}, { userId: string; }>
// | CraftExceptionResult<{  code: "COMMON_HTTP_ERROR";  scope: "loader";}, { status: number; }>
userQuery.exceptions().loader;
```
