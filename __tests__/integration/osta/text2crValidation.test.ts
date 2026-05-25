import fs from "fs";
import path from "path";
import { parseHsMsText } from "../../../utils/manuscriptParser";
import { requireOstaIntegration, resolveOstaTranscriptionsPath } from "./ostaPaths";

requireOstaIntegration();

const TEXT_2CR_PATH = path.join(resolveOstaTranscriptionsPath(), "TEXT.2CR.txt");

if (!fs.existsSync(TEXT_2CR_PATH)) {
  throw new Error(`TEXT.2CR.txt not found in OSTA corpus: ${TEXT_2CR_PATH}`);
}

describe("TEXT.2CR validation", () => {
  it("does not report false EXTRA_CLOSE on column-wrapper closing braces", () => {
    const raw = fs.readFileSync(TEXT_2CR_PATH, "utf8");
    const ast = parseHsMsText(raw);
    const errors = ast.validationErrors ?? [];
    const extraClose = errors.filter((e) =>
      /extra structural closing brace/i.test(e.message),
    );
    expect(extraClose).toHaveLength(0);
  });
});
