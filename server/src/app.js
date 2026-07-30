import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { donorsRouter, appointmentsRouter } from "./routes/donors.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { requestsRouter } from "./routes/requests.routes.js";
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

app.use(notFoundHandler);
app.use(errorHandler);
