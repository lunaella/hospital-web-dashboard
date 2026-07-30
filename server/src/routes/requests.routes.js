import { Router } from "express";
import { listRequests, createRequest, fulfillRequest } from "../controllers/requests.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const requestsRouter = Router();
requestsRouter.use(requireAuth);

requestsRouter.get("/", listRequests);
requestsRouter.post("/", createRequest);
requestsRouter.patch("/:code/fulfill", fulfillRequest);
