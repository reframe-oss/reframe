import { Request, Response, NextFunction } from "express";

const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const now = Date.now();
  const record = ipRequestCounts.get(ip as string);

  if (!record || now > record.resetTime) {
    ipRequestCounts.set(ip as string, { count: 1, resetTime: now + WINDOW_MS });
    return next();
  }

  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  record.count += 1;
  next();
};
