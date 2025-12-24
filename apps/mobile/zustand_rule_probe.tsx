import { useAppStore } from "./dummy";

// ❌ NG（新オブジェクト参照が毎回生成される）
const { startInitialization } = useAppStore((s) => ({
  startInitialization: s.startInitialization,
}));

// ✅ OK
const startInitialization2 = useAppStore((s) => s.startInitialization);

export {};
