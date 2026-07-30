import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export function signSessionToken(adminId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: adminId, jti }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  return { token, jti };
}

export function verifySessionToken(token) {
  return jwt.verify(token, env.jwtSecret); // throws if invalid/expired
}
