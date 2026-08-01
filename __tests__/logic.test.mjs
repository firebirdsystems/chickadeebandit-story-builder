import { describe, it, expect } from "vitest";
import { nextTurnId, canAddEntry, isStoryComplete, isParticipant, activeParticipants } from "../src/logic.js";

const participants = [
  { id: "alice", name: "Alice" },
  { id: "bob",   name: "Bob"   },
  { id: "carol", name: "Carol" },
];

function makeStory(overrides = {}) {
  return {
    id: "s1",
    status: "active",
    turn_mode: "round-robin",
    max_rounds: 10,
    participants,
    current_turn_member_id: "alice",
    current_round: 1,
    ...overrides,
  };
}

// ── nextTurnId — round-robin ──────────────────────────────────────────────────

describe("nextTurnId — round-robin", () => {
  it("advances from first to second", () => {
    expect(nextTurnId(makeStory({ current_turn_member_id: "alice" }), "alice")).toBe("bob");
  });

  it("advances from second to third", () => {
    expect(nextTurnId(makeStory({ current_turn_member_id: "bob" }), "bob")).toBe("carol");
  });

  it("wraps from last back to first", () => {
    expect(nextTurnId(makeStory({ current_turn_member_id: "carol" }), "carol")).toBe("alice");
  });

  it("handles unknown current_turn_member_id gracefully", () => {
    const result = nextTurnId(makeStory({ current_turn_member_id: "ghost" }), "ghost");
    expect(participants.map(p => p.id)).toContain(result);
  });
});

// ── nextTurnId — random ───────────────────────────────────────────────────────

describe("nextTurnId — random", () => {
  it("always returns a valid participant id", () => {
    const story = makeStory({ turn_mode: "random" });
    const ids = participants.map(p => p.id);
    for (let i = 0; i < 30; i++) {
      expect(ids).toContain(nextTurnId(story, "alice"));
    }
  });
});

// ── nextTurnId — free-for-all ─────────────────────────────────────────────────

describe("nextTurnId — free-for-all", () => {
  it("returns the submitter id to mark them as last", () => {
    const story = makeStory({ turn_mode: "free-for-all", current_turn_member_id: "alice" });
    expect(nextTurnId(story, "bob")).toBe("bob");
    expect(nextTurnId(story, "carol")).toBe("carol");
  });

  it("even when submitter was the previous last contributor", () => {
    const story = makeStory({ turn_mode: "free-for-all", current_turn_member_id: "alice" });
    expect(nextTurnId(story, "alice")).toBe("alice");
  });
});

// ── canAddEntry ───────────────────────────────────────────────────────────────

describe("canAddEntry — round-robin", () => {
  it("allows the current turn member", () => {
    expect(canAddEntry(makeStory({ current_turn_member_id: "alice" }), "alice")).toBe(true);
  });

  it("blocks a non-turn member", () => {
    expect(canAddEntry(makeStory({ current_turn_member_id: "alice" }), "bob")).toBe(false);
  });

  it("blocks anyone on a complete story", () => {
    expect(canAddEntry(makeStory({ status: "complete" }), "alice")).toBe(false);
  });

  it("blocks non-participants", () => {
    expect(canAddEntry(makeStory(), "outsider")).toBe(false);
  });

  it("blocks null meId", () => {
    expect(canAddEntry(makeStory(), null)).toBe(false);
  });
});

describe("canAddEntry — free-for-all", () => {
  it("allows anyone who is not the last contributor", () => {
    const story = makeStory({ turn_mode: "free-for-all", current_turn_member_id: "alice" });
    expect(canAddEntry(story, "bob")).toBe(true);
    expect(canAddEntry(story, "carol")).toBe(true);
  });

  it("blocks the last contributor", () => {
    const story = makeStory({ turn_mode: "free-for-all", current_turn_member_id: "alice" });
    expect(canAddEntry(story, "alice")).toBe(false);
  });

  it("blocks non-participants even if they are not the last contributor", () => {
    const story = makeStory({ turn_mode: "free-for-all", current_turn_member_id: "alice" });
    expect(canAddEntry(story, "outsider")).toBe(false);
  });
});

// ── isStoryComplete ───────────────────────────────────────────────────────────

describe("isStoryComplete", () => {
  it("returns true when status is already complete", () => {
    expect(isStoryComplete(makeStory({ status: "complete" }))).toBe(true);
  });

  it("returns true when current_round reaches max_rounds", () => {
    expect(isStoryComplete(makeStory({ current_round: 10, max_rounds: 10 }))).toBe(true);
  });

  it("returns true when current_round exceeds max_rounds", () => {
    expect(isStoryComplete(makeStory({ current_round: 11, max_rounds: 10 }))).toBe(true);
  });

  it("returns false when rounds not yet reached", () => {
    expect(isStoryComplete(makeStory({ current_round: 9, max_rounds: 10 }))).toBe(false);
  });

  it("returns false when max_rounds is null (no limit)", () => {
    expect(isStoryComplete(makeStory({ current_round: 999, max_rounds: null }))).toBe(false);
  });
});

// ── isParticipant ─────────────────────────────────────────────────────────────

describe("isParticipant", () => {
  it("returns true for a known participant", () => {
    expect(isParticipant(makeStory(), "alice")).toBe(true);
    expect(isParticipant(makeStory(), "carol")).toBe(true);
  });

  it("returns false for a non-participant", () => {
    expect(isParticipant(makeStory(), "outsider")).toBe(false);
  });

  it("returns false for null meId", () => {
    expect(isParticipant(makeStory(), null)).toBe(false);
  });
});

// ── Departed participants ─────────────────────────────────────────────────────
//
// A story's participant list is a KV snapshot taken at creation and nothing
// prunes it on member removal (member_references is app-DB only). Round-robin
// therefore handed the turn to someone who had left, and since canAddEntry
// requires you to BE the turn holder, the story deadlocked forever with no host
// override. These lock in the unstick.

const ROSTER = [{ id: "alice" }, { id: "carol" }]; // bob has left the household

describe("activeParticipants", () => {
  it("drops participants who are no longer on the roster", () => {
    expect(activeParticipants(makeStory(), ROSTER).map(p => p.id)).toEqual(["alice", "carol"]);
  });

  it("keeps the stored list when no roster is supplied", () => {
    expect(activeParticipants(makeStory(), null).map(p => p.id)).toEqual(["alice", "bob", "carol"]);
  });

  it("keeps the stored list rather than emptying it when the roster fetch failed", () => {
    // An empty roster means "we don't know", not "everyone left" — emptying here
    // would make every story unplayable on a transient context failure.
    expect(activeParticipants(makeStory(), []).map(p => p.id)).toEqual(["alice", "bob", "carol"]);
  });

  it("keeps the stored list when no participant is still on the roster", () => {
    expect(activeParticipants(makeStory(), [{ id: "stranger" }]).map(p => p.id))
      .toEqual(["alice", "bob", "carol"]);
  });
});

describe("nextTurnId skips departed members", () => {
  it("round-robin hands off past a departed member instead of stalling on them", () => {
    // alice just went; bob is gone, so carol is next.
    const story = makeStory({ current_turn_member_id: "alice" });
    expect(nextTurnId(story, "alice", ROSTER)).toBe("carol");
  });

  it("still stalls on the departed member with no roster to check against", () => {
    const story = makeStory({ current_turn_member_id: "alice" });
    expect(nextTurnId(story, "alice", null)).toBe("bob");
  });
});

describe("canAddEntry unsticks a story stalled on a departed member", () => {
  it("lets a remaining participant take a turn owned by someone who left", () => {
    const story = makeStory({ current_turn_member_id: "bob" });
    expect(canAddEntry(story, "carol", ROSTER)).toBe(true);
  });

  it("does not let a non-participant take that turn", () => {
    const story = makeStory({ current_turn_member_id: "bob" });
    expect(canAddEntry(story, "outsider", ROSTER)).toBe(false);
  });

  it("keeps normal turn order when the holder is still on the roster", () => {
    const story = makeStory({ current_turn_member_id: "alice" });
    expect(canAddEntry(story, "carol", ROSTER)).toBe(false);
    expect(canAddEntry(story, "alice", ROSTER)).toBe(true);
  });

  it("keeps the strict rule when there is no roster to check", () => {
    const story = makeStory({ current_turn_member_id: "bob" });
    expect(canAddEntry(story, "carol", null)).toBe(false);
  });

  it("does not resurrect a completed story", () => {
    const story = makeStory({ current_turn_member_id: "bob", status: "complete" });
    expect(canAddEntry(story, "carol", ROSTER)).toBe(false);
  });
});
