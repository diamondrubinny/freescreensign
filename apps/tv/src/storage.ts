/** Where the loader keeps the server address on the device: only the address, nothing else. */
const KEY = 'rubinny.tv.server';

export interface ServerStore {
  read(): string | null;
  write(origin: string): boolean;
}

/** Reading localStorage itself can throw (storage turned off), hence the getter. */
export function localServerStore(storage: () => Pick<Storage, 'getItem' | 'setItem'>): ServerStore {
  return {
    read() {
      try {
        return storage().getItem(KEY);
      } catch {
        return null;
      }
    },
    write(origin) {
      try {
        storage().setItem(KEY, origin);
        return true;
      } catch {
        return false;
      }
    },
  };
}
