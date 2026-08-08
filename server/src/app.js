import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { donorsRouter, appointmentsRouter } from "./routes/donors.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { requestsRouter } from "./routes/requests.routes.js";
import { hospitalsRouter } from "./routes/hospitals.routes.js";
import { importRouter } from "./routes/import.routes.js";
import { teamRouter } from "./routes/team.routes.js";
import { donorAuthRouter } from "./routes/donorAuth.routes.js";
import { donorPortalRouter } from "./routes/donorPortal.routes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

export const app = express();

// So req.ip resolves the real client IP from X-Forwarded-For when this
// runs behind a reverse proxy/tunnel (e.g. ngrok) instead of the proxy's
// own address — matters for the login geolocation lookup in
// auth.controller.js to report the actual visitor's region.
app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({ service: "resq-api", status: "ok", docs: "/health" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/donors", donorsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/hospitals", hospitalsRouter);
app.use("/api/import", importRouter);
app.use("/api/team", teamRouter);

// The donor-facing Android app's API surface — separate auth scheme from
// the admin routes above (see middleware/donorAuth.js), same server.
app.use("/api/donor-auth", donorAuthRouter);
app.use("/api/donor", donorPortalRouter);

app.use(notFoundHandler);
app.use(errorHandler);
