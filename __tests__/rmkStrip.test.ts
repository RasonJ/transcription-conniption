import fs from "fs";
import path from "path";
import { compileManuscriptTree } from "../utils/compiler";

const TRS = path.resolve(__dirname, "../../PedroNunes-TRS/text-TRS.txt");

describe("RMK stripping", () => {
  if (!fs.existsSync(TRS)) {
    it.skip("TRS file missing", () => {});
    return;
  }

  it("does not render RMK lines as folio body text", () => {
    const ast = compileManuscriptTree(fs.readFileSync(TRS, "utf8"));
    const body = ast.folios
      .flatMap((f) => f.blocks)
      .flatMap((b) => b.tokens.map((t) => t.value))
      .join(" ");
    expect(body).not.toMatch(/\{RMK:/);
    expect(body).not.toMatch(/Pedro Nunes\./);
    expect(body).not.toMatch(/Georgetown University/);
  });
});
