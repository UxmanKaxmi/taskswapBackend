export type HomeModuleEntity = {
  type: "task";
  taskId: string;
  taskType: "reminder" | "advice" | "decision" | "motivation";
  taskText: string;
  ownerId: string;
  ownerName: string;
  ownerPhoto: string | null;
};

type HomeModuleBase = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  entity: HomeModuleEntity;
};

export type SuccessStoryModule = HomeModuleBase & {
  type: "success_story";
  timestamps: {
    contributedAt: string;
    resultAt: string;
  };
};

export type NeedsYourPushModule = HomeModuleBase & {
  type: "needs_your_push";
  stats: {
    pushCount: number;
  };
};

export type UpdateProgressModule = HomeModuleBase & {
  type: "update_progress";
  stats: {
    pushCount: number;
    lastPushAt: string | null;
  };
};

export type AdviceRequestModule = HomeModuleBase & {
  type: "advice_request_waiting_on_you";
  stats: {
    helperCount: number;
    lastHelperAt: string | null;
  };
  question: string;
};

export type HomeModules = {
  successStory: SuccessStoryModule | null;
  needsYourPush: NeedsYourPushModule | null;
  updateProgress: UpdateProgressModule | null;
  adviceRequestWaitingOnYou: AdviceRequestModule | null;
};

export type HomeSummary = {
  modules: HomeModules;
};
