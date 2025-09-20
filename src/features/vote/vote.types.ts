// DTO for returning vote data
export interface VoteDTO {
  id: string;
  userId: string;
  taskId: string;
  option: string;
  createdAt: string;
}

// Input type for casting a vote (used in service/controller)
export interface CastVoteInput {
  userId: string;
  taskId: string;
  nextOption?: string; // new
  prevOption?: string; // new (optional)
  option?: string;
}

// Response shape for aggregated results
export interface VoteSummary {
  [option: string]: number;
}
