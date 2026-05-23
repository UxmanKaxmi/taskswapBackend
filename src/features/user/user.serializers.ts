export type PublicUserRecord = {
  id: string;
  name: string;
  username?: string | null;
  photo?: string | null;
  avatarInitial?: string | null;
  avatarColor?: string | null;
};

function toPhoto(photo: string | null | undefined) {
  return photo && photo.trim() ? photo : null;
}

export function toPublicUser(user: PublicUserRecord) {
  return {
    id: user.id,
    displayName: user.name,
    username: user.username ?? null,
    handle: user.username ?? null,
    avatar: toPhoto(user.photo),
    avatarUrl: toPhoto(user.photo),
    avatarInitial: user.avatarInitial ?? user.name.charAt(0).toUpperCase(),
    avatarColor: user.avatarColor ?? null,
    name: user.name,
    photo: toPhoto(user.photo),
  };
}
