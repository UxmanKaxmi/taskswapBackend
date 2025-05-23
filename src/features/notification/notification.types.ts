export interface NotificationDTO {
  id: string;
  userId: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, any>; // Flexible for all notification types
  sender?: {
    id: string;
    name: string;
    photo?: string;
  };
}
