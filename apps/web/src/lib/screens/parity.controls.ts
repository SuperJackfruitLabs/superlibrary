/** Names of controls that do not depend on data. No imports: the e2e specs read this file too (they cannot resolve `$lib`). */
export const OUTCOME_WORDS = ['Approved', 'Completed', 'In progress', 'Superseded', 'Rejected', 'Failed', 'Abandoned'] as const;
export const LIBRARY_COMBOBOXES = ['Kind', 'Board', 'Agent', 'Station', 'Active'] as const;
export const ARTIFACT_BUTTONS = ['Save caption', 'Mark as superseded', 'Remove from memory', 'Set the delete date', 'Revoke this item', 'Add to collection', 'Copy SHA-256'] as const;
export const ARTIFACT_HEADINGS = ['Versions', 'Details · version 1', 'Provenance', 'Related', 'Collections', 'Moderate', 'Revoke'] as const;
