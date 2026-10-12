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
export function nextTurnId(story, submitterId, roster = null) {
  const { turn_mode, current_turn_member_id } = story;
  const participants = activeParticipants(story, roster);

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
 * The story's participants who are still on the household roster.
 *
 * A story's participant list is a snapshot taken at creation and stored in KV,
 * where nothing prunes it on member removal (KV has no member_references — that
 * mechanism is app-DB only). Round-robin therefore used to hand the turn to
 * someone who had left, and because `canAddEntry` requires you to BE the current
 * turn holder, the story deadlocked permanently with no host override and no way
 * to skip. Filtering against the live roster is what unsticks it.
 *
 * `roster` is the members array from family.members; pass null (or an empty
 * roster, e.g. a failed context fetch) to keep the stored list as-is rather than
 * emptying every story.
 */
export function activeParticipants(story, roster = null) {
  const all = story?.participants ?? [];
  if (!roster || !roster.length) return all;
  const live = new Set(roster.map(m => m.id));
  const remaining = all.filter(p => live.has(p.id));
  return remaining.length ? remaining : all;
}

/**
 * Returns true if this member is allowed to add an entry right now.
 *
 * @param {object} story
 * @param {string|null} meId
 */
export function canAddEntry(story, meId, roster = null) {
  if (!meId) return false;
  if (story.status !== "active") return false;
  if (!isParticipant(story, meId)) return false;
  if (story.turn_mode === "free-for-all") {
    return story.current_turn_member_id !== meId;
  }
  if (story.current_turn_member_id === meId) return true;
  // The turn holder has left the roster: the story is stuck on a member who can
  // never take their turn. Any remaining participant may unstick it. With no
  // roster to check against we cannot tell, so we keep the strict rule.
  if (!roster || !roster.length) return false;
  const live = new Set(roster.map(m => m.id));
  return !live.has(story.current_turn_member_id);
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

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * A story is found by its title and by who is in it, which is what
 * gets remembered once a family has a shelf of them.
 */
export function searchableFields(story, participantNames = "") {
  return [story.title, participantNames];
}

/**
 * The id to give the part a member is adding to a story.
 *
 * Saving a part is two writes: the story's entries, then its header. When the
 * first lands and the second fails the member is told it did not save and
 * presses Add again. A fresh id on that second press stored the same part
 * twice. So the id is kept until the whole save is known to have landed, and a
 * second press for the same story reuses it.
 *
 * @param {{storyId: string, id: string}|null} pending - the unfinished submission, if any
 * @param {string} storyId
 * @param {() => string} newId
 */
export function pendingEntryId(pending, storyId, newId) {
  return pending && pending.storyId === storyId && pending.id ? pending.id : newId();
}

/**
 * The stored entries with `entry` merged in: appended when its id is new,
 * otherwise put in place of the stored entry with that id — so a retried part
 * keeps its position and carries whatever the member last wrote. Returns a new
 * array; the stored one is not changed.
 */
export function mergeEntry(entries, entry) {
  const list = Array.isArray(entries) ? entries : [];
  const idx = entry.id ? list.findIndex(e => e.id === entry.id) : -1;
  if (idx === -1) return [...list, entry];
  // The first save's time stands: the part was stored then.
  return list.map((e, i) => i === idx ? { ...entry, added_at: e.added_at ?? entry.added_at } : e);
}
