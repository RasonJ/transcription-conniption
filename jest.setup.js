jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// The lemma dictionary is lazy in the app (SPEC-LIGHTWEIGHT §4.2). Unit tests expect lemmatized
// concordance output, so load it synchronously here; tests that cover laziness reset it.
require("./utils/hsmsDictionary").loadLemmaDictionarySync();

// Locale catalogs other than en load lazily in the app (SPEC-I18N I18N-3); tests use them all.
beforeAll(() => require("./i18n/core").ensureAllLocalesLoaded());
