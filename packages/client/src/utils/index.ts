const exhaustiveMatchingGuard = (value: never): never => {
  throw new Error(`Unhandled value: ${value}`);
};

type DebouncedFunction<T extends (...args: any[]) => any> = (...args: Parameters<T>) => void;

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

const Utils = {
  exhaustiveMatchingGuard,
  debounce,
};

export default Utils;
