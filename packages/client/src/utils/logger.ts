import { ToastType } from '../components/Toast';

type WrappedConsoleMethods = 'log' | 'info' | 'warn' | 'error' | 'debug';

const toastTypeMap: Record<WrappedConsoleMethods, ToastType> = {
  log: 'info',
  info: 'info',
  warn: 'warning',
  error: 'error',
  debug: 'info',
};

type ShowToastFn = (message: string, type: ToastType) => void;

let showToastFn: ShowToastFn | null = null;

export const initializeLogger = (showToast: ShowToastFn): void => {
  showToastFn = showToast;
};

const createLogger = <T extends WrappedConsoleMethods>(
  method: T,
  originalFn: Console[T]
): Console[T] => {
  return ((...args: any[]) => {
    let shouldShowToast = false;
    if (args.length > 0 && typeof args[args.length - 1] === 'boolean') {
      shouldShowToast = args.pop() as boolean;
    }

    originalFn.apply(console, args);

    if (shouldShowToast && showToastFn) {
      const message = args
        .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
        .join(' ');
      showToastFn(message, toastTypeMap[method]);
    }
  }) as Console[T];
};

export const logger = {
  log: createLogger('log', console.log),
  info: createLogger('info', console.info),
  warn: createLogger('warn', console.warn),
  error: createLogger('error', console.error),
  debug: createLogger('debug', console.debug),
};

export default logger;
