# Setup, updates, and removal

[Back to README](../README.en.md) | [日本語](SETUP.ja.md)

## Initial setup

You need Windows 10/11, .NET Framework 4.8, Node.js 24 or later, and Codex configured to save session logs on the same PC.

**This repository contains source code. Downloading it from GitHub does not provide a ready-to-run EXE.** Build the app and install a protected copy for your normal Windows account. If it is already installed, skip this section.

### 1. Build and prepare the installation package

This example assumes the source is at `C:\work\onecarat-agent-office-cx`. Change the first path if needed. Run each command separately and stop if any command fails. No additional npm packages need to be installed.

```powershell
Set-Location C:\work\onecarat-agent-office-cx
npm.cmd run build
node scripts/package-office.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-office.ps1 -ValidateOnly
```

The message `Package contents and hashes verified` confirms the package file and hash checks. This is not a software signature or a guarantee of overall safety.

### 2. Review and install the protected copy

Review the [security response and manual installation instructions (Japanese)](SECURITY_RESPONSE_2026_11_22.md#レビューと手動配置), the script, and the package contents. Then **run the following yourself in regular PowerShell**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-office.ps1 -ReviewedPackage
icacls "$env:LOCALAPPDATA\Programs\OnecaratCX" /T
```

The installer expects Node.js at `C:\Program Files\nodejs\node.exe` by default. If it is installed elsewhere, append `-NodeExe 'ABSOLUTE-PATH-TO-TRUSTED-node.exe'` to the installation command.

The destination is `%LOCALAPPDATA%\Programs\OnecaratCX`. Check for `Installed reviewed copy with private ACL` and confirm that access permissions allow only your account, SYSTEM, and Administrators. Installation does not automatically launch Office or Codex. Once complete, proceed to [Everyday use](../README.en.md#everyday-use).

**If the destination already exists, installation stops without overwriting it.** There is no automatic updater. Review changes and the installation procedure separately when updating. Do not use the development-folder EXE as a substitute for the protected installation or loosen its access permissions.

## Updating

These are manual steps for the user to perform in their normal Windows environment, not an in-app update feature.

1. Review the source version and its changes. If you obtained the source with Git, check `git status` in the project directory and run `git pull --ff-only` only when you have no uncommitted changes. Stop if an error or conflict occurs.
2. Follow the initial setup steps above to build, package, and run `-ValidateOnly`. Review the new scripts and package before continuing.
3. Close every Office window. You do not need to stop Codex.
4. Enter `%LOCALAPPDATA%\Programs` in File Explorer's address bar. Verify this is the installation location, then rename its `OnecaratCX` folder to an unused backup name, such as `OnecaratCX-backup-20261122`. Keep it in the same parent directory and do not change its permissions. Stop if Windows reports that it is in use or another error occurs.
5. Run the same `-ReviewedPackage` command used for initial setup to create a fresh installation, then check the `icacls` output.
6. Launch with a verified Thread ID and confirm that the target session's window opens. Keep the old installation until you have checked the new version.

If the update fails, close the new windows, rename the new `OnecaratCX` folder to another unused name in File Explorer, and rename the old installation back to `OnecaratCX`. If installation failed before creating a new folder, simply restore the old name. Check permissions and launch again after restoring the old version.

Updating the source alone does not update the protected installation.

## Uninstalling

1. Close all Office windows.
2. Open `%LOCALAPPDATA%\Programs` in File Explorer and verify the installed app's location.
3. Delete only the `OnecaratCX` folder. If you no longer need installation backups, inspect and delete those folders separately. Do not delete the parent `Programs` folder.

The installer does not register automatic startup or change Codex settings. You do not need to delete Codex, `.codex`, session logs, or the project's source. If you also want to remove the source, first check whether you need to retain local changes or investigation records.

## Verification scope

The installation paths, refusal to overwrite existing folders, and copied contents have been checked against the current script. The author previously confirmed initial protected installation, permissions, and launch. Updating, backing up, restoring, and removing an installation were not performed on a real installation during this README revision.

