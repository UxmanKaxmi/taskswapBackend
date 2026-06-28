"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEEDED_USER_PROFILES = exports.USER_ORIGIN = void 0;
exports.getSeededUserProfiles = getSeededUserProfiles;
exports.seedSeededUsers = seedSeededUsers;
const client_1 = require("../../db/client");
exports.USER_ORIGIN = {
    REAL: "real",
    SEEDED: "seeded",
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
exports.SEEDED_USER_PROFILES = Array.from({ length: 30 }, (_, index) => {
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
});
const DEFAULT_PEOPLE_API_URL = "https://randomuser.me/api/?results=30&seed=taskswap-launch-real-portraits";
const SEEDED_USER_PHOTO_KEEP_RATE = 0.65;
function slugifyUsername(value, fallback) {
    const slug = value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 24);
    return slug || fallback;
}
function deterministicUnitInterval(seed) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
}
function getPeopleArray(payload) {
    if (Array.isArray(payload))
        return payload;
    if (payload && typeof payload === "object") {
        const record = payload;
        if (Array.isArray(record.results))
            return record.results;
        if (Array.isArray(record.people))
            return record.people;
        if (Array.isArray(record.data))
            return record.data;
        if (Array.isArray(record.users))
            return record.users;
    }
    return [];
}
function profileFromPerson(person, index) {
    const fallback = exports.SEEDED_USER_PROFILES[index];
    const nameFromParts = [person.name?.first ?? person.firstName, person.name?.last ?? person.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    const name = person.fullName?.trim() ||
        person.name_full?.trim() ||
        nameFromParts ||
        fallback.name;
    const usernameSource = person.username ||
        person.login?.username ||
        name ||
        fallback.username;
    const photo = person.picture?.large ||
        person.picture?.medium ||
        person.avatarUrl ||
        person.avatar ||
        person.image ||
        person.photo ||
        null;
    const shouldKeepPhoto = Boolean(photo) &&
        deterministicUnitInterval(`${fallback.id}:${name}`) < SEEDED_USER_PHOTO_KEEP_RATE;
    return {
        ...fallback,
        name,
        username: `${slugifyUsername(usernameSource, fallback.username)}${String(index + 1).padStart(2, "0")}`,
        photo: shouldKeepPhoto ? photo : null,
        avatarInitial: name.charAt(0).toUpperCase(),
    };
}
function removeDuplicateProfilePhotos(profiles) {
    const usedPhotos = new Set();
    return profiles.map((profile) => {
        if (!profile.photo)
            return profile;
        if (usedPhotos.has(profile.photo)) {
            return { ...profile, photo: null };
        }
        usedPhotos.add(profile.photo);
        return profile;
    });
}
async function getSeededUserProfiles() {
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
        return removeDuplicateProfilePhotos(exports.SEEDED_USER_PROFILES.map((fallback, index) => people[index] ? profileFromPerson(people[index], index) : fallback));
    }
    catch (error) {
        console.warn("[SEEDED_USERS] People API unavailable; using bundled full-name fallback profiles.", error instanceof Error ? error.message : error);
        return exports.SEEDED_USER_PROFILES;
    }
}
async function seedSeededUsers(client = client_1.prisma) {
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
                    origin: exports.USER_ORIGIN.SEEDED,
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
                    origin: exports.USER_ORIGIN.SEEDED,
                    fcmToken: null,
                },
            });
            users.push(user);
        }
        const followRows = profiles.flatMap((profile, index) => {
            const followingCount = 2 + (index % 4);
            return Array.from({ length: followingCount }, (_, offset) => {
                const following = profiles[(index + offset + 3) % profiles.length];
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
