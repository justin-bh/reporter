// Ad-hoc code-sign the packaged macOS app.
//
// electron-builder injects app.asar and rewrites the bundle AFTER Electron's
// own binary was signed, which leaves the app's top-level signature broken
// ("code has no resources but signature indicates they must be present"). On
// Apple Silicon a broken/absent signature makes Gatekeeper report a transferred
// app as "damaged and can't be opened". A deep ad-hoc signature (identity "-")
// makes the signature valid again, so the app instead shows the normal
// "unidentified developer" prompt (bypassable). Full notarization still requires
// an Apple Developer ID — see apps/desktop/README.md.
const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // During a universal build electron-builder packs each arch into a *-temp dir
  // and then merges them; @electron/universal requires the per-arch bundles to
  // have identical non-binary SHAs, so signing the intermediates breaks the
  // merge. Skip them and sign only the final (merged / single-arch) output.
  if (context.appOutDir.includes('-temp')) return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  console.log(`afterPack: ad-hoc signing ${appPath}`);
  execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
  console.log('afterPack: ad-hoc signature verified');
};
