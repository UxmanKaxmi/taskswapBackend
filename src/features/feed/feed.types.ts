export interface FeedItem {
  id: string;
  title: string;
  createdAt: Date;
  userId: string;
  user: {
    id: string;
    name?: string;
    avatar?: string;
  };
  _count: {
    comments: number;
    favorites: number;
    helpers: number;
  };
}