import { describe, expect, it } from "vitest";
import { createPortalService, MAX_PENDING_PER_USER } from "../src/services/portalService.js";
import { createInMemoryPortalRepository } from "./portalFakes.js";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function setup() {
  const repo = createInMemoryPortalRepository();
  return { repo, service: createPortalService({ portalRepository: repo }) };
}

describe("portalService.listFor", () => {
  it("returns the four seeded approved portals, none selected", async () => {
    const { service } = setup();
    const list = await service.listFor(ALICE);
    expect(list.map((p) => p.name).sort()).toEqual(["Indeed", "LinkedIn", "Naukri", "foundit"]);
    expect(list.every((p) => p.status === "approved" && p.selected === false)).toBe(true);
  });

  it("shows a pending portal only to the user who submitted it", async () => {
    const { service } = setup();
    await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });

    const alice = await service.listFor(ALICE);
    const bob = await service.listFor(BOB);

    expect(alice.find((p) => p.name === "Shine")).toMatchObject({ status: "pending", selected: false });
    expect(alice.find((p) => p.name === "Shine").submittedAt).toBeTruthy();
    expect(bob.find((p) => p.name === "Shine")).toBeUndefined();
  });

  it("never leaks submitter or reviewer ids", async () => {
    const { service } = setup();
    await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    for (const p of await service.listFor(ALICE)) {
      expect(p).not.toHaveProperty("submittedBy");
      expect(p).not.toHaveProperty("reviewedBy");
    }
  });

  it("does not show rejected portals to anyone (TODO: tell the submitter why)", async () => {
    const { service, repo } = setup();
    const created = await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    await repo.review({ id: created.id, status: "rejected", reviewerId: BOB, rejectionReason: "spam" });
    expect((await service.listFor(ALICE)).find((p) => p.id === created.id)).toBeUndefined();
  });
});

describe("portalService.submit", () => {
  it("creates a pending portal with a normalized origin", async () => {
    const { service, repo } = setup();
    const p = await service.submit({ userId: ALICE, name: "  Shine  ", baseUrl: "https://www.shine.com/jobs?x=1" });
    expect(p).toMatchObject({ name: "Shine", baseUrl: "https://www.shine.com", status: "pending" });
    expect(repo._byName("Shine")).toMatchObject({ domain: "shine.com", submittedBy: ALICE, reviewedBy: null });
  });

  it("rejects duplicates of approved portals by normalized domain", async () => {
    const { service } = setup();
    for (const baseUrl of ["naukri.com", "https://WWW.Naukri.com/x", "https://m.naukri.com", "https://in.indeed.com"]) {
      await expect(service.submit({ userId: ALICE, name: "Dup", baseUrl }), baseUrl).rejects.toMatchObject({
        status: 409,
        code: "DUPLICATE_PORTAL",
      });
    }
  });

  it("rejects a domain already pending, with the same message so pending portals aren't revealed", async () => {
    const { service } = setup();
    await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    const err = await service.submit({ userId: BOB, name: "Shine 2", baseUrl: "www.shine.com" }).catch((e) => e);
    expect(err).toMatchObject({ status: 409, code: "DUPLICATE_PORTAL" });
    const approvedDup = await service.submit({ userId: BOB, name: "x", baseUrl: "naukri.com" }).catch((e) => e);
    expect(err.message).toBe(approvedDup.message);
  });

  it("allows resubmitting a domain that was rejected", async () => {
    const { service, repo } = setup();
    const first = await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    await repo.review({ id: first.id, status: "rejected", reviewerId: BOB, rejectionReason: "typo in name" });
    await expect(service.submit({ userId: BOB, name: "Shine", baseUrl: "shine.com" })).resolves.toMatchObject({
      status: "pending",
    });
  });

  it("rejects invalid addresses", async () => {
    const { service } = setup();
    for (const baseUrl of ["javascript:alert(1)", "http://localhost", "http://10.0.0.1", "nope"]) {
      await expect(service.submit({ userId: ALICE, name: "X", baseUrl }), baseUrl).rejects.toMatchObject({
        status: 400,
      });
    }
  });

  it(`limits a user to ${MAX_PENDING_PER_USER} portals under review`, async () => {
    const { service } = setup();
    for (let i = 0; i < MAX_PENDING_PER_USER; i++) {
      await service.submit({ userId: ALICE, name: `P${i}`, baseUrl: `portal${i}.com` });
    }
    await expect(service.submit({ userId: ALICE, name: "One more", baseUrl: "onemore.com" })).rejects.toMatchObject({
      status: 409,
      code: "TOO_MANY_PENDING",
    });
    // another user is unaffected
    await expect(service.submit({ userId: BOB, name: "Fine", baseUrl: "fine.com" })).resolves.toBeTruthy();
  });

  it("never auto-approves: a submission stays pending, even if it is very old", async () => {
    const { service, repo } = setup();
    const p = await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    repo._backdate(p.id, 10 * 24 * 60); // 10 days
    expect((await service.listFor(ALICE)).find((x) => x.id === p.id).status).toBe("pending");
    expect(repo._byName("Shine").status).toBe("pending");
  });
});

describe("portalService.setSelection", () => {
  it("replaces the whole selection and reflects it in the list", async () => {
    const { service, repo } = setup();
    const [naukri, linkedin, indeed] = ["Naukri", "LinkedIn", "Indeed"].map((n) => repo._byName(n).id);

    let list = await service.setSelection({ userId: ALICE, portalIds: [naukri, linkedin] });
    expect(list.filter((p) => p.selected).map((p) => p.name).sort()).toEqual(["LinkedIn", "Naukri"]);

    list = await service.setSelection({ userId: ALICE, portalIds: [indeed] });
    expect(list.filter((p) => p.selected).map((p) => p.name)).toEqual(["Indeed"]);

    list = await service.setSelection({ userId: ALICE, portalIds: [] });
    expect(list.some((p) => p.selected)).toBe(false);
  });

  it("is per-user", async () => {
    const { service, repo } = setup();
    await service.setSelection({ userId: ALICE, portalIds: [repo._byName("Naukri").id] });
    expect((await service.listFor(BOB)).some((p) => p.selected)).toBe(false);
  });

  it("accepts duplicate ids in the request", async () => {
    const { service, repo } = setup();
    const id = repo._byName("Naukri").id;
    const list = await service.setSelection({ userId: ALICE, portalIds: [id, id] });
    expect(list.filter((p) => p.selected)).toHaveLength(1);
  });

  it("refuses pending, rejected and unknown portals, and leaves the old selection untouched", async () => {
    const { service, repo } = setup();
    const naukri = repo._byName("Naukri").id;
    await service.setSelection({ userId: ALICE, portalIds: [naukri] });

    const pending = await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    for (const bad of [pending.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"]) {
      await expect(service.setSelection({ userId: ALICE, portalIds: [naukri, bad] })).rejects.toMatchObject({
        status: 400,
        code: "INVALID_PORTAL",
      });
    }
    expect((await service.listFor(ALICE)).filter((p) => p.selected).map((p) => p.name)).toEqual(["Naukri"]);
  });

  it("can't select someone else's pending portal", async () => {
    const { service } = setup();
    const pending = await service.submit({ userId: ALICE, name: "Shine", baseUrl: "shine.com" });
    await expect(service.setSelection({ userId: BOB, portalIds: [pending.id] })).rejects.toMatchObject({
      code: "INVALID_PORTAL",
    });
  });
});
