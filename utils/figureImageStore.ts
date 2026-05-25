import AsyncStorage from "@react-native-async-storage/async-storage";

export const FIGURE_IMAGE_STORAGE_KEY = "hsms.figureImages.v2";

export type FigureImageStore = Record<string, Record<string, string>>;

export async function loadFigureImageStore(): Promise<FigureImageStore> {
  const raw = await AsyncStorage.getItem(FIGURE_IMAGE_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as FigureImageStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveFigureImageStore(store: FigureImageStore): Promise<void> {
  await AsyncStorage.setItem(FIGURE_IMAGE_STORAGE_KEY, JSON.stringify(store));
}

export function imagesForManuscript(
  store: FigureImageStore,
  manuscriptId: string,
): Record<string, string> {
  return store[manuscriptId] ?? {};
}

export function upsertManuscriptImages(
  store: FigureImageStore,
  manuscriptId: string,
  images: Record<string, string>,
): FigureImageStore {
  return { ...store, [manuscriptId]: images };
}
