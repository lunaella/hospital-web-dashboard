import { Router } from "express";
import { listTeam, createTeamMember, updateTeamMember, deleteTeamMember } from "../controllers/team.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTeamManager } from "../middleware/permissions.js";

export const teamRouter = Router();
teamRouter.use(requireAuth, requireTeamManager);

teamRouter.get("/", listTeam);
teamRouter.post("/", createTeamMember);
teamRouter.patch("/:id", updateTeamMember);
teamRouter.delete("/:id", deleteTeamMember);
