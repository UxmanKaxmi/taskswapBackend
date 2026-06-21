import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { BadRequestError } from "../../errors";
import { getParamString } from "../../utils/params";
import { cheerBeat } from "./cheer.service";
import { cheerSchema } from "./cheer.schema";

export async function handleCheerBeat(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = req.user?.id;
  const beatId = getParamString(req.params.beatId);

  if (!userId) {
    return next(new BadRequestError("User ID is required"));
  }

  if (!beatId) {
    return next(new BadRequestError("Beat ID is required"));
  }

  try {
    const parsed = cheerSchema.parse(req.body);
    const result = await cheerBeat({
      beatId,
      userId,
      presetKey: parsed.presetKey,
    });

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Validation error",
        issues: error.errors,
      });
      return;
    }

    next(error);
  }
}
