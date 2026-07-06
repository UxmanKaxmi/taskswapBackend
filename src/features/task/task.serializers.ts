import { anonOwnerId } from "../../utils/anonIdentity";

// The single choke point for task-owner identity. EVERY task payload that
// leaves the server must run its owner through this before serialization.
// For an anonymous task viewed by anyone but its owner, the real user is
// replaced by the task's generated alias and a fake, non-resolvable id.

export type TaskOwnerShape = {
  id: string;
  name: string;
  photo?: string | null;
  [key: string]: unknown;
};

export type AnonMaskableTask = {
  id: string;
  userId: string;
  isAnonymous: boolean;
  anonAlias: string | null;
  anonAvatarColor: string | null;
};

export function isMaskedForViewer(
  task: Pick<AnonMaskableTask, "isAnonymous" | "userId">,
  viewerId?: string | null
) {
  return task.isAnonymous && task.userId !== viewerId;
}

export function presentTaskOwner<T extends TaskOwnerShape>(
  task: AnonMaskableTask,
  owner: T,
  viewerId?: string | null
): TaskOwnerShape {
  if (!isMaskedForViewer(task, viewerId)) {
    return { ...owner, isAnonymous: task.isAnonymous };
  }

  return {
    id: anonOwnerId(task.id),
    name: task.anonAlias ?? "Anonymous",
    photo: null,
    avatarColor: task.anonAvatarColor,
    isAnonymous: true,
  };
}

// Masks owner-authored content attached to an anonymous task (comments,
// progress updates). Supporters' content stays fully named — that asymmetry
// is the product: the vulnerable party hides, the generous party gets credit.
export function presentTaskContentAuthor<T extends TaskOwnerShape>(
  task: AnonMaskableTask,
  author: T,
  viewerId?: string | null
): T | TaskOwnerShape {
  if (author.id !== task.userId) return author;
  return presentTaskOwner(task, author, viewerId);
}
