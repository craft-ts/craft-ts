import { render } from 'solid-js/web';
import { begin, installHandlers } from '../../page-common.js';
import { App, mounted } from './app.js';

let dispose: (() => void) | undefined;

function mountApp() {
  dispose = render(() => <App />, document.getElementById('mount')!);
}

begin();
installHandlers({
  update: (action: string) => mounted.page!.dispatch(action),
  remount: () => {
    dispose!();
    mountApp();
  },
});
mountApp();
