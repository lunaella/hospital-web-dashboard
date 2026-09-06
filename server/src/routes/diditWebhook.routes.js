import { Router } from "express";
import { handleDiditWebhook } from "../controllers/diditWebhook.controller.js";

// No requireDonorAuth here on purpose — Didit's servers call this directly
// with their own HMAC signature (verified inside the handler), not a
// donor's bearer token. Kept as its own router/mount point (rather than
// living under /api/donor) so it's obvious at a glance in app.js that this
// one route is public.
export const diditWebhookRouter = Router();
diditWebhookRouter.post("/", handleDiditWebhook);
