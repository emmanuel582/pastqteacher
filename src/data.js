import { useEffect, useState } from 'react';
import { api } from './api';
export const isDemo = new URLSearchParams(location.search).get('demo') === '1';
export const request = (path, options) =>
  isDemo ? import('./demo').then(({ demoApi }) => demoApi(path, options)) : api(path, options);
export function useResource(path, version = 0, scope = '') {
  const key = `${scope}:${path || ''}`;
  const [value, setValue] = useState({ key, data: null, error: '', loading: !!path });
  useEffect(() => {
    let active = true;
    if (!path) {
      setValue({ key, data: null, error: '', loading: false });
      return;
    }
    setValue((previous) =>
      previous.key === key
        ? { ...previous, error: '', loading: !previous.data }
        : { key, data: null, error: '', loading: true },
    );
    request(path)
      .then((data) => {
        if (active) setValue({ key, data, error: '', loading: false });
      })
      .catch((error) => {
        if (active) setValue((previous) => ({ ...previous, error: error.message, loading: false }));
      });
    return () => {
      active = false;
    };
  }, [path, version, scope]);
  return value.key === key ? value : { data: null, error: '', loading: !!path };
}
