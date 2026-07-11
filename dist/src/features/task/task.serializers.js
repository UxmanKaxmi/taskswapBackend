"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMaskedForViewer = isMaskedForViewer;
exports.presentTaskOwner = presentTaskOwner;
exports.presentTaskContentAuthor = presentTaskContentAuthor;
const anonIdentity_1 = require("../../utils/anonIdentity");
function isMaskedForViewer(task, viewerId) {
    return task.isAnonymous && task.userId !== viewerId;
}
function presentTaskOwner(task, owner, viewerId) {
    if (!isMaskedForViewer(task, viewerId)) {
        return { ...owner, isAnonymous: task.isAnonymous };
    }
    return {
        id: (0, anonIdentity_1.anonOwnerId)(task.id),
        name: task.anonAlias ?? "Anonymous",
        photo: null,
        avatarColor: task.anonAvatarColor,
        isAnonymous: true,
    };
}
// Masks owner-authored content attached to an anonymous task (comments,
// progress updates). Supporters' content stays fully named — that asymmetry
// is the product: the vulnerable party hides, the generous party gets credit.
function presentTaskContentAuthor(task, author, viewerId) {
    if (author.id !== task.userId)
        return author;
    return presentTaskOwner(task, author, viewerId);
}
