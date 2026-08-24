/**
 * Shared client production defaults. Libraries stay ESM and are bundled by
 * the consuming application; these options apply to deployable app bundles.
 */
export function craftProductionBuildOptions(outDir, overrides = {}) {
  return {
    outDir,
    emptyOutDir: true,
    minify: 'oxc',
    cssMinify: 'lightningcss',
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
    ...overrides,
  };
}
