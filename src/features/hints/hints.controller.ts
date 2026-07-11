import { NextFunction, Request, Response } from "express";
import { AppError } from "../../errors/AppError";
import { HttpStatus } from "../../types/httpStatus";
import { resetFirstTimeHints, writeFirstTimeHintState } from "./hints.service";
import { isFirstTimeHintId, isFirstTimeHintState } from "./hints.types";

export async function handleWriteFirstTimeHintState(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError("Unauthorized", HttpStatus.UNAUTHORIZED));

    const { hintId } = req.params;
    if (typeof hintId !== "string" || !isFirstTimeHintId(hintId)) {
      return next(
        new AppError("Unknown hint id", HttpStatus.UNPROCESSABLE_ENTITY)
      );
    }

    const state = req.body?.state;
    if (!isFirstTimeHintState(state)) {
      return next(
        new AppError(
          "state must be 'completed' or 'dismissed'",
          HttpStatus.BAD_REQUEST
        )
      );
    }

    const firstTimeHints = await writeFirstTimeHintState(userId, hintId, state);
    res.status(200).json({ firstTimeHints });
  } catch (err) {
    next(err);
  }
}

export async function handleResetFirstTimeHints(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new AppError("Unauthorized", HttpStatus.UNAUTHORIZED));

    await resetFirstTimeHints(userId);
    res.status(200).json({ firstTimeHints: {} });
  } catch (err) {
    next(err);
  }
}
