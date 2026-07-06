// Anonymous task identities: a per-task generated alias ("QuietFox") with a
// neutral avatar color. Per-task on purpose — a stable per-user alias would
// link every anonymous task a person posts into one traceable identity.

const ADJECTIVES = [
  "Quiet", "Brave", "Gentle", "Steady", "Bright", "Calm", "Swift", "Warm",
  "Bold", "Kind", "Clever", "Patient", "Honest", "Humble", "Lively", "Mellow",
  "Nimble", "Plucky", "Sincere", "Sturdy", "Tender", "Upbeat", "Vivid", "Wise",
  "Zesty", "Daring", "Earnest", "Faithful", "Gallant", "Hopeful", "Intrepid",
  "Jolly", "Keen", "Loyal", "Merry", "Noble", "Optimistic", "Peaceful",
  "Radiant", "Serene", "Thoughtful", "Valiant", "Willing", "Youthful", "Zealous",
];

const ANIMALS = [
  "Fox", "Owl", "Bear", "Wolf", "Hare", "Deer", "Lynx", "Otter", "Badger",
  "Falcon", "Heron", "Ibex", "Jackal", "Koala", "Lemur", "Marten", "Narwhal",
  "Ocelot", "Panda", "Quail", "Raven", "Seal", "Tiger", "Urchin", "Vole",
  "Walrus", "Yak", "Zebra", "Bison", "Crane", "Dolphin", "Eagle", "Gecko",
  "Hedgehog", "Iguana", "Jay", "Kestrel", "Llama", "Moose", "Newt", "Osprey",
  "Puffin", "Robin", "Swan", "Toucan", "Wombat",
];

// Matches the seeded-user avatar palette so client rendering stays consistent.
const ANON_AVATAR_COLORS = [
  "#D97706", "#059669", "#2563EB", "#7C3AED", "#DC2626",
  "#0891B2", "#9333EA", "#16A34A", "#EA580C", "#4F46E5",
];

function pick<T>(values: T[]): T {
  return values[Math.floor(Math.random() * values.length)];
}

export function generateAnonIdentity() {
  const alias = `${pick(ADJECTIVES)}${pick(ANIMALS)}`;
  return {
    alias,
    avatarColor: pick(ANON_AVATAR_COLORS),
  };
}

// Stable fake owner id for anonymous tasks. Never the real userId — the
// client uses ids for profile navigation, so this must not resolve to anyone.
export function anonOwnerId(taskId: string) {
  return `anon:${taskId}`;
}
