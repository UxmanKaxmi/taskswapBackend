"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = toPublicUser;
function toPhoto(photo) {
    return photo && photo.trim() ? photo : null;
}
function toPublicUser(user) {
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
