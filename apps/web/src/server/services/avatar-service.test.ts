import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  row: null as any,
  upserted: [] as any[],
  deletes: [] as any[],
};

vi.mock("@openploy/db", () => ({
  userAvatars: { userId: "user-id-column" },
}));

vi.mock("../db", () => ({
  db: {
    query: {
      userAvatars: { findFirst: vi.fn(async () => state.row) },
    },
    insert: vi.fn(() => ({
      values: (values: any) => ({
        onConflictDoUpdate: async ({ set }: { set: any }) => {
          state.upserted.push({ values, set });
        },
      }),
    })),
    delete: vi.fn(() => ({
      where: async () => {
        state.deletes.push(true);
      },
    })),
  },
}));

const { deleteAvatar, getAvatar, uploadAvatar } = await import("./avatar-service");

const userId = "018e5a3e-0000-7000-8000-000000000001";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF_HEADER = Buffer.from("GIF89a" + "rest-of-file");
const WEBP_HEADER = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("WEBP")]);
const TEXT_FILE = Buffer.from("not an image, just plain text");

describe("avatar-service", () => {
  beforeEach(() => {
    state.row = null;
    state.upserted = [];
    state.deletes = [];
  });

  describe("uploadAvatar", () => {
    it("accepts a PNG and detects its content type", async () => {
      await uploadAvatar(userId, PNG_HEADER);
      expect(state.upserted).toHaveLength(1);
      expect(state.upserted[0].values).toMatchObject({ userId, contentType: "image/png", sizeBytes: PNG_HEADER.length });
    });

    it("accepts a JPEG and detects its content type", async () => {
      await uploadAvatar(userId, JPEG_HEADER);
      expect(state.upserted[0].values).toMatchObject({ contentType: "image/jpeg" });
    });

    it("accepts a GIF and detects its content type", async () => {
      await uploadAvatar(userId, GIF_HEADER);
      expect(state.upserted[0].values).toMatchObject({ contentType: "image/gif" });
    });

    it("accepts a WEBP and detects its content type", async () => {
      await uploadAvatar(userId, WEBP_HEADER);
      expect(state.upserted[0].values).toMatchObject({ contentType: "image/webp" });
    });

    it("rejects a file with no recognizable image signature, regardless of claimed type", async () => {
      await expect(uploadAvatar(userId, TEXT_FILE)).rejects.toThrow("not a supported image");
      expect(state.upserted).toEqual([]);
    });

    it("rejects an empty file", async () => {
      await expect(uploadAvatar(userId, Buffer.alloc(0))).rejects.toThrow("empty");
    });

    it("rejects a file over the 2MB size cap", async () => {
      const oversized = Buffer.concat([PNG_HEADER, Buffer.alloc(2 * 1024 * 1024)]);
      await expect(uploadAvatar(userId, oversized)).rejects.toThrow("too large");
    });

    it("upserts on the userId conflict target so re-uploading replaces the existing avatar", async () => {
      await uploadAvatar(userId, PNG_HEADER);
      await uploadAvatar(userId, JPEG_HEADER);
      expect(state.upserted).toHaveLength(2);
      expect(state.upserted[1].set).toMatchObject({ contentType: "image/jpeg" });
    });
  });

  describe("deleteAvatar", () => {
    it("deletes the row for the given user", async () => {
      await deleteAvatar(userId);
      expect(state.deletes).toHaveLength(1);
    });
  });

  describe("getAvatar", () => {
    it("returns null when the user has no avatar", async () => {
      state.row = null;
      await expect(getAvatar(userId)).resolves.toBeNull();
    });

    it("returns the content type and image bytes when one exists", async () => {
      state.row = { contentType: "image/png", imageData: PNG_HEADER };
      await expect(getAvatar(userId)).resolves.toEqual({ contentType: "image/png", imageData: PNG_HEADER });
    });
  });
});
