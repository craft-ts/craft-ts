<script>
import Row from './Row.svelte';
import { initialModel, visibleRows, reduce, settings, installActionHandler } from '../common.js';
let model = $state.raw(initialModel);
const visible = $derived(visibleRows(model));
installActionHandler(action => { model = reduce(model, action); });
</script>
<div id="rows" data-revision={model.revision}>{#each visible as row, i (row.id)}<Row {row} position={settings.indexes ? i : 0} />{/each}</div>
