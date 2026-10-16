/**
 * Test-only Babel plugin: rewrites `import(spec)` to `Promise.resolve().then(() => require(spec))`.
 * Jest runs CommonJS without --experimental-vm-modules, so native dynamic import throws there.
 * The app bundle keeps real `import()` so Metro can split lazy chunks (SPEC-LIGHTWEIGHT LW-2).
 */
module.exports = function jestDynamicImport({ types: t }) {
  return {
    name: "jest-dynamic-import",
    visitor: {
      CallExpression(path) {
        if (path.node.callee.type !== "Import") return;
        const [spec] = path.node.arguments;
        const requireCall = t.callExpression(t.identifier("require"), [spec]);
        path.replaceWith(
          t.callExpression(
            t.memberExpression(
              t.callExpression(t.memberExpression(t.identifier("Promise"), t.identifier("resolve")), []),
              t.identifier("then"),
            ),
            [t.arrowFunctionExpression([], requireCall)],
          ),
        );
      },
    },
  };
};
