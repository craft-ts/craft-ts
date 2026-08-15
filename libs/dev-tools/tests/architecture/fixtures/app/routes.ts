import { craftRoute, craftRoutes } from '../craft-runtime';
import { AdminPage } from './admin-page';
import { CheckoutPage } from './checkout-page';
import { provideCart } from './cart';
import { provideUserDetail } from './user-detail';
import { provideUserList } from './user-list';

export const appRoutes = craftRoutes('appRoutes', [
  craftRoute('/admin', {
    path: '/admin',
    providers: [provideUserList()],
    loadComponent: () => Promise.resolve(AdminPage),
  }),
  craftRoute('/checkout', {
    path: '/checkout',
    providers: [provideCart()],
    loadComponent: () => Promise.resolve(CheckoutPage),
  }),
  craftRoute('/users/:id', {
    path: '/users/:id',
    providers: [provideUserDetail()],
  }),
]);
