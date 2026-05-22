# Requirements Document

## Introduction

The Slatebase MVP currently relies on statically configured vault paths with no persistent server-side storage management. This feature introduces full vault lifecycle management: users can create and delete named vaults on the server, import files and folders from the local filesystem into vaults, and delete items within vaults. All data is persisted on the server. Vaults are selected via a dropdown menu in the sidebar, with the file explorer appearing below when a vault is active.

## Glossary

- **Vault_Service**: The backend service responsible for vault lifecycle operations (creation, deletion, listing) and persistent storage management.
- **Import_Service**: The backend service responsible for receiving uploaded files and folders and writing them into a vault's persistent storage.
- **File_Explorer**: The frontend component that displays the hierarchical directory tree of a vault's contents.
- **Vault_List**: The frontend dropdown component that allows users to select, create, and delete vaults. It is displayed in the sidebar above the File_Explorer.
- **Vault_Name**: A user-chosen string identifier for a vault, unique across all vaults.
- **Vault_Storage**: The server-side directory where a vault's files and folders are persistently stored.
- **Import_Source**: A file or folder selected from the local filesystem for import into a vault.

## Requirements

### Requirement 1: Vault Creation

**User Story:** As a user, I want to create a new named vault on the server, so that I have a persistent container for organizing my files.

#### Acceptance Criteria

1. WHEN the user submits a vault creation request with a Vault_Name, THE Vault_Service SHALL create a new empty Vault_Storage directory on the server and return the vault metadata containing the generated vault ID and the confirmed vault name.
2. THE Vault_Service SHALL validate that the Vault_Name is a non-empty string of 1 to 128 characters that contains at least one non-whitespace character.
3. THE Vault_Service SHALL validate that no existing vault uses the same Vault_Name (case-sensitive comparison).
4. IF the Vault_Name is empty, contains only whitespace, exceeds 128 characters, or is already in use, THEN THE Vault_Service SHALL reject the request with an error code identifying the specific validation failure and a message indicating the reason for rejection.
5. IF the Vault_Storage directory cannot be created due to a server filesystem error, THEN THE Vault_Service SHALL reject the request with an error code indicating a server-side failure without leaving a partially created vault in the vault list.
6. WHEN a vault is successfully created, THE Vault_List SHALL append the new vault entry to the dropdown menu without requiring a full page reload.

### Requirement 2: Vault Deletion

**User Story:** As a user, I want to delete a vault from the server, so that I can remove vaults I no longer need along with all their stored data.

#### Acceptance Criteria

1. WHEN the user confirms deletion of a vault by its ID, THE Vault_Service SHALL remove the vault's Vault_Storage directory and all contained files and folders from the server and return a success response within 30 seconds.
2. WHEN a vault is successfully deleted, THE Vault_Service SHALL remove the vault from the vault registry so that it no longer appears in the list of available vaults.
3. IF the specified vault ID does not match any existing vault, THEN THE Vault_Service SHALL return a VAULT_NOT_FOUND error without modifying any data on the server.
4. IF the Vault_Storage directory cannot be removed due to a filesystem error, THEN THE Vault_Service SHALL return an error indicating the deletion failed and SHALL NOT remove the vault from the registry.
5. WHEN a vault is successfully deleted, THE Vault_List SHALL remove the vault from the dropdown menu without requiring a full page reload.
6. WHILE the user has a vault selected in the File_Explorer and that vault is deleted, THE Vault_List SHALL clear the selection (showing the placeholder text) and hide the File_Explorer.

### Requirement 3: Vault Visual Distinction

**User Story:** As a user, I want vaults to be visually distinct from files and folders in the interface, so that I can immediately identify vaults in the dropdown.

#### Acceptance Criteria

1. THE Vault_List SHALL render each vault entry in the dropdown with a distinct text style that differentiates it from files or directories in the File_Explorer.
2. THE Vault_List SHALL display the currently selected vault name in the dropdown trigger, clearly distinguishing it from the File_Explorer's chevron and folder styling.
3. THE Vault_List SHALL provide each vault entry with an accessible label (e.g., via aria-label) that conveys the entry's type as "vault" to assistive technologies.

### Requirement 4: File Import

**User Story:** As a user, I want to import a file from my local filesystem into a vault, so that I can persistently store individual files on the server.

#### Acceptance Criteria

1. WHEN the user selects a single file as Import_Source that is at most 500 MB in size, THE Import_Service SHALL write a persistent copy of that file into the vault's Vault_Storage at the root level.
2. WHEN a file is successfully imported, THE File_Explorer SHALL display the newly imported file in the vault's directory tree without requiring a full page reload.
3. IF a file with the same name already exists at the target location in the vault, THEN THE Import_Service SHALL reject the import with a descriptive error indicating the name conflict.
4. THE Import_Service SHALL preserve the original file name during import, provided the name is at most 255 characters in length and contains no path separator characters.
5. IF the file import fails after transfer has begun (due to storage failure or connection interruption), THEN THE Import_Service SHALL remove any partially written data from the vault's Vault_Storage and return a descriptive error indicating the failure.
6. IF the target vault does not exist, THEN THE Import_Service SHALL reject the import with a VAULT_NOT_FOUND error.
7. IF the Import_Source exceeds 500 MB or the file name exceeds 255 characters or contains path separator characters, THEN THE Import_Service SHALL reject the import with a descriptive error indicating the validation failure.

### Requirement 5: Folder Import

**User Story:** As a user, I want to import a folder from my local filesystem into a vault, so that I can persistently store an entire directory structure on the server.

#### Acceptance Criteria

1. WHEN the user selects a folder as Import_Source, THE Import_Service SHALL recursively copy the folder and all its contents into the vault's Vault_Storage at the root level, replicating the original filesystem structure up to a maximum depth of 10 nested levels and a maximum of 500 total files.
2. THE Import_Service SHALL preserve the relative directory hierarchy of all files and subfolders within the imported folder, including empty subfolders.
3. WHEN a folder is successfully imported, THE File_Explorer SHALL display the imported folder and its contents in the vault's directory tree without requiring a full page reload.
4. IF a folder or file with the same name already exists at any corresponding location in the vault where an imported item would be placed, THEN THE Import_Service SHALL reject the entire import with a descriptive error indicating the name conflict and the conflicting path.
5. THE Import_Service SHALL preserve all original file and folder names during import.
6. IF the selected folder exceeds 10 levels of nesting depth or contains more than 500 total files, THEN THE Import_Service SHALL reject the import with an error indicating which limit was exceeded.
7. IF the import fails after partially writing files to Vault_Storage, THEN THE Import_Service SHALL remove all files and folders written during that import operation so that the vault remains in its pre-import state.

### Requirement 6: Vault Content Deletion

**User Story:** As a user, I want to delete files and folders inside a vault, so that I can manage and clean up the vault's contents.

#### Acceptance Criteria

1. WHEN the user confirms deletion of a file inside a vault, THE Vault_Service SHALL remove that file from the vault's Vault_Storage.
2. WHEN the user confirms deletion of a folder inside a vault, THE Vault_Service SHALL recursively remove that folder and all its contents from the vault's Vault_Storage.
3. WHEN a file or folder is successfully deleted, THE File_Explorer SHALL remove the item from the displayed directory tree without requiring a full page reload.
4. IF the specified file or folder does not exist within the vault, THEN THE Vault_Service SHALL return a FILE_NOT_FOUND error.
5. IF the specified vault does not exist, THEN THE Vault_Service SHALL return a VAULT_NOT_FOUND error.
6. THE Vault_Service SHALL reject any deletion request where the resolved path falls outside the vault's Vault_Storage directory.
7. IF a deletion request fails, THEN THE File_Explorer SHALL display an error message indicating the reason for failure and SHALL leave the directory tree unchanged.

### Requirement 7: Persistence Guarantee

**User Story:** As a user, I want my vault data to survive server restarts, so that I can rely on the server as persistent storage.

#### Acceptance Criteria

1. THE Vault_Service SHALL store all vault data (vault directories and their file contents) on the server filesystem so that vaults and their contents are available after a server restart.
2. WHEN the server starts, THE Vault_Service SHALL load all previously created vaults from the vault registry and make them available in the Vault_List dropdown with their correct names and IDs within 30 seconds of server startup.
3. THE Vault_Service SHALL maintain a vault registry (metadata store) that persists vault names, IDs, and storage locations across server restarts.
4. WHEN a vault is created or deleted, THE Vault_Service SHALL update the vault registry before returning a success response to the client, so that the registry always reflects the current set of vaults.
5. IF a vault directory referenced in the registry does not exist on the filesystem at startup, THEN THE Vault_Service SHALL log a warning, skip that vault, and continue loading the remaining vaults.
