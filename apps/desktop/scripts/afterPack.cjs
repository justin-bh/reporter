// Code-sign the packaged macOS app.
//
// electron-builder injects app.asar and rewrites the bundle AFTER Electron's
// own binary was signed, which leaves the app's top-level signature broken
// ("code has no resources but signature indicates they must be present"). On
// Apple Silicon a broken/absent signature makes Gatekeeper report a transferred
// app as "damaged and can't be opened". A deep signature makes it valid again.
//
// Identity is chosen via REPORTER_SIGN_IDENTITY:
//   - unset / "-"  → ad-hoc. Valid signature, but the app's identity IS its
//     content hash (cdhash). Every rebuild → a new identity, so macOS TCC grants
//     (Screen Recording, etc.) are bound to one build and break on the next one.
//   - a keychain identity name (e.g. "Reporter Dev", a self-signed code-signing
//     cert) → a STABLE designated requirement anchored to that certificate.
//     Rebuilds and copies keep the same identity, so a Screen Recording grant
//     given once persists across every rebuild. Recommended for local dev; see
//     apps/desktop/README.md for creating the cert. (Full notarization / a
//     prompt-free install still requires an Apple Developer ID.)
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
  const identity = process.env.REPORTER_SIGN_IDENTITY || '-';
  const label = identity === '-' ? 'ad-hoc' : `identity "${identity}"`;
  console.log(`afterPack: signing ${appPath} with ${label}`);
  execSync(`codesign --deep --force --sign "${identity}" "${appPath}"`, {
    stdio: 'inherit',
  });
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
  if (identity === '-') {
    console.log(
      'afterPack: ad-hoc signature verified. NOTE: macOS permissions (Screen ' +
        'Recording) are pinned to this build and will reset on the next rebuild. ' +
        'Set REPORTER_SIGN_IDENTITY to a stable code-signing cert to avoid this.',
    );
  } else {
    // Surface the designated requirement so it's easy to confirm the grant is
    // anchored to the cert (stable) and not to a cdhash (per-build).
    const dr = execSync(`codesign -d -r- "${appPath}"`, { encoding: 'utf8' });
    console.log(`afterPack: signature verified. Designated requirement:\n${dr.trim()}`);
  }
};
