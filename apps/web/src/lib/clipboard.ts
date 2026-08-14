/**
 * Copy text to the clipboard, working in both secure (HTTPS / localhost) and
 * insecure (plain-HTTP LAN) contexts.
 *
 * `navigator.clipboard` only exists in a secure context, so a reporter server
 * reached over http://<lan-ip>:8080 has no async Clipboard API — the async path
 * is skipped there and we fall back to a hidden <textarea> + execCommand('copy'),
 * which still works over HTTP. Returns whether the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or transient failure — try the legacy path.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    // Keep it off-screen but selectable.
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
