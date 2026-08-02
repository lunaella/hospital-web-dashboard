import { Router } from "express";
import { listHospitals } from "../controllers/hospitals.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const hospitalsRouter = Router();
hospitalsRouter.use(requireAuth);

hospitalsRouter.get("/", listHospitals);
