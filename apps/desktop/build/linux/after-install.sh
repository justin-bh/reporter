#!/bin/bash
# Custom deb postinst. Mirrors electron-builder's default integration (the
# update-alternatives symlink + mime/desktop-db refresh), but ALWAYS makes the
# Chromium sandbox helper SUID root.
#
# Why: the stock postinst only chmods chrome-sandbox to 4755 when the kernel has
# no user namespaces. But postinst runs as root, and root can always create user
# namespaces, so the check passes and it leaves chrome-sandbox as 0755. On
# Ubuntu 23.10+/24.04+/26.04 the *unprivileged* user is then blocked from
# unprivileged userns by AppArmor, and with no SUID fallback Chromium aborts at
# launch ("The SUID sandbox helper binary ... is not configured correctly" /
# "No usable sandbox!"). Forcing SUID makes the setuid sandbox work everywhere.
#
# Paths are literal (fpm does not template this script); they track productName
# `reporter` (install dir /opt/reporter) + executableName `reporter`.

if type update-alternatives 2>/dev/null >&1; then
    # Remove a previous non-alternatives link if present.
    if [ -L '/usr/bin/reporter' -a -e '/usr/bin/reporter' -a "`readlink '/usr/bin/reporter'`" != '/etc/alternatives/reporter' ]; then
        rm -f '/usr/bin/reporter'
    fi
    update-alternatives --install '/usr/bin/reporter' 'reporter' '/opt/reporter/reporter' 100 || ln -sf '/opt/reporter/reporter' '/usr/bin/reporter'
else
    ln -sf '/opt/reporter/reporter' '/usr/bin/reporter'
fi

chmod 4755 '/opt/reporter/chrome-sandbox' || true

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
