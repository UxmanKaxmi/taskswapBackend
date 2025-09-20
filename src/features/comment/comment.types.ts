export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  user: {
    id: string;
    name: string;
    photo?: string;
  };

  // 👍 likes
  likesCount: number;
  likedByMe: boolean;
}

export interface CreateCommentInput {
  text: string;
  taskId: string;
  userId: string;
  mentions?: string[]; // ✅ userIds to notify
}

export interface ToggleCommentLikePayload {
  commentId: string;
  like: boolean; // true = like, false = unlike
}
