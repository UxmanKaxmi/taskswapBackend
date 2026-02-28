import { Request, Response, NextFunction } from "express";
import { sendReminderNote, getRemindersByTask } from "./reminderNote.service";
import { BadRequestError } from "../../errors";
import { getParamString } from "../../utils/params";

export async function handleSendReminderNote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { message } = req.body;
    const taskId = getParamString(req.params.id);
    const senderId = req.user?.id;

    if (!senderId) {
      return next(new BadRequestError("User ID is missing from request."));
    }
    if (!taskId) {
      return next(new BadRequestError("Task ID is required."));
    }

    const note = await sendReminderNote({ taskId, senderId, message });
    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
}

export async function handleGetRemindersByTask(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const taskId = getParamString(req.params.id);
    const userId = req.user?.id ?? null; // <-- ⭐ PUBLIC SUPPORT

    if (!taskId) {
      return next(new BadRequestError("Task ID is required."));
    }
 
    const notes = await getRemindersByTask(taskId, userId);
    res.status(200).json(notes);
  } catch (error) {
    next(error);
  }
}
