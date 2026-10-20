/** Admin area and reviews settings, kept in one place. */

export const REVIEW_STATUSES = ["visible", "hidden", "flagged"];
export const REVIEW_MAX_CHARS = 1000;

/** Everything an admin can do that is written to the audit log. Matches the CHECK in the admin_actions table. */
export const AUDIT_ACTIONS = ["approve_portal", "reject_portal", "hide_review", "unhide_review", "flag_review", "view_resume"];
export const AUDIT_TARGET_TYPES = ["portal", "review", "resume"];

/** The audit action for moving a review to each status. */
export const REVIEW_ACTION_FOR_STATUS = { hidden: "hide_review", visible: "unhide_review", flagged: "flag_review" };

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
