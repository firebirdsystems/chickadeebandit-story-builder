/**
 * Pure story-state functions — no DOM, no fetch, no hub globals.
 * Imported by index.html (type="module") and by unit tests.
 */

/**
 * Returns the id that current_turn_member_id should be set to after a
 * submission. Semantics differ by mode:
 *   round-robin / random → "who goes next"
 *   free-for-all         → "who just went" (blocks them from going again)
 *
 * @param {object} story - story header with current_turn_member_id and participants
 * @param {string} submitterId - id of the member who just submitted
 */
export function nextTurnId(story, submitterId) {
  const { turn_mode, participants, current_turn_member_id } = story;

  if (turn_mode === "free-for-all") {
    return submitterId;
  }

  if (turn_mode === "random") {
    return participants[Math.floor(Math.random() * participants.length)].id;
  }

  // round-robin: advance from the member who just went (current_turn_member_id)
  const idx = participants.findIndex(p => p.id === current_turn_member_id);
  const base = idx === -1 ? 0 : idx;
  return participants[(base + 1) % participants.length].id;
}

/**
 * Returns true if this member is allowed to add an entry right now.
 *
 * @param {object} story
 * @param {string|null} meId
 */
export function canAddEntry(story, meId) {
  if (!meId) return false;
  if (story.status !== "active") return false;
  if (!isParticipant(story, meId)) return false;
  if (story.turn_mode === "free-for-all") {
    return story.current_turn_member_id !== meId;
  }
  return story.current_turn_member_id === meId;
}

/**
 * Returns true if the story has auto-completed due to reaching its round limit.
 *
 * @param {object} story
 */
export function isStoryComplete(story) {
  if (story.status === "complete") return true;
  return story.max_rounds !== null && story.current_round >= story.max_rounds;
}

/**
 * Returns true if meId is in the story's participant list.
 *
 * @param {object} story
 * @param {string|null} meId
 */
export function isParticipant(story, meId) {
  if (!meId) return false;
  return story.participants.some(p => p.id === meId);
}
