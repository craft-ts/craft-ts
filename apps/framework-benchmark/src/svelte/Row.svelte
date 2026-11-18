<script>
import { settings } from '../common.js';
let { row, position } = $props();
</script>
<div data-row={row.id}>{#if settings.indexes}<span data-position={position}>{`${position + 1}. `}</span>{/if}{row.label}</div>
