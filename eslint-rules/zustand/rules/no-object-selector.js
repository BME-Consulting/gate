/**
 * @fileoverview ESLint rule to forbid object literal returns in Zustand selectors
 * @description Prevents the anti-pattern that causes infinite re-renders:
 *   ❌ useAppStore(s => ({ key: s.key }))  // new object on each render
 *   ✅ useAppStore(s => s.key)             // same reference
 *   ✅ useAppStore(useShallow(s => ({ key: s.key })))  // exception: explicit wrapper
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid object literal returns in Zustand selectors to prevent infinite re-renders",
      category: "Best Practices",
      recommended: "error",
      url: "https://github.com/yourusername/eslint-plugin-zustand"
    },
    messages: {
      objectLiteralSelector:
        "Do not return object literals from Zustand selectors. This causes infinite re-renders due to reference equality checks. Use a wrapper like `useShallow()` if you must return an object.",
      forbiddenPattern:
        "Object literal selector detected: {{hookName}}(s => ({{objectKey}})). Use destructuring or `useShallow()` wrapper instead."
    },
    fixable: null,
    schema: [
      {
        type: "object",
        properties: {
          hooks: {
            type: "array",
            items: { type: "string" },
            default: ["useAppStore", "useStore", "useBoundStore"]
          },
          allowUseShallow: {
            type: "boolean",
            default: true
          }
        },
        additionalProperties: false
      }
    ]
  },

  create(context) {
    const options = context.options[0] || {};
    const hooks = options.hooks || ["useAppStore", "useStore", "useBoundStore"];
    const allowUseShallow = options.allowUseShallow !== false;

    /**
     * Check if node is a Zustand hook call
     */
    function isZustandHook(node) {
      if (!node) return false;

      // useAppStore() - direct call
      if (node.type === "Identifier" && hooks.includes(node.name)) {
        return true;
      }

      // store.useAppStore() - member expression
      if (node.type === "MemberExpression") {
        const prop = node.property;
        if (prop && prop.name && hooks.includes(prop.name)) {
          return true;
        }
      }

      return false;
    }

    /**
     * Check if a selector function returns an object literal
     */
    function hasObjectLiteralReturn(fn) {
      if (!fn) return null;

      // Arrow function: (s) => ({ key: s.key })
      if (fn.type === "ArrowFunctionExpression") {
        if (fn.body.type === "ObjectExpression") {
          return {
            type: "direct",
            node: fn.body
          };
        }

        // Block statement: (s) => { return { key: s.key }; }
        if (fn.body.type === "BlockStatement") {
          const returnStmt = fn.body.body.find(
            stmt => stmt.type === "ReturnStatement"
          );
          if (
            returnStmt &&
            returnStmt.argument &&
            returnStmt.argument.type === "ObjectExpression"
          ) {
            return {
              type: "block",
              node: returnStmt.argument
            };
          }
        }
      }

      // Regular function: function(s) { return { key: s.key }; }
      if (fn.type === "FunctionExpression") {
        const returnStmt = fn.body.body.find(
          stmt => stmt.type === "ReturnStatement"
        );
        if (
          returnStmt &&
          returnStmt.argument &&
          returnStmt.argument.type === "ObjectExpression"
        ) {
          return {
            type: "block",
            node: returnStmt.argument
          };
        }
      }

      return null;
    }

    /**
     * Check if selector is wrapped with useShallow or similar
     */
    function isWrappedWithException(callExpr) {
      const callee = callExpr.callee;

      // useAppStore(useShallow(selector))
      if (
        callee &&
        (callee.name === "useShallow" ||
          callee.name === "subscribeWithSelector")
      ) {
        return true;
      }

      // store.useShallow(selector)
      if (
        callee &&
        callee.type === "MemberExpression" &&
        callee.property &&
        (callee.property.name === "useShallow" ||
          callee.property.name === "subscribeWithSelector")
      ) {
        return true;
      }

      return false;
    }

    /**
     * Get hook name for error message
     */
    function getHookName(node) {
      if (!node) return "hook";
      if (node.type === "Identifier") return node.name;
      if (node.type === "MemberExpression" && node.property) {
        return node.property.name;
      }
      return "hook";
    }

    /**
     * Get object properties for error message
     */
    function getObjectPropertiesString(objNode) {
      if (!objNode || !objNode.properties) return "...";
      const props = objNode.properties
        .slice(0, 3) // show first 3 properties
        .map(prop => {
          if (prop.shorthand) return prop.key.name;
          if (prop.key && prop.key.name) return prop.key.name;
          return "key";
        })
        .join(", ");
      if (objNode.properties.length > 3) {
        return `{ ${props}, ... }`;
      }
      return `{ ${props} }`;
    }

    return {
      CallExpression(node) {
        // Check if this is a Zustand hook call: useAppStore(selector)
        if (!isZustandHook(node.callee)) {
          return;
        }

        // Get the first argument (the selector function)
        const selector = node.arguments[0];
        if (!selector) return;

        // Check if selector returns an object literal
        const objectReturn = hasObjectLiteralReturn(selector);
        if (!objectReturn) {
          return;
        }

        // Check if it's wrapped with useShallow or similar exception
        if (allowUseShallow && isWrappedWithException(selector)) {
          return;
        }

        // Report the error
        const hookName = getHookName(node.callee);
        const objectStr = getObjectPropertiesString(objectReturn.node);

        context.report({
          node: objectReturn.node,
          messageId: "forbiddenPattern",
          data: {
            hookName,
            objectKey: objectStr
          }
        });
      }
    };
  }
};
