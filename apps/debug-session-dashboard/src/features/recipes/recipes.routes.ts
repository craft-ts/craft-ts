import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

export const { recipesRoutes } = craftRoutes('recipes', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./recipes-page')).then(
        (module) => module.RecipesPage,
      ),
    ),
  }),
  craftRoute(':recipeId', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./recipe-detail-page')).then(
        (module) => module.RecipeDetailPage,
      ),
    ),
  }),
]);
assertExhaustiveRouteExceptions(recipesRoutes);
