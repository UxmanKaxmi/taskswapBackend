import { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client";

export const USER_ORIGIN = {
  REAL: "real",
  SEEDED: "seeded",
} as const;

type SeededUserProfile = {
  id: string;
  email: string;
  name: string;
  username: string;
  photo: string | null;
  avatarInitial: string;
  avatarColor: string;
};

const avatarColors = [
  "#D97706",
  "#059669",
  "#2563EB",
  "#7C3AED",
  "#DC2626",
  "#0891B2",
  "#9333EA",
  "#16A34A",
  "#EA580C",
  "#4F46E5",
];

export const SEEDED_USER_PROFILES: SeededUserProfile[] = Array.from(
  { length: 30 },
  (_, index) => {
    const padded = String(index + 1).padStart(3, "0");
    const name = `Seeded User ${padded}`;

    return {
      id: `seeded-user-${padded}`,
      email: `seeded-user-${padded}@internal.taskswap.invalid`,
      name,
      username: `seededuser${padded}`,
      photo: null,
      avatarInitial: name.charAt(0).toUpperCase(),
      avatarColor: avatarColors[index % avatarColors.length],
    };
  }
);

type SeededUserClient = Pick<
  PrismaClient,
  "user" | "follow" | "$transaction"
>;

const DEFAULT_PEOPLE_API_URL =
  "https://randomuser.me/api/?results=30&seed=taskswap-launch-real-portraits";
const SEEDED_USER_PHOTO_KEEP_RATE = 0.65;

type PeopleApiPerson = {
  name?: {
    first?: string;
    last?: string;
  };
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name_full?: string;
  username?: string;
  login?: {
    username?: string;
  };
  picture?: {
    large?: string;
    medium?: string;
    thumbnail?: string;
  };
  avatar?: string;
  avatarUrl?: string;
  image?: string;
  photo?: string;
};

function slugifyUsername(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);

  return slug || fallback;
}

function deterministicUnitInterval(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function getPeopleArray(payload: unknown): PeopleApiPerson[] {
  if (Array.isArray(payload)) return payload as PeopleApiPerson[];

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results as PeopleApiPerson[];
    if (Array.isArray(record.people)) return record.people as PeopleApiPerson[];
    if (Array.isArray(record.data)) return record.data as PeopleApiPerson[];
    if (Array.isArray(record.users)) return record.users as PeopleApiPerson[];
  }

  return [];
}

function profileFromPerson(person: PeopleApiPerson, index: number): SeededUserProfile {
  const fallback = SEEDED_USER_PROFILES[index];
  const nameFromParts = [person.name?.first ?? person.firstName, person.name?.last ?? person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name =
    person.fullName?.trim() ||
    person.name_full?.trim() ||
    nameFromParts ||
    fallback.name;
  const usernameSource =
    person.username ||
    person.login?.username ||
    name ||
    fallback.username;
  const photo =
    person.picture?.large ||
    person.picture?.medium ||
    person.avatarUrl ||
    person.avatar ||
    person.image ||
    person.photo ||
    null;
  const shouldKeepPhoto =
    Boolean(photo) &&
    deterministicUnitInterval(`${fallback.id}:${name}`) < SEEDED_USER_PHOTO_KEEP_RATE;

  return {
    ...fallback,
    name,
    username: `${slugifyUsername(usernameSource, fallback.username)}${String(index + 1).padStart(2, "0")}`,
    photo: shouldKeepPhoto ? photo : null,
    avatarInitial: name.charAt(0).toUpperCase(),
  };
}

function removeDuplicateProfilePhotos(profiles: SeededUserProfile[]) {
  const usedPhotos = new Set<string>();

  return profiles.map((profile) => {
    if (!profile.photo) return profile;

    if (usedPhotos.has(profile.photo)) {
      return { ...profile, photo: null };
    }

    usedPhotos.add(profile.photo);
    return profile;
  });
}

export async function getSeededUserProfiles(): Promise<SeededUserProfile[]> {
  const peopleApiUrl = process.env.SEEDED_PEOPLE_API_URL || DEFAULT_PEOPLE_API_URL;

  try {
    const response = await fetch(peopleApiUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`People API returned ${response.status}`);
    }

    const people = getPeopleArray(await response.json());
    if (!people.length) {
      throw new Error("People API returned no people");
    }

    return removeDuplicateProfilePhotos(
      SEEDED_USER_PROFILES.map((fallback, index) =>
        people[index] ? profileFromPerson(people[index], index) : fallback
      )
    );
  } catch (error) {
    console.warn(
      "[SEEDED_USERS] People API unavailable; using bundled full-name fallback profiles.",
      error instanceof Error ? error.message : error
    );
    return SEEDED_USER_PROFILES;
  }
}

export async function seedSeededUsers(client: SeededUserClient = prisma) {
  const profiles = await getSeededUserProfiles();

  return client.$transaction(async (tx) => {
    const users = [];

    for (const profile of profiles) {
      const user = await tx.user.upsert({
        where: { id: profile.id },
        update: {
          email: profile.email,
          name: profile.name,
          username: profile.username,
          photo: profile.photo,
          avatarInitial: profile.avatarInitial,
          avatarColor: profile.avatarColor,
          origin: USER_ORIGIN.SEEDED,
          fcmToken: null,
        },
        create: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          username: profile.username,
          photo: profile.photo,
          avatarInitial: profile.avatarInitial,
          avatarColor: profile.avatarColor,
          origin: USER_ORIGIN.SEEDED,
          fcmToken: null,
        },
      });

      users.push(user);
    }

    const followRows = profiles.flatMap((profile, index) => {
      const followingCount = 2 + (index % 4);

      return Array.from({ length: followingCount }, (_, offset) => {
        const following =
          profiles[(index + offset + 3) % profiles.length];

        return {
          followerId: profile.id,
          followingId: following.id,
        };
      }).filter((row) => row.followerId !== row.followingId);
    });

    await tx.follow.createMany({
      data: followRows,
      skipDuplicates: true,
    });

    return { count: users.length };
  });
}
