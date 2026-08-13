import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readFileIfExists, safeWriteFile } from "../../src/core/fs-safe.js";
import { makeTempAppRoot } from "../helpers.js";

describe("safeWriteFile", () => {
  it("writes a new file and creates intermediate directories", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      const target = join(root, "app", "Controllers", "ProductController.php");
      const result = safeWriteFile(target, "<?php\n", false);
      expect(result).toMatchObject({ written: true, reason: "written" });
      expect(existsSync(target)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("does NOT overwrite without overwrite: reports exists_no_overwrite without touching anything", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      const target = join(root, "file.php");
      safeWriteFile(target, "ORIGINAL", false);
      const result = safeWriteFile(target, "NUEVO", false);
      expect(result).toMatchObject({
        written: false,
        reason: "exists_no_overwrite",
      });
      expect(readFileSync(target, "utf8")).toBe("ORIGINAL");
    } finally {
      cleanup();
    }
  });

  it("overwrites only with overwrite=true (reason: overwritten)", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      const target = join(root, "file.php");
      safeWriteFile(target, "ORIGINAL", false);
      const result = safeWriteFile(target, "NUEVO", true);
      expect(result).toMatchObject({ written: true, reason: "overwritten" });
      expect(readFileSync(target, "utf8")).toBe("NUEVO");
    } finally {
      cleanup();
    }
  });

  it("with overwrite=true and a missing file reports written", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      const target = join(root, "file.php");
      const result = safeWriteFile(target, "CONTENIDO", true);
      expect(result).toMatchObject({ written: true, reason: "written" });
    } finally {
      cleanup();
    }
  });
});

describe("readFileIfExists", () => {
  it("returns null when the file does not exist", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      expect(readFileIfExists(join(root, "no-existe.php"))).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("returns the content when it exists", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      const target = join(root, "file.php");
      safeWriteFile(target, "HOLA", false);
      expect(readFileIfExists(target)).toBe("HOLA");
    } finally {
      cleanup();
    }
  });
});
