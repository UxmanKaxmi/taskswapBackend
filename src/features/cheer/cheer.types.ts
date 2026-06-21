export type AvatarUser = {
  id: string;
  name: string;
  photo: string | null;
};

export type BeatCheerState = {
  beatId: string;
  type: "post" | "update";
  updateId: string | null;
  createdAt: string;
  isLatest: boolean;
  isCheeringOpen: boolean;
  cheerCount: number;
  sampleCheerers: AvatarUser[];
  callerHasCheered: boolean;
  callerCheer?: {
    presetKey: string;
    presetText: string;
    createdAt: string;
  };
  isMostCheered: boolean;
};

export type TaskCheerSummary = {
  beats: BeatCheerState[];
  cheerTotal: number;
  distinctCheererCount: number;
  sampleCheerers: AvatarUser[];
  mostCheeredBeatId: string | null;
};
