export interface SendReminderNoteInput {
  taskId: string;
  senderId: string;
  message: string;
}

// ReminderNoteDTO stands for Reminder Note Data Transfer Object — it’s a TypeScript interface you define to:

// ✅ Clearly structure the data sent back to the frontend

// ⸻

// Example:

// You may store extra internal fields in your DB (like sender.email, task.deletedAt, etc.), but your API response should be:

export interface ReminderNoteDTO {
  id: string;
  taskId: string;
  senderId: string;
  message: string;
  createdAt: string;
  senderName: string;
  senderPhoto?: string | null;
}
