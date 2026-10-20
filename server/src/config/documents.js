/** Document generation settings, kept in one place. */

export const DOCUMENT_TYPES = ["resume", "cover_note", "prep_kit"];

/** Total model attempts per document: the first one plus one regeneration. */
export const DOCUMENT_ATTEMPTS = 2;

export const COVER_NOTE_MIN_WORDS = 120;
export const COVER_NOTE_MAX_WORDS = 180;

export const PREP_QUESTION_COUNT = 10;
export const PREP_ASK_COUNT = 5;

/** Shown by the UI next to any document made from a short job snippet (the API sends it as `limitedInfoNote`). */
export const LIMITED_INFO_UI_NOTE = "Based on limited job details. Open the posting for the full description.";
