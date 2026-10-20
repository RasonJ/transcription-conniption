import AsyncStorage from "@react-native-async-storage/async-storage";
import { openAsNewWorkspace } from "../utils/workspaceTransactions";
import { loadWorkspaceIndex } from "../utils/scriptoriumWorkspace";

describe("openAsNewWorkspace", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("creates a distinct workspace without discarding prior index entries", async () => {
    const first = await openAsNewWorkspace({
      transcriptionText: "{CB1. first }",
      sourceFileName: "First.txt",
      manuscriptTitle: "First",
    });
    const second = await openAsNewWorkspace({
      transcriptionText: "{CB1. second }",
      sourceFileName: "Second.txt",
      manuscriptTitle: "Second",
    });

    expect(second.id).not.toBe(first.id);

    const index = await loadWorkspaceIndex();
    expect(index.activeWorkspaceId).toBe(second.id);
    expect(index.workspaces[first.id]?.manuscriptTitle).toBe("First");
    expect(index.workspaces[second.id]?.manuscriptTitle).toBe("Second");
  });
});
