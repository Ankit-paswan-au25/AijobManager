import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { conflict, unauthorized } from "../lib/errors.js";

export const normalizeEmail = (email) => email.trim().toLowerCase();

const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  isAdmin: Boolean(user.isAdmin),
  createdAt: user.createdAt,
});

export function createAuthService({ userRepository, jwtSecret, jwtExpiresInDays, bcryptCost = 12 }) {
  // Used to equalise timing when the email is unknown, so login doesn't reveal which emails exist.
  const dummyHashPromise = bcrypt.hash("not-a-real-password", bcryptCost);

  const signToken = (userId) =>
    jwt.sign({}, jwtSecret, {
      subject: userId,
      expiresIn: `${jwtExpiresInDays}d`,
      algorithm: "HS256",
    });

  return {
    async signup({ email, password, fullName }) {
      const normalized = normalizeEmail(email);
      const passwordHash = await bcrypt.hash(password, bcryptCost);
      const user = await userRepository.create({
        email: normalized,
        passwordHash,
        fullName: fullName.trim(),
      });
      if (!user) throw conflict("EMAIL_TAKEN", "An account with this email already exists");
      return { user: toPublicUser(user), token: signToken(user.id) };
    },

    async login({ email, password }) {
      const user = await userRepository.findByEmail(normalizeEmail(email));
      const hash = user ? user.passwordHash : await dummyHashPromise;
      const ok = await bcrypt.compare(password, hash);
      if (!user || !ok) throw unauthorized("Invalid email or password");
      return { user: toPublicUser(user), token: signToken(user.id) };
    },

    /** Returns the user id for a valid token, otherwise throws 401. */
    verifyToken(token) {
      try {
        const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
        if (typeof payload.sub !== "string") throw new Error("missing subject");
        return payload.sub;
      } catch {
        throw unauthorized("Invalid or expired session");
      }
    },

    async getUserById(id) {
      const user = await userRepository.findById(id);
      if (!user) throw unauthorized("Invalid or expired session");
      return toPublicUser(user);
    },
  };
}
