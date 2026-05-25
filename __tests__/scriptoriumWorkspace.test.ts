import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createWorkspace,
  inferManuscriptTitle,
  LEGACY_WORKSPACE_INDEX_KEY,
  loadWorkspaceIndex,
  persistWorkspace,
  removeFigureFromWorkspace,
  touchWorkspace,
  WORKSPACE_INDEX_KEY,
  workspaceShardKey,
  workspaceToIndexEntry,
} from "../utils/scriptoriumWorkspace";

jest.mock("../utils/figureAssetStorage", () => ({
  deleteFigureAsset: jest.fn(async () => {}),
  ensureWorkspaceDirectories: jest.fn(async () => {}),
}));

describe("scriptoriumWorkspace", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("infers title from second RMK when multiple RMK lines exist", () => {
    const text = `{RMK: Pedro Nunes.}
{RMK: Tratado da sphera.}
[fol. 1r]`;
    expect(inferManuscriptTitle(text)).toBe("Tratado da sphera");
  });

  it("falls back to source filename", () => {
    expect(inferManuscriptTitle("[fol. 1r]\n1 texto", "TEXT.CDP.txt")).toBe("TEXT.CDP");
  });

  it("touchWorkspace updates lastModified without changing id", () => {
    const ws = createWorkspace({ transcriptionText: "a", manuscriptTitle: "Test" });
    const updated = touchWorkspace(ws, { transcriptionText: "ab" });
    expect(updated.id).toBe(ws.id);
    expect(updated.transcriptionText).toBe("ab");
    expect(updated.lastModified >= ws.lastModified).toBe(true);
  });

  it("persists full workspace in a dedicated shard, not the root index", async () => {
    const largeText = "x".repeat(200_000);
    const ws = createWorkspace({
      transcriptionText: largeText,
      manuscriptTitle: "Large witness",
      sourceFileName: "BIG.txt",
    });

    await persistWorkspace(ws);

    const indexRaw = await AsyncStorage.getItem(WORKSPACE_INDEX_KEY);
    expect(indexRaw).toBeTruthy();
    expect(indexRaw!.length).toBeLessThan(2048);

    const index = JSON.parse(indexRaw!);
    expect(index.workspaces[ws.id].manuscriptTitle).toBe("Large witness");
    expect(index.workspaces[ws.id].transcriptionText).toBeUndefined();

    const shardRaw = await AsyncStorage.getItem(workspaceShardKey(ws.id));
    expect(shardRaw).toContain(largeText.slice(0, 64));
  });

  it("migrates legacy monolithic index into shards", async () => {
    const legacyWs = createWorkspace({
      transcriptionText: "Legacy body text",
      manuscriptTitle: "Legacy title",
    });

    await AsyncStorage.setItem(
      LEGACY_WORKSPACE_INDEX_KEY,
      JSON.stringify({
        activeWorkspaceId: legacyWs.id,
        workspaces: { [legacyWs.id]: legacyWs },
      }),
    );

    const index = await loadWorkspaceIndex();
    expect(index.activeWorkspaceId).toBe(legacyWs.id);
    expect(index.workspaces[legacyWs.id].manuscriptTitle).toBe("Legacy title");
    expect(await AsyncStorage.getItem(LEGACY_WORKSPACE_INDEX_KEY)).toBeNull();

    const shardRaw = await AsyncStorage.getItem(workspaceShardKey(legacyWs.id));
    expect(shardRaw).toContain("Legacy body text");
  });

  it("repairs a bloated index entry by moving transcription text into a shard", async () => {
    const ws = createWorkspace({
      transcriptionText: "Bloated inline payload",
      manuscriptTitle: "Repair me",
    });

    await AsyncStorage.setItem(
      WORKSPACE_INDEX_KEY,
      JSON.stringify({
        activeWorkspaceId: ws.id,
        workspaces: { [ws.id]: ws },
      }),
    );

    const index = await loadWorkspaceIndex();
    expect(index.workspaces[ws.id].transcriptionText).toBeUndefined();

    const repairedIndexRaw = await AsyncStorage.getItem(WORKSPACE_INDEX_KEY);
    expect(repairedIndexRaw!.length).toBeLessThan(1024);
    expect(await AsyncStorage.getItem(workspaceShardKey(ws.id))).toContain("Bloated inline payload");
  });

  it("updates shard storage when removing a figure asset", async () => {
    const ws = createWorkspace({ transcriptionText: "fig test", manuscriptTitle: "Fig" });
    const withFig = touchWorkspace(ws, { assetMap: { fig1: "file:///tmp/x.jpg" } });
    await persistWorkspace(withFig);

    const updated = await removeFigureFromWorkspace(withFig, "fig1");

    const shard = JSON.parse((await AsyncStorage.getItem(workspaceShardKey(ws.id)))!);
    expect(shard.assetMap.fig1).toBeUndefined();
    expect(updated.assetMap.fig1).toBeUndefined();

    const index = JSON.parse((await AsyncStorage.getItem(WORKSPACE_INDEX_KEY))!);
    expect(index.workspaces[ws.id]).toEqual(workspaceToIndexEntry(updated));
  });
});
