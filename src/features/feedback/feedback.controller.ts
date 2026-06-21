import { RequestHandler } from "express";
import { ZodError } from "zod";
import { submitFeedbackSchema } from "./feedback.schema";
import { createFeedback } from "./feedback.service";

export const handleSubmitFeedback: RequestHandler = async (req, res, next) => {
  try {
    const input = submitFeedbackSchema.parse(req.body);

    const result = await createFeedback(input, req.user?.id);

    res.status(201).json({ success: true, id: result.id });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "Invalid feedback payload",
        details: err.flatten().fieldErrors,
      });
      return;
    }

    console.error("[SUBMIT_FEEDBACK_ERROR]", err);
    next(err);
  }
};
