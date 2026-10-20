import { describe, expect, it } from "vitest";
import { createPortalService } from "../src/services/portalService.js";
import { createPortalAdminService, pendingMinutes } from "../src/services/portalAdminService.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function setup() {
  const repo = createInMemoryPortalRepository();
  return {
    repo,
    users: createPortalService({ portalRepository: repo }),
    admin: createPortalAdminService({ portalRepository: repo }),
  };
}

describe("pendingMinutes", () => {
  it("computes whole minutes and never goes negative", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(pendingMinutes("2026-10-20T10:30:30Z", now)).toBe(89);
    expect(pendingMinutes("2026-10-20T12:30:00Z", now)).toBe(0);
  });
});

describe("portalAdminService.listPending", () => {
  it("lists only pending portals, oldest first, with how long each has waited", async () => {
    const { repo, users, admin } = setup();
    const a = await users.submit({ userId: ALICE, name: "A", baseUrl: "a-portal.com" });
    const b = await users.submit({ userId: BOB, name: "B", baseUrl: "b-portal.com" });
    const c = await users.submit({ userId: BOB, name: "C", baseUrl: "c-portal.com" });
    repo._backdate(a.id, 30);
    repo._backdate(b.id, 3000); // 50 hours
    repo._backdate(c.id, 120);
    await admin.approve({ id: c.id, adminId: ADMIN });

    const list = await admin.listPending();
    expect(list.map((p) => p.name)).toEqual(["B", "A"]);
    expect(list[0]).toMatchObject({ pendingMinutes: 3000, overdue: true, domain: "b-portal.com" });
    expect(list[1]).toMatchObject({ pendingMinutes: 30, overdue: false });
  });

  it("keeps overdue portals pending: nothing is approved automatically after 48 hours", async () => {
    const { repo, users, admin } = setup();
    const p = await users.submit({ userId: ALICE, name: "Old", baseUrl: "old-portal.com" });
    repo._backdate(p.id, 100 * 60);
    const list = await admin.listPending();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "pending", overdue: true });
    expect(repo._byName("Old").status).toBe("pending");
  });
});

describe("portalAdminService approve / reject", () => {
  it("approve makes the portal public, selectable, and records the reviewer", async () => {
    const { repo, users, admin } = setup();
    const p = await users.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });

    const result = await admin.approve({ id: p.id, adminId: ADMIN });
    expect(result).toMatchObject({ status: "approved", name: "Shine" });
    expect(repo._byName("Shine")).toMatchObject({ reviewedBy: ADMIN });
    expect(repo._byName("Shine").reviewedAt).toBeInstanceOf(Date);

    expect((await users.listFor(BOB)).find((x) => x.id === p.id)).toMatchObject({ status: "approved" });
    await expect(users.setSelection({ userId: BOB, portalIds: [p.id] })).resolves.toBeTruthy();
    expect(await admin.listPending()).toHaveLength(0);
  });

  it("reject stores the reason and hides the portal from everyone", async () => {
    const { repo, users, admin } = setup();
    const p = await users.submit({ userId: ALICE, name: "Spammy", baseUrl: "spammy.com" });

    const result = await admin.reject({ id: p.id, adminId: ADMIN, reason: "Not a job portal" });
    expect(result).toMatchObject({ status: "rejected", rejectionReason: "Not a job portal" });
    expect(repo._byName("Spammy")).toMatchObject({ reviewedBy: ADMIN, rejectionReason: "Not a job portal" });
    for (const user of [ALICE, BOB]) {
      expect((await users.listFor(user)).some((x) => x.id === p.id)).toBe(false);
    }
  });

  it("can't review twice, and unknown ids are 404", async () => {
    const { users, admin } = setup();
    const p = await users.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    await admin.approve({ id: p.id, adminId: ADMIN });

    await expect(admin.reject({ id: p.id, adminId: ADMIN, reason: "changed my mind" })).rejects.toMatchObject({
      status: 409,
      code: "NOT_PENDING",
    });
    await expect(admin.approve({ id: p.id, adminId: ADMIN })).rejects.toMatchObject({ code: "NOT_PENDING" });
    await expect(
      admin.approve({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", adminId: ADMIN }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("seeded portals can't be reviewed (they're not pending)", async () => {
    const { repo, admin } = setup();
    await expect(admin.reject({ id: repo._byName("Naukri").id, adminId: ADMIN, reason: "x" })).rejects.toMatchObject({
      code: "NOT_PENDING",
    });
  });
});
