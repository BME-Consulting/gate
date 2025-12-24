# zustand/no-object-selector

## Why

Zustand selector でオブジェクトリテラルを返すと、毎回新しい参照が生成される。
Zustand の equality check（Object.is）が常に false を返し、subscriber が「変更あり」と誤判定。
結果として無限 re-render が発生し `Maximum update depth exceeded` エラーに至る。

**参考**: G-3-4 Zustand infinite loop incident (Commit 1195783)

## Forbidden Pattern

```typescript
// ❌ NG: Object literal creates new reference every render
const { startInitialization } = useAppStore((s) => ({
  startInitialization: s.startInitialization,
}));
```

## Recommended Pattern

```typescript
// ✅ OK: Direct property selector (stable reference)
const startInitialization = useAppStore((s) => s.startInitialization);

// ✅ OK: Destructuring in component scope (not in hook)
function MyComponent() {
  const store = useAppStore();
  const { startInitialization } = store;
  // ...
}
```

## Allowed Exception

```typescript
// ✅ OK: Explicit shallow compare wrapper
import { useShallow } from 'zustand/react';

const { a, b } = useAppStore(useShallow((s) => ({
  a: s.a,
  b: s.b,
})));
```

When to use `useShallow`:
- Multiple properties needed from store
- Explicitly acknowledged and intentional
- Performance trade-off understood

## References

- **SSOT Document**: `docs/SSOT_G34_CASE123_FIX.md`
- **Root Cause Analysis**: Commit 1195783
- **ESLint Rule Implementation**: Commit 04c75de
- **ESLint v9 Integration**: Commit f75a6bb
