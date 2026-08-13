import { describe, expect, it } from "vitest";
import {
  filterExecutedMigrationLines,
  interpretPhpRunnerError,
  sanitizeErrorText,
} from "../../src/core/migration-errors.js";

describe("interpretPhpRunnerError", () => {
  it("detects a PHP parse error (anonymous class case) and returns an actionable message", () => {
    const stdout = `Error:  Cannot use anonymous class
in <path>/app/Database/Migrations/2026_08_13_CreateOrders.php on line 12
Fatal error: Uncaught Error: Cannot use anonymous class
Stack trace:`;
    const info = interpretPhpRunnerError(stdout, "");
    expect(info.kind).toBe("parse-error");
    expect(info.message).toContain("PHP syntax error");
    expect(info.rawLines.length).toBeGreaterThan(0);
    expect(info.rawLines.join("\n")).not.toContain("2026_08_13_CreateOrders.php");
    expect(info.rawLines.join("\n")).not.toContain("/app/Database");
  });

  it("detects a missing class and reports which one", () => {
    const info = interpretPhpRunnerError(
      "",
      'PHP Fatal error:  Uncaught Error: Class "OrderRepository" not found in <path>',
    );
    expect(info.kind).toBe("class-not-found");
    expect(info.message).toContain("OrderRepository");
  });

  it("detects SQLSTATE errors", () => {
    const info = interpretPhpRunnerError(
      "SQLSTATE[23000]: Integrity constraint violation: 1048 Column 'title' cannot be null",
      "",
    );
    expect(info.kind).toBe("sql-error");
    expect(info.message).toContain("database rejected");
  });

  it("falls back to a generic message when nothing matches", () => {
    const info = interpretPhpRunnerError("something weird happened", "");
    expect(info.kind).toBe("runner-error");
    expect(info.message).toContain("runner failed");
  });

  it("never exposes absolute paths in the sanitized lines", () => {
    const info = interpretPhpRunnerError(
      "PHP Fatal error:  Uncaught Error in C:\\xampp\\htdocs\\citas2027\\app\\Database\\Migrations\\x.php on line 3",
      "",
    );
    const exposed = `${info.message}\n${info.rawLines.join("\n")}`;
    expect(exposed).not.toContain("citas2027");
    expect(exposed).not.toContain("xampp");
    expect(exposed).not.toContain("C:\\");
  });
});

describe("sanitizeErrorText", () => {
  it("strips Windows and POSIX absolute paths", () => {
    expect(
      sanitizeErrorText("in C:\\xampp\\htdocs\\app\\X.php on line 2"),
    ).not.toContain("xampp");
    expect(
      sanitizeErrorText("in /var/www/html/app/Config/X.php on line 2"),
    ).not.toContain("/var/www");
  });
});

describe("filterExecutedMigrationLines", () => {
  it("counts only lines that reference a .php migration file (skips spark headers)", () => {
    const stdout = `
Running all new migrations...

      DB Driver  MySQLi
  DB Version  8.0.36
      File    Version  Class            Group  Migrated At
  ------------------------------------------------------------------------
  2026_08_13_CreateOrders.php  1  App\\Database\\Migrations\\CreateOrders  default  2026-08-13 10:30:00
  2026_08_13_CreatePatients.php  1  App\\Database\\Migrations\\CreatePatients  default  2026-08-13 10:31:00
`;
    expect(filterExecutedMigrationLines(stdout)).toEqual([
      "2026_08_13_CreateOrders.php  1  App\\Database\\Migrations\\CreateOrders  default  2026-08-13 10:30:00",
      "2026_08_13_CreatePatients.php  1  App\\Database\\Migrations\\CreatePatients  default  2026-08-13 10:31:00",
    ]);
  });

  it("keeps spec-style relative migration paths", () => {
    const stdout = "app/Database/Migrations/2026_08_12_create_orders_table.php\n";
    expect(filterExecutedMigrationLines(stdout)).toEqual([
      "app/Database/Migrations/2026_08_12_create_orders_table.php",
    ]);
  });

  it("returns empty when the runner printed no migration files", () => {
    expect(filterExecutedMigrationLines("Nothing to migrate.")).toEqual([]);
  });
});
