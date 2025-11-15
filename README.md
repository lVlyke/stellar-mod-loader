# Stellar Mod Loader

Stellar is a mod manager for Windows and Linux that supports games including Fallout, Oblivion, Skyrim, and Starfield. Formerly known as Starfield Mod Loader.

# Features

* **Add**, **re-order**, **rename**, **disable** and **remove** your mods and plugins.
* **Multiple profiles** enable quick switching between different games and mod loadouts.
* **Base profiles** allows for easily syncing mods between different devices, or VR and non-VR versions of games.
* **Root mod** support enables management of ENBs, script extenders, and other injectors.
* **Custom game support** allows Stellar to work with many games.
* **Cross-platform**: Native clients for Windows and Linux (including Steam Deck).
* Per-profile management of config files, save files, and archive invalidation.
* Support for FOMOD installers.
* Support for **Steam**, **UWP (Game Pass)** and other versions of games.

![Stellar Mod Loader](/docs/app1.png)

# Releases

Releases can be found here:

&nbsp;&nbsp;&nbsp;&nbsp;[Stellar releases](https://github.com/lVlyke/stellar-mod-loader/releases)

# Supported Games
Stellar currently has built-in support the following games:

* **Elder Scrolls IV: Oblivion**
* **Elder Scrolls IV: Oblivion Remastered**
* **Elder Scrolls V: Skyrim LE**
* **Elder Scrolls V: Skyrim SE**
* **Elder Scrolls V: Skyrim VR**
* **Fallout 3**
* **Fallout 4**
* **Fallout 4 VR**
* **Fallout: New Vegas**
* **Starfield**

Many other games are supported with **[custom game support](#custom-games)**.

# Installation

> [!IMPORTANT]
> [7-Zip](https://www.7-zip.org/) must be installed to use Stellar.

To install Stellar, simply download the latest release from the [releases page](https://github.com/lVlyke/stellar-mod-loader/releases) and extract the archive to a folder of your choice.

> [!NOTE]
> If you are using Ubuntu or an Ubuntu-based Linux distribution, you will need to run the included `install-apparmor-profile.sh` script in order to create an AppArmor profile for Stellar. See [this Ubuntu blog post](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces) for more information.

# Using Stellar

> **Quick Links:**
> * **Profiles**
>   * [**Create a profile**](#create-a-profile)
>   * [**Link mode**](#link-mode)
>   * [**Manage config files**](#manage-configini-files)
>   * [**Manage save files**](#manage-save-files)
>   * [**Mod path case normalization (Linux)**](#normalize-mod-file-paths)
>   * [**Archive invalidation**](#archive-invalidation)
>   * [**Base profile**](#base-profile)
>   * [**Profile path overrides**](#profile-path-overrides)
>   * [**Profile locking**](#profile-locking)
>   * [**External profiles**](#add-external-profiles)
>   * [**Import profiles**](#import-profiles)
>   * [**Export profiles**](#export-profiles)
>   * [**Delete profiles**](#delete-profiles)
> * [**Base profiles**](#base-profiles)
> * **Mods**
>   * [**Adding mods**](#add-some-mods)
>   * [**FOMOD installers**](#fomod-installers)
>   * [**BAIN installers**](#bain-installers)
>   * [**Root mods**](#root-mods)
>   * [**Managing mods**](#managing-your-mods)
>   * [**Mod section dividers**](#mod-section-dividers)
>   * [**Mod file overwrite**](#mod-file-overwrite)
>   * [**Activating mods**](#activate-your-mods)
>   * [**Backup/restore mod order**](#backuprestore-mod-order)
> * **Plugins**
>   * [**Managing plugins**](#game-plugins)
>   * [**Plugin type promotion**](#plugin-type-promotion)
>   * [**External plugin files**](#external-plugins)
>   * [**Backup/restore load order**](#backuprestore-plugin-order)
> * [**Config file management**](#config-file-management)
>   * [**Backup/restore config files**](#backuprestore-config-files)
> * [**Save file management**](#save-file-management)
> * **Games**
>   * [**Game manager**](#game-manager)
>   * [**Custom games**](#custom-games)
> * [**App settings**](#app-settings)
> * [**Launching games**](#launch-the-game)
>   * [**Custom actions**](#custom-actions)
>   * [**Add actions to your Steam library**](#add-actions-to-your-steam-library)
>   * [**Launch profile from CLI**](#launch-profile-from-cli)
> * [**Troubleshooting**](#troubleshooting)
>   * [**Common issues**](#common-issues)
>   * [**Report an issue**](#report-an-issue)

**Note:** This guide refers specifically to Starfield in some places, but most of the information also applies to other games.

To enable mods in Starfield, add the following lines to the `StarfieldCustom.ini` file in your `Documents/My Games/Starfield` folder if not already present:

```ini
[Archive]
bInvalidateOlderFiles=1
sResourceDataDirsFinal=
```

## Create a profile

To add and manage mods you must first create a profile. Upon first launching the app you will be shown a form to create a new profile.

Select which game you want to create the profile for. Then give your profile a unique name.

Select a **Game Installation** that the profile will use to deploy to. Any detected game installations will be listed automatically. If no installations are detected, or you want to define your own, select the **Custom Installation** option and define the required paths.

The **Game Root Directory** is the game's installation directory.

The **Game Data Directory** is the directory mod files are deployed to. This is usually the `Data` folder inside the **Game Root Directory**.

The **Game Config Files Directory** is the directory where the game's config files are located. For Bethesda games, this is located at `<User_Directory>/Documents/My Games/<GameName>`.

The **Game Saves Directory** is the directory where the game's save files are located. For Bethesda games, this is located at `<User_Directory>/Documents/My Games/<GameName>/Saves`.

The **Game Plugin List Path** is the location of the `plugins.txt` file for the game. For Bethesda games, this is located at `<User_Directory>/AppData/Local/<GameName>/plugins.txt`.

**Steam ID** is the Steam ID for the game. This is only applicable if you're using a Steam version of the game.

### Link mode

When **Link Mode** is enabled, file links to the mod files will be used instead of copying the files when activating mods. This is significantly faster and uses less disk space. This setting is recommended to be enabled when possible.

Link mode can also be separately enabled for config files and save files. To enable/disable link mode for config or save files, click the icon to the left of **Game Config Files Directory** or **Game Saves Directory**.

**NOTE:** Link mode can only be enabled if the profile is located on the same disk/partition as the game itself.

### Manage Config/INI files

If the **Manage Config/INI Files** option is enabled, new config files will be created for the profile. When enabled, you must also define the **Game Config Files Directory**.

Upon first enabling the option, you will be prompted to copy the existing config files from the **Game Config Files Directory** to the profile's config files.

**NOTE:** When activating mods, the profile's config files will be copied to the **Game Config Files Directory**. If any existing config files are in the **Game Config Files Directory** when mods are activated, they will be moved to a `.sml.bak` folder during activation. The files moved to `.sml.bak` will be restored back to their original location upon deactivating mods.

### Manage save files

If the **Manage Save Files** option is enabled, any created save games while this profile is deployed will be tied only to that profile. When enabled, you must also define the **Game Saves Directory**.

### Normalize mod file paths

Some mods may use different casing for their files/folders (i.e. `Interface` vs `interface`) and this can cause issues on case-sensitive file systems (often used on Linux). When this setting is enabled, Stellar will automatically convert all activated mod files and folders to the correct case to avoid this issue.

It is recommended to enable this setting when using a case-sensitive file system.

### Archive invalidation

Certain games require a feature called **Archive Invalidation** to properly load mod files. If this setting is enabled, Stellar will automatically enable archive invalidation to ensure all mods are loaded properly.

**NOTE:** It is recommended to also enable the "Manage Config/INI Files" option. However if it is disabled, and existing config files can be located, archive invalidation can still be enabled.

### Base profile

You can optionally pick a base profile to inherit from. By default only base profiles from the current game are shown, but you can select any base profile by checkng **Show all profiles**.

See [this section](#base-profiles) for more information about base profiles.

### Profile path overrides

You can choose to override any of the profile paths to point to other directories. Each profile path override will be explained below.

#### Profile Root Path

By default, profiles are stored in the `profiles` directory where the application is located. Overriding this path will allow you to store the profile at an alternative location. This can be useful if your game is installed on a different drive and you want to co-locate the profile to the same drive as the game to enable Link mode.

A profile with an overridden root path is called an **external profile**. Existing external profiles can also be added or imported by selecting **Profiles -> Add External Profile** or **Profiles -> Import Profile**.

#### Profile mods path

Overriding this path will allow you to store the profile's mods at an alternative location.

#### Profile saves path

Overriding this path will allow you to store the profile's save files at an alternative location. This is useful if you are syncing save files between multiple PCs or profiles.

#### Profile config path

Overriding this path will allow you to store the profile's config files at an alternative location. This is useful if you are syncing config files between multiple PCs or profiles.

#### Profile backups path

Overriding this path will allow you to store the profile's backup files at an alternative location.

### Profile locking

Profiles can be locked/unlocked by clicking the "Lock Profile" button at the top of the mod list. When a profile is locked you will not be able to change any settings or edit mods for that profile.

### Creating additional profiles

You can create additional profiles at any time by pressing the **Create Profile** button above the **Mod List** section or by selecting **Profile > Add New Profile** from the the menu bar.

### Add external profiles

External profiles can be added to SML from **Profile > Add External Profile**. An external profile will remain in the same directory it was added from, allowing for profiles to be used from any location.

### Import profiles

Existing profiles can be imported into SML from **Profile > Import Profile**.

### Export profiles

You can export a profile from **Profile > Export Profile**. Exported profiles will be removed from SML after successful export. A backup of the profile will be written to `<OS temp dir>/SML` before export.

### Delete profiles

You can delete a profile from **Profile > Delete Profile**. **This cannot be undone**.

**Tip:** You can change the app theme at any time under **File > Preferences**.

## Base profiles

Base profiles are a special kind of profile that can be extended by other profiles. Mods and plugins in a base profile are added and managed as normal, but cannot directly be deployed. Instead, other profiles can extend a base profile and will automatically inherit mods, plugins, and config files from the base profile.

This allows for defining a common set of mods that can be used and extended by other profiles. One way this can be useful is for easily deploying a common set of mods between multiple PCs while also allowing for adding mods or config settings that may only be used on certain machines, such as high-res texture packs or specific compatability patches only needed for some devices. This can also be used to sync mods between different versions of games, such as Skyrim SE and Skyrim VR.

Game directories are not defined for base profiles, allowing extending profiles to point to different game installation locations as needed.

## Add some mods

Once your profile is set up you can begin adding and managing mods. To add a new mod, click the **+** icon in the **Mod List** section and select **Add Mod**, or select **Profile > Mods > Add Mod** from the menu bar and choose the mod that you want to install.

**Note:** You can also import existing mods by clicking the **+** icon in the **Mod List** section and select **Import Mod**, or select **Profile > Mods > Import Mod** from the menu bar. This will allow you to add a mod from a folder, which can be useful for importing mods from other profiles or sources.

**Tip:** You can also add mods by dragging and dropping them into the app. This will allow you to install multiple mods at a time.

After choosing a mod to add you will be shown either a [FOMOD installer](#fomod-installers), or the default installation options.

### Default mod installation

The default installation allows you to rename the mod and select which files from the mod to add. By default, all files from the mod will be added. However, some mods may occasionally contain a non-standard directory structure that can require changing the **root data dir**, like in the following example:

![Add Mod Example 1](/docs/mod-add-1.png)

This mod contains a single root directory called `standard` that contains an inner `Data` directory with all of the mod files. We need to mark this inner `Data` directory as the **root data dir** in order for the mod to be installed correctly:

![Add Mod Example 2](/docs/mod-add-2.png)

Now, only the files in `standard/Data` directory will be added for this mod.

**Tip:** Multiple directories can be marked as **root data dir** if needed.

Some games will use multiple directories for mods. In this case, Stellar will attempt to figure out where to install mods if possible, but some mods may be packaged in a way where this is not possible. If Stellar cannot deduce the installation directory, you will need to choose which folder to install the mod to:

![Add Mod Example 2](/docs/mod-add-3.png)

Select the installation directory on the left. If no folder is selected, mod will be installed to the top level data directory.

### FOMOD installers

Some mods are packaged with special metadata known as FOMOD that allows for customizing the installation through a guided flow. Stellar supports FOMOD and will automatically show the installation wizard for FOMOD-compatible mods, as shown in the example below:

![FOMOD Installer Example 1](/docs/fomod-1.png)

The installer will guide you through the installation of the mod. Hovering over or selecting an option will show information about what it does. If you wish to install the mod manually instead, you can click the **Manual Install** button at the bottom left corner of the installer window.

**Note**: Many mods will ask you if you are using Vortex or Mod Organizer 2. Stellar supports either option, but if you encounter any issues, select **Mod Organizer 2**.

**Tip**: Click the preview image (or the **?** tooltip in compact view) to show a fullscreen view of the image.

### BAIN installers

BAIN is another kind of packaging format for mods that allow for customizing installation. Mods that use BAIN will have directories that start with numbered prefixes (`00`, `10`, `20`, etc), representing features that can be optionally installed. To choose which features are installed, mark the features you want to install as **root data dirs**. Only these features will be installed.

![BAIN Example 1](/docs/bain-1.png)

### Root mods

Root mods are mods that are deployed to the **Game Base Directory** instead of the **Mod Base Directory**. This allows for script extenders, DLSS injectors, ENBs, and other types of injectors to be managed as mods in your profile.

To add a root mod, click the **+** icon in the **Mod List** section and select **Add Root Mod**, or select **Profile > Mods > Add Root Mod** from the menu bar and chose the mod that you want to install.

## Managing your mods

Mods you have added will appear in your mods list with the load order of that mod shown to the right of its name. You can modify the load order of a mod by dragging and dropping it in the list. Unchecking a mod will disable it and make it inactive. Mods inherited from a base profile cannot be re-ordered or enabled/disabled.

You can right click individual mods to bring up additional options, such as renaming or deleting.

**Tip:** You can customize which columns of the mods list are visible under the **View > Mod List Columns** section of the app menu bar.

## Mod section dividers

You can create section dividers in your mod list to better keep mods organized. To add a new section divider click the **+** icon and select **Add Mod Section** or **Add Root Mod Section** depending on which list you want to add a section to. You can customize the name and icon of each section divider.

You can rename or delete a section divider by right clicking the section and selecting the desired option. All mods in a section can also be enabled or disabled.

Mods can be easily moved between sections or to the top/bottom of a section by right clicking a mod and opening the **Section** sub-menu.

### External files

Existing game files and other files that have been manually copied to the **Mod Base Directory** outside of your profile will show up in the UI as **External files**. When activating mods for a profile that overwrite external files, the original external files will be moved to a folder called `.sml.bak` while mods are activated. The files in the `.sml.bak` folder will be restored back to their original location upon deactivating mods.

## Mod file overwrite

You can see which files are being overwritten by specific mods by enabling mod overwrite calculations. To enable mod overwrite calculations, click the file icon next to the **Mod Name** header in the mod list. Once enabled, file icons will be displayed next to mods that overwrite files from other mods. Clicking the file icon will show the list of files being overwritten by that mod.

## Game plugins

Once at least one mod with a plugin has been installed, you will see your plugins listed along with their load order. Plugins can be individually disabled or re-ordered by dragging and dropping them. Plugins inherited from a base profile cannot be re-ordered or enabled/disabled.

You can right click individual plugins to bring up additional options.

### Plugin type promotion

Most games have rules regarding the load order of different types of plugins. For Starfield and other Bethesda games, the order is `ESM -> ESL -> ESP`. However, mods sometimes contain `ESP` plugins that are "flagged" as `ESM` or `ESL`. While Stellar does not currently parse these flags, you can manually account for this by using **plugin type promotion**. To promote a plugin to a new type, right-click it and use the "Plugin Type" option to select the new plugin type. Once promoted, the plugin will behave as if it were of the promoted type.

### External plugins

External game plugin management is optional for some games and is required for others. For games where external plugin management is optional, it can be enabled or disabled by pressing the "Manage External Plugins" button at the top left of the plugins list. When enabled, all external game plugin files will be shown in the list and can be re-ordered alongside profile-managed plugins.

### Backup/restore plugin order

You can backup and restore the plugin load order using the buttons at the top right of the plugins list. Selecting the "Create Plugin Backup" option will allow you to create a new plugin order backup. Selecting the "Restore Plugin Backup" option will show a list of all available plugin order backups that can be restored. You can also export the plugin order in a plugins.txt-compatible format using the "Export Plugins List" button.

Note that any plugins in a backup that are not currently in the active plugin list will not be re-added.

## Config file management

If you have enabled the **Manage Config/INI Files** option for your profile, you will be able to select the "Config" option from the dropdown at the top of the Plugins list. From this section you can edit your profile-specific config/INI files.

If profile-managed config/INI files are disabled, you will see an option in the "Actions" section to view external config files if any are found.

### Backup/restore config files

You can backup and restore the current config file values using the buttons at the top right of the Config file management section. Selecting the "Create Config Backup" option will allow you to create a new config file backup. Selecting the "Restore Config Backup" option will show a list of all available config file backups that can be restored.

## Save file management

If you have enabled the **Manage Save Files** option for your profile, you will be able to select the "Saves" option from the dropdown at the top of the Plugins list. From this section you can manage your profile-specific save files.

## Activate your mods

To enable mods in the game you must first deploy the profile. Press the **Activate Mods** button in the **Actions** section to deploy the current profile.

Mods will now remain active until you press the **Deactivate Mods** button, even if you close the app or restart your PC.

**IMPORTANT NOTE:** If Link Mode is not enabled for the profile and you update any of the profile's mod files externally (i.e. in a text editor) while mods are deployed, make sure to press the **Refresh Files** button after, otherwise your changes will not be applied.

### Backup/restore mod order

You can backup and restore the mod load order using the "Backup" button at the top of the mod list. Selecting the "Create Mod Order Backup" option will allow you to create a new mod order backup. Selecting the "Restore Mod Order" option will show a list of all available mod order backups that can be restored.

Note that any mods in a backup that are not currently added to the profile will not be re-added.

## Games

### Game manager

To open the **Game Manager**, select **File > Manage Games**. You can browse the built-in game definitions here, as well as add, import, and export custom game definitions.

![Game Manager](/docs/game-manager-1.png)

### Custom games

If Stellar doesn't have built-in support for a game you want to mod, you can create a **custom game definition** to add support for it. Existing custom game definitions can also be imported or exported, allowing you to share game definitions with others or [submit them for inclusion directly into Stellar](#submit-custom-game).

### Import a custom game definition

To import an existing custom game definition, open the **Game Manager** and then click the **gear** icon and select "**Import Game**". Browse for the custom game definition file and select it.

You can now create a new profile using this game definition.

### Create a custom game definition

To create a new custom game definition, open the **Game Manager** and then click the **gear** icon and select "**Add New Game**". You will be presented with a form to define the details for the custom game:

#### Game ID

The ID for the game. This must be unique.

#### Title

The title of the game.

#### Background Color

The background color for the game. Can be either a hex color or `rgb()` definition.

#### Foreground Color

The foreground (text) color for the game. Can be either a hex color or `rgb()` definition.

#### Game Installations

The default game installation paths for this game. These are typically the default installation folders for the game on supported platforms.

- **Game Root Directory** - The root installation directory for the game.
- **Game Data Directory** - The directory where mod data for the game is installed. If this is the same as the Game Root Directory you can simply specify the same path (or ".").
- **Game Config Files Directory** - (Optional) The directory where config files for the game are located.
- **Game Saves Directory** - (Optional) The directory where save files for the game are located.
- **Game Plugin List Path** - (Optional) The location where the plugin list should be saved.
- **Steam IDs** - (Optional) Any Steam game IDs associated with this installation (if applicable).

#### Multiple Mod Data Roots

Whether or not the game uses multiple subdirectories for mod data.

#### Game Binaries

(Optional) The names of binaries (i.e. the `exe` of the game). Also include the names of any possible mod loader binaries for the game here.

#### Save Formats

(Optional) The save file formats for the game.

#### Plugin Formats

(Optional) The plugin file formats for the game.

##### Require External Plugins

Whether or not external plugin file management is required for this game.

#### Plugin Data Directory

(Optional) The directory where plugin files are located, relative to the **Game Data Directory**.

#### Plugin List Type

(Optional) The type of plugin list for the game, if applicable.

#### Pinned Plugins

(Optional) Any plugin files that are required to be present for the game.

#### Game Config Files

(Optional) The names of the config files for the game.

#### Script Extenders

(Optional) Any script extenders for the game.

- **Name** - The name of the script extender.
- **Binaries** - The names of any binaries associated with the script extender.
- **Mod Paths** - Any directories that are used by mods associated with this script extender.

For specific examples of these values you can also look at the definitions of the built-in games.

Once you have defined all of the details for the custom game, click the "**Save**" button to confirm your changes. The button will be disabled if there are any errors in your game definition.

You can now create a new profile using this game definition.

### Export a custom game definition

If you would like to share your existing custom game definition, open the **Game Manager** and then click the **gear** icon and select "**Export Game**". Select a file to save your game definition to. The game definition file can be shared and imported by others. You can also [submit your game definition file](#submit-custom-game) for inclusion directly into Stellar.

### Submit a custom game definition for inclusion into Stellar <a name="submit-custom-game"></a>

Once you have tested your game definition to make sure everything works as expected, feel free to open an [issue](https://github.com/lVlyke/stellar-mod-loader/issues) and submit your exported game definition file for inclusion directly into Stellar. If approved, your game definition will be added as a built-in game in a future release.

## App settings

App settings can be changed via **File > Preferences** from the menu bar. The following settings are available:

### Verify active profile on app startup

Whether or not the active profile should be verified upon starting Stellar. This is recommended to be enabled, but can be disabled if verification takes too long.

### Enable game plugins

Whether or not plugin management is enabled. Only disable this if you do not want plugins to be managed.

### Steam installation directory

Your Steam installation directory. This only needs to be specified if Steam is installed in a non-standard location.

### App theme

The app theme to use.

## Launch the game

You can either click the **Start Game** button or simply launch the game directly through Steam, Game Pass, etc. The game should launch with your mods enabled!

If you have added a mod with a known custom executable (like a script extender), you will see an additional action to launch that mod's executable.

Some actions may require that you launch them directly from Steam (i.e. running a game through Proton on Linux). When you try to run these actions, Stellar will prompt you to automatically create a corresponding Steam library shortcut to run the mod's executable. Stellar can then create a new action to launch that Steam shortcut.

### Custom actions

Additional actions can be added by clicking the dropdown arrow to the right of the launch action button (**Start Game**) and clicking **New Action**. There are two types of actions: **Commands** or **Steam Apps**.

A Command Action can be any kind of program or script with arguments and environment variables.

A Steam App Action can launch an app or shortcut using its Steam App ID. The App ID can be found by adding a desktop shortcut for the app in Steam and then inspecting the shortcut file. The shortcut will have an argument in the format of `steam://rungameid/13109217361204871168` where the App ID is the number at the end.

After creating an action you can select it or other actions by clicking the dropdown arrow.

### Add actions to your Steam library

You can add custom actions directly to your Steam library. Click the dropdown arrow to the right of the launch action button and click the gear icon next to a custom action. Click the **Create Steam shortcut** button at the top right of the settings window to create a Steam library shortcut.

> [!NOTE]
> When creating a Steam shortcut on Linux for a script extender or other game tool, make sure the option to use the game's Proton prefix is enabled. You may need to enable Proton for the shortcut in Steam under the shortcut's Compatibility settings.

### Launch profile from CLI

You can activate and launch a profile directly from the CLI by using the `--launch` argument. For example, if you want to activate the profile named "My Profile" and launch the game, you can specify the following:

```stellar-mod-loader.exe --launch "My Profile"```

You can also optionally specify the game action to run:

```stellar-mod-loader.exe --launch "My Profile" "Custom Action Name"```

This will activate the given profile and invoke the given action (or the currently active action if one isn't specified).

# Troubleshooting

## Common issues

### Symlinks are not enabled <a name="symlinks"></a>

If you get a warning about symlinks not being enabled when creating or editing a profile, you need to enable symlink permissions.

To enable symlinks in Windows, you can either A) enable Windows Developer Mode by going the Windows "Settings" app, select "For developers", and then enable "Developer Mode", or B) run Stellar as administrator (not recommended). Once enabled, Stellar should now be able to use symlinks.

### The app sits on the "Verifying Profile..." loading screen for a long time during startup

This can happen when very large profiles are activated. If profile verification is taking too long, you can disable verification on app startup via the menu bar under **File > Preferences**.

### **(Linux)** Stellar won't run with error "The SUID sandbox helper binary was found, but is not configured correctly."

If you are using Ubuntu or a related distribution, you will need to run the included `install-apparmor-profile.sh` script in order to create an AppArmor profile for Stellar. See [this Ubuntu blog post](https://ubuntu.com/blog/ubuntu-23-10-restricted-unprivileged-user-namespaces) for more information.

### **(Linux)** Some mods are not loading/strange behavior when loading some mods

This can be fixed by enabling **Normalize mod file path** for the app. See [this section](#normalize-mod-file-path) for more information.

### **(Linux)** Mods are not loading when using a script extender like SFSE

You must set the `STEAM_COMPAT_DATA_PATH` environment variable to use the game's Proton prefix. Stellar will do this automatically when creating Steam shortcuts.

### (Starfield) My mods are not loading

First, make sure you have added the following lines to your `StarfieldCustom.ini` file:

```ini
[Archive]
bInvalidateOlderFiles=1
sResourceDataDirsFinal=
```

If mods still are not working, you may also need to also add these lines to your `StarfieldPrefs.ini` file.

If you are using the game's installation `Data` folder as your **Mod Base Directory**, make sure you delete the `Data` folder at `Documents/My Games/Starfield`, otherwise your mods will not be detected by the game. The game will automatically create this folder on game start and when you take in-game screenshots. To change this behavior, you can add the following lines to your `StarfieldCustom.ini` and `StarfieldPrefs.ini` files to disable MotD and change your screenshots folder:

```ini
[General]
bEnableMessageOfTheDay=0
```

```ini
[Display]
sPhotoModeFolder=Photos
```

## Report an issue

If you run into a problem, please check the [issues page](https://github.com/lVlyke/stellar-mod-loader/issues) to see if your question has been answered, or create a new issue if you have a new bug to report.

If you have a suggestion for a new feature or a new game to support, feel free to open an issue for your request.

# Devs - Building and testing

To build and run the app for testing and development, ensure you have Node and NPM installed on your machine and run `npm install` and `npm run start`.

To build a release, run `npm run app:build-release` for the current platform or `npm run app:build-release:all` for all supported platforms.