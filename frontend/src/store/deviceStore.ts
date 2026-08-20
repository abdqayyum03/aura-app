import { create } from 'zustand';
import { Device } from '../api/types';
import { devicesApi } from '../api/devices';

interface DeviceState {
  devices: Device[];
  selectedDeviceId: string | null;
  isLoading: boolean;
  fetchDevices: () => Promise<void>;
  selectDevice: (deviceId: string) => void;
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  devices: [],
  selectedDeviceId: null,
  isLoading: false,

  fetchDevices: async () => {
    set({ isLoading: true });
    try {
      const devices = await devicesApi.list();
      const { selectedDeviceId } = get();
      set({
        devices,
        isLoading: false,
        // Preserve the current selection if it's still valid, otherwise default
        // to the first device - avoids silently switching screens out from
        // under the user on every refetch.
        selectedDeviceId:
          selectedDeviceId && devices.some((d) => d.id === selectedDeviceId)
            ? selectedDeviceId
            : (devices[0]?.id ?? null),
      });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  selectDevice: (deviceId) => set({ selectedDeviceId: deviceId }),
}));
