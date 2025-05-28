// src/features/reminderNote/reminderNote.controller.ts

import { Request, Response, NextFunction } from "express";
import { sendReminderNote, getRemindersByTask } from "./reminderNote.service";
import { BadRequestError } from "../../errors";

export async function handleSendReminderNote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { message } = req.body;
    const taskId = req.params.id;
    const senderId = req.user?.id;
    if (!senderId) {
      return next(new BadRequestError("User ID is missing from request."));
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
    const taskId = req.params.id;
    const userId = req.user?.id;

    const notes = await getRemindersByTask(taskId, userId);
    res.status(200).json(notes);
  } catch (error) {
    next(error);
  }
}
