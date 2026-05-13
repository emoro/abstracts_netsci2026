import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  cartItemKey,
  readCartFromStorage,
  writeCartToStorage,
} from "./sessionCartStorage";

const ProgramCartContext = createContext(null);

export function ProgramCartProvider({ children }) {
  const [items, setItems] = useState(() => readCartFromStorage());

  useEffect(() => {
    writeCartToStorage(items);
  }, [items]);

  const likedKeys = useMemo(
    () => new Set(items.map((i) => cartItemKey(i.kind, i.id))),
    [items]
  );

  const isLiked = useCallback(
    (kind, id) => likedKeys.has(cartItemKey(kind, id)),
    [likedKeys]
  );

  const toggleLike = useCallback((item) => {
    const k = cartItemKey(item.kind, item.id);
    setItems((prev) => {
      const exists = prev.some((x) => cartItemKey(x.kind, x.id) === k);
      if (exists) return prev.filter((x) => cartItemKey(x.kind, x.id) !== k);
      return [...prev, { ...item, addedAt: new Date().toISOString() }];
    });
  }, []);

  const removeItem = useCallback((kind, id) => {
    const k = cartItemKey(kind, id);
    setItems((prev) => prev.filter((x) => cartItemKey(x.kind, x.id) !== k));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      count: items.length,
      isLiked,
      toggleLike,
      removeItem,
      clearCart,
    }),
    [items, isLiked, toggleLike, removeItem, clearCart]
  );

  return (
    <ProgramCartContext.Provider value={value}>{children}</ProgramCartContext.Provider>
  );
}

export function useProgramCart() {
  const ctx = useContext(ProgramCartContext);
  if (!ctx) {
    throw new Error("useProgramCart must be used within ProgramCartProvider");
  }
  return ctx;
}
