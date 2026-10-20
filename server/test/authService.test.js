import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { createInMemoryUserRepository, createTestAuthService, TEST_CONFIG } from "./helpers.js";

const PASSWORD = "correct horse battery";
const signupInput = (email = "a@example.com") => ({ email, password: PASSWORD, fullName: "Asha Rai" });

describe("authService", () => {
  it("signs up a user with a lower-cased email, trimmed name and hashed password", async () => {
    const repo = createInMemoryUserRepository();
    const service = createTestAuthService(repo);

    const { user, token } = await service.signup({
      email: "  Me@Example.COM ",
      password: PASSWORD,
      fullName: "  Asha Rai ",
    });

    expect(user.email).toBe("me@example.com");
    expect(user.fullName).toBe("Asha Rai");
    expect(user).not.toHaveProperty("passwordHash");
    expect(token).toEqual(expect.any(String));
    const stored = await repo.findByEmail("me@example.com");
    expect(stored.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects duplicate emails regardless of case", async () => {
    const service = createTestAuthService();
    await service.signup(signupInput("a@example.com"));
    await expect(service.signup(signupInput("A@example.com"))).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_TAKEN",
    });
  });

  it("logs in with correct credentials", async () => {
    const service = createTestAuthService();
    await service.signup(signupInput());
    const { user, token } = await service.login({ email: "A@example.com", password: PASSWORD });
    expect(user.email).toBe("a@example.com");
    expect(service.verifyToken(token)).toBe(user.id);
  });

  it("gives the same error for wrong password and unknown email", async () => {
    const service = createTestAuthService();
    await service.signup(signupInput());

    const wrongPassword = await service.login({ email: "a@example.com", password: "nope-nope-nope" }).catch((e) => e);
    const unknownEmail = await service.login({ email: "x@example.com", password: PASSWORD }).catch((e) => e);

    for (const err of [wrongPassword, unknownEmail]) {
      expect(err).toMatchObject({ status: 401, code: "UNAUTHENTICATED", message: "Invalid email or password" });
    }
  });

  it("rejects tampered, expired, and wrongly-signed tokens", async () => {
    const service = createTestAuthService();
    const { user, token } = await service.signup(signupInput());

    expect(() => service.verifyToken(token + "x")).toThrow();
    expect(() => service.verifyToken("garbage")).toThrow();

    const expired = jwt.sign({}, TEST_CONFIG.JWT_SECRET, { subject: user.id, expiresIn: -10 });
    expect(() => service.verifyToken(expired)).toThrow();

    const wrongKey = jwt.sign({}, "another-secret-another-secret-123456", { subject: user.id });
    expect(() => service.verifyToken(wrongKey)).toThrow();

    const noneAlg = jwt.sign({ sub: user.id }, "", { algorithm: "none" });
    expect(() => service.verifyToken(noneAlg)).toThrow();
  });

  it("getUserById fails for a deleted/unknown user", async () => {
    const service = createTestAuthService();
    await expect(service.getUserById("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      status: 401,
    });
  });
});
