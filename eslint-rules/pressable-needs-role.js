/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Require accessibilityRole on Pressable and Touchable components (SPEC-ACCESSIBILITY A11Y-2)",
      category: "Accessibility",
      recommended: true,
    },
    schema: [],
    messages: {
      missingRole:
        '<{{name}}> must specify accessibilityRole (e.g. accessibilityRole="button"). Prefer ActionButton / LabeledSwitch primitives.',
    },
  },
  create(context) {
    const TARGET_COMPONENTS = new Set([
      "Pressable",
      "TouchableOpacity",
      "TouchableHighlight",
      "TouchableWithoutFeedback",
    ]);

    const filename = context.getFilename().replace(/\\/g, "/");
    // Allow the ActionButton primitive itself to set the role once.
    if (filename.includes("/components/ui/ActionButton.")) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const componentName = node.name.name;
        if (!TARGET_COMPONENTS.has(componentName)) return;

        const hasRole = node.attributes.some(
          (attr) =>
            attr.type === "JSXAttribute" &&
            attr.name.type === "JSXIdentifier" &&
            (attr.name.name === "accessibilityRole" || attr.name.name === "role"),
        );

        if (!hasRole) {
          context.report({
            node,
            messageId: "missingRole",
            data: { name: componentName },
          });
        }
      },
    };
  },
};
