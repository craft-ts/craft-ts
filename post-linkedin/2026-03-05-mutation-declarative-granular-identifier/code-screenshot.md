```ts
export const updateUserMutation = mutation({
  method: (user: UpdateUserInput) => user,
  loader: async ({ params: user }) => apiService.updateUser(user),
});

updateUserMutation.mutate({ id: 'user-1', name: 'Romain' });

const isLoading = updateUserMutation.isLoading();
// boolean
const updatedUser = updateUserMutation.safeValue();
// UpdateUserInput | undefined
```
