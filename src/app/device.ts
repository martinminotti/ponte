import { useLiveQuery } from 'dexie-react-hooks';
import { getDevice, setDevice, type DevicePrefs } from '@/data/repo';

/** scelta di usare Ponte senza account (tutto sul dispositivo) anche dove il cloud è disponibile */
export const setDeviceLocalOnly = (on: boolean) => setDevice({ localOnly: on });

export function useDevice(): DevicePrefs | undefined {
  return useLiveQuery(getDevice, []);
}
