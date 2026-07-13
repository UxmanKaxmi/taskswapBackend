import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { BadRequestError } from "../../errors";
import { getParamString } from "../../utils/params";
import { createCircleSchema, joinCircleSchema } from "./circle.schema";
import {
  createCircle,
  createCircleInvite,
  getCircleById,
  getCircleInvitePreview,
  joinCircleByToken,
  leaveCircle,
  nudgeCircleMember,
  pushAllInCircle,
} from "./circle.service";

export async function handleCreateCircle(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }

  try {
    const parsed = createCircleSchema.parse(req.body);
    const created = await createCircle({ userId, ...parsed });
    res.status(201).json(created);
  } catch (error) {
    console.error("[CIRCLE_CREATE_ERROR]", error);

    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.errors,
      });
    }

    next(error);
  }
}

export async function handleGetCircle(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParamString(req.params.id);
    const userId = req.user?.id ?? null;

    if (!id) {
      res.status(400).json({ error: "Missing circle id" });
      return;
    }

    const circle = await getCircleById(id, userId);
    res.status(200).json(circle);
  } catch (error) {
    console.error("[CIRCLE_FETCH_ERROR]", error);
    next(error);
  }
}

export async function handleCreateCircleInvite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const id = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }
  if (!id) {
    return next(new BadRequestError("Circle ID is required"));
  }

  try {
    const invite = await createCircleInvite(userId, id);
    res.status(201).json(invite);
  } catch (error) {
    console.error("[CIRCLE_INVITE_ERROR]", error);
    next(error);
  }
}

export async function handleLeaveCircle(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const id = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }
  if (!id) {
    return next(new BadRequestError("Circle ID is required"));
  }

  try {
    const result = await leaveCircle(userId, id);
    res.status(200).json(result);
  } catch (error) {
    console.error("[CIRCLE_LEAVE_ERROR]", error);
    next(error);
  }
}

export async function handlePushAllCircle(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const id = getParamString(req.params.id);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }
  if (!id) {
    return next(new BadRequestError("Circle ID is required"));
  }

  try {
    const result = await pushAllInCircle(userId, id);
    res.status(200).json(result);
  } catch (error) {
    console.error("[CIRCLE_PUSH_ALL_ERROR]", error);
    next(error);
  }
}

export async function handleNudgeCircleMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const circleId = getParamString(req.params.id);
  const targetUserId = getParamString(req.params.userId);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }
  if (!circleId || !targetUserId) {
    return next(new BadRequestError("Circle and member are required"));
  }

  try {
    const result = await nudgeCircleMember(userId, circleId, targetUserId);
    res.status(200).json(result);
  } catch (error) {
    console.error("[CIRCLE_NUDGE_ERROR]", error);
    next(error);
  }
}

export async function handleJoinCircleInvite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getParamString(req.params.token);
  const userId = req.user?.id;

  if (!userId) {
    return next(new BadRequestError("User ID is missing"));
  }
  if (!token) {
    return next(new BadRequestError("Invite token is required"));
  }

  try {
    const parsed = joinCircleSchema.parse(req.body ?? {});
    const joined = await joinCircleByToken({
      userId,
      token,
      feeling: parsed.feeling,
    });

    res.status(joined.alreadyMember ? 200 : 201).json(joined);
  } catch (error) {
    console.error("[CIRCLE_JOIN_ERROR]", error);

    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.errors,
      });
    }

    next(error);
  }
}

export async function handleGetInvitePreview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = getParamString(req.params.token);

    if (!token) {
      res.status(400).json({ error: "Missing invite token" });
      return;
    }

    const preview = await getCircleInvitePreview(token);
    res.status(200).json(preview);
  } catch (error) {
    console.error("[CIRCLE_INVITE_PREVIEW_ERROR]", error);
    next(error);
  }
}
