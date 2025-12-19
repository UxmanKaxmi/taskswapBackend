// DTO for returning push data
export interface PushDTO {
  id: string;
  userId: string;
  taskId: string;
  createdAt: string;
}

// Input type for toggling a push (used in service/controller)
export interface TogglePushInput {
  userId: string;
  taskId: string;
}

// Response shape for aggregated results
export interface PushSummary {
  taskId: string;
  pushCount: number;
}